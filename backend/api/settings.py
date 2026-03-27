from fastapi import APIRouter
from pydantic import BaseModel
from services.llm import list_models

router = APIRouter()


class ModelsRequest(BaseModel):
    base_url: str
    api_key: str


@router.post("/api/settings/models")
async def get_models(body: ModelsRequest):
    """查询指定 LLM provider 支持的模型列表"""
    try:
        models = await list_models(body.base_url, body.api_key)
        return {"models": models}
    except Exception as e:
        return {"models": [], "error": str(e)}
