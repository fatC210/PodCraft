import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Trash2, Clock, Headphones, Archive, Loader2, PhoneCall, Play, ChevronRight } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import {
  fetchHistory, deleteHistoryItem, type PodcastHistoryItem,
  fetchInterruptedSessions, deleteInterruptedSession, type InterruptedSession,
} from "@/lib/api";

type FilterTab = "all" | "podcast";

function EmptyState({ filter }: { filter: FilterTab }) {
  const isPodcast = filter === "podcast";
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-up">
      <div className="w-16 h-16 rounded-full bg-surface-alt border border-border flex items-center justify-center mb-5">
        {isPodcast ? <Headphones size={24} className="text-muted-foreground/40" /> : <Archive size={24} className="text-muted-foreground/40" />}
      </div>
      <p className="text-sm text-muted-foreground mb-1">暂无记录</p>
      <p className="font-mono text-xs text-muted-foreground/60">
        {isPodcast ? "生成的播客将在这里展示" : "你的任务记录将在这里显示"}
      </p>
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

  useEffect(() => {
    Promise.all([
      fetchHistory().catch(() => [] as PodcastHistoryItem[]),
      fetchInterruptedSessions().catch(() => [] as InterruptedSession[]),
    ]).then(([hist, inter]) => {
      setRecords(hist);
      setInterrupted(inter);
    }).finally(() => setLoading(false));
  }, []);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try { await deleteHistoryItem(id); } catch { /* ignore */ }
    setRecords(prev => prev.filter(r => r.id !== id));
  };

  const handleDeleteInterrupted = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try { await deleteInterruptedSession(id); } catch { /* ignore */ }
    setInterrupted(prev => prev.filter(r => r.id !== id));
  };

  const tabs: { key: FilterTab; label: string }[] = [
    { key: "all", label: t.history.filterAll },
    { key: "podcast", label: t.history.filterPodcast },
  ];

  const showInterrupted = filter === "all";
  const filtered = records;
  const totalCount = filtered.length + (showInterrupted ? interrupted.length : 0);

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
        <EmptyState filter={filter} />
      ) : (
        <div className="space-y-4">
          {/* 中断的会话 — 任务记录 */}
          {showInterrupted && interrupted.length > 0 && (
            <div className="space-y-2">
              {interrupted.map((item, i) => (
                <div
                  key={item.id}
                  onClick={() => navigate(`/history/session/${item.id}`)}
                  className="group flex items-center gap-4 bg-card border border-amber-500/30 rounded px-5 py-4 hover:border-amber-500/60 hover:bg-amber-500/5 cursor-pointer transition-all duration-200 animate-fade-up"
                  style={{ animationDelay: `${(i + 2) * 60}ms` }}
                >
                  <div className="w-9 h-9 rounded-full border border-amber-500/40 bg-amber-500/10 flex items-center justify-center text-amber-500/80 flex-shrink-0">
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

                  <span className="font-mono text-[11px] text-muted-foreground flex-shrink-0">
                    {new Date(item.created_at).toLocaleDateString("zh-CN")}
                  </span>

                  <div className="flex items-center gap-1">
                    <ChevronRight size={14} className="text-muted-foreground/40 group-hover:text-amber-500/60 transition-colors" />
                    <button
                      onClick={(e) => handleDeleteInterrupted(e, item.id)}
                      className="w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all active:scale-95"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 已完成的播客 — 长方形卡片 */}
          {filtered.length > 0 ? (
            <div className="space-y-2">
              {showInterrupted && <p className="font-mono text-[10px] text-muted-foreground tracking-widest uppercase px-1 mt-4">播客</p>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filtered.map((item, i) => (
                  <div
                    key={item.id}
                    onClick={() => navigate(`/podcast/${item.id}`)}
                    className="group relative bg-card border border-border rounded-lg overflow-hidden cursor-pointer hover:border-primary/30 hover:shadow-md transition-all duration-200 animate-fade-up"
                    style={{ animationDelay: `${(interrupted.length + i + 2) * 60}ms` }}
                  >
                    {/* Cover gradient */}
                    <div className="h-20 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent flex items-end px-4 py-3">
                      <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center group-hover:bg-primary/30 transition-colors">
                        <Play size={13} className="text-primary ml-0.5" />
                      </div>
                    </div>

                    {/* Info */}
                    <div className="px-4 py-3">
                      <h3 className="text-sm font-semibold truncate mb-1">{item.title}</h3>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-[11px] text-muted-foreground flex items-center gap-1">
                          <Clock size={10} /> {item.duration}
                        </span>
                        <span className="font-mono text-[11px] text-muted-foreground">{item.language}</span>
                        <span className="font-mono text-[11px] text-muted-foreground ml-auto">{item.date}</span>
                      </div>
                    </div>

                    {/* Delete */}
                    <button
                      onClick={(e) => handleDelete(e, item.id)}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 bg-background/80 text-muted-foreground hover:text-destructive transition-all active:scale-95"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : !showInterrupted && (
            <EmptyState filter="podcast" />
          )}
        </div>
      )}
    </div>
  );
}
