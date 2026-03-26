import httpx


FIRECRAWL_BASE = "https://api.firecrawl.dev"


async def search(query: str, api_key: str, limit: int = 5, lang: str = "zh") -> list:
    """搜索相关内容，返回素材列表"""
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            f"{FIRECRAWL_BASE}/v1/search",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "query": query,
                "limit": limit,
                "lang": lang,
                "scrapeOptions": {"formats": ["markdown"]},
            },
        )
        response.raise_for_status()
        data = response.json()
        results = []
        for item in data.get("data", []):
            results.append({
                "url": item.get("url", ""),
                "title": item.get("title", ""),
                "snippet": item.get("description", ""),
                "content": item.get("markdown", "") or item.get("content", ""),
            })
        return results


async def scrape(url: str, api_key: str) -> str:
    """抓取指定 URL 的 Markdown 内容"""
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            f"{FIRECRAWL_BASE}/v1/scrape",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "url": url,
                "formats": ["markdown"],
            },
        )
        response.raise_for_status()
        data = response.json()
        return data.get("data", {}).get("markdown", "") or data.get("markdown", "")
