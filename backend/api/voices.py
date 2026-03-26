from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from config import get_settings
from services.elevenlabs import list_voices, tts
import io

router = APIRouter()

PREVIEW_TEXT = "Hello, this is a preview of my voice. I hope you like it!"


@router.get("/api/voices/list")
async def get_voices():
    settings = get_settings()
    api_key = settings.get("elevenlabs_key", "")
    if not api_key:
        raise HTTPException(status_code=400, detail="ElevenLabs API key not configured")
    try:
        voices = await list_voices(api_key)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"ElevenLabs unavailable: {e}")
    return voices


@router.get("/api/voices/{voice_id}/preview")
async def voice_preview(voice_id: str):
    settings = get_settings()
    api_key = settings.get("elevenlabs_key", "")
    if not api_key:
        raise HTTPException(status_code=400, detail="ElevenLabs API key not configured")

    audio_bytes = await tts(PREVIEW_TEXT, voice_id, api_key)

    return StreamingResponse(
        io.BytesIO(audio_bytes),
        media_type="audio/mpeg",
        headers={"Content-Disposition": f"inline; filename=preview_{voice_id}.mp3"},
    )
