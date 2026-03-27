/**
 * 前端 localStorage 设置存储
 * 所有 API Keys 和 providers 存储在浏览器本地，不上传服务器
 */

export interface Provider {
  id: string;
  name: string;
  base_url: string;
  api_key: string;
  models: string[];
  active: boolean;
}

export interface StoredSettings {
  elevenlabs_key: string;
  firecrawl_key: string;
  providers: Provider[];
  assistant_voice_id: string;
  assistant_voice_name: string;
  content_model: string;
  content_provider_id: string;
  stt_model: string;
}

const STORAGE_KEY = "podcraft_settings";

const defaults: StoredSettings = {
  elevenlabs_key: "",
  firecrawl_key: "",
  providers: [],
  assistant_voice_id: "",
  assistant_voice_name: "",
  content_model: "",
  content_provider_id: "",
  stt_model: "scribe_v1",
};

export function getSettings(): StoredSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaults };
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return { ...defaults };
  }
}

export function saveSettings(patch: Partial<StoredSettings>): void {
  const current = getSettings();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...patch }));
}

export function getActiveProvider(settings?: StoredSettings): Provider | null {
  const s = settings ?? getSettings();
  const { providers, content_provider_id } = s;
  if (!providers.length) return null;
  if (content_provider_id) {
    const found = providers.find((p) => p.id === content_provider_id);
    if (found) return found;
  }
  return providers.find((p) => p.active) ?? providers[0] ?? null;
}

export function addProvider(provider: Omit<Provider, "id" | "active">): Provider {
  const settings = getSettings();
  const newProvider: Provider = {
    ...provider,
    id: crypto.randomUUID(),
    active: settings.providers.length === 0,
  };
  saveSettings({ providers: [...settings.providers, newProvider] });
  return newProvider;
}

export function updateProvider(id: string, updates: Partial<Omit<Provider, "id">>): Provider | null {
  const settings = getSettings();
  const idx = settings.providers.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  const updated = { ...settings.providers[idx], ...updates };
  const providers = [...settings.providers];
  providers[idx] = updated;
  saveSettings({ providers });
  return updated;
}

export function activateProvider(id: string): void {
  const settings = getSettings();
  saveSettings({
    providers: settings.providers.map((p) => ({ ...p, active: p.id === id })),
  });
}

export function deleteProvider(id: string): void {
  const settings = getSettings();
  saveSettings({
    providers: settings.providers.filter((p) => p.id !== id),
  });
}
