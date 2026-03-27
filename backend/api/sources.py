from fastapi import APIRouter, Header
from pydantic import BaseModel
from typing import Optional
from services.firecrawl import search as fc_search, scrape as fc_scrape

router = APIRouter()


class SearchRequest(BaseModel):
    query: str


class UrlRequest(BaseModel):
    url: str


@router.post("/api/sources/search")
async def search_sources(body: SearchRequest, x_firecrawl_key: Optional[str] = Header(None)):
    api_key = x_firecrawl_key or ""
    if not api_key:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Firecrawl API key not provided")
    results = await fc_search(body.query, api_key)
    return results


@router.post("/api/sources/url")
async def scrape_url(body: UrlRequest, x_firecrawl_key: Optional[str] = Header(None)):
    api_key = x_firecrawl_key or ""
    if not api_key:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Firecrawl API key not provided")
    content = await fc_scrape(body.url, api_key)
    return {"url": body.url, "content": content}
