/**
 * PodCraft API 客户端
 * 所有请求通过 vite proxy 转发到 http://localhost:8000
 */

const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Settings ──────────────────────────────────────────────────────────────────

export type ServiceSettings = {
  elevenlabs_key: string;
  firecrawl_key: string;
  assistant_voice_id?: string;
  assistant_voice_name?: string;
  content_model?: string;
  content_provider_id?: string;
  stt_model?: string;
};

export type Provider = {
  id: string;
  name: string;
  base_url: string;
  api_key: string;
  models: string[];
  active: boolean;
};

export function fetchSettings(): Promise<ServiceSettings> {
  return request("/settings");
}

export function saveServiceSettings(data: ServiceSettings): Promise<{ ok: boolean; elevenlabs_verified?: boolean | null }> {
  return request("/settings/services", { method: "PUT", body: JSON.stringify(data) });
}

export function fetchProviders(): Promise<Provider[]> {
  return request("/settings/providers");
}

export function saveProvider(provider: Omit<Provider, "id" | "active"> & { models?: string[] }): Promise<Provider> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  return request("/settings/providers", { method: "POST", body: JSON.stringify(provider), signal: ctrl.signal })
    .finally(() => clearTimeout(timer));
}

export function updateProvider(id: string, provider: { name: string; base_url: string; api_key?: string; models?: string[] }): Promise<Provider> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  return request(`/settings/providers/${id}`, { method: "PUT", body: JSON.stringify(provider), signal: ctrl.signal })
    .finally(() => clearTimeout(timer));
}

export function activateProvider(id: string): Promise<{ ok: boolean }> {
  return request(`/settings/providers/${id}/activate`, { method: "PUT" });
}

export function deleteProvider(id: string): Promise<{ ok: boolean }> {
  return request(`/settings/providers/${id}`, { method: "DELETE" });
}

export function fetchProviderModels(id: string): Promise<string[]> {
  return request(`/settings/providers/${id}/models`);
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

export function generatePodcast(params: {
  script: ScriptLine[];
  voice_assignments: Record<string, string>;
  title: string;
  language: string;
  materials_count: number;
}): Promise<{ id: string; audio_url: string; duration: string }> {
  return request("/podcast/generate", { method: "POST", body: JSON.stringify(params) });
}

export function fetchHistory(): Promise<PodcastHistoryItem[]> {
  return request("/podcast/history");
}

export function fetchPodcast(id: string): Promise<PodcastHistoryItem> {
  return request(`/podcast/${id}`);
}

export function deleteHistoryItem(id: string): Promise<{ ok: boolean }> {
  return request(`/podcast/${id}`, { method: "DELETE" });
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
