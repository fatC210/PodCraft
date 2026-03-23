import { useState } from "react";
import { Plus, Trash2, Check, ExternalLink, Globe } from "lucide-react";
import { useI18n, Locale } from "@/lib/i18n";

type Provider = {
  id: number;
  name: string;
  baseUrl: string;
  apiKey: string;
  models: string[];
  active: boolean;
};

export default function SettingsPage() {
  const { t, locale, setLocale } = useI18n();

  const [providers, setProviders] = useState<Provider[]>([
    { id: 1, name: "OpenAI", baseUrl: "https://api.openai.com/v1", apiKey: "sk-••••••••••••", models: ["gpt-4o", "gpt-4o-mini"], active: true },
  ]);
  const [elevenLabsKey, setElevenLabsKey] = useState("••••••••");
  const [firecrawlKey, setFirecrawlKey] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProvider, setNewProvider] = useState({ name: "", baseUrl: "", apiKey: "" });

  const addProvider = () => {
    if (!newProvider.name || !newProvider.baseUrl) return;
    setProviders(prev => [...prev, {
      id: Date.now(),
      name: newProvider.name,
      baseUrl: newProvider.baseUrl,
      apiKey: newProvider.apiKey,
      models: [t.settings.modelsLoading],
      active: false,
    }]);
    setNewProvider({ name: "", baseUrl: "", apiKey: "" });
    setShowAddForm(false);
  };

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-10 animate-fade-up">
        <p className="font-mono text-xs text-muted-foreground tracking-widest uppercase mb-2">{t.settings.label}</p>
        <h1 className="text-2xl font-bold tracking-tight">{t.settings.title}</h1>
      </div>

      {/* Language switcher */}
      <section className="mb-10 animate-fade-up" style={{ animationDelay: "40ms" }}>
        <h2 className="text-sm font-semibold uppercase tracking-wider mb-4 flex items-center gap-2">
          <Globe size={14} /> {t.settings.language}
        </h2>
        <div className="flex gap-2">
          {(["zh", "en"] as Locale[]).map(l => (
            <button
              key={l}
              onClick={() => setLocale(l)}
              className={`
                px-4 py-2 rounded text-sm font-mono transition-all active:scale-[0.98]
                ${locale === l
                  ? "bg-primary text-primary-foreground"
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
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider">{t.settings.aiProviders}</h2>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors font-mono"
          >
            <Plus size={14} /> {t.settings.add}
          </button>
        </div>

        <div className="space-y-3">
          {providers.map(provider => (
            <div key={provider.id} className="bg-card border border-border rounded p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${provider.active ? "bg-success" : "bg-border"}`} />
                  <span className="text-sm font-medium">{provider.name}</span>
                </div>
                <button className="text-muted-foreground hover:text-destructive transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-muted-foreground w-16">{t.settings.apiUrl}</span>
                  <span className="font-mono text-xs text-foreground/80">{provider.baseUrl}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-muted-foreground w-16">{t.settings.apiKey}</span>
                  <span className="font-mono text-xs text-foreground/80">{provider.apiKey}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-muted-foreground w-16">{t.settings.models}</span>
                  <div className="flex gap-1.5">
                    {provider.models.map(m => (
                      <span key={m} className="font-mono text-[10px] bg-surface-alt px-2 py-0.5 rounded text-muted-foreground">{m}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {showAddForm && (
            <div className="bg-card border border-primary/20 rounded p-4 space-y-3 animate-fade-up">
              <input
                value={newProvider.name}
                onChange={e => setNewProvider(p => ({ ...p, name: e.target.value }))}
                placeholder={t.settings.providerName}
                className="w-full bg-surface border border-border rounded px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
              />
              <input
                value={newProvider.baseUrl}
                onChange={e => setNewProvider(p => ({ ...p, baseUrl: e.target.value }))}
                placeholder={t.settings.baseUrl}
                className="w-full bg-surface border border-border rounded px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
              />
              <input
                value={newProvider.apiKey}
                onChange={e => setNewProvider(p => ({ ...p, apiKey: e.target.value }))}
                placeholder={t.settings.apiKey}
                type="password"
                className="w-full bg-surface border border-border rounded px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
              />
              <div className="flex gap-2">
                <button
                  onClick={addProvider}
                  className="flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded text-xs font-semibold hover:brightness-110 active:scale-[0.98]"
                >
                  <Check size={14} /> {t.settings.save}
                </button>
                <button
                  onClick={() => setShowAddForm(false)}
                  className="px-4 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
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
        <h2 className="text-sm font-semibold uppercase tracking-wider mb-4">{t.settings.services}</h2>

        <div className="space-y-3">
          <div className="bg-card border border-border rounded p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">ElevenLabs</span>
                <span className="font-mono text-[10px] text-muted-foreground">TTS / STT</span>
              </div>
              <a href="https://elevenlabs.io" target="_blank" rel="noopener" className="text-muted-foreground hover:text-primary transition-colors">
                <ExternalLink size={12} />
              </a>
            </div>
            <input
              value={elevenLabsKey}
              onChange={e => setElevenLabsKey(e.target.value)}
              placeholder="ElevenLabs API Key"
              type="password"
              className="w-full bg-surface border border-border rounded px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
            />
          </div>

          <div className="bg-card border border-border rounded p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Firecrawl</span>
                <span className="font-mono text-[10px] text-muted-foreground">{t.settings.webScraping}</span>
              </div>
              <a href="https://firecrawl.dev" target="_blank" rel="noopener" className="text-muted-foreground hover:text-primary transition-colors">
                <ExternalLink size={12} />
              </a>
            </div>
            <input
              value={firecrawlKey}
              onChange={e => setFirecrawlKey(e.target.value)}
              placeholder="Firecrawl API Key"
              type="password"
              className="w-full bg-surface border border-border rounded px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
            />
          </div>
        </div>
      </section>

      <footer className="mt-16 pt-6 border-t border-border">
        <p className="font-mono text-[10px] text-muted-foreground tracking-widest">{t.settings.footer}</p>
      </footer>
    </div>
  );
}
