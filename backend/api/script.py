from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional
from config import get_settings
from services.llm import chat

router = APIRouter()


class GenerateScriptRequest(BaseModel):
    materials: List[dict]
    params: dict


class AIEditRequest(BaseModel):
    script: str
    instruction: str


@router.post("/api/script/generate")
async def generate_script(body: GenerateScriptRequest):
    settings = get_settings()
    providers = settings.get("providers", [])
    active_provider = next((p for p in providers if p.get("active")), providers[0] if providers else None)

    if not active_provider:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="No active AI provider configured")

    import json

    script_prompt = (
        f"基于以下素材，生成一段播客对话脚本。\n"
        f"素材：{json.dumps(body.materials[:5], ensure_ascii=False)}\n"
        f"参数：{json.dumps(body.params, ensure_ascii=False)}\n"
        f"要求：根据 params 中的 roles 列表设置角色，"
        f"对话自然流畅，约5分钟（约800字），格式为"角色名：台词"。"
        f"只输出脚本内容，不要额外说明。"
    )

    script = await chat(
        [{"role": "user", "content": script_prompt}],
        active_provider["base_url"],
        active_provider["api_key"],
        active_provider.get("models", ["gpt-4o"])[0],
    )
    return {"script": script}


@router.post("/api/script/ai-edit")
async def ai_edit_script(body: AIEditRequest):
    settings = get_settings()
    providers = settings.get("providers", [])
    active_provider = next((p for p in providers if p.get("active")), providers[0] if providers else None)

    if not active_provider:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="No active AI provider configured")

    edit_prompt = (
        f"请根据以下指令修改播客脚本。\n"
        f"指令：{body.instruction}\n\n"
        f"原始脚本：\n{body.script}\n\n"
        f"只输出修改后的完整脚本，不要额外说明。"
    )

    edited = await chat(
        [{"role": "user", "content": edit_prompt}],
        active_provider["base_url"],
        active_provider["api_key"],
        active_provider.get("models", ["gpt-4o"])[0],
    )
    return {"script": edited}
