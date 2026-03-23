import httpx
from typing import AsyncIterator


ELEVENLABS_BASE = "https://api.elevenlabs.io"


async def stt(audio_bytes: bytes, api_key: str) -> str:
    """语音转文字，使用 ElevenLabs Scribe v1"""
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            f"{ELEVENLABS_BASE}/v1/speech-to-text",
            headers={"xi-api-key": api_key},
            files={"file": ("audio.webm", audio_bytes, "audio/webm")},
            data={"model_id": "scribe_v1"},
        )
        response.raise_for_status()
        result = response.json()
        return result.get("text", "")


async def tts(text: str, voice_id: str, api_key: str) -> bytes:
    """文字转语音，返回 MP3 音频字节"""
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            f"{ELEVENLABS_BASE}/v1/text-to-speech/{voice_id}",
            headers={
                "xi-api-key": api_key,
                "Content-Type": "application/json",
            },
            json={
                "text": text,
                "model_id": "eleven_multilingual_v2",
                "voice_settings": {
                    "stability": 0.5,
                    "similarity_boost": 0.75,
                },
            },
        )
        response.raise_for_status()
        return response.content


async def tts_stream(text: str, voice_id: str, api_key: str) -> bytes:
    """流式 TTS，收集所有 chunk 后返回完整音频字节"""
    chunks = []
    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream(
            "POST",
            f"{ELEVENLABS_BASE}/v1/text-to-speech/{voice_id}/stream",
            headers={
                "xi-api-key": api_key,
                "Content-Type": "application/json",
            },
            json={
                "text": text,
                "model_id": "eleven_multilingual_v2",
                "voice_settings": {
                    "stability": 0.5,
                    "similarity_boost": 0.75,
                },
            },
        ) as response:
            response.raise_for_status()
            async for chunk in response.aiter_bytes():
                if chunk:
                    chunks.append(chunk)
    return b"".join(chunks)


async def list_voices(api_key: str) -> list:
    """获取可用音色列表"""
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(
            f"{ELEVENLABS_BASE}/v1/voices",
            headers={"xi-api-key": api_key},
        )
        response.raise_for_status()
        data = response.json()
        voices = []
        for v in data.get("voices", []):
            voices.append({
                "id": v.get("voice_id"),
                "name": v.get("name"),
                "preview_url": v.get("preview_url"),
                "labels": v.get("labels", {}),
            })
        return voices
