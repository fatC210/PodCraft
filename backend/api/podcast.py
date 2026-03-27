import uuid
import re
import json
from pathlib import Path
from datetime import datetime
from fastapi import APIRouter, Header
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Dict, Optional
from services.elevenlabs import tts
from database import save_podcast, get_podcasts, get_podcast_by_id, delete_podcast as db_delete_podcast
from api.generating_registry import get_all as get_generating

router = APIRouter()

STORAGE_DIR = Path(__file__).parent.parent / "storage"
STORAGE_DIR.mkdir(exist_ok=True)


class GeneratePodcastRequest(BaseModel):
    script: str
    voice_assignments: Dict[str, str]  # {role_name: voice_id}
    session_id: Optional[str] = None
    title: Optional[str] = None
    language: Optional[str] = "中文"


def parse_script_segments(script: str, voice_assignments: Dict[str, str]) -> list:
    """将脚本解析为 [{role, text, voice_id}] 列表"""
    segments = []
    lines = script.strip().split("\n")
    for line in lines:
        line = line.strip()
        if not line:
            continue
        # 匹配 "角色名：台词" 格式
        match = re.match(r"^([^：:]+)[：:]\s*(.+)$", line)
        if match:
            role = match.group(1).strip()
            text = match.group(2).strip()
            voice_id = voice_assignments.get(role)
            if voice_id and text:
                segments.append({"role": role, "text": text, "voice_id": voice_id})
        # 如果没有角色前缀，跳过
    return segments


@router.post("/api/podcast/generate")
async def generate_podcast(body: GeneratePodcastRequest, x_elevenlabs_key: Optional[str] = Header(None)):
    api_key = x_elevenlabs_key or ""
    if not api_key:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="ElevenLabs API key not provided")

    segments = parse_script_segments(body.script, body.voice_assignments)
    if not segments:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="No valid script segments found")

    # 逐段 TTS
    audio_chunks = []
    for seg in segments:
        try:
            chunk = await tts(seg["text"], seg["voice_id"], api_key)
            audio_chunks.append(chunk)
        except Exception as e:
            from fastapi import HTTPException
            raise HTTPException(status_code=500, detail=f"TTS failed for role {seg['role']}: {str(e)}")

    # 用 pydub 拼接音频，并记录每段时间偏移
    segments_info = []
    try:
        from pydub import AudioSegment
        import io

        combined = None
        offset_ms = 0
        for i, (chunk, seg) in enumerate(zip(audio_chunks, segments)):
            seg_audio = AudioSegment.from_file(io.BytesIO(chunk), format="mp3")
            seg_duration_ms = len(seg_audio)
            segments_info.append({
                "role": seg["role"],
                "text": seg["text"],
                "start_ms": offset_ms,
                "duration_ms": seg_duration_ms,
            })
            offset_ms += seg_duration_ms
            if combined is None:
                combined = seg_audio
            else:
                combined = combined + seg_audio

        podcast_id = str(uuid.uuid4())
        audio_filename = f"{podcast_id}.mp3"
        audio_path = STORAGE_DIR / audio_filename

        combined.export(str(audio_path), format="mp3")

        # 计算时长
        duration_seconds = len(combined) / 1000
        minutes = int(duration_seconds // 60)
        seconds = int(duration_seconds % 60)
        duration_str = f"{minutes}:{seconds:02d}"

    except ImportError:
        # pydub 不可用时，直接拼接字节（仅适用于相同参数的 MP3）
        podcast_id = str(uuid.uuid4())
        audio_filename = f"{podcast_id}.mp3"
        audio_path = STORAGE_DIR / audio_filename
        audio_path.write_bytes(b"".join(audio_chunks))
        duration_str = "未知"
        # 无时间戳时均等分配
        for seg in segments:
            segments_info.append({"role": seg["role"], "text": seg["text"], "start_ms": -1, "duration_ms": -1})

    # 入库
    podcast_data = {
        "id": podcast_id,
        "title": body.title or f"播客 {datetime.now().strftime('%Y%m%d %H%M')}",
        "duration": duration_str,
        "date": datetime.now().strftime("%Y-%m-%d"),
        "language": body.language or "中文",
        "materials": len(body.voice_assignments),
        "audio_path": audio_filename,
        "script": body.script,
        "segments_json": json.dumps(segments_info, ensure_ascii=False),
        "created_at": datetime.now().isoformat(),
    }
    save_podcast(podcast_data)

    return {
        "id": podcast_id,
        "audio_url": f"/storage/{audio_filename}",
        "duration": duration_str,
        "title": podcast_data["title"],
    }


@router.get("/api/podcast/history")
def podcast_history():
    completed = [
        {**p, "audio_url": f"/storage/{p['audio_path']}" if p.get("audio_path") else None, "status": "completed"}
        for p in get_podcasts()
    ]
    generating = [
        {
            "id": g["id"], "title": g["title"], "status": "generating",
            "current": g["current"], "total": g["total"],
            "duration": None, "date": None, "language": None,
            "materials": 0, "audio_url": None,
        }
        for g in get_generating()
    ]
    return generating + completed


@router.get("/api/podcast/{podcast_id}")
def get_podcast(podcast_id: str):
    podcast = get_podcast_by_id(podcast_id)
    if not podcast:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Podcast not found")
    return {
        **podcast,
        "audio_url": f"/storage/{podcast['audio_path']}" if podcast.get("audio_path") else None,
    }


@router.delete("/api/podcast/{podcast_id}")
def delete_podcast_endpoint(podcast_id: str):
    podcast = get_podcast_by_id(podcast_id)
    if not podcast:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Podcast not found")

    # 删除音频文件
    if podcast.get("audio_path"):
        audio_file = STORAGE_DIR / podcast["audio_path"]
        if audio_file.exists():
            audio_file.unlink()

    db_delete_podcast(podcast_id)
    return {"ok": True}
