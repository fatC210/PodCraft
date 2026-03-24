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
  content_model?: string;
  content_provider_id?: string;
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

export function saveServiceSettings(data: ServiceSettings): Promise<{ ok: boolean }> {
  return request("/settings/services", { method: "PUT", body: JSON.stringify(data) });
}

export function fetchProviders(): Promise<Provider[]> {
  return request("/settings/providers");
}

export function saveProvider(provider: Omit<Provider, "id" | "models" | "active">): Promise<Provider> {
  return request("/settings/providers", { method: "POST", body: JSON.stringify(provider) });
}

export function updateProvider(id: string, provider: { name: string; base_url: string; api_key?: string }): Promise<Provider> {
  return request(`/settings/providers/${id}`, { method: "PUT", body: JSON.stringify(provider) });
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

export type PodcastHistoryItem = {
  id: string;
  title: string;
  duration: string;
  date: string;
  language: string;
  materials: number;
  audio_url: string;
  created_at: string;
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
