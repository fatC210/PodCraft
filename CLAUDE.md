# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. Reply in Chinese.

## Commands

### Frontend
```bash
npm run dev        # Start Vite dev server at http://localhost:8080
npm run build      # Production build
npm run lint       # ESLint
npm run test       # Vitest (single run)
npm run test:watch # Vitest (watch mode)
```

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Docker (full stack)
```bash
docker compose up
```

## Architecture

**Request flow:** Browser → Vite proxy (dev) / Nginx (prod) → FastAPI :8000

**API key transport:** Keys are stored in frontend `localStorage` and sent to the backend on every request — via WebSocket query params for the voice stream, and via HTTP headers (`X-ElevenLabs-Key`, `X-Firecrawl-Key`, `X-Provider-*`) for REST endpoints. The backend never persists keys.

### Frontend (`src/`)
- `lib/api.ts` — All HTTP + WebSocket URL builders; reads keys from `lib/settings-store.ts` and injects into every request
- `lib/settings-store.ts` — localStorage-backed settings (providers, API keys, voice config)
- `lib/store.ts` — `usePodcastStore`, `useCallStore`, `useHistoryStore` (localStorage)
- `lib/i18n.tsx` — zh/en i18n, localStorage-persisted locale
- `pages/VoiceStudio` — Core voice conversation UI; owns the WebSocket lifecycle
- `pages/SettingsPage` — Provider/key management
- `components/ui/` — shadcn/ui components (generated, don't edit manually)

### Backend (`backend/`)
- `main.py` — FastAPI app entry; mounts all routers; serves `/storage` static files; calls `init_db()` on startup
- `database.py` — SQLite (`podcraft.db`); two tables: `podcasts` and `interrupted_sessions`
- `api/voice.py` — WebSocket `/api/voice/stream`; drives the 6-stage conversation state machine; saves interrupted sessions on disconnect
- `api/podcast.py` — Podcast CRUD + MP3 assembly with pydub; `parse_script_segments()` parses `角色名：台词` format
- `api/generating_registry.py` — In-memory registry tracking in-progress podcast generation (read by `podcast.py`, written by `voice.py`)
- `api/settings.py` — Single endpoint: `POST /api/settings/models` proxies model list from LLM provider
- `api/voices.py` / `api/sources.py` / `api/script.py` — ElevenLabs voices, Firecrawl search/scrape, LLM script generation
- `services/elevenlabs.py` — `stt()`, `tts()`, `list_voices()`
- `services/llm.py` — `chat()`, `chat_stream()`, `list_models()` — OpenAI-compatible, provider-agnostic
- `services/firecrawl.py` — `search()`, `scrape()`

### 6-Stage Voice Pipeline (the core loop)
Managed as a session dict in `api/voice.py::handle_stage()`:

| Stage | Name | Key action |
|-------|------|------------|
| 0 | Define Topic | STT → LLM → Firecrawl search |
| 1 | Filter Sources | User keeps/skips materials |
| 2 | Set Parameters | Extract language + role names |
| 3 | Review Script | LLM streams full script; user confirms/regenerates |
| 4 | Choose Voices | Assign ElevenLabs voices per role |
| 5 | Generate | pydub merges per-segment TTS → MP3 saved to `backend/storage/` |

Sessions are keyed by UUID in the in-memory `sessions` dict. On WebSocket disconnect without an explicit end, the session is persisted to `interrupted_sessions` table for resumption.

### Key Conventions
- All i18n strings for the voice pipeline live in `_STRINGS` dict in `api/voice.py` (zh + en)
- Script format is `角色名：台词` (or `Role: Line`), parsed by `parse_script_segments()` in `api/podcast.py`
- `backend/storage/` holds generated MP3s; served as static files at `/storage/<filename>`
- `vite.config.ts` proxies `/api` and `/storage` to `localhost:8000` in development
