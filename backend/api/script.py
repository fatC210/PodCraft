from fastapi import APIRouter, Header
from pydantic import BaseModel
from typing import List, Optional
from services.llm import chat

router = APIRouter()


class GenerateScriptRequest(BaseModel):
    materials: List[dict]
    params: dict


class AIEditRequest(BaseModel):
    script: str
    instruction: str


def _get_provider(base_url: str, api_key: str, model: str):
    if not base_url or not api_key:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="No AI provider configured")
    return base_url, api_key, model or "gpt-4o"


@router.post("/api/script/generate")
async def generate_script(
    body: GenerateScriptRequest,
    x_provider_base_url: Optional[str] = Header(None),
    x_provider_api_key: Optional[str] = Header(None),
    x_provider_model: Optional[str] = Header(None),
):
    base_url, api_key, model = _get_provider(
        x_provider_base_url or "", x_provider_api_key or "", x_provider_model or ""
    )

    import json

    script_prompt = (
        f"基于以下素材，生成一段播客对话脚本。\n"
        f"素材：{json.dumps(body.materials[:5], ensure_ascii=False)}\n"
        f"参数：{json.dumps(body.params, ensure_ascii=False)}\n"
        f"要求：根据 params 中的 roles 列表设置角色，"
        f'对话自然流畅，约5分钟（约800字），格式为"角色名:台词"。'
        f"只输出脚本内容，不要额外说明。"
    )

    script = await chat(
        [{"role": "user", "content": script_prompt}],
        base_url,
        api_key,
        model,
    )
    return {"script": script}


@router.post("/api/script/ai-edit")
async def ai_edit_script(
    body: AIEditRequest,
    x_provider_base_url: Optional[str] = Header(None),
    x_provider_api_key: Optional[str] = Header(None),
    x_provider_model: Optional[str] = Header(None),
):
    base_url, api_key, model = _get_provider(
        x_provider_base_url or "", x_provider_api_key or "", x_provider_model or ""
    )

    edit_prompt = (
        f"请根据以下指令修改播客脚本。\n"
        f"指令：{body.instruction}\n\n"
        f"原始脚本：\n{body.script}\n\n"
        f"只输出修改后的完整脚本，不要额外说明。"
    )

    edited = await chat(
        [{"role": "user", "content": edit_prompt}],
        base_url,
        api_key,
        model,
    )
    return {"script": edited}
