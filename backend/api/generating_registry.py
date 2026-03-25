"""
轻量内存注册表，跟踪正在生成的播客任务。
voice.py 写入，podcast.py 读取，无循环依赖。
"""
from typing import Any

_registry: dict[str, dict[str, Any]] = {}


def register(podcast_id: str, title: str, total: int) -> None:
    _registry[podcast_id] = {"id": podcast_id, "title": title, "current": 0, "total": total}


def update_progress(podcast_id: str, current: int) -> None:
    if podcast_id in _registry:
        _registry[podcast_id]["current"] = current


def unregister(podcast_id: str) -> None:
    _registry.pop(podcast_id, None)


def get_all() -> list[dict[str, Any]]:
    return list(_registry.values())
