# config.py — 所有 API keys 已迁移到前端 localStorage 存储
# 后端不再存储或读取任何 API keys


def get_settings() -> dict:
    """返回空设置（兼容性保留，已无实际数据）"""
    return {}


def mask_key(key: str) -> str:
    if not key:
        return ""
    if len(key) <= 8:
        return "••••"
    return key[:4] + "••••" + key[-4:]
