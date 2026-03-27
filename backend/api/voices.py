from fastapi import APIRouter, HTTPException, Header
from fastapi.responses import StreamingResponse
from typing import Optional
from services.elevenlabs import list_voices, tts
import io

router = APIRouter()

PREVIEW_TEXT = "Hello, this is a preview of my voice. I hope you like it!"


@router.get("/api/voices/list")
async def get_voices(x_elevenlabs_key: Optional[str] = Header(None)):
    api_key = x_elevenlabs_key or ""
    if not api_key:
        raise HTTPException(status_code=400, detail="ElevenLabs API key not provided")
    try:
        voices = await list_voices(api_key)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"ElevenLabs unavailable: {e}")
    return voices


@router.get("/api/voices/{voice_id}/preview")
async def voice_preview(voice_id: str, x_elevenlabs_key: Optional[str] = Header(None)):
    api_key = x_elevenlabs_key or ""
    if not api_key:
        raise HTTPException(status_code=400, detail="ElevenLabs API key not provided")

    audio_bytes = await tts(PREVIEW_TEXT, voice_id, api_key)

    return StreamingResponse(
        io.BytesIO(audio_bytes),
        media_type="audio/mpeg",
        headers={"Content-Disposition": f"inline; filename=preview_{voice_id}.mp3"},
    )
