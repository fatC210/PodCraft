# PodCraft — 语音对话驱动的 AI 播客生成平台

> 说出你的想法，AI 帮你做成播客。

PodCraft 是一个 AI 驱动的播客创作平台。从选题、联网搜索、脚本生成、配音选角，到最终音频合成，整个流程完全通过与 AI 助手的语音对话完成。

**[English → README.md](./README.md)**

---

## 核心亮点

- **全程语音操控** — 用说话代替点击，每个环节都通过与 AI 的自然对话推进
- **端到端一站式流程** — 一次会话从原始想法到可播放的 MP3
- **内置联网搜索** — 集成 Firecrawl，自动抓取最新网页内容，让脚本有据可查
- **LLM 无锁定** — 兼容任意 OpenAI 接口：DeepSeek、OpenAI、Ollama 等本地模型均可
- **真实语音合成** — 为每个播客角色分配 ElevenLabs 真人声线，按段合成后拼接成完整音频
- **会话断点续传** — 中断的会话自动保存到 SQLite，随时恢复，不丢进度
- **中英双语** — UI 与 AI 对话层均支持中英文切换

---

## 生产流程

```
第 0 阶段  确定选题     → AI 从你的口述中提取搜索关键词
第 1 阶段  筛选来源     → Firecrawl 联网搜索，你挑选要保留的信息来源
第 2 阶段  设置参数     → 语音设定输出语言和角色名称
第 3 阶段  审核脚本     → LLM 流式生成约 800 字的双主播对话脚本，可重新生成或确认
第 4 阶段  选择声音     → 为每个角色分配 ElevenLabs 声线
第 5 阶段  生成播客     → 后端按段合成 TTS，pydub 拼接合并，导出 MP3
```

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 18 + TypeScript + Vite，Tailwind CSS，shadcn/ui，TanStack Query |
| 后端 | Python，FastAPI，WebSocket，SQLite |
| AI / 语音 | ElevenLabs（STT + TTS），任意 OpenAI-compatible LLM |
| 联网搜索 | Firecrawl（搜索 + 网页抓取）|
| 音频处理 | pydub + ffmpeg |
| 部署 | Docker Compose，Nginx，Railway |

---

## 架构

```
浏览器
  │  WebSocket（语音流）
  │  REST（播客、设置、历史记录）
  ▼
Nginx  ──代理──▶  FastAPI :8000
                        ├── ElevenLabs  （语音识别 / 合成）
                        ├── Firecrawl   （联网搜索）
                        ├── LLM API     （脚本生成）
                        └── SQLite      （会话、播客记录）
```

---

## 快速开始

### Docker（推荐）

```bash
git clone https://github.com/fatC210/PodCraft.git
cd PodCraft
docker compose up
```

打开 [http://localhost](http://localhost)，进入 **设置** 页面填入 API Keys 即可使用。

### 本地开发

```bash
# 后端
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# 前端（另开终端）
npm install
npm run dev
```

打开 [http://localhost:8080](http://localhost:8080)。

### 环境要求

- Docker & Docker Compose，**或** Python 3.10+ + Node.js 18+
- ffmpeg — Windows 可用 `winget install ffmpeg` 安装
- API Keys：[ElevenLabs](https://elevenlabs.io)、[Firecrawl](https://firecrawl.dev)、以及一个 OpenAI-compatible LLM 服务

---

## 配置说明

所有运行时配置均在应用内 **设置** 页面管理，持久化到 `backend/settings.json`。

| 配置项 | 用途 |
|--------|------|
| ElevenLabs API Key | 语音识别（STT）+ 语音合成（TTS）|
| Firecrawl API Key | 联网搜索与网页内容抓取 |
| LLM 供应商 | 任意 OpenAI-compatible 接口 + 模型名称 |

---

## License

MIT
