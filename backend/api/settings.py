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
    assistant_voice_id: Optional[str] = None
    content_model: Optional[str] = None
    content_provider_id: Optional[str] = None
    stt_model: Optional[str] = None


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
        "assistant_voice_id": settings.get("assistant_voice_id", ""),
        "content_model": settings.get("content_model", ""),
        "content_provider_id": settings.get("content_provider_id", ""),
        "stt_model": settings.get("stt_model", "scribe_v1"),
        "providers": [
            {
                **p,
                "api_key": mask_key(p.get("api_key", "")),
            }
            for p in settings.get("providers", [])
        ],
    }


@router.put("/api/settings/services")
async def update_services(body: ServicesUpdate):
    data = {}
    elevenlabs_verified = None
    # 只在 key 非空且不含掩码字符时才更新
    if body.elevenlabs_key and "\u2022" not in body.elevenlabs_key:
        # 验证 ElevenLabs key 有效性
        try:
            from services.elevenlabs import list_voices
            await list_voices(body.elevenlabs_key)
            data["elevenlabs_key"] = body.elevenlabs_key
            elevenlabs_verified = True
        except Exception:
            elevenlabs_verified = False
    if body.firecrawl_key and "\u2022" not in body.firecrawl_key:
        data["firecrawl_key"] = body.firecrawl_key
    if body.assistant_voice_id is not None:
        data["assistant_voice_id"] = body.assistant_voice_id
    if body.content_model is not None:
        data["content_model"] = body.content_model
    if body.content_provider_id is not None:
        data["content_provider_id"] = body.content_provider_id
    if body.stt_model is not None:
        data["stt_model"] = body.stt_model
    save_settings(data)
    return {"ok": True, "elevenlabs_verified": elevenlabs_verified}


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

    # 尝试获取模型列表；失败时允许添加，使用空列表
    models_warning = None
    if body.models:
        models = body.models
    else:
        try:
            models = await list_models(body.base_url, body.api_key)
        except Exception as e:
            models = []
            models_warning = str(e)

    new_provider = {
        "id": str(uuid.uuid4()),
        "name": body.name,
        "base_url": body.base_url,
        "api_key": body.api_key,
        "models": models,
        "active": len(providers) == 0,
    }
    providers.append(new_provider)
    save_settings({"providers": providers})

    result = {**new_provider, "api_key": mask_key(new_provider["api_key"])}
    if models_warning:
        result["models_warning"] = models_warning
    return result


class ProviderUpdate(BaseModel):
    name: str
    base_url: str
    api_key: Optional[str] = None  # None 表示不更新 key
    models: Optional[List[str]] = None  # 手动指定模型列表


@router.put("/api/settings/providers/{provider_id}")
async def update_provider(provider_id: str, body: ProviderUpdate):
    from fastapi import HTTPException
    settings = get_settings()
    providers = settings.get("providers", [])
    provider = next((p for p in providers if p.get("id") == provider_id), None)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    # 使用新 key 或保留原 key
    api_key = body.api_key if body.api_key else provider["api_key"]

    # 手动指定模型优先；否则尝试自动获取，失败时保留原有列表
    models_warning = None
    if body.models is not None:
        models = body.models
    else:
        try:
            models = await list_models(body.base_url, api_key)
        except Exception as e:
            models = provider.get("models", [])
            models_warning = str(e)

    provider["name"] = body.name
    provider["base_url"] = body.base_url
    provider["api_key"] = api_key
    provider["models"] = models

    save_settings({"providers": providers})
    result = {**provider, "api_key": mask_key(provider["api_key"])}
    if models_warning:
        result["models_warning"] = models_warning
    return result


@router.put("/api/settings/providers/{provider_id}/activate")
def activate_provider(provider_id: str):
    from fastapi import HTTPException
    settings = get_settings()
    providers = settings.get("providers", [])
    if not any(p.get("id") == provider_id for p in providers):
        raise HTTPException(status_code=404, detail="Provider not found")
    for p in providers:
        p["active"] = p.get("id") == provider_id
    save_settings({"providers": providers})
    return {"ok": True}


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
