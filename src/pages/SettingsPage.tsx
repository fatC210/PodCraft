import { useState, useEffect, useRef } from "react";
import { Plus, Trash2, Check, ExternalLink, ChevronDown, Eye, EyeOff, Loader2, Pencil, Zap, Play, Square, RefreshCw, Search } from "lucide-react";
import { useI18n, Locale } from "@/lib/i18n";
import { fetchVoices, fetchProviderModels, type Voice } from "@/lib/api";
import {
  getSettings,
  saveSettings,
  addProvider,
  updateProvider as updateProviderStore,
  activateProvider as activateProviderStore,
  deleteProvider as deleteProviderStore,
  type Provider,
} from "@/lib/settings-store";

// ── Voice list cache helpers ──────────────────────────────────────────────────
const VOICES_CACHE_DATA_KEY = "podcraft_voices_data";
const VOICES_CACHE_EL_KEY   = "podcraft_voices_el_key";

function loadVoicesCache(elKey: string): Voice[] | null {
  if (!elKey) return null;
  try {
    if (localStorage.getItem(VOICES_CACHE_EL_KEY) !== elKey) return null;
    const raw = localStorage.getItem(VOICES_CACHE_DATA_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveVoicesCache(elKey: string, voices: Voice[]): void {
  localStorage.setItem(VOICES_CACHE_EL_KEY, elKey);
  localStorage.setItem(VOICES_CACHE_DATA_KEY, JSON.stringify(voices));
}

function clearVoicesCache(): void {
  localStorage.removeItem(VOICES_CACHE_EL_KEY);
  localStorage.removeItem(VOICES_CACHE_DATA_KEY);
}

function SectionTitle({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={`text-base font-semibold tracking-tight text-foreground ${className}`}>
      {children}
    </h2>
  );
}

function InputField({
  value,
  onChange,
  onBlur,
  placeholder,
  type = "text",
  mono = false,
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  type?: string;
  mono?: boolean;
  disabled?: boolean;
}) {
  const [show, setShow] = useState(false);
  const isPassword = type === "password";

  return (
    <div className="relative flex items-center">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        type={isPassword && !show ? "password" : "text"}
        disabled={disabled}
        className={`w-full bg-background border border-border rounded-md px-4 py-3 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all disabled:opacity-50 ${isPassword ? "pr-10" : ""} ${mono ? "font-mono" : ""}`}
      />
      {isPassword && (
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-3 text-muted-foreground hover:text-foreground transition-colors"
        >
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const { t, locale, setLocale } = useI18n();

  // ── 从 localStorage 初始化状态 ───────────────────────────────────────────
  const [providers, setProviders] = useState<Provider[]>([]);
  const [contentModel, setContentModel] = useState("");
  const [contentProviderId, setContentProviderId] = useState("");
  const [modelOpen, setModelOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [modelProvId, setModelProvId] = useState<string | null>(null);
  const modelDropRef = useRef<HTMLDivElement>(null);
  const modelListRef = useRef<HTMLDivElement>(null);
  // committed = saved to localStorage; draft = current input value
  const [elevenLabsKey, setElevenLabsKey] = useState("");
  const [elevenLabsKeyDraft, setElevenLabsKeyDraft] = useState("");
  const [firecrawlKey, setFirecrawlKey] = useState("");
  const [firecrawlKeyDraft, setFirecrawlKeyDraft] = useState("");
  const [sttModel, setSttModel] = useState("scribe_v1");
  const [assistantVoiceId, setAssistantVoiceId] = useState("");
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [voicesError, setVoicesError] = useState("");
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProvider, setNewProvider] = useState({ name: "", base_url: "", api_key: "", models: "" });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedModels, setExpandedModels] = useState<Set<string>>(new Set());
  const [refreshingModels, setRefreshingModels] = useState<Set<string>>(new Set());
  const [editForm, setEditForm] = useState({ name: "", base_url: "", api_key: "", models: "" });
  const [providerSaving, setProviderSaving] = useState(false);
  const [providerMsg, setProviderMsg] = useState("");
  const [loading, setLoading] = useState(true);

  // 从 localStorage 加载初始状态
  useEffect(() => {
    const s = getSettings();
    setElevenLabsKey(s.elevenlabs_key);
    setElevenLabsKeyDraft(s.elevenlabs_key);
    setFirecrawlKey(s.firecrawl_key);
    setFirecrawlKeyDraft(s.firecrawl_key);
    setProviders(s.providers);
    setAssistantVoiceId(s.assistant_voice_id);
    setContentModel(s.content_model);
    setContentProviderId(s.content_provider_id);
    setSttModel(s.stt_model || "scribe_v1");
    if (s.elevenlabs_key) {
      const cached = loadVoicesCache(s.elevenlabs_key);
      if (cached) {
        setVoices(cached);
        // 若已有 voice_id 但未保存 voice_name，自动补填
        if (s.assistant_voice_id && !s.assistant_voice_name) {
          const v = cached.find(vv => vv.id === s.assistant_voice_id);
          if (v) saveSettings({ assistant_voice_name: v.name.split(" - ")[0].trim() });
        }
      } else {
        loadVoices(s.elevenlabs_key);
      }
    }
    setLoading(false);
  }, []);

  // 点击 model 下拉外部时关闭
  useEffect(() => {
    if (!modelOpen) return;
    const handler = (e: MouseEvent) => {
      if (modelDropRef.current && !modelDropRef.current.contains(e.target as Node)) {
        setModelOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [modelOpen]);

  // 下拉打开时滚动到选中模型
  useEffect(() => {
    if (!modelOpen) return;
    requestAnimationFrame(() => {
      const el = modelListRef.current?.querySelector("[data-selected='true']") as HTMLElement | null;
      el?.scrollIntoView({ block: "nearest" });
    });
  }, [modelOpen]);

  const parseModels = (s: string): string[] => {
    return s.split(/[\n,]+/).map(m => m.trim()).filter(Boolean);
  };

  // ── Provider CRUD ────────────────────────────────────────────────────────

  const addProviderHandler = async () => {
    if (!newProvider.name || !newProvider.base_url || !newProvider.api_key) return;
    setProviderSaving(true);
    setProviderMsg(t.settings.verifying);
    let models: string[] = parseModels(newProvider.models);
    let modelsWarning = "";

    if (models.length === 0) {
      try {
        const result = await fetchProviderModels(newProvider.base_url, newProvider.api_key);
        models = result.models ?? [];
        if (result.error) modelsWarning = result.error;
      } catch (e: unknown) {
        if (e instanceof Error && e.name === "AbortError") {
          setProviderSaving(false);
          setProviderMsg(t.settings.errTimeout);
          return;
        }
        modelsWarning = e instanceof Error ? e.message : String(e);
      }
    }

    const saved = addProvider({ name: newProvider.name, base_url: newProvider.base_url, api_key: newProvider.api_key, models });
    setProviders(getSettings().providers);
    setExpandedId(saved.id);
    setNewProvider({ name: "", base_url: "", api_key: "", models: "" });
    setShowAddForm(false);
    setProviderSaving(false);
    setProviderMsg(modelsWarning ? `⚠ ${modelsWarning}` : "");
  };

  const saveEditHandler = async (id: string) => {
    setProviderSaving(true);
    setProviderMsg(t.settings.verifying);

    const current = providers.find(p => p.id === id);
    if (!current) { setProviderSaving(false); return; }

    const api_key = editForm.api_key || current.api_key;
    let models: string[] = parseModels(editForm.models);
    let modelsWarning = "";

    if (models.length === 0) {
      try {
        const result = await fetchProviderModels(editForm.base_url, api_key);
        models = result.models ?? [];
        if (result.error) modelsWarning = result.error;
      } catch (e: unknown) {
        if (e instanceof Error && e.name === "AbortError") {
          setProviderSaving(false);
          setProviderMsg(t.settings.errTimeout);
          return;
        }
        models = current.models;
        modelsWarning = e instanceof Error ? e.message : String(e);
      }
    }

    updateProviderStore(id, { name: editForm.name, base_url: editForm.base_url, api_key, models });
    setProviders(getSettings().providers);
    setEditingId(null);
    setProviderSaving(false);
    setProviderMsg(modelsWarning ? `⚠ ${modelsWarning}` : t.settings.verifySuccess);
    if (!modelsWarning) setTimeout(() => setProviderMsg(""), 3000);
  };

  const removeProviderHandler = (id: string) => {
    deleteProviderStore(id);
    setProviders(getSettings().providers);
    if (expandedId === id) setExpandedId(null);
    if (editingId === id) setEditingId(null);
  };

  const refreshProviderModels = async (id: string) => {
    const provider = providers.find(p => p.id === id);
    if (!provider) return;
    setRefreshingModels(prev => new Set(prev).add(id));
    try {
      const result = await fetchProviderModels(provider.base_url, provider.api_key);
      if (Array.isArray(result.models) && result.models.length > 0) {
        updateProviderStore(id, { models: result.models });
        setProviders(getSettings().providers);
      }
    } catch {}
    finally {
      setRefreshingModels(prev => { const next = new Set(prev); next.delete(id); return next; });
    }
  };

  const activateProviderHandler = (id: string) => {
    activateProviderStore(id);
    setProviders(getSettings().providers);
  };

  // ── Voice ────────────────────────────────────────────────────────────────

  const loadVoices = async (keyOverride?: string) => {
    setVoicesLoading(true);
    setVoicesError("");
    try {
      const list = await fetchVoices();
      setVoices(list);
      const key = keyOverride ?? elevenLabsKey;
      if (key) saveVoicesCache(key, list);
      // 若已有 voice_id 但未保存 voice_name，自动补填
      const s = getSettings();
      if (s.assistant_voice_id && !s.assistant_voice_name) {
        const v = list.find(vv => vv.id === s.assistant_voice_id);
        if (v) saveSettings({ assistant_voice_name: v.name.split(" - ")[0].trim() });
      }
    } catch (e) {
      setVoicesError(e instanceof Error ? e.message : String(e));
    } finally {
      setVoicesLoading(false);
    }
  };

  // ElevenLabs key 失焦时保存（仅在有修改时）
  const handleElevenLabsBlur = () => {
    if (elevenLabsKeyDraft === elevenLabsKey) return;
    setElevenLabsKey(elevenLabsKeyDraft);
    saveSettings({ elevenlabs_key: elevenLabsKeyDraft });
    if (!elevenLabsKeyDraft) {
      setVoices([]);
      clearVoicesCache();
      setVoicesError("");
    } else {
      clearVoicesCache();
      loadVoices(elevenLabsKeyDraft);
    }
  };

  // Firecrawl key 失焦时保存（仅在有修改时）
  const handleFirecrawlBlur = () => {
    if (firecrawlKeyDraft === firecrawlKey) return;
    setFirecrawlKey(firecrawlKeyDraft);
    saveSettings({ firecrawl_key: firecrawlKeyDraft });
  };

  const [isPlaying, setIsPlaying] = useState(false);

  const playPreview = (url: string) => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
      setIsPlaying(false);
    } else {
      const audio = new Audio(url);
      previewAudioRef.current = audio;
      setIsPlaying(true);
      audio.play().catch(() => { setIsPlaying(false); previewAudioRef.current = null; });
      audio.onended = () => { setIsPlaying(false); previewAudioRef.current = null; };
    }
  };

  const stopPreview = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
      setIsPlaying(false);
    }
  };

  const voiceOptionLabel = (v: Voice) => {
    if (locale === "en") return v.name;
    const vl = t.settings.voiceLabels;
    const lc = (s: string | undefined) => (s ?? "").toLowerCase().replace(/_/g, " ");
    const labels = v.labels ?? {};
    const gender = vl.gender[lc(labels.gender)] || labels.gender;
    const age    = vl.age[lc(labels.age)]        || labels.age;
    const accent = vl.accent[lc(labels.accent)]  || labels.accent;
    const baseName = v.name.split(" - ")[0];
    const attrs  = [gender, age, accent].filter(Boolean).join("/");
    return attrs ? `${baseName}（${attrs}）` : baseName;
  };

  const startEditHandler = (provider: Provider) => {
    setEditingId(provider.id);
    setEditForm({ name: provider.name, base_url: provider.base_url, api_key: "", models: provider.models.join(", ") });
    setProviderMsg("");
  };

  return (
    <div className="p-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-10 animate-fade-up">
        <p className="font-mono text-xs text-muted-foreground tracking-widest uppercase mb-2">{t.settings.label}</p>
        <h1 className="text-3xl font-bold tracking-tight">{t.settings.title}</h1>
      </div>

      {/* Language */}
      <section className="mb-10 animate-fade-up" style={{ animationDelay: "40ms" }}>
        <div className="flex items-center justify-between mb-5">
          <SectionTitle>{t.settings.language}</SectionTitle>
          <div className="flex gap-3">
            {(["zh", "en"] as Locale[]).map(l => (
              <button
                key={l}
                onClick={() => setLocale(l)}
                className={`
                  px-6 py-3 rounded-md text-sm font-medium transition-all active:scale-[0.98]
                  ${locale === l
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/30"
                  }
                `}
              >
                {l === "zh" ? "中文" : "English"}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* AI Model Providers */}
      <section className="mb-10 animate-fade-up" style={{ animationDelay: "80ms" }}>
        <div className="flex items-center justify-between mb-5">
          <SectionTitle>{t.settings.aiProviders}</SectionTitle>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors font-medium flex-shrink-0"
          >
            <Plus size={15} /> {t.settings.add}
          </button>
        </div>

        <div className="space-y-3">
          {!loading && providers.length === 0 && !showAddForm && (
            <div className="bg-card border border-dashed border-border rounded-lg p-8 text-center animate-fade-up">
              <p className="text-sm text-muted-foreground mb-1">{t.settings.noProviders}</p>
              <p className="font-mono text-xs text-muted-foreground/60">{t.settings.noProvidersDesc}</p>
            </div>
          )}

          {providers.map(provider => (
            <div key={provider.id} className="bg-card border border-border rounded-lg overflow-hidden">
              <div
                className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-surface-alt/50 transition-colors"
                onClick={() => {
                  if (editingId === provider.id) return;
                  const closing = expandedId === provider.id;
                  setExpandedId(closing ? null : provider.id);
                  if (!closing) {
                    setExpandedModels(prev => { const n = new Set(prev); n.delete(provider.id); return n; });
                  }
                }}
              >
                <div className="flex items-center gap-3">
                  <span className="text-base font-semibold">{provider.name}</span>
                  {provider.active && (
                    <span className="flex items-center gap-1 font-mono text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded">
                      <Zap size={9} /> {t.settings.activeProvider}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {!provider.active && (
                    <button
                      onClick={(e) => { e.stopPropagation(); activateProviderHandler(provider.id); }}
                      className="text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded border border-border hover:border-primary/30"
                    >
                      {t.settings.setActive}
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (editingId === provider.id) {
                        setEditingId(null);
                        setProviderMsg("");
                      } else {
                        setExpandedId(provider.id);
                        startEditHandler(provider);
                      }
                    }}
                    className="text-muted-foreground hover:text-primary transition-colors p-1"
                    title={t.settings.editProvider}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeProviderHandler(provider.id); }}
                    className="text-muted-foreground hover:text-destructive transition-colors p-1"
                  >
                    <Trash2 size={15} />
                  </button>
                  <ChevronDown
                    size={15}
                    className={`text-muted-foreground transition-transform ${expandedId === provider.id ? "rotate-180" : ""}`}
                  />
                </div>
              </div>

              {expandedId === provider.id && (
                <div className="px-5 pb-5 border-t border-border space-y-4 pt-4 animate-fade-up">
                  {editingId === provider.id ? (
                    // 编辑模式
                    <div className="space-y-3">
                      <InputField
                        value={editForm.name}
                        onChange={v => setEditForm(f => ({ ...f, name: v }))}
                        placeholder={t.settings.providerName}
                      />
                      <InputField
                        value={editForm.base_url}
                        onChange={v => setEditForm(f => ({ ...f, base_url: v }))}
                        placeholder={t.settings.baseUrl}
                        mono
                      />
                      <InputField
                        value={editForm.api_key}
                        onChange={v => setEditForm(f => ({ ...f, api_key: v }))}
                        placeholder={t.settings.apiKeyPlaceholder}
                        type="password"
                        mono
                      />
                      <div>
                        <p className="text-xs text-muted-foreground mb-1.5">{t.settings.modelsHint}</p>
                        <textarea
                          value={editForm.models}
                          onChange={e => setEditForm(f => ({ ...f, models: e.target.value }))}
                          placeholder={"gpt-4o, gpt-4o-mini\nclaude-3-5-sonnet"}
                          rows={2}
                          className="w-full bg-background border border-border rounded-md px-4 py-3 text-sm font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all resize-none"
                        />
                      </div>
                      <div className="space-y-2">
                        {providerMsg && (
                          <span className={`block text-sm font-mono ${providerMsg.startsWith("✓") || providerMsg === t.settings.verifySuccess ? "text-success" : providerMsg === t.settings.verifying ? "text-muted-foreground" : "text-destructive"}`}>
                            {providerMsg}
                          </span>
                        )}
                        <div className="flex gap-3 justify-end">
                          <button
                            onClick={() => { setEditingId(null); setProviderMsg(""); }}
                            className="px-5 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {t.settings.cancel}
                          </button>
                          <button
                            onClick={() => saveEditHandler(provider.id)}
                            disabled={providerSaving || !editForm.name || !editForm.base_url}
                            className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-md text-sm font-semibold hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {providerSaving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                            {t.settings.save}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    // 只读模式
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs text-muted-foreground min-w-[72px]">{t.settings.apiUrl}</span>
                        <span className="font-mono text-sm text-foreground/80 truncate">{provider.base_url}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs text-muted-foreground min-w-[72px]">{t.settings.apiKey}</span>
                        <span className="font-mono text-sm text-foreground/80">••••••••••••</span>
                      </div>
                      <div className="flex items-start gap-3">
                        <span className="font-mono text-xs text-muted-foreground min-w-[72px] mt-0.5">{t.settings.models}</span>
                        <div className="flex-1 min-w-0">
                          {provider.models.length === 0 ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground/60">{t.settings.modelsFetchFailed}</span>
                              <button
                                onClick={() => refreshProviderModels(provider.id)}
                                disabled={refreshingModels.has(provider.id)}
                                className="flex items-center gap-1 text-[11px] text-primary hover:underline disabled:opacity-50"
                              >
                                {refreshingModels.has(provider.id)
                                  ? <Loader2 size={11} className="animate-spin" />
                                  : <RefreshCw size={11} />}
                                {t.settings.refresh}
                              </button>
                            </div>
                          ) : (
                            <>
                              <div className={`flex flex-wrap gap-2 overflow-hidden transition-all ${expandedModels.has(provider.id) ? "" : "max-h-[28px]"}`}>
                                {provider.models.map(m => (
                                  <span key={m} className="font-mono text-xs bg-surface-alt px-3 py-1 rounded text-muted-foreground whitespace-nowrap">
                                    {m}
                                  </span>
                                ))}
                              </div>
                              <button
                                onClick={() => setExpandedModels(prev => {
                                  const next = new Set(prev);
                                  next.has(provider.id) ? next.delete(provider.id) : next.add(provider.id);
                                  return next;
                                })}
                                className="mt-1.5 font-mono text-[10px] text-muted-foreground/60 hover:text-primary transition-colors"
                              >
                                {expandedModels.has(provider.id) ? t.settings.modelsCollapse : t.settings.modelsExpand}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {showAddForm && (
            <div className="bg-card border border-primary/20 rounded-lg p-5 space-y-4 animate-fade-up">
              <p className="text-sm font-semibold text-foreground">{t.settings.addProviderTitle}</p>
              <InputField
                value={newProvider.name}
                onChange={v => setNewProvider(p => ({ ...p, name: v }))}
                placeholder={t.settings.providerName}
              />
              <InputField
                value={newProvider.base_url}
                onChange={v => setNewProvider(p => ({ ...p, base_url: v }))}
                placeholder={t.settings.baseUrl}
                mono
              />
              <InputField
                value={newProvider.api_key}
                onChange={v => setNewProvider(p => ({ ...p, api_key: v }))}
                placeholder={t.settings.apiKey}
                type="password"
                mono
              />
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">{t.settings.modelsHintOptional}</p>
                <textarea
                  value={newProvider.models}
                  onChange={e => setNewProvider(p => ({ ...p, models: e.target.value }))}
                  placeholder={"gpt-4o, gpt-4o-mini\nclaude-3-5-sonnet"}
                  rows={2}
                  className="w-full bg-background border border-border rounded-md px-4 py-3 text-sm font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all resize-none"
                />
              </div>
              <div className="space-y-2">
                {providerMsg && (
                  <span className={`block text-sm font-mono ${providerMsg.startsWith("✓") ? "text-success" : providerMsg === t.settings.verifying ? "text-muted-foreground" : "text-destructive"}`}>
                    {providerMsg}
                  </span>
                )}
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => { setShowAddForm(false); setProviderMsg(""); }}
                    className="px-5 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {t.settings.cancel}
                  </button>
                  <button
                    onClick={addProviderHandler}
                    disabled={providerSaving || !newProvider.name || !newProvider.base_url || !newProvider.api_key}
                    className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-md text-sm font-semibold hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {providerSaving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                    {t.settings.save}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Content Generation Model */}
      <section className="mb-10 animate-fade-up relative z-10" style={{ animationDelay: "120ms" }}>
        <div className="mb-5">
          <SectionTitle>{t.settings.contentModel}</SectionTitle>
          <p className="text-xs text-muted-foreground mt-1">{t.settings.contentModelDesc}</p>
        </div>

        {providers.length === 0 ? (
          <div className="bg-card border border-dashed border-border rounded-lg px-5 py-4">
            <p className="text-sm text-muted-foreground">{t.settings.noProviders}</p>
          </div>
        ) : (
          <div ref={modelDropRef} className="relative">
            {/* Trigger */}
            <button
              onClick={() => {
                if (!modelOpen) {
                  const initProv =
                    providers.find(p => p.models.includes(contentModel))?.id ??
                    providers.find(p => p.active)?.id ??
                    providers[0]?.id ?? null;
                  setModelProvId(initProv);
                  setModelSearch("");
                }
                setModelOpen(o => !o);
              }}
              className="w-full flex items-center justify-between bg-background border border-border rounded-md px-4 py-3 text-sm hover:border-primary/50 transition-all focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
            >
              <span className={contentModel ? "text-foreground font-mono" : "text-muted-foreground/60"}>
                {contentModel
                  ? (() => {
                      const prov = providers.find(p => p.id === contentProviderId) ?? providers.find(p => p.models.includes(contentModel));
                      return prov ? `${prov.name} · ${contentModel}` : contentModel;
                    })()
                  : t.settings.contentModelPlaceholder}
              </span>
              <ChevronDown size={15} className={`text-muted-foreground transition-transform ${modelOpen ? "rotate-180" : ""}`} />
            </button>

            {/* Dropdown panel */}
            {modelOpen && (
              <div className="absolute z-50 top-full mt-1 w-full bg-card border border-border rounded-lg shadow-xl overflow-hidden animate-fade-up">
                {/* Search */}
                <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
                  <Search size={13} className="text-muted-foreground flex-shrink-0" />
                  <input
                    autoFocus
                    value={modelSearch}
                    onChange={e => setModelSearch(e.target.value)}
                    placeholder={t.settings.searchModel}
                    className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground/60 focus:outline-none"
                  />
                </div>

                {/* Two columns */}
                <div className="flex h-56">
                  {/* Left: providers */}
                  <div className="w-[38%] border-r border-border overflow-y-auto py-1 flex-shrink-0">
                    {providers.map(p => (
                      <button
                        key={p.id}
                        onClick={() => setModelProvId(p.id)}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                          modelProvId === p.id
                            ? "bg-primary/10 text-primary font-medium"
                            : "text-muted-foreground hover:text-foreground hover:bg-surface-alt/50"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="truncate">{p.name}</span>
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Right: models */}
                  <div ref={modelListRef} className="flex-1 overflow-y-auto py-1">
                    {(() => {
                      const prov = providers.find(p => p.id === modelProvId);
                      const models = (prov?.models ?? []).filter(m =>
                        !modelSearch || m.toLowerCase().includes(modelSearch.toLowerCase())
                      );
                      if (!prov) return (
                        <p className="px-3 py-2 text-xs text-muted-foreground/60">{t.settings.contentModelPlaceholder}</p>
                      );
                      if (models.length === 0) return (
                        <p className="px-3 py-2 text-xs text-muted-foreground/60">{t.settings.noMatchModels}</p>
                      );
                      return models.map(m => (
                        <button
                          key={m}
                          data-selected={contentModel === m ? "true" : undefined}
                          onClick={() => {
                            setContentModel(m);
                            setContentProviderId(modelProvId ?? "");
                            setModelOpen(false);
                            saveSettings({ content_model: m, content_provider_id: modelProvId ?? "" });
                          }}
                          className={`w-full text-left px-3 py-2 text-sm font-mono transition-colors ${
                            contentModel === m
                              ? "bg-primary/10 text-primary"
                              : "text-muted-foreground hover:text-foreground hover:bg-surface-alt/50"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {contentModel === m && <Check size={11} className="flex-shrink-0" />}
                            <span className="truncate">{m}</span>
                          </div>
                        </button>
                      ));
                    })()}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Service keys */}
      <section className="animate-fade-up" style={{ animationDelay: "160ms" }}>
        <div className="flex items-center justify-between mb-5">
          <SectionTitle>{t.settings.services}</SectionTitle>
        </div>

        <div className="space-y-4">
          {/* ElevenLabs */}
          <div className="bg-card border border-border rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base font-semibold">ElevenLabs</span>
                  <span className="font-mono text-xs text-muted-foreground bg-surface-alt px-2 py-0.5 rounded">TTS / STT</span>
                </div>
                <p className="text-xs text-muted-foreground">{t.settings.elevenLabsDesc}</p>
              </div>
              <a href="https://elevenlabs.io" target="_blank" rel="noopener" className="text-muted-foreground hover:text-primary transition-colors">
                <ExternalLink size={13} />
              </a>
            </div>
            <InputField
              value={elevenLabsKeyDraft}
              onChange={setElevenLabsKeyDraft}
              onBlur={handleElevenLabsBlur}
              placeholder="ElevenLabs API Key"
              type="password"
              mono
            />
            {/* 助手音色选择 */}
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">{t.settings.assistantVoice}</span>
                <button
                  onClick={loadVoices}
                  disabled={voicesLoading || !elevenLabsKey}
                  title={voices.length > 0 ? t.settings.refreshVoices : t.settings.loadVoices}
                  className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
                >
                  {voicesLoading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                </button>
              </div>
              {voicesError && (
                <p className="text-xs text-destructive mb-2 font-mono">{voicesError}</p>
              )}
              {voices.length > 0 && (
                <div className="flex items-center gap-2">
                  <select
                    className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50 transition-all"
                    value={assistantVoiceId || voices[0]?.id || ""}
                    onChange={(e) => {
                      stopPreview();
                      const vid = e.target.value;
                      setAssistantVoiceId(vid);
                      const v = voices.find(vv => vv.id === vid);
                      const vname = v ? v.name.split(" - ")[0].trim() : undefined;
                      saveSettings({ assistant_voice_id: vid, assistant_voice_name: vname ?? "" });
                    }}
                  >
                    {voices.map((v) => (
                      <option key={v.id} value={v.id}>
                        {voiceOptionLabel(v)}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      const voice = voices.find(v => v.id === (assistantVoiceId || voices[0]?.id));
                      if (voice?.preview_url) playPreview(voice.preview_url);
                    }}
                    title={t.settings.previewVoice}
                    className="w-9 h-9 flex-shrink-0 rounded border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
                  >
                    {isPlaying ? <Square size={13} /> : <Play size={13} />}
                  </button>
                </div>
              )}
            </div>
            {/* STT 模型选择 */}
            <div className="mt-4">
              <div className="mb-2">
                <span className="text-xs text-muted-foreground">{t.settings.sttModel}</span>
              </div>
              <div className="flex gap-2">
                {(["scribe_v1", "scribe_v2"] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => { setSttModel(m); saveSettings({ stt_model: m }); }}
                    className={`flex-1 py-2 rounded-md text-sm font-mono border transition-all ${
                      sttModel === m
                        ? "bg-primary/10 border-primary/40 text-primary"
                        : "bg-background border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Firecrawl */}
          <div className="bg-card border border-border rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base font-semibold">Firecrawl</span>
                  <span className="font-mono text-xs text-muted-foreground bg-surface-alt px-2 py-0.5 rounded">{t.settings.webScraping}</span>
                </div>
                <p className="text-xs text-muted-foreground">{t.settings.firecrawlDesc}</p>
              </div>
              <a href="https://firecrawl.dev" target="_blank" rel="noopener" className="text-muted-foreground hover:text-primary transition-colors">
                <ExternalLink size={13} />
              </a>
            </div>
            <InputField
              value={firecrawlKeyDraft}
              onChange={setFirecrawlKeyDraft}
              onBlur={handleFirecrawlBlur}
              placeholder="Firecrawl API Key"
              type="password"
              mono
            />
          </div>

        </div>
      </section>

    </div>
  );
}
