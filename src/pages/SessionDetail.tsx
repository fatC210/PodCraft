import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, PhoneCall, Bot, User } from "lucide-react";
import { fetchInterruptedSession, type InterruptedSessionDetail } from "@/lib/api";

const STAGE_COLORS: Record<number, string> = {
  0: "text-blue-400",
  1: "text-green-400",
  2: "text-yellow-400",
  3: "text-purple-400",
  4: "text-pink-400",
  5: "text-orange-400",
};

export default function SessionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<InterruptedSessionDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetchInterruptedSession(id)
      .then(setSession)
      .catch(() => navigate("/history"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session) return null;

  const messages = session.history.filter(
    (m) => m.role === "user" || m.role === "assistant"
  );

  return (
    <div className="flex flex-col h-full max-w-2xl mx-auto p-6 gap-5">
      {/* Header */}
      <div className="flex items-center gap-3 animate-fade-up">
        <button
          onClick={() => navigate("/history")}
          className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-surface-alt transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-mono text-[10px] text-muted-foreground tracking-widest uppercase">对话记录</p>
          <h1 className="text-lg font-semibold truncate">{session.title}</h1>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span className={`font-mono text-[11px] font-medium ${STAGE_COLORS[session.stage] ?? "text-muted-foreground"}`}>
            {session.stage_name}
          </span>
          <span className="font-mono text-[10px] text-muted-foreground">
            {new Date(session.created_at).toLocaleDateString("zh-CN")}
          </span>
        </div>
      </div>

      {/* Status banner */}
      <div className="flex items-center gap-2 px-4 py-2.5 rounded border border-amber-500/30 bg-amber-500/5 animate-fade-up" style={{ animationDelay: "40ms" }}>
        <PhoneCall size={13} className="text-amber-500" />
        <span className="text-xs text-amber-500/90 font-mono">
          通话已中断 · 停留在「{session.stage_name}」阶段 · 共 {messages.length} 条消息
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1" style={{ minHeight: 0 }}>
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">暂无对话记录</p>
        ) : (
          messages.map((msg, i) => {
            const isUser = msg.role === "user";
            return (
              <div
                key={i}
                className={`flex gap-2.5 animate-fade-up ${isUser ? "flex-row-reverse" : ""}`}
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <div
                  className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center border mt-0.5 ${
                    isUser
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-border bg-surface-alt text-muted-foreground"
                  }`}
                >
                  {isUser ? <User size={12} /> : <Bot size={12} />}
                </div>
                <div
                  className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    isUser
                      ? "bg-primary text-primary-foreground rounded-tr-sm"
                      : "bg-card border border-border text-foreground rounded-tl-sm"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer action */}
      <div className="animate-fade-up" style={{ animationDelay: "120ms" }}>
        <button
          onClick={() => navigate("/create", { state: { resumeId: id } })}
          className="w-full h-10 rounded border border-amber-500/40 text-amber-500 text-sm font-mono hover:bg-amber-500/10 transition-colors active:scale-[0.98]"
        >
          继续这次对话
        </button>
      </div>
    </div>
  );
}
