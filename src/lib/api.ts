/**
 * PodCraft API 客户端
 * 所有请求通过 vite proxy 转发到 http://localhost:8000
 * API Keys 从前端 localStorage 读取，通过 HTTP header 传递给后端
 */

import { getSettings, getActiveProvider } from "./settings-store";
import { getStoredHistory, getStoredItem, removeFromHistory, migrateFromBackend } from "./history-store";

const BASE = "/api";

function buildHeaders(extra?: Record<string, string>): Record<string, string> {
  const settings = getSettings();
  const provider = getActiveProvider(settings);
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (settings.elevenlabs_key) headers["X-ElevenLabs-Key"] = settings.elevenlabs_key;
  if (settings.firecrawl_key) headers["X-Firecrawl-Key"] = settings.firecrawl_key;
  if (provider) {
    headers["X-Provider-Base-Url"] = provider.base_url;
    headers["X-Provider-Api-Key"] = provider.api_key;
    headers["X-Provider-Model"] =
      settings.content_model || provider.models[0] || "";
  }

  return { ...headers, ...extra };
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { ...buildHeaders(), ...(options?.headers as Record<string, string> | undefined) },
    ...options,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── WebSocket URL builder ───────────────────────────────────────────────────

export function buildVoiceStreamUrl(locale: string, resumeId?: string | null): string {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const base = `${protocol}://${window.location.host}/api/voice/stream`;
  const settings = getSettings();
  const provider = getActiveProvider(settings);

  const params = new URLSearchParams({ ui_lang: locale });
  if (resumeId) params.set("resume_id", resumeId);
  if (settings.elevenlabs_key) params.set("elevenlabs_key", settings.elevenlabs_key);
  if (settings.firecrawl_key) params.set("firecrawl_key", settings.firecrawl_key);
  if (settings.assistant_voice_id) params.set("assistant_voice_id", settings.assistant_voice_id);
  if (settings.stt_model) params.set("stt_model", settings.stt_model);
  if (provider) {
    params.set("provider_base_url", provider.base_url);
    params.set("provider_api_key", provider.api_key);
    params.set("provider_model", settings.content_model || provider.models[0] || "");
    params.set("provider_name", provider.name);
    params.set("content_provider_id", provider.id);
  }
  if (settings.content_model) params.set("content_model", settings.content_model);

  return `${base}?${params}`;
}

// ── Models endpoint (backend proxies to LLM provider) ──────────────────────

export function fetchProviderModels(base_url: string, api_key: string): Promise<{ models: string[]; error?: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  return request("/settings/models", {
    method: "POST",
    body: JSON.stringify({ base_url, api_key }),
    signal: ctrl.signal,
  }).finally(() => clearTimeout(timer));
}

// ── Voices ────────────────────────────────────────────────────────────────────

export type Voice = {
  id: string;
  name: string;
  preview_url: string;
  labels: Record<string, string>;
};

export function fetchVoices(): Promise<Voice[]> {
  return request("/voices/list");
}

// ── Sources ───────────────────────────────────────────────────────────────────

export type MaterialItem = {
  url: string;
  title: string;
  snippet: string;
  content: string;
};

export function searchSources(query: string): Promise<MaterialItem[]> {
  return request("/sources/search", { method: "POST", body: JSON.stringify({ query }) });
}

export function scrapeUrl(url: string): Promise<{ content: string }> {
  return request("/sources/url", { method: "POST", body: JSON.stringify({ url }) });
}

// ── Script ────────────────────────────────────────────────────────────────────

export type ScriptLine = {
  role: string;
  text: string;
};

export function generateScript(params: {
  materials: MaterialItem[];
  language: string;
  roles: string[];
  guidance?: string;
}): Promise<{ script: ScriptLine[]; summary: string }> {
  return request("/script/generate", { method: "POST", body: JSON.stringify(params) });
}

export function aiEditScript(params: {
  script: ScriptLine[];
  instruction: string;
}): Promise<{ script: ScriptLine[] }> {
  return request("/script/ai-edit", { method: "POST", body: JSON.stringify(params) });
}

// ── Podcast ───────────────────────────────────────────────────────────────────

export type PodcastSegment = {
  role: string;
  text: string;
  start_ms: number;
  duration_ms: number;
};

export type PodcastHistoryItem = {
  id: string;
  title: string;
  duration: string | null;
  date: string | null;
  language: string | null;
  materials: number;
  audio_url: string | null;
  script?: string;
  segments_json?: string;
  created_at?: string;
  status?: "completed" | "generating";
  current?: number;
  total?: number;
};

export async function fetchHistory(): Promise<PodcastHistoryItem[]> {
  const local = getStoredHistory();
  // 拉取后端的生成中条目（兼容迁移）
  try {
    const all = await request<PodcastHistoryItem[]>("/podcast/history");
    migrateFromBackend(all);
    const generating = all.filter(i => i.status === "generating");
    return [...generating, ...getStoredHistory()];
  } catch {
    return local;
  }
}

export async function fetchPodcast(id: string): Promise<PodcastHistoryItem> {
  return getStoredItem(id) ?? request(`/podcast/${id}`);
}

export async function deleteHistoryItem(id: string): Promise<{ ok: boolean }> {
  removeFromHistory(id);
  try { await request(`/podcast/${id}`, { method: "DELETE" }); } catch { /* 音频文件已不存在时忽略 */ }
  return { ok: true };
}

// ── Interrupted sessions ───────────────────────────────────────────────────────

export type InterruptedSession = {
  id: string;
  title: string;
  stage: number;
  stage_name: string;
  created_at: string;
};

export type InterruptedSessionDetail = InterruptedSession & {
  history: { role: string; content: string }[];
};

export function fetchInterruptedSessions(): Promise<InterruptedSession[]> {
  return request("/voice/interrupted");
}

export function fetchInterruptedSession(id: string): Promise<InterruptedSessionDetail> {
  return request(`/voice/interrupted/${id}`);
}

export function deleteInterruptedSession(id: string): Promise<{ ok: boolean }> {
  return request(`/voice/interrupted/${id}`, { method: "DELETE" });
}
