import httpx
import json
from typing import AsyncIterator


async def chat(messages: list, base_url: str, api_key: str, model: str) -> str:
    """调用 OpenAI-compatible 接口，返回完整回复文本"""
    base_url = base_url.rstrip("/")
    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            f"{base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": messages,
            },
        )
        if not response.is_success:
            body = response.text[:300].strip()
            raise ValueError(f"LLM API {response.status_code}: {body or '(empty)'}")
        try:
            data = response.json()
        except Exception:
            snippet = response.text[:200].strip()
            if snippet.lower().startswith(("<!doctype", "<html")):
                raise ValueError("LLM API 返回了 HTML 页面（非 JSON），请检查供应商地址、API Key 或网络连通性")
            raise ValueError(f"LLM 返回了非 JSON 响应: {snippet or '(empty)'}")
        return data["choices"][0]["message"]["content"]


async def chat_stream(
    messages: list, base_url: str, api_key: str, model: str
) -> AsyncIterator[str]:
    """流式调用 OpenAI-compatible 接口，逐 token yield 文本"""
    base_url = base_url.rstrip("/")
    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream(
            "POST",
            f"{base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": messages,
                "stream": True,
            },
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line.startswith("data: "):
                    continue
                payload = line[6:]
                if payload.strip() == "[DONE]":
                    return
                try:
                    chunk = json.loads(payload)
                    delta = chunk["choices"][0]["delta"]
                    content = delta.get("content", "")
                    if content:
                        yield content
                except (json.JSONDecodeError, KeyError, IndexError):
                    continue


async def list_models(base_url: str, api_key: str) -> list:
    """获取 provider 的可用模型列表"""
    base_url = base_url.rstrip("/")
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(
            f"{base_url}/models",
            headers={"Authorization": f"Bearer {api_key}"},
        )
        response.raise_for_status()
        data = response.json()
        models = []
        for m in data.get("data", []):
            model_id = m.get("id", "")
            if model_id:
                models.append(model_id)
        return models
