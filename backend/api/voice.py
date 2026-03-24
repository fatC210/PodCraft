from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import asyncio
import base64
import json
import uuid
from services.elevenlabs import stt, tts
from services.llm import chat
from services.firecrawl import search
from config import get_settings

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
- 阶段1（筛选素材）：逐一播报搜索到的素材，引导用户保留或跳过
- 阶段2（参数确认）：确认输出语言、角色数量和名字
- 阶段3（生成脚本）：基于素材生成脚本，播报摘要等待确认
- 阶段4（选择音色）：列出可用音色，引导用户选择每个角色的音色
- 阶段5（生成播客）：确认所有参数，开始生成

回复要简洁，适合语音播报。"""

STAGE_NAMES = ["确定主题", "筛选素材", "参数确认", "生成脚本", "选择音色", "生成播客"]

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


@router.websocket("/api/voice/stream")
async def voice_stream(websocket: WebSocket):
    await websocket.accept()
    session_id = str(uuid.uuid4())
    sessions[session_id] = {
        "stage": 0,
        "history": [],  # [{role, content}]
        "materials": [],
        "params": {"language": "中文", "roles": []},
        "voices": {},
        "script": "",
    }
    session = sessions[session_id]
    settings = get_settings()

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

    audio_buffer = bytearray()

    try:
        while True:
            message = await websocket.receive()

            if message["type"] == "websocket.disconnect":
                break

            if "bytes" in message and message["bytes"]:
                # 收到音频数据，加入缓冲区
                audio_buffer.extend(message["bytes"])

            elif "text" in message and message["text"]:
                data = json.loads(message["text"])

                if data.get("type") == "end_speech":
                    # 用户说完了，处理音频
                    if not audio_buffer:
                        continue

                    audio_data = bytes(audio_buffer)
                    audio_buffer.clear()

                    # STT
                    try:
                        transcript = await stt(audio_data, settings.get("elevenlabs_key", ""))
                    except Exception as e:
                        await websocket.send_json({"type": "error", "message": f"STT 失败: {str(e)}"})
                        continue

                    # 过滤空内容和噪音标记（如 "(background noise)"）
                    clean = transcript.strip()
                    if not clean or (clean.startswith("(") and clean.endswith(")")):
                        await websocket.send_json({"type": "no_speech"})
                        continue

                    await websocket.send_json({"type": "transcript", "text": transcript})

                    session["history"].append({"role": "user", "content": transcript})

                    # 根据阶段处理
                    ai_response = await handle_stage(session, transcript, settings, websocket)

                    if ai_response:
                        session["history"].append({"role": "assistant", "content": ai_response})
                        await websocket.send_json({"type": "ai_text", "text": ai_response, "stage": session["stage"]})

                        # TTS
                        try:
                            audio_bytes = await tts(ai_response, _assistant_voice(settings), settings.get("elevenlabs_key", ""))
                            audio_b64 = base64.b64encode(audio_bytes).decode()
                            await websocket.send_json({"type": "audio", "data": audio_b64})
                        except Exception as e:
                            await websocket.send_json({"type": "error", "message": f"TTS 失败: {str(e)}"})

                elif data.get("type") == "follow_up":
                    # 用户长时间未回复，AI 主动跟进
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
        sessions.pop(session_id, None)


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
        # 确定主题阶段：提取关键词并搜索
        if active_provider:
            response = await chat(
                messages,
                active_provider["base_url"],
                active_provider["api_key"],
                active_model,
            )
        else:
            response = "请先在设置页面配置 AI 模型供应商。"

        # 尝试搜索
        try:
            await websocket.send_json({"type": "ai_text", "text": "好的，我来搜索相关资料……", "stage": 0})
            firecrawl_key = settings.get("firecrawl_key", "")
            results = await search(user_text, firecrawl_key)
            session["materials"] = results
            # 升级到阶段1
            session["stage"] = 1
            await websocket.send_json({"type": "stage_change", "stage": 1})
            # 构建素材播报
            material_text = f"已找到 {len(results)} 条相关内容。"
            for i, r in enumerate(results[:3], 1):
                material_text += f"第{i}条：{r.get('title', '未知标题')}。{r.get('snippet', '')[:80]}。"
            material_text += '你想保留哪些素材？可以说「保留第1条」或「全部保留」。'
            return material_text
        except Exception:
            return response

    elif stage == 1:
        # 筛选素材阶段
        if not active_provider:
            return "请先配置 AI 模型供应商。"

        keywords_next = ["下一步", "确认", "没问题", "继续", "好了", "完成"]
        if any(k in user_text for k in keywords_next):
            session["stage"] = 2
            await websocket.send_json({"type": "stage_change", "stage": 2})
            return '素材确认完毕！现在设置播客参数。输出语言默认中文，请告诉我角色数量和名字，比如「主持人叫小明，嘉宾叫小红」。'

        response = await chat(
            messages,
            active_provider["base_url"],
            active_provider["api_key"],
            active_model,
        )
        return response

    elif stage == 2:
        # 参数确认
        if not active_provider:
            return "请先配置 AI 模型供应商。"

        response = await chat(
            messages + [{"role": "user", "content": f"请从这段话中提取角色名字和语言设置，并确认参数：{user_text}"}],
            active_provider["base_url"],
            active_provider["api_key"],
            active_model,
        )

        keywords_next = ["好了", "确认", "没问题", "下一步", "生成", "继续"]
        if any(k in user_text for k in keywords_next):
            session["stage"] = 3
            await websocket.send_json({"type": "stage_change", "stage": 3})
            return "参数确认！开始生成脚本，请稍候……"
        return response

    elif stage == 3:
        # 生成脚本
        if not active_provider:
            return "请先配置 AI 模型供应商。"

        keywords_confirm = ["好了", "确认", "没问题", "继续", "下一步", "选音色"]
        keywords_generate = ["生成脚本", "开始生成", "生成吧"]

        if any(k in user_text for k in keywords_generate) or not session.get("script"):
            script_prompt = (
                f"基于以下素材，生成一段播客对话脚本。\n"
                f"素材：{json.dumps(session['materials'][:3], ensure_ascii=False)}\n"
                f"参数：{json.dumps(session['params'], ensure_ascii=False)}\n"
                f'要求：2个角色对话，自然流畅，约5分钟（约800字），格式为「角色名：台词」。'
            )
            script = await chat(
                [{"role": "user", "content": script_prompt}],
                active_provider["base_url"],
                active_provider["api_key"],
                active_model,
            )
            session["script"] = script
            return (
                f"脚本已生成！共约{len(script)}字。"
                f"脚本概要：{script[:150]}..."
                f"你觉得怎么样？需要修改还是直接选择音色？"
            )

        if any(k in user_text for k in keywords_confirm):
            session["stage"] = 4
            await websocket.send_json({"type": "stage_change", "stage": 4})
            return "脚本确认！现在为角色选择音色。我们有多种音色供选择，你想听几个样本吗？"

        response = await chat(
            messages,
            active_provider["base_url"],
            active_provider["api_key"],
            active_model,
        )
        return response

    elif stage == 4:
        # 选择音色
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
        # 兜底：按 attempt 轮换预设追问，避免 API 限速导致无追问
        bucket = FOLLOW_UP_FALLBACKS[(attempt - 1) % len(FOLLOW_UP_FALLBACKS)]
        stage_idx = min(stage, len(bucket) - 1)
        return bucket[stage_idx]
