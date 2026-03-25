from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from typing import Optional
import asyncio
import base64
import json
import uuid
from datetime import datetime
from services.elevenlabs import stt, tts
from services.llm import chat
from services.firecrawl import search
from config import get_settings
from database import (
    save_interrupted_session,
    get_interrupted_sessions,
    get_interrupted_session_by_id,
    delete_interrupted_session,
)

router = APIRouter()

DEFAULT_ASSISTANT_VOICE = "21m00Tcm4TlvDq8ikWAM"

def _assistant_voice(settings: dict) -> str:
    return settings.get("assistant_voice_id") or DEFAULT_ASSISTANT_VOICE

# 内存 session 存储
sessions: dict = {}

SYSTEM_PROMPT = """你是 PodCraft 的 AI 播客制作助手。你帮助用户通过语音对话完成播客创建全流程。
当前阶段：{stage_name}
对话历史素材：{materials}
当前参数：{params}

阶段说明：
- 阶段0（确定主题）：引导用户描述播客主题，提取关键词准备搜索
- 阶段1（筛选素材）：逐一播报搜索到的素材，引导用户保留或跳过，确认后进入下一步
- 阶段2（确认参数）：确认输出语言和角色名字，参数只在此阶段设置一次，后续不再重复询问
- 阶段3（确认脚本）：完整脚本已自动生成并展示，引导用户确认或提出修改意见，不涉及语言和角色设置
- 阶段4（选择音色）：为每个角色选择音色，不涉及语言和角色设置
- 阶段5（生成播客）：开始合成音频

重要原则：语言和角色参数已在阶段2确定，阶段3及之后绝对不要再询问或修改语言、角色数量等参数。
回复要简洁，适合语音播报。"""

STAGE_NAMES = ["确定主题", "筛选素材", "确认参数", "确认脚本", "选择音色", "生成播客"]

# 对话语言名称 → ISO-639-1 代码（用于 STT language_code）
LANGUAGE_CODE_MAP = {
    "中文": "zh", "chinese": "zh", "mandarin": "zh",
    "英文": "en", "english": "en",
    "日文": "ja", "日语": "ja", "japanese": "ja",
    "韩文": "ko", "韩语": "ko", "korean": "ko",
    "法文": "fr", "法语": "fr", "french": "fr",
    "德文": "de", "德语": "de", "german": "de",
    "西班牙文": "es", "西班牙语": "es", "spanish": "es",
}

def _content_provider_and_model(settings: dict):
    """返回内容生成用的 (provider, model)，优先用设置页选定的供应商和模型"""
    providers = settings.get("providers", [])
    content_provider_id = settings.get("content_provider_id", "")
    content_model = settings.get("content_model", "")

    provider = None
    if content_provider_id:
        provider = next((p for p in providers if p.get("id") == content_provider_id), None)
    if not provider:
        provider = next((p for p in providers if p.get("active")), providers[0] if providers else None)

    model = content_model or (provider.get("models", ["gpt-4o"])[0] if provider else "gpt-4o")
    return provider, model


FOLLOW_UP_FALLBACKS = [
    ["还在吗？有什么需要我帮你的吗？",
     "遇到什么问题了吗？我在这里等你。",
     "需要换个方式继续吗？随时告诉我。"],
    ["主题还没确定？可以先说个大方向，比如科技、生活或者旅行。",
     "素材有疑问吗？可以说「跳过」或者告诉我你的想法。",
     "参数没想好？默认两个角色、中文输出，直接说「好的」就行。",
     "脚本看起来怎么样？觉得可以就说「确认」，想改的话告诉我。",
     "音色没选好？可以说出你喜欢的风格，我来推荐。",
     "正在生成中，请稍等一下。"],
    ["还需要我帮你吗？", "如果有任何问题，随时说。", "我在等你的指令，随时可以继续。"],
]


async def _generate_title(history: list, settings: dict) -> str:
    """根据对话中用户描述的播客主题生成标题"""
    user_msgs = [m["content"] for m in history if m.get("role") == "user"][:6]
    if not user_msgs:
        return "未命名任务"

    try:
        provider, model = _content_provider_and_model(settings)
        if not provider:
            raise ValueError("no provider")
        title = await chat(
            messages=[
                {"role": "system", "content": (
                    "你是标题生成助手。从用户的发言中找出他想制作的播客主题，"
                    "用不超过10个字概括这个主题作为任务标题。"
                    "只输出标题本身，不加引号、书名号、「」等符号，不加任何解释。"
                )},
                {"role": "user", "content": "\n".join(user_msgs)},
            ],
            base_url=provider["base_url"],
            api_key=provider["api_key"],
            model=model,
        )
        title = title.strip().strip('"\'').strip("《》「」【】").replace("\n", "")
        return title[:20] if title else "未命名任务"
    except Exception:
        # 降级：从第一条用户消息中去掉口语前缀
        import re
        first = user_msgs[0].strip()
        cleaned = re.sub(r"我想(做|制作|录制)?一?(期|个|篇)?[关于的]?播客[关于的]?", "", first).strip()
        text = cleaned or first
        return text[:15] + ("…" if len(text) > 15 else "")


# ── REST 端点：中断会话管理 ────────────────────────────────────────────────────

@router.get("/api/voice/interrupted")
def list_interrupted_sessions():
    rows = get_interrupted_sessions()
    return [
        {
            "id": r["id"],
            "title": r["title"],
            "stage": r["stage"],
            "stage_name": STAGE_NAMES[min(r["stage"], len(STAGE_NAMES) - 1)],
            "created_at": r["created_at"],
        }
        for r in rows
    ]


@router.get("/api/voice/interrupted/{session_id}")
def get_interrupted_session(session_id: str):
    from fastapi import HTTPException
    row = get_interrupted_session_by_id(session_id)
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    return {
        "id": row["id"],
        "title": row["title"],
        "stage": row["stage"],
        "stage_name": STAGE_NAMES[min(row["stage"], len(STAGE_NAMES) - 1)],
        "history": json.loads(row["history_json"]),
        "created_at": row["created_at"],
    }


@router.delete("/api/voice/interrupted/{session_id}")
def remove_interrupted_session(session_id: str):
    delete_interrupted_session(session_id)
    return {"ok": True}


# ── WebSocket ──────────────────────────────────────────────────────────────────

@router.websocket("/api/voice/stream")
async def voice_stream(websocket: WebSocket, resume_id: Optional[str] = Query(None)):
    await websocket.accept()
    session_id = str(uuid.uuid4())
    settings = get_settings()

    # 检查是否是恢复会话
    if resume_id:
        saved = get_interrupted_session_by_id(resume_id)
        if saved:
            sessions[session_id] = {
                "stage": saved["stage"],
                "history": json.loads(saved["history_json"]),
                "materials": json.loads(saved["materials_json"]),
                "params": json.loads(saved["params_json"]),
                "voices": json.loads(saved["voices_json"]),
                "script": saved.get("script", ""),
                "ended_explicitly": False,
            }
            # 删除已恢复的中断记录
            delete_interrupted_session(resume_id)
            session = sessions[session_id]
            await websocket.send_json({
                "type": "session_id",
                "session_id": session_id,
            })
            await websocket.send_json({
                "type": "session_restored",
                "stage": session["stage"],
                "history": session["history"],
                "materials": [
                    {
                        "url": r.get("url", ""),
                        "title": r.get("title", "未知标题"),
                        "snippet": r.get("snippet", r.get("content", ""))[:200],
                    }
                    for r in session["materials"]
                ],
                "script": session.get("script", ""),
            })
            # 朗读欢迎回来提示
            welcome_back = "欢迎回来！我们继续上次的对话。"
            try:
                audio_bytes = await tts(welcome_back, _assistant_voice(settings), settings.get("elevenlabs_key", ""))
                await websocket.send_json({"type": "audio", "data": base64.b64encode(audio_bytes).decode()})
            except Exception:
                pass
        else:
            # 找不到记录，当新会话处理
            resume_id = None

    if not resume_id:
        sessions[session_id] = {
            "stage": 0,
            "history": [],
            "materials": [],
            "params": {"language": "中文", "roles": []},
            "voices": {},
            "script": "",
            "search_query": "",
            "ended_explicitly": False,
        }
        session = sessions[session_id]

        # 发送 session_id 和问候
        await websocket.send_json({"type": "session_id", "session_id": session_id})

        greeting = "你好！我是你的播客制作助手。今天想做一期什么主题的播客呢？"
        session["history"].append({"role": "assistant", "content": greeting})
        await websocket.send_json({"type": "ai_text", "text": greeting, "stage": 0})

        # TTS 问候语
        try:
            audio_bytes = await tts(greeting, _assistant_voice(settings), settings.get("elevenlabs_key", ""))
            audio_b64 = base64.b64encode(audio_bytes).decode()
            await websocket.send_json({"type": "audio", "data": audio_b64})
        except Exception as e:
            await websocket.send_json({"type": "error", "message": f"TTS 失败: {str(e)}"})

    session = sessions[session_id]
    audio_buffer = bytearray()

    try:
        while True:
            message = await websocket.receive()

            if message["type"] == "websocket.disconnect":
                break

            if "bytes" in message and message["bytes"]:
                audio_buffer.extend(message["bytes"])

            elif "text" in message and message["text"]:
                data = json.loads(message["text"])

                if data.get("type") == "end_call":
                    # 用户主动挂断，标记为显式结束
                    session["ended_explicitly"] = True

                elif data.get("type") == "end_speech":
                    if not audio_buffer:
                        continue

                    audio_data = bytes(audio_buffer)
                    audio_buffer.clear()

                    try:
                        lang_name = session["params"].get("language", "中文").lower()
                        lang_code = LANGUAGE_CODE_MAP.get(lang_name, "zh")
                        stt_model = settings.get("stt_model", "scribe_v1")
                        transcript = await stt(audio_data, settings.get("elevenlabs_key", ""),
                                               language_code=lang_code, model_id=stt_model)
                    except Exception as e:
                        await websocket.send_json({"type": "error", "message": f"STT 失败: {str(e)}"})
                        continue

                    clean = transcript.strip()
                    # 过滤空内容或纯括号注释（如 "(笑声)" "(music)" "(rire)" 等 STT 幻觉）
                    import re as _re
                    clean_no_parens = _re.sub(r'\([^)]*\)', '', clean).strip()
                    if not clean or not clean_no_parens or (clean.startswith("(") and clean.endswith(")")):
                        await websocket.send_json({"type": "no_speech"})
                        continue

                    # 去除行内括号噪声后作为实际文本使用
                    clean_transcript = clean_no_parens

                    await websocket.send_json({"type": "transcript", "text": clean_transcript})

                    session["history"].append({"role": "user", "content": clean_transcript})

                    ai_response = await handle_stage(session, clean_transcript, settings, websocket)

                    if ai_response:
                        session["history"].append({"role": "assistant", "content": ai_response})
                        await websocket.send_json({"type": "ai_text", "text": ai_response, "stage": session["stage"]})

                        try:
                            audio_bytes = await tts(ai_response, _assistant_voice(settings), settings.get("elevenlabs_key", ""))
                            audio_b64 = base64.b64encode(audio_bytes).decode()
                            await websocket.send_json({"type": "audio", "data": audio_b64})
                        except Exception as e:
                            await websocket.send_json({"type": "error", "message": f"TTS 失败: {str(e)}"})

                elif data.get("type") == "text_input":
                    # 手动文本输入，直接绕过 STT 处理
                    user_text = data.get("text", "").strip()
                    if not user_text:
                        continue

                    await websocket.send_json({"type": "transcript", "text": user_text})
                    session["history"].append({"role": "user", "content": user_text})

                    ai_response = await handle_stage(session, user_text, settings, websocket)

                    if ai_response:
                        session["history"].append({"role": "assistant", "content": ai_response})
                        await websocket.send_json({"type": "ai_text", "text": ai_response, "stage": session["stage"]})

                        try:
                            audio_bytes = await tts(ai_response, _assistant_voice(settings), settings.get("elevenlabs_key", ""))
                            audio_b64 = base64.b64encode(audio_bytes).decode()
                            await websocket.send_json({"type": "audio", "data": audio_b64})
                        except Exception as e:
                            await websocket.send_json({"type": "error", "message": f"TTS 失败: {str(e)}"})

                elif data.get("type") == "follow_up":
                    attempt = data.get("attempt", 1)
                    print(f"[follow_up] 收到追问请求 attempt={attempt}", flush=True)
                    follow_up = await generate_follow_up(session, attempt, settings)
                    print(f"[follow_up] generate 结果: {repr(follow_up)}", flush=True)
                    if follow_up:
                        session["history"].append({"role": "assistant", "content": follow_up})
                        await websocket.send_json({"type": "ai_text", "text": follow_up, "stage": session["stage"]})
                        try:
                            audio_bytes = await tts(follow_up, _assistant_voice(settings), settings.get("elevenlabs_key", ""))
                            audio_b64 = base64.b64encode(audio_bytes).decode()
                            await websocket.send_json({"type": "audio", "data": audio_b64})
                        except Exception as e:
                            await websocket.send_json({"type": "error", "message": f"TTS 失败: {str(e)}"})

    except WebSocketDisconnect:
        pass
    finally:
        sess = sessions.pop(session_id, None)
        # 如果不是主动挂断，且有用户发言记录，自动保存为中断会话
        if sess and not sess.get("ended_explicitly", False):
            has_user_msg = any(m.get("role") == "user" for m in sess.get("history", []))
            if has_user_msg:
                try:
                    title = await _generate_title(sess["history"], settings)
                    save_interrupted_session({
                        "id": session_id,
                        "title": title,
                        "stage": sess["stage"],
                        "history_json": json.dumps(sess["history"], ensure_ascii=False),
                        "materials_json": json.dumps(sess["materials"], ensure_ascii=False),
                        "params_json": json.dumps(sess["params"], ensure_ascii=False),
                        "voices_json": json.dumps(sess["voices"], ensure_ascii=False),
                        "script": sess.get("script", ""),
                        "created_at": datetime.now().isoformat(),
                    })
                except Exception as e:
                    print(f"[interrupted] 保存��断会话失败: {e}", flush=True)


def _detect_language(text: str) -> str:
    """按字符分布推断用户使用的语言名称"""
    if not text:
        return "中文"
    cjk = sum(1 for c in text if '\u4e00' <= c <= '\u9fff' or '\u3040' <= c <= '\u30ff' or '\uac00' <= c <= '\ud7a3')
    latin = sum(1 for c in text if c.isalpha() and ord(c) < 128)
    total = max(len(text), 1)
    if cjk / total > 0.1:
        return "中文"
    if latin / total > 0.3:
        return "英文"
    return "中文"


# 用户文本中显式语言指定关键词 → 标准语言名
_EXPLICIT_LANG_MAP = {
    "中文": ["中文", "普通话", "汉语"],
    "英文": ["英文", "英语", "english"],
    "日文": ["日文", "日语", "japanese"],
    "韩文": ["韩文", "韩语", "korean"],
    "法文": ["法文", "法语", "french"],
    "德文": ["德文", "德语", "german"],
    "西班牙文": ["西班牙文", "西班牙语", "spanish"],
}


def _extract_explicit_language(text: str) -> str | None:
    """从用户文本中提取明确指定的语言，未指定则返回 None"""
    lower = text.lower()
    for lang_name, keywords in _EXPLICIT_LANG_MAP.items():
        if any(k in lower for k in keywords):
            return lang_name
    return None


def _deduplicate(results: list, existing: list = None) -> list:
    """按 URL 去重，existing 中已有的 URL 也一并排除"""
    seen = set(r.get("url", "") for r in (existing or []) if r.get("url"))
    deduped = []
    for r in results:
        url = r.get("url", "")
        if url and url not in seen:
            seen.add(url)
            deduped.append(r)
    return deduped


def _stage2_model_commits_to_script_generation(response: str) -> bool:
    """
    检测阶段2提取参数的模型回复是否已承诺「马上开始写脚本」。
    用于用户只说人名、未说「确认」但模型仍口头进入生成流程时，仍能发 progress 并真正调用脚本 LLM。
    """
    if not response:
        return False
    # 先排除「要你确认后才生成」类话术，避免误判
    if any(
        p in response
        for p in (
            "请说「确认」",
            "请说确认",
            "先说确认",
            "说完确认",
            "确认后再",
            "可以说「确认」",
            "说「确认」",
            "需要你说",
            "先说「好的」",
        )
    ):
        return False
    markers = (
        "现在开始生成",
        "我现在开始生成",
        "开始生成播客脚本",
        "正在生成播客脚本",
        "正在根据素材生成",
        "正在生成脚本",
        "马上生成脚本",
        "这就生成脚本",
        "去生成脚本",
        "为你生成脚本",
    )
    return any(m in response for m in markers)


def _stage2_user_supplies_params_only(user_text: str) -> bool:
    """用户是否在补充简短参数（人名、单人/双人等），而非长段闲聊"""
    t = user_text.strip()
    if len(t) > 48:
        return False
    if "？" in t or "?" in t:
        return False
    role_hints = ("单人", "双人", "主持人", "嘉宾", "角色", "叫", "名为", "名字")
    if any(h in t for h in role_hints):
        return True
    # 纯短句（如「小林」「中文，小明」）
    return len(t) <= 24


async def _run_stage2_script_generation(
    session: dict, settings: dict, websocket: WebSocket, active_provider: dict, active_model: str
) -> str:
    """阶段2 确认参数后：发 progress、朗读过渡、生成脚本并 script_ready"""
    session["stage"] = 3
    await websocket.send_json({"type": "stage_change", "stage": 3})
    await websocket.send_json({"type": "progress", "task": "generating_script"})
    interim_script = "好的，正在根据素材生成脚本，请稍候……"
    await websocket.send_json({"type": "ai_text", "text": interim_script, "stage": 3})
    try:
        interim_audio = await tts(interim_script, _assistant_voice(settings), settings.get("elevenlabs_key", ""))
        await websocket.send_json({"type": "audio", "data": base64.b64encode(interim_audio).decode()})
    except Exception:
        pass
    script_lang = session["params"].get("language", "中文")
    script_prompt = (
        f"基于以下素材，生成一段播客对话脚本。\n"
        f"素材：{json.dumps(session['materials'][:3], ensure_ascii=False)}\n"
        f"参数：{json.dumps(session['params'], ensure_ascii=False)}\n"
        f"语言要求：主要使用【{script_lang}】撰写，专有名词、术语可保留原文。\n"
        f'要求：2个角色对话，自然流畅，约5分钟（约800字），格式为「角色名：台词」。'
    )
    script = await chat(
        [{"role": "user", "content": script_prompt}],
        active_provider["base_url"],
        active_provider["api_key"],
        active_model,
    )
    session["script"] = script
    await websocket.send_json({"type": "script_ready", "text": script})
    return (
        f"完整脚本已生成，共约 {len(script)} 字，你可以在下方展开查看。"
        f"需要我给你念前一部分吗？如果满意，说「确认」进入音色选择。"
    )


async def _build_search_query(user_text: str, settings: dict) -> str:
    """从用户的播客主题描述中提炼搜索关键词，面向文章/资讯而非播客"""
    provider, model = _content_provider_and_model(settings)
    if not provider:
        # 无 LLM 时简单去掉口语化前缀
        import re
        cleaned = re.sub(r"我想(做|制作|创建|录制)?一?(期|个|篇|档)?[关于的]?播客[关于的]?", "", user_text).strip()
        return cleaned or user_text

    try:
        result = await chat(
            messages=[
                {"role": "system", "content": (
                    "你是搜索词提炼助手。用户想制作一期播客，请从他的描述中提取核心主题，"
                    "生成一个适合搜索相关文章、报告、资讯的简短搜索词（不超过15字，不含'播客'二字，"
                    "直接输出搜索词，不加任何解释）。"
                )},
                {"role": "user", "content": user_text},
            ],
            base_url=provider["base_url"],
            api_key=provider["api_key"],
            model=model,
        )
        query = result.strip().replace("\n", "")[:50]
        return query if query else user_text
    except Exception:
        return user_text


async def handle_stage(session: dict, user_text: str, settings: dict, websocket: WebSocket) -> str:
    """根据当前阶段处理用户输入，返回 AI 回复"""
    stage = session["stage"]
    active_provider, active_model = _content_provider_and_model(settings)

    system = SYSTEM_PROMPT.format(
        stage_name=STAGE_NAMES[min(stage, len(STAGE_NAMES) - 1)],
        materials=json.dumps(session["materials"], ensure_ascii=False),
        params=json.dumps(session["params"], ensure_ascii=False),
    )

    messages = [{"role": "system", "content": system}] + session["history"][-10:]

    if stage == 0:
        # 第一条用户消息：用回复语言作为默认，明确指定则优先
        explicit_lang = _extract_explicit_language(user_text)
        session["params"]["language"] = explicit_lang or _detect_language(user_text)

        if active_provider:
            response = await chat(
                messages,
                active_provider["base_url"],
                active_provider["api_key"],
                active_model,
            )
        else:
            response = "请先在设置页面配置 AI 模型供应商。"

        try:
            await websocket.send_json({"type": "progress", "task": "searching"})
            interim_text = "好的，我来搜索相关资料……"
            await websocket.send_json({"type": "ai_text", "text": interim_text, "stage": 0})
            try:
                interim_audio = await tts(interim_text, _assistant_voice(settings), settings.get("elevenlabs_key", ""))
                await websocket.send_json({"type": "audio", "data": base64.b64encode(interim_audio).decode()})
            except Exception:
                pass
            firecrawl_key = settings.get("firecrawl_key", "")
            search_query = await _build_search_query(user_text, settings)
            session["search_query"] = search_query
            results = await search(search_query, firecrawl_key)
            results = _deduplicate(results)
            session["materials"] = results
            session["stage"] = 1
            await websocket.send_json({"type": "stage_change", "stage": 1})
            # 发送素材数据供前端展示可点击链接
            await websocket.send_json({
                "type": "materials",
                "items": [
                    {
                        "url": r.get("url", ""),
                        "title": r.get("title", "未知标题"),
                        "snippet": r.get("snippet", r.get("content", ""))[:200],
                    }
                    for r in results[:5]
                ],
            })
            # AI 只朗读标题和概述，不读链接
            material_text = f"已找到 {len(results)} 条相关内容。"
            for i, r in enumerate(results, 1):
                title = r.get("title", "未知标题")
                snippet = r.get("snippet", r.get("content", ""))[:60]
                material_text += f"第{i}条：{title}。{snippet}。"
            material_text += "界面上可以点击查看原文。你想保留哪些素材？可以说「保留第1条」或「全部保留」。"
            return material_text
        except Exception:
            return response

    elif stage == 1:
        if not active_provider:
            return "请先配置 AI 模型供应商。"

        keywords_next = ["下一步", "确认", "没问题", "继续", "好了", "完成"]
        if any(k in user_text for k in keywords_next):
            session["stage"] = 2
            await websocket.send_json({"type": "stage_change", "stage": 2})
            return '素材确认完毕！现在设置播客参数。请告诉我输出语言和角色名字，比如「中文，主持人叫小明，嘉宾叫小红」。确认后将直接生成脚本，无需再次设置。'

        keywords_research = ["换一条", "替换", "重新搜索", "再搜", "换个", "找新的", "换掉", "不要这条", "搜索更多", "再找"]
        if any(k in user_text for k in keywords_research):
            firecrawl_key = settings.get("firecrawl_key", "")
            search_query = session.get("search_query", "")
            if not search_query:
                search_query = await _build_search_query(user_text, settings)
            try:
                # 多取一些结果，排除已有素材后补充
                raw = await search(search_query, firecrawl_key, limit=15)
                new_results = _deduplicate(raw, existing=session["materials"])
                if new_results:
                    session["materials"].extend(new_results)
                    await websocket.send_json({
                        "type": "materials",
                        "items": [
                            {
                                "url": r.get("url", ""),
                                "title": r.get("title", "未知标题"),
                                "snippet": r.get("snippet", r.get("content", ""))[:200],
                            }
                            for r in session["materials"]
                        ],
                    })
                    material_text = f"已补充 {len(new_results)} 条新素材，当前共 {len(session['materials'])} 条。"
                    for i, r in enumerate(new_results, 1):
                        title = r.get("title", "未知标题")
                        snippet = r.get("snippet", r.get("content", ""))[:60]
                        material_text += f"新增第{i}条：{title}。{snippet}。"
                    material_text += "需要继续筛选，还是说「下一步」继续？"
                    return material_text
                else:
                    return "没有找到新的不重复素材，当前素材已是最新结果。如果满意请说「下一步」。"
            except Exception:
                pass

        response = await chat(
            messages,
            active_provider["base_url"],
            active_provider["api_key"],
            active_model,
        )
        return response

    elif stage == 2:
        if not active_provider:
            return "请先配置 AI 模型供应商。"

        # 用户若明确指定了语言则覆盖默认值
        explicit_lang = _extract_explicit_language(user_text)
        if explicit_lang:
            session["params"]["language"] = explicit_lang

        response = await chat(
            messages + [{"role": "user", "content": f"请从这段话中提取角色名字和语言设置，并确认参数：{user_text}"}],
            active_provider["base_url"],
            active_provider["api_key"],
            active_model,
        )

        keywords_next = ["好了", "确认", "没问题", "下一步", "生成", "继续"]
        explicit_proceed = any(k in user_text for k in keywords_next)
        # 用户只说「小林」等时模型常口头说「现在开始生成脚本」但未命中关键词；对齐行为：真的生成并发 progress
        implicit_proceed = _stage2_model_commits_to_script_generation(response) and _stage2_user_supplies_params_only(
            user_text
        )

        if explicit_proceed or implicit_proceed:
            return await _run_stage2_script_generation(session, settings, websocket, active_provider, active_model)
        return response

    elif stage == 3:
        if not active_provider:
            return "请先配置 AI 模型供应商。"

        keywords_confirm = ["好了", "确认", "没问题", "继续", "下一步", "选音色", "可以"]
        keywords_read = ["朗读", "念一下", "读一读", "听一下", "听听", "念念", "读读"]

        # 朗读脚本开头
        if any(k in user_text for k in keywords_read) and session.get("script"):
            opening = session["script"][:300].strip()
            return f"好的，为你朗读脚本开头：{opening}……"

        # 确认脚本，进入音色选择
        if any(k in user_text for k in keywords_confirm) and session.get("script"):
            session["stage"] = 4
            await websocket.send_json({"type": "stage_change", "stage": 4})
            return "脚本已确认！现在为每个角色选择音色，我们有多种音色可供选择。"

        # 重新生成脚本
        keywords_regen = ["重新生成", "重写", "不满意", "改一下", "重来"]
        if any(k in user_text for k in keywords_regen):
            await websocket.send_json({"type": "progress", "task": "generating_script"})
            interim_regen = "好的，正在重新生成脚本，请稍候……"
            await websocket.send_json({"type": "ai_text", "text": interim_regen, "stage": 3})
            try:
                interim_audio = await tts(interim_regen, _assistant_voice(settings), settings.get("elevenlabs_key", ""))
                await websocket.send_json({"type": "audio", "data": base64.b64encode(interim_audio).decode()})
            except Exception:
                pass
            script_lang = session["params"].get("language", "中文")
            script_prompt = (
                f"基于以下素材，重新生成一段播客对话脚本。\n"
                f"素材：{json.dumps(session['materials'][:3], ensure_ascii=False)}\n"
                f"参数：{json.dumps(session['params'], ensure_ascii=False)}\n"
                f"语言要求：主要使用【{script_lang}】撰写，专有名词、术语可保留原文。\n"
                f"用户修改意见：{user_text}\n"
                f'要求：2个角色对话，自然流畅，约5分钟（约800字），格式为「角色名：台词」。'
            )
            script = await chat(
                [{"role": "user", "content": script_prompt}],
                active_provider["base_url"],
                active_provider["api_key"],
                active_model,
            )
            session["script"] = script
            await websocket.send_json({"type": "script_ready", "text": script})
            return (
                f"已重新生成脚本，共约 {len(script)} 字，可在下方展开查看。"
                f"如果满意，说「确认」进入音色选择。"
            )

        # 其他修改意见
        response = await chat(
            messages,
            active_provider["base_url"],
            active_provider["api_key"],
            active_model,
        )
        return response

    elif stage == 4:
        keywords_confirm = ["确认", "就用", "好的", "生成播客", "开始生成", "没问题", "下一步"]
        if any(k in user_text for k in keywords_confirm):
            session["stage"] = 5
            await websocket.send_json({"type": "stage_change", "stage": 5})
            await websocket.send_json({"type": "generating_podcast"})
            return "所有参数已确认！开始合成播客音频，请稍候……"

        if not active_provider:
            return "请先配置 AI 模型供应商。"
        response = await chat(
            messages,
            active_provider["base_url"],
            active_provider["api_key"],
            active_model,
        )
        return response

    elif stage == 5:
        return "播客正在生成中，请稍候……"

    return "请继续。"


async def generate_follow_up(session: dict, attempt: int, settings: dict) -> str:
    """用户长时间无回复时，根据阶段和历史生成跟进问题"""
    active_provider, active_model = _content_provider_and_model(settings)
    if not active_provider:
        return None

    stage = session["stage"]
    stage_name = STAGE_NAMES[min(stage, len(STAGE_NAMES) - 1)]
    last_ai = next((m["content"] for m in reversed(session["history"]) if m["role"] == "assistant"), "")

    prompt = f"""用户在语音播客制作助手对话中停止了回复，已等待超过1分钟。
当前阶段：{stage_name}
最近一条AI消息：{last_ai[:300]}
这是第{attempt}次跟进询问。

请生成一条简短的跟进消息（不超过35字，适合语音播报），从不同角度猜测用户可能遇到的问题：
- 第1次：温和地询问是否有疑问或需要帮助
- 第2次：猜测用户对当前阶段某个具体细节感到困惑，提出一个具体猜测
- 第3次及以后：换一个全新角度，比如询问是否需要换个思路，或是否有技术问题等

注意：每次问题角度必须不同，语气自然亲切。只输出一句话，不加任何解释。"""

    try:
        response = await chat(
            [{"role": "user", "content": prompt}],
            active_provider["base_url"],
            active_provider["api_key"],
            active_model,
        )
        return response
    except Exception as e:
        print(f"[follow_up] chat() 异常，使用兜底文案: {e}", flush=True)
        bucket = FOLLOW_UP_FALLBACKS[(attempt - 1) % len(FOLLOW_UP_FALLBACKS)]
        stage_idx = min(stage, len(bucket) - 1)
        return bucket[stage_idx]
