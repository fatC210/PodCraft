# PodCraft — Voice-Driven AI Podcast Creator

> Speak your idea. Get a podcast.

PodCraft is an AI-powered podcast creation platform where the entire production workflow — topic selection, web research, script writing, voice casting, and audio synthesis — is driven entirely by natural voice conversation with an AI assistant.

**[中文文档 → README.zh.md](./README.zh.md)**

---

## Highlights

- **Fully voice-driven** — Every stage is controlled by speaking to the AI. No forms, no dropdowns.
- **End-to-end pipeline** — From raw idea to playable MP3 in one session
- **Web research built-in** — Firecrawl searches and scrapes fresh sources to ground your script in real content
- **LLM-agnostic** — Works with any OpenAI-compatible API: DeepSeek, OpenAI, Ollama, etc.
- **Real voice casting** — Assign real ElevenLabs voices to each podcast character; segments are synthesized and merged into final audio
- **Session resilience** — Interrupted sessions are persisted to SQLite and fully resumable
- **Bilingual** — Full zh/en i18n for both the UI and the AI conversation layer

---

## Pipeline

```
Stage 0  Define Topic     → AI extracts search keywords from your spoken idea
Stage 1  Filter Sources   → Firecrawl searches the web; you pick which sources to keep
Stage 2  Set Parameters   → Set output language and character names by voice
Stage 3  Review Script    → LLM streams a full two-host dialogue (~800 words); regenerate or confirm
Stage 4  Choose Voices    → Assign ElevenLabs voices to each character
Stage 5  Generate         → Backend synthesizes TTS per segment, merges with pydub, exports MP3
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite, Tailwind CSS, shadcn/ui, TanStack Query |
| Backend | Python, FastAPI, WebSockets, SQLite |
| AI / Voice | ElevenLabs (STT + TTS), any OpenAI-compatible LLM |
| Research | Firecrawl (web search + scraping) |
| Audio | pydub + ffmpeg |
| Deployment | Docker Compose, Nginx, Railway |

---

## Architecture

```
Browser
  │  WebSocket (voice stream)
  │  REST (podcasts, settings, history)
  ▼
Nginx  ──proxy──▶  FastAPI :8000
                        ├── ElevenLabs  (STT / TTS)
                        ├── Firecrawl   (web search)
                        ├── LLM API     (script generation)
                        └── SQLite      (sessions, podcasts)
```

---

## Quick Start

### Docker (recommended)

```bash
git clone https://github.com/fatC210/PodCraft.git
cd PodCraft
docker compose up
```

Open [http://localhost](http://localhost), go to **Settings**, and paste in your API keys.

### Local Development

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend (separate terminal)
npm install
npm run dev
```

Open [http://localhost:8080](http://localhost:8080).

### Prerequisites

- Docker & Docker Compose, **or** Python 3.10+ and Node.js 18+
- ffmpeg — `winget install ffmpeg` on Windows
- API keys: [ElevenLabs](https://elevenlabs.io), [Firecrawl](https://firecrawl.dev), and an OpenAI-compatible LLM

---

## Configuration

All runtime config is managed through the in-app **Settings** page and persisted to `backend/settings.json`.

| Setting | Purpose |
|---------|---------|
| ElevenLabs API Key | Speech-to-text + voice synthesis |
| Firecrawl API Key | Web search and content scraping |
| LLM Provider | Any OpenAI-compatible endpoint + model |

---

## License

MIT
