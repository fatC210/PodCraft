import { Play, Trash2, Clock } from "lucide-react";
import { useI18n } from "@/lib/i18n";

const mockHistory = [
  { id: 1, title: "量子计算前沿探索", duration: "5:32", date: "2026-03-23", materials: 4, language: "中文" },
  { id: 2, title: "AI 在医疗领域的应用", duration: "8:15", date: "2026-03-22", materials: 6, language: "中文" },
  { id: 3, title: "Web3 技术全景解读", duration: "3:47", date: "2026-03-21", materials: 3, language: "英文" },
  { id: 4, title: "可持续能源新趋势", duration: "6:20", date: "2026-03-20", materials: 5, language: "中文" },
  { id: 5, title: "深度学习框架对比", duration: "7:08", date: "2026-03-19", materials: 7, language: "中文" },
];

export default function History() {
  const { t } = useI18n();

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-10 animate-fade-up">
        <p className="font-mono text-xs text-muted-foreground tracking-widest uppercase mb-2">{t.history.label}</p>
        <h1 className="text-2xl font-bold tracking-tight">{t.history.title}</h1>
      </div>

      <div className="space-y-2">
        {mockHistory.map((item, i) => (
          <div
            key={item.id}
            className="group flex items-center gap-4 bg-card border border-border rounded px-5 py-4 hover:border-primary/20 transition-all duration-200 animate-fade-up cursor-pointer"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <button className="w-9 h-9 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary transition-colors active:scale-95">
              <Play size={14} className="ml-0.5" />
            </button>

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

            <button className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all active:scale-95">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      <footer className="mt-16 pt-6 border-t border-border">
        <p className="font-mono text-[10px] text-muted-foreground tracking-widest">
          {t.history.footer(mockHistory.length)}
        </p>
      </footer>
    </div>
  );
}
