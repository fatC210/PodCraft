import { useState, useEffect } from "react";
import { Plus, Trash2, Check, ExternalLink, ChevronDown, Eye, EyeOff, Loader2 } from "lucide-react";
import { useI18n, Locale } from "@/lib/i18n";
import {
  fetchSettings,
  saveServiceSettings,
  fetchProviders,
  saveProvider,
  deleteProvider,
  type Provider,
} from "@/lib/api";

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
  placeholder,
  type = "text",
  mono = false,
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
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
        placeholder={placeholder}
        type={isPassword && !show ? "password" : "text"}
        disabled={disabled}
        className={`w-full bg-background border border-border rounded-md px-4 py-3 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all disabled:opacity-50 ${mono ? "font-mono" : ""}`}
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

  const [providers, setProviders] = useState<Provider[]>([]);
  const [elevenLabsKey, setElevenLabsKey] = useState("");
  const [firecrawlKey, setFirecrawlKey] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProvider, setNewProvider] = useState({ name: "", base_url: "", api_key: "" });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [loading, setLoading] = useState(true);

  // Load settings from backend on mount
  useEffect(() => {
    Promise.all([fetchSettings(), fetchProviders()])
      .then(([svc, provs]) => {
        setElevenLabsKey(svc.elevenlabs_key ?? "");
        setFirecrawlKey(svc.firecrawl_key ?? "");
        setProviders(provs ?? []);
      })
      .catch(() => {
        // Backend not available yet, work offline
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSaveServices = async () => {
    setSaving(true);
    try {
      await saveServiceSettings({ elevenlabs_key: elevenLabsKey, firecrawl_key: firecrawlKey });
      setSaveMsg(t.settings.savedOk);
    } catch {
      setSaveMsg(t.settings.savedError);
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(""), 3000);
    }
  };

  const addProviderHandler = async () => {
    if (!newProvider.name || !newProvider.base_url) return;
    setSaving(true);
    try {
      const saved = await saveProvider(newProvider);
      setProviders(prev => [...prev, saved]);
      setExpandedId(saved.id);
      setNewProvider({ name: "", base_url: "", api_key: "" });
      setShowAddForm(false);
    } catch {
      // fallback: add locally
      const local: Provider = {
        id: Date.now().toString(),
        name: newProvider.name,
        base_url: newProvider.base_url,
        api_key: newProvider.api_key,
        models: [t.settings.modelsLoading],
        active: providers.length === 0,
      };
      setProviders(prev => [...prev, local]);
      setShowAddForm(false);
    } finally {
      setSaving(false);
    }
  };

  const removeProviderHandler = async (id: string) => {
    try {
      await deleteProvider(id);
    } catch {
      // ignore if backend unavailable
    }
    setProviders(prev => prev.filter(p => p.id !== id));
    if (expandedId === id) setExpandedId(null);
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
        <SectionTitle className="mb-5">{t.settings.language}</SectionTitle>
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
                onClick={() => setExpandedId(expandedId === provider.id ? null : provider.id)}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${provider.active ? "bg-success" : "bg-border"}`} />
                  <span className="text-base font-semibold">{provider.name}</span>
                  {provider.active && (
                    <span className="font-mono text-[10px] bg-success/10 text-success px-2 py-0.5 rounded">
                      {t.settings.activeProvider}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
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
                      <div className="flex flex-wrap gap-2">
                        {provider.models.map(m => (
                          <span key={m} className="font-mono text-xs bg-surface-alt px-3 py-1 rounded text-muted-foreground">
                            {m}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
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
              <div className="flex gap-3 items-center">
                <button
                  onClick={addProviderHandler}
                  disabled={saving}
                  className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-md text-sm font-semibold hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-60"
                >
                  {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                  {t.settings.save}
                </button>
                <button
                  onClick={() => setShowAddForm(false)}
                  className="px-5 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t.settings.cancel}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Service keys */}
      <section className="animate-fade-up" style={{ animationDelay: "160ms" }}>
        <SectionTitle className="mb-5">{t.settings.services}</SectionTitle>

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
              value={elevenLabsKey}
              onChange={setElevenLabsKey}
              placeholder="ElevenLabs API Key"
              type="password"
              mono
            />
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
              value={firecrawlKey}
              onChange={setFirecrawlKey}
              placeholder="Firecrawl API Key"
              type="password"
              mono
            />
          </div>

          {/* Save button */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              onClick={handleSaveServices}
              disabled={saving}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-md text-sm font-semibold hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-60"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              {t.settings.saveAll}
            </button>
            {saveMsg && (
              <span className={`text-sm font-mono ${saveMsg === t.settings.savedOk ? "text-success" : "text-destructive"}`}>
                {saveMsg}
              </span>
            )}
          </div>
        </div>
      </section>

    </div>
  );
}
