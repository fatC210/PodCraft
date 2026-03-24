import httpx
import asyncio
from typing import AsyncIterator


ELEVENLABS_BASE = "https://api.elevenlabs.io"

# 复用连接池，避免每次请求重新建立 TCP/TLS 连接
_client = httpx.AsyncClient(
    timeout=60.0,
    limits=httpx.Limits(max_connections=10, max_keepalive_connections=5),
)


async def stt(audio_bytes: bytes, api_key: str, retries: int = 3, language_code: str = "zh", model_id: str = "scribe_v1") -> str:
    """语音转文字，使用 ElevenLabs Scribe，失败时自动重试"""
    last_exc: Exception = RuntimeError("unknown")
    for attempt in range(retries):
        try:
            response = await _client.post(
                f"{ELEVENLABS_BASE}/v1/speech-to-text",
                headers={"xi-api-key": api_key},
                files={"file": ("audio.webm", audio_bytes, "audio/webm")},
                data={"model_id": model_id, "language_code": language_code},
            )
            response.raise_for_status()
            result = response.json()
            return result.get("text", "")
        except (httpx.RemoteProtocolError, httpx.ConnectError, httpx.ReadError) as e:
            last_exc = e
            if attempt < retries - 1:
                await asyncio.sleep(0.5 * (attempt + 1))
    raise last_exc


async def tts(text: str, voice_id: str, api_key: str) -> bytes:
    """文字转语音，返回 MP3 音频字节"""
    response = await _client.post(
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
    async with _client.stream(
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
    response = await _client.get(
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
