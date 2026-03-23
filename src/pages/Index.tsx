import { Link } from "react-router-dom";
import { Plus, Play, Pause } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";

const mockPodcasts = [
  { id: 1, title: "量子计算前沿探索", duration: "5:32", date: "2026-03-23", status: "completed" as const },
  { id: 2, title: "AI 在医疗领域的应用", duration: "8:15", date: "2026-03-22", status: "completed" as const },
  { id: 3, title: "Web3 技术全景解读", duration: "3:47", date: "2026-03-21", status: "completed" as const },
  { id: 4, title: "可持续能源新趋势", duration: "6:20", date: "2026-03-20", status: "completed" as const },
];

function PodcastCard({ podcast, index }: { podcast: typeof mockPodcasts[0]; index: number }) {
  const [playing, setPlaying] = useState(false);

  return (
    <div
      className="group bg-card border border-border rounded p-5 hover:border-primary/30 transition-all duration-300 cursor-pointer animate-fade-up"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 rounded bg-surface-alt flex items-center justify-center">
          <div className="w-3 h-3 rounded-full bg-primary/60" />
        </div>
        <span className="font-mono text-xs text-muted-foreground">{podcast.date}</span>
      </div>

      <h3 className="font-semibold text-sm text-foreground mb-1 line-clamp-2">{podcast.title}</h3>
      <p className="font-mono text-xs text-muted-foreground mb-4">{podcast.duration}</p>

      <div className="flex items-center gap-3">
        <div className="flex items-end gap-[2px] h-4 flex-1">
          {Array.from({ length: 24 }).map((_, i) => (
            <div
              key={i}
              className={`w-[2px] rounded-full transition-all duration-300 ${playing ? "bg-primary" : "bg-border group-hover:bg-muted-foreground/40"}`}
              style={{ height: `${Math.random() * 100}%`, minHeight: 2 }}
            />
          ))}
        </div>

        <button
          onClick={(e) => { e.preventDefault(); setPlaying(!playing); }}
          className="w-8 h-8 rounded-full border border-border flex items-center justify-center hover:border-primary hover:text-primary transition-colors active:scale-95"
        >
          {playing ? <Pause size={12} /> : <Play size={12} className="ml-0.5" />}
        </button>
      </div>
    </div>
  );
}

export default function Index() {
  const { t } = useI18n();

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-end justify-between mb-12 animate-fade-up">
        <div>
          <p className="font-mono text-xs text-muted-foreground tracking-widest uppercase mb-2">{t.index.workspace}</p>
          <h1 className="text-3xl font-bold tracking-tight text-balance">PodCraft</h1>
        </div>
        <Link
          to="/create"
          className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded text-sm font-semibold hover:brightness-110 transition-all active:scale-[0.98]"
        >
          <Plus size={16} />
          {t.index.createNew}
        </Link>
      </div>

      <div className="mb-10 animate-fade-up" style={{ animationDelay: "100ms" }}>
        <Link
          to="/create"
          className="block bg-card border border-primary/20 rounded p-8 hover:border-primary/40 transition-all duration-300 animate-breathing-glow"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse-amber" />
            <span className="font-mono text-xs text-primary tracking-widest uppercase">{t.index.ready}</span>
          </div>
          <h2 className="text-xl font-semibold mb-2">{t.index.startVoice}</h2>
          <p className="text-sm text-muted-foreground max-w-md">{t.index.startVoiceDesc}</p>
        </Link>
      </div>

      <div className="mb-6">
        <p className="font-mono text-xs text-muted-foreground tracking-widest uppercase mb-4">
          {t.index.recentPodcasts} — {mockPodcasts.length} {t.index.records}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {mockPodcasts.map((podcast, i) => (
          <PodcastCard key={podcast.id} podcast={podcast} index={i} />
        ))}
      </div>

      <footer className="mt-16 pt-6 border-t border-border">
        <p className="font-mono text-[10px] text-muted-foreground tracking-widest">{t.index.footer}</p>
      </footer>
    </div>
  );
}
