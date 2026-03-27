from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from database import init_db
from api import settings, voices, sources, voice, script, podcast

app = FastAPI(title="PodCraft Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 挂载路由
app.include_router(settings.router)
app.include_router(voices.router)
app.include_router(sources.router)
app.include_router(voice.router)
app.include_router(script.router)
app.include_router(podcast.router)

# 静态文件（音频）
storage_path = Path(__file__).parent / "storage"
storage_path.mkdir(exist_ok=True)
app.mount("/storage", StaticFiles(directory=str(storage_path)), name="storage")


@app.on_event("startup")
async def startup():
    init_db()


@app.get("/health")
def health():
    return {"status": "ok", "version": "2.0-frontend-keys"}


@app.get("/api/version")
def api_version():
    return {"version": "2.0-frontend-keys"}
