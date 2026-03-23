import { useState } from "react";
import { Play, Trash2, Clock, PhoneIncoming, PhoneOff, Headphones, RotateCcw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "@/lib/i18n";

type CallStatus = "completed" | "interrupted" | "generating";
type RecordType = "podcast" | "call";

type PodcastRecord = {
  id: number;
  type: "podcast";
  title: string;
  duration: string;
  date: string;
  language: string;
  materials: number;
};

type CallRecord = {
  id: number;
  type: "call";
  title: string;
  duration: string;
  date: string;
  stage: number;
  stageName: string;
  status: CallStatus;
};

type HistoryRecord = PodcastRecord | CallRecord;

const mockData: {
  zh: HistoryRecord[];
  en: HistoryRecord[];
} = {
  zh: [
    { id: 1, type: "podcast", title: "量子计算前沿探索", duration: "5:32", date: "2026-03-23", materials: 4, language: "中文" },
    { id: 2, type: "call", title: "AI 在医疗领域的应用", duration: "8:15", date: "2026-03-23", stage: 3, stageName: "生成脚本", status: "interrupted" },
    { id: 3, type: "podcast", title: "Web3 技术全景解读", duration: "3:47", date: "2026-03-22", materials: 3, language: "英文" },
    { id: 4, type: "call", title: "可持续能源新趋势", duration: "2:10", date: "2026-03-22", stage: 1, stageName: "筛选素材", status: "interrupted" },
    { id: 5, type: "podcast", title: "深度学习框架对比", duration: "7:08", date: "2026-03-21", materials: 7, language: "中文" },
    { id: 6, type: "call", title: "太空探索商业化", duration: "12:30", date: "2026-03-21", stage: 4, stageName: "生成播客", status: "generating" },
    { id: 7, type: "call", title: "元宇宙社交平台", duration: "6:45", date: "2026-03-20", stage: 4, stageName: "选择音色", status: "completed" },
  ],
  en: [
    { id: 1, type: "podcast", title: "Quantum Computing Frontiers", duration: "5:32", date: "2026-03-23", materials: 4, language: "English" },
    { id: 2, type: "call", title: "AI in Healthcare", duration: "8:15", date: "2026-03-23", stage: 3, stageName: "Generate Script", status: "interrupted" },
    { id: 3, type: "podcast", title: "Web3 Tech Overview", duration: "3:47", date: "2026-03-22", materials: 3, language: "English" },
    { id: 4, type: "call", title: "Sustainable Energy Trends", duration: "2:10", date: "2026-03-22", stage: 1, stageName: "Select Material", status: "interrupted" },
    { id: 5, type: "podcast", title: "Deep Learning Frameworks", duration: "7:08", date: "2026-03-21", materials: 7, language: "Chinese" },
    { id: 6, type: "call", title: "Space Commercialization", duration: "12:30", date: "2026-03-21", stage: 4, stageName: "Generating", status: "generating" },
    { id: 7, type: "call", title: "Metaverse Social Platforms", duration: "6:45", date: "2026-03-20", stage: 4, stageName: "Voice Selection", status: "completed" },
  ],
};

const stages = ["确定主题", "筛选素材", "生成脚本", "选择音色", "生成播客"];

function StatusBadge({ status, t }: { status: CallStatus; t: any }) {
  const config = {
    completed: { label: t.history.statusCompleted, cls: "bg-success/15 text-success" },
    interrupted: { label: t.history.statusInterrupted, cls: "bg-amber-500/15 text-amber-500" },
    generating: { label: t.history.statusGenerating, cls: "bg-primary/15 text-primary animate-pulse" },
  };
  const c = config[status];
  return <span className={`px-2 py-0.5 rounded text-[10px] font-mono ${c.cls}`}>{c.label}</span>;
}

function StageProgress({ stage }: { stage: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {stages.map((_, i) => (
        <div
          key={i}
          className={`w-1.5 h-1.5 rounded-full transition-colors ${
            i < stage ? "bg-primary" : i === stage ? "bg-primary/50" : "bg-border"
          }`}
        />
      ))}
    </div>
  );
}

type FilterTab = "all" | "podcast" | "call";

export default function History() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterTab>("all");

  const records = mockData[locale];
  const filtered = filter === "all" ? records : records.filter((r) => r.type === filter);

  const tabs: { key: FilterTab; label: string }[] = [
    { key: "all", label: t.history.filterAll },
    { key: "podcast", label: t.history.filterPodcast },
    { key: "call", label: t.history.filterCall },
  ];

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
          {filtered.length} {t.history.items}
        </span>
      </div>

      {/* Records list */}
      <div className="space-y-2">
        {filtered.map((item, i) => (
          <div
            key={item.id}
            className="group flex items-center gap-4 bg-card border border-border rounded px-5 py-4 hover:border-primary/20 transition-all duration-200 animate-fade-up"
            style={{ animationDelay: `${(i + 2) * 60}ms` }}
          >
            {/* Icon */}
            {item.type === "podcast" ? (
              <div className="w-9 h-9 rounded-full border border-border flex items-center justify-center text-primary/70">
                <Headphones size={14} />
              </div>
            ) : (
              <div
                className={`w-9 h-9 rounded-full border flex items-center justify-center ${
                  item.status === "interrupted"
                    ? "border-amber-500/30 text-amber-500/70"
                    : item.status === "generating"
                    ? "border-primary/30 text-primary/70"
                    : "border-border text-muted-foreground"
                }`}
              >
                {item.status === "interrupted" ? <PhoneOff size={14} /> : <PhoneIncoming size={14} />}
              </div>
            )}

            {/* Content */}
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-medium truncate">{item.title}</h3>
              <div className="flex items-center gap-3 mt-1">
                <span className="font-mono text-[11px] text-muted-foreground flex items-center gap-1">
                  <Clock size={10} /> {item.duration}
                </span>
                {item.type === "podcast" ? (
                  <>
                    <span className="font-mono text-[11px] text-muted-foreground">{item.materials} {t.history.materials}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">{item.language}</span>
                  </>
                ) : (
                  <>
                    <StageProgress stage={item.stage} />
                    <span className="font-mono text-[11px] text-muted-foreground">{item.stageName}</span>
                  </>
                )}
              </div>
            </div>

            {/* Status / Actions */}
            <div className="flex items-center gap-3">
              {item.type === "call" && <StatusBadge status={item.status} t={t} />}
              <span className="font-mono text-[11px] text-muted-foreground">{item.date}</span>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1">
              {item.type === "podcast" ? (
                <button className="w-8 h-8 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary/30 transition-colors active:scale-95">
                  <Play size={13} className="ml-0.5" />
                </button>
              ) : item.status === "interrupted" ? (
                <button
                  onClick={() => navigate("/create")}
                  className="w-8 h-8 rounded-full border border-amber-500/30 flex items-center justify-center text-amber-500/70 hover:text-amber-500 hover:border-amber-500/50 transition-colors active:scale-95"
                  title={t.history.resume}
                >
                  <RotateCcw size={13} />
                </button>
              ) : null}
              <button className="w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all active:scale-95">
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <footer className="mt-16 pt-6 border-t border-border">
        <p className="font-mono text-[10px] text-muted-foreground tracking-widest">
          {t.history.footer(records.length)}
        </p>
      </footer>
    </div>
  );
}
