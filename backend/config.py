import json
import os
from pathlib import Path
from cryptography.fernet import Fernet

SETTINGS_PATH = Path(__file__).parent / "settings.json"
KEY_PATH = Path(__file__).parent / ".fernet_key"


def _get_fernet() -> Fernet:
    if KEY_PATH.exists():
        key = KEY_PATH.read_bytes()
    else:
        key = Fernet.generate_key()
        KEY_PATH.write_bytes(key)
    return Fernet(key)


def _encrypt(value: str) -> str:
    if not value:
        return value
    f = _get_fernet()
    return f.encrypt(value.encode()).decode()


def _decrypt(value: str) -> str:
    if not value:
        return value
    try:
        f = _get_fernet()
        return f.decrypt(value.encode()).decode()
    except Exception:
        return value


def get_settings() -> dict:
    if not SETTINGS_PATH.exists():
        return {}
    try:
        raw = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}

    result = {}

    # 解密 elevenlabs_key
    if raw.get("elevenlabs_key"):
        result["elevenlabs_key"] = _decrypt(raw["elevenlabs_key"])
    else:
        result["elevenlabs_key"] = ""

    # 解密 firecrawl_key
    if raw.get("firecrawl_key"):
        result["firecrawl_key"] = _decrypt(raw["firecrawl_key"])
    else:
        result["firecrawl_key"] = ""

    # assistant_voice_id / content_model / content_provider_id / stt_model（明文存储）
    result["assistant_voice_id"] = raw.get("assistant_voice_id", "")
    result["content_model"] = raw.get("content_model", "")
    result["content_provider_id"] = raw.get("content_provider_id", "")
    result["stt_model"] = raw.get("stt_model", "scribe_v1")

    # 解密 providers
    providers = []
    for p in raw.get("providers", []):
        provider = dict(p)
        if provider.get("api_key"):
            provider["api_key"] = _decrypt(provider["api_key"])
        providers.append(provider)
    result["providers"] = providers

    return result


def save_settings(data: dict):
    # 先读取现有设置
    existing = {}
    if SETTINGS_PATH.exists():
        try:
            existing = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
        except Exception:
            existing = {}

    to_save = dict(existing)

    if "elevenlabs_key" in data:
        val = data["elevenlabs_key"]
        to_save["elevenlabs_key"] = _encrypt(val) if val else ""

    if "firecrawl_key" in data:
        val = data["firecrawl_key"]
        to_save["firecrawl_key"] = _encrypt(val) if val else ""

    if "assistant_voice_id" in data:
        to_save["assistant_voice_id"] = data["assistant_voice_id"]

    if "content_model" in data:
        to_save["content_model"] = data["content_model"]

    if "content_provider_id" in data:
        to_save["content_provider_id"] = data["content_provider_id"]

    if "stt_model" in data:
        to_save["stt_model"] = data["stt_model"]

    if "providers" in data:
        encrypted_providers = []
        for p in data["providers"]:
            provider = dict(p)
            if provider.get("api_key"):
                provider["api_key"] = _encrypt(provider["api_key"])
            encrypted_providers.append(provider)
        to_save["providers"] = encrypted_providers

    SETTINGS_PATH.write_text(json.dumps(to_save, ensure_ascii=False, indent=2), encoding="utf-8")


def mask_key(key: str) -> str:
    if not key:
        return ""
    if len(key) <= 8:
        return "••••"
    return key[:4] + "••••" + key[-4:]
