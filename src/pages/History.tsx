import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Play, Trash2, Clock, Headphones, Archive, Loader2, PhoneCall } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import {
  fetchHistory, deleteHistoryItem, type PodcastHistoryItem,
  fetchInterruptedSessions, deleteInterruptedSession, type InterruptedSession,
} from "@/lib/api";

type FilterTab = "all" | "podcast";

function EmptyState({ t }: { t: any }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-up">
      <div className="w-16 h-16 rounded-full bg-surface-alt border border-border flex items-center justify-center mb-5">
        <Archive size={24} className="text-muted-foreground/40" />
      </div>
      <p className="text-sm text-muted-foreground mb-1">{t.history.emptyTitle}</p>
      <p className="font-mono text-xs text-muted-foreground/60">{t.history.emptyDesc}</p>
    </div>
  );
}

export default function History() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterTab>("all");
  const [records, setRecords] = useState<PodcastHistoryItem[]>([]);
  const [interrupted, setInterrupted] = useState<InterruptedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);

  useEffect(() => {
    Promise.all([
      fetchHistory().catch(() => [] as PodcastHistoryItem[]),
      fetchInterruptedSessions().catch(() => [] as InterruptedSession[]),
    ]).then(([hist, inter]) => {
      setRecords(hist);
      setInterrupted(inter);
    }).finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: string) => {
    try { await deleteHistoryItem(id); } catch { /* ignore */ }
    setRecords(prev => prev.filter(r => r.id !== id));
  };

  const handleDeleteInterrupted = async (id: string) => {
    try { await deleteInterruptedSession(id); } catch { /* ignore */ }
    setInterrupted(prev => prev.filter(r => r.id !== id));
  };

  const handlePlay = (item: PodcastHistoryItem) => {
    if (playingId === item.id) {
      audioEl?.pause();
      setPlayingId(null);
      setAudioEl(null);
      return;
    }
    if (audioEl) audioEl.pause();
    const audio = new Audio(item.audio_url);
    audio.play();
    audio.onended = () => { setPlayingId(null); setAudioEl(null); };
    setAudioEl(audio);
    setPlayingId(item.id);
  };

  const handleResume = (id: string) => {
    navigate("/create", { state: { resumeId: id } });
  };

  const tabs: { key: FilterTab; label: string }[] = [
    { key: "all", label: t.history.filterAll },
    { key: "podcast", label: t.history.filterPodcast },
  ];

  const filtered = records;
  const totalCount = filtered.length + interrupted.length;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8 animate-fade-up">
        <p className="font-mono text-xs text-muted-foreground tracking-widest uppercase mb-2">{t.history.label}</p>
        <h1 className="text-2xl font-bold tracking-tight">{t.history.title}</h1>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-6 animate-fade-up" style={{ animationDelay: "60ms" }}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-3 py-1.5 rounded text-xs font-mono transition-all duration-200 active:scale-[0.97] ${
              filter === tab.key
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-surface-alt"
            }`}
          >
            {tab.label}
          </button>
        ))}
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
          {totalCount} {t.history.items}
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-muted-foreground" />
        </div>
      ) : totalCount === 0 ? (
        <EmptyState t={t} />
      ) : (
        <div className="space-y-2">
          {/* 中断的会话 */}
          {interrupted.map((item, i) => (
            <div
              key={item.id}
              className="group flex items-center gap-4 bg-card border border-amber-500/30 rounded px-5 py-4 hover:border-amber-500/50 transition-all duration-200 animate-fade-up"
              style={{ animationDelay: `${(i + 2) * 60}ms` }}
            >
              <div className="w-9 h-9 rounded-full border border-amber-500/40 bg-amber-500/10 flex items-center justify-center text-amber-500/80">
                <PhoneCall size={14} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium truncate">{item.title}</h3>
                  <span className="flex-shrink-0 font-mono text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500 border border-amber-500/25">
                    中断
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className="font-mono text-[11px] text-muted-foreground">阶段：{item.stage_name}</span>
                </div>
              </div>

              <span className="font-mono text-[11px] text-muted-foreground">
                {new Date(item.created_at).toLocaleDateString("zh-CN")}
              </span>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleResume(item.id)}
                  className="px-3 h-8 rounded border border-amber-500/40 text-amber-500 text-xs font-mono hover:bg-amber-500/10 transition-colors active:scale-95"
                >
                  继续
                </button>
                <button
                  onClick={() => handleDeleteInterrupted(item.id)}
                  className="w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all active:scale-95"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}

          {/* 已完成的播客 */}
          {filtered.map((item, i) => (
            <div
              key={item.id}
              className="group flex items-center gap-4 bg-card border border-border rounded px-5 py-4 hover:border-primary/20 transition-all duration-200 animate-fade-up"
              style={{ animationDelay: `${(interrupted.length + i + 2) * 60}ms` }}
            >
              <div className="w-9 h-9 rounded-full border border-border flex items-center justify-center text-primary/70">
                <Headphones size={14} />
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium truncate">{item.title}</h3>
                <div className="flex items-center gap-3 mt-1">
                  <span className="font-mono text-[11px] text-muted-foreground flex items-center gap-1">
                    <Clock size={10} /> {item.duration}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">{item.materials} {t.history.materials}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">{item.language}</span>
                </div>
              </div>

              <span className="font-mono text-[11px] text-muted-foreground">{item.date}</span>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => handlePlay(item)}
                  className={`w-8 h-8 rounded-full border flex items-center justify-center transition-colors active:scale-95 ${
                    playingId === item.id
                      ? "border-primary text-primary"
                      : "border-border text-muted-foreground hover:text-primary hover:border-primary/30"
                  }`}
                >
                  <Play size={13} className="ml-0.5" />
                </button>
                <button
                  onClick={() => handleDelete(item.id)}
                  className="w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all active:scale-95"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
