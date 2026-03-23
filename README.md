# PodCraft — 语音对话驱动的 AI 播客生成平台

## 快速启动

### 环境要求
- Python 3.10+
- Node.js 18+
- ffmpeg（用于音频处理）

### 1. 安装后端依赖
```bash
cd backend
pip install -r requirements.txt
```

> **Windows 安装 ffmpeg**：`winget install ffmpeg` 或从 https://ffmpeg.org/download.html 下载

### 2. 启动后端（端口 8000）
```bash
cd backend
uvicorn main:app --reload --port 8000
```

### 3. 启动前端（端口 8080）
```bash
npm install
npm run dev
```

### 4. 配置 API Keys
打开 http://localhost:8080/settings，配置：
- **ElevenLabs API Key** — 语音识别（STT）+ 语音合成（TTS）
- **Firecrawl API Key** — 内容搜索与网页抓取
- **AI 模型供应商** — 任意 OpenAI-compatible API（DeepSeek、OpenAI 等）

### 5. 开始创建播客
首页点击「创建新播客」，允许麦克风权限，通过语音对话完成全流程。

## 架构
```
前端 :8080  ──proxy──▶  后端 :8000
                              ├── ElevenLabs (STT/TTS)
                              ├── Firecrawl (内容搜索)
                              ├── 用户 LLM (脚本生成)
                              └── SQLite (历史记录)
```
