import uuid
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional, List
from config import get_settings, save_settings, mask_key
from services.llm import list_models

router = APIRouter()


class ServicesUpdate(BaseModel):
    elevenlabs_key: Optional[str] = None
    firecrawl_key: Optional[str] = None


class ProviderCreate(BaseModel):
    name: str
    base_url: str
    api_key: str
    models: Optional[List[str]] = None


@router.get("/api/settings")
def get_settings_api():
    settings = get_settings()
    return {
        "elevenlabs_key": mask_key(settings.get("elevenlabs_key", "")),
        "firecrawl_key": mask_key(settings.get("firecrawl_key", "")),
        "providers": [
            {
                **p,
                "api_key": mask_key(p.get("api_key", "")),
            }
            for p in settings.get("providers", [])
        ],
    }


@router.put("/api/settings/services")
def update_services(body: ServicesUpdate):
    data = {}
    if body.elevenlabs_key is not None:
        data["elevenlabs_key"] = body.elevenlabs_key
    if body.firecrawl_key is not None:
        data["firecrawl_key"] = body.firecrawl_key
    save_settings(data)
    return {"ok": True}


@router.get("/api/settings/providers")
def get_providers():
    settings = get_settings()
    providers = settings.get("providers", [])
    return [
        {**p, "api_key": mask_key(p.get("api_key", ""))}
        for p in providers
    ]


@router.post("/api/settings/providers")
async def add_provider(body: ProviderCreate):
    settings = get_settings()
    providers = settings.get("providers", [])

    # 尝试获取模型列表
    models = body.models or []
    if not models:
        try:
            models = await list_models(body.base_url, body.api_key)
        except Exception:
            models = []

    new_provider = {
        "id": str(uuid.uuid4()),
        "name": body.name,
        "base_url": body.base_url,
        "api_key": body.api_key,
        "models": models,
        "active": len(providers) == 0,  # 第一个 provider 默认激活
    }
    providers.append(new_provider)
    save_settings({"providers": providers})

    return {**new_provider, "api_key": mask_key(new_provider["api_key"])}


@router.delete("/api/settings/providers/{provider_id}")
def delete_provider(provider_id: str):
    settings = get_settings()
    providers = settings.get("providers", [])
    providers = [p for p in providers if p.get("id") != provider_id]
    save_settings({"providers": providers})
    return {"ok": True}


@router.get("/api/settings/providers/{provider_id}/models")
async def get_provider_models(provider_id: str):
    settings = get_settings()
    providers = settings.get("providers", [])
    provider = next((p for p in providers if p.get("id") == provider_id), None)
    if not provider:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Provider not found")
    try:
        models = await list_models(provider["base_url"], provider["api_key"])
        # 同步更新缓存
        provider["models"] = models
        save_settings({"providers": providers})
        return {"models": models}
    except Exception as e:
        return {"models": provider.get("models", []), "error": str(e)}
