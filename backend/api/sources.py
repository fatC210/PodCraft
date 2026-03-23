from fastapi import APIRouter
from pydantic import BaseModel
from config import get_settings
from services.firecrawl import search as fc_search, scrape as fc_scrape

router = APIRouter()


class SearchRequest(BaseModel):
    query: str


class UrlRequest(BaseModel):
    url: str


@router.post("/api/sources/search")
async def search_sources(body: SearchRequest):
    settings = get_settings()
    api_key = settings.get("firecrawl_key", "")
    if not api_key:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Firecrawl API key not configured")
    results = await fc_search(body.query, api_key)
    return results


@router.post("/api/sources/url")
async def scrape_url(body: UrlRequest):
    settings = get_settings()
    api_key = settings.get("firecrawl_key", "")
    if not api_key:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Firecrawl API key not configured")
    content = await fc_scrape(body.url, api_key)
    return {"url": body.url, "content": content}
