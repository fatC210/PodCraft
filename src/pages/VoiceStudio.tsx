import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { PhoneOff, Mic, MicOff, ChevronDown, ChevronUp } from "lucide-react";
import { useI18n } from "@/lib/i18n";

type AIState = "connecting" | "speaking" | "listening" | "thinking";

type Message = {
  id: number;
  role: "ai" | "user";
  content: string;
  timestamp: string;
};

// Animated orb component
function VoiceOrb({ state }: { state: AIState }) {
  const rings = state === "speaking" ? 4 : state === "listening" ? 3 : 2;

  return (
    <div className="relative flex items-center justify-center">
      {/* Outer rings */}
      {Array.from({ length: rings }).map((_, i) => (
        <div
          key={i}
          className={`absolute rounded-full border transition-all duration-700 ${
            state === "speaking"
              ? "border-primary/30"
              : state === "listening"
              ? "border-success/20"
              : state === "thinking"
              ? "border-primary/15"
              : "border-border"
          }`}
          style={{
            width: `${120 + i * 40}px`,
            height: `${120 + i * 40}px`,
            animation:
              state === "speaking"
                ? `pulse-ring ${1.5 + i * 0.3}s ease-in-out infinite`
                : state === "listening"
                ? `pulse-ring ${2 + i * 0.4}s ease-in-out infinite`
                : state === "thinking"
                ? `pulse-ring ${2.5 + i * 0.5}s ease-in-out infinite`
                : "none",
            opacity: 1 - i * 0.25,
          }}
        />
      ))}

      {/* Core orb */}
      <div
        className={`relative w-28 h-28 rounded-full flex items-center justify-center transition-all duration-500 ${
          state === "speaking"
            ? "bg-primary/20 glow-amber-strong"
            : state === "listening"
            ? "bg-success/10"
            : state === "thinking"
            ? "bg-primary/10"
            : "bg-surface-alt"
        }`}
        style={{
          animation:
            state === "speaking"
              ? "orb-breathe 1.2s ease-in-out infinite"
              : state === "thinking"
              ? "orb-breathe 2s ease-in-out infinite"
              : "none",
        }}
      >
        {/* Inner glow */}
        <div
          className={`w-16 h-16 rounded-full transition-all duration-500 ${
            state === "speaking"
              ? "bg-primary/40"
              : state === "listening"
              ? "bg-success/20"
              : state === "thinking"
              ? "bg-primary/20 animate-pulse-amber"
              : "bg-border/30"
          }`}
        />

        {/* Waveform bars for speaking */}
        {state === "speaking" && (
          <div className="absolute flex items-center gap-[3px]">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="w-[3px] bg-primary rounded-full"
                style={{
                  animation: `waveform ${0.4 + i * 0.1}s ease-in-out ${i * 60}ms infinite alternate`,
                  height: "20px",
                }}
              />
            ))}
          </div>
        )}

        {/* Listening indicator dots */}
        {state === "listening" && (
          <div className="absolute flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
          </div>
        )}
      </div>
    </div>
  );
}

// Timer component
function CallTimer({ startTime }: { startTime: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  const mins = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const secs = String(elapsed % 60).padStart(2, "0");

  return <span>{mins}:{secs}</span>;
}

export default function VoiceStudio() {
  const { t } = useI18n();
  const navigate = useNavigate();

  const stages = t.studio.stages.map((label, i) => ({
    id: i + 1,
    label,
    key: ["topic", "material", "script", "voice", "generate"][i],
  }));

  const [aiState, setAIState] = useState<AIState>("connecting");
  const [currentStage, setCurrentStage] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [startTime] = useState(Date.now());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const msgId = useRef(1);
  const simulationIndex = useRef(0);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, []);

  const addMessage = useCallback(
    (role: "ai" | "user", content: string) => {
      const now = new Date();
      const ts = `${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
      setMessages((prev) => [...prev, { id: msgId.current++, role, content, timestamp: ts }]);
      scrollToBottom();
    },
    [scrollToBottom]
  );

  // Simulate AI greeting on mount
  useEffect(() => {
    const connectTimer = setTimeout(() => {
      setAIState("speaking");
      addMessage("ai", t.studio.greeting);
    }, 1500);

    const listenTimer = setTimeout(() => {
      setAIState("listening");
    }, 5000);

    return () => {
      clearTimeout(connectTimer);
      clearTimeout(listenTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Simulated conversation flow
  const simulatedConversation = useCallback(() => {
    const flows = [
      { userText: t.studio.mockVoiceInput, aiResponse: t.studio.responses.default, nextStage: 1 },
      { userText: t.studio.keywords.keep[0] === "保留" ? "第一条和第三条保留，第二条跳过" : "Keep the first and third, skip the second", aiResponse: t.studio.responses.keep, nextStage: 1 },
      { userText: t.studio.keywords.next[0] === "下一步" ? "素材确认完毕，下一步" : "Materials confirmed, next step", aiResponse: t.studio.responses.next, nextStage: 2 },
      { userText: t.studio.keywords.script[0] === "脚本" ? "主持人叫小明，嘉宾叫小红，生成脚本吧" : "Host is Alex, Guest is Sam, generate the script", aiResponse: t.studio.responses.script, nextStage: 3 },
      { userText: t.studio.keywords.voice[0] === "音色" ? "脚本没问题，选择音色" : "Script looks good, choose voices", aiResponse: t.studio.responses.voice, nextStage: 4 },
      { userText: t.studio.keywords.generate[0] === "生成" ? "就用第一个和第二个音色，开始生成" : "Use voice 1 and 2, start generating", aiResponse: t.studio.responses.generate, nextStage: 4 },
    ];

    const idx = simulationIndex.current;
    if (idx >= flows.length) return;

    const flow = flows[idx];
    simulationIndex.current++;

    // User "speaks"
    setAIState("listening");
    setTimeout(() => {
      addMessage("user", flow.userText);
      setAIState("thinking");
    }, 1500);

    // AI "thinks" then "speaks"
    setTimeout(() => {
      setAIState("speaking");
      addMessage("ai", flow.aiResponse);
      setCurrentStage(flow.nextStage);
    }, 3500);

    // Back to listening
    setTimeout(() => {
      setAIState("listening");
    }, 7000);
  }, [addMessage, t]);

  // Auto-simulate first user interaction after greeting
  useEffect(() => {
    const timer = setTimeout(() => {
      simulatedConversation();
    }, 7000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEndCall = useCallback(() => {
    navigate("/");
  }, [navigate]);

  const stateLabel =
    aiState === "connecting"
      ? t.studio.connecting
      : aiState === "speaking"
      ? t.studio.speaking
      : aiState === "thinking"
      ? t.studio.processing
      : t.studio.listening;

  return (
    <div className="h-screen flex flex-col bg-background relative overflow-hidden">
      {/* Ambient background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            aiState === "speaking"
              ? "radial-gradient(circle at 50% 40%, hsl(43 100% 50% / 0.04) 0%, transparent 60%)"
              : aiState === "listening"
              ? "radial-gradient(circle at 50% 40%, hsl(142 71% 45% / 0.03) 0%, transparent 60%)"
              : "none",
          transition: "background 1s ease",
        }}
      />

      {/* Top bar */}
      <header className="relative flex items-center justify-between px-6 py-3 border-b border-border/50 bg-background/80 backdrop-blur-sm z-10">
        {/* Stage indicator */}
        <div className="flex items-center gap-1">
          {stages.map((stage, i) => (
            <div key={stage.id} className="flex items-center">
              <div
                className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono transition-all duration-300 ${
                  i <= currentStage ? "text-primary bg-primary/10" : "text-muted-foreground/50"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    i < currentStage ? "bg-primary" : i === currentStage ? "bg-primary animate-pulse-amber" : "bg-border"
                  }`}
                />
                {stage.label}
              </div>
              {i < stages.length - 1 && (
                <div className={`w-3 h-px mx-0.5 ${i < currentStage ? "bg-primary/40" : "bg-border/50"}`} />
              )}
            </div>
          ))}
        </div>

        {/* Duration */}
        <div className="font-mono text-[11px] text-muted-foreground flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
          <CallTimer startTime={startTime} />
        </div>
      </header>

      {/* Main voice area */}
      <div className="flex-1 flex flex-col items-center justify-center relative z-10">
        {/* Orb */}
        <VoiceOrb state={aiState} />

        {/* State label */}
        <p className="mt-8 font-mono text-xs text-muted-foreground tracking-widest uppercase animate-fade-up">
          {stateLabel}
        </p>

        {/* Current AI text (latest message) */}
        {messages.length > 0 && (
          <div className="mt-6 max-w-lg px-6 text-center animate-fade-up">
            <p className="text-sm text-foreground/80 leading-relaxed line-clamp-3">
              {messages[messages.length - 1].content}
            </p>
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="relative z-10 px-6 pb-6">
        {/* Transcript toggle */}
        <button
          onClick={() => setShowTranscript(!showTranscript)}
          className="mx-auto flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors mb-4 font-mono text-[10px] tracking-widest uppercase"
        >
          {t.studio.transcript}
          {showTranscript ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
        </button>

        {/* Transcript panel */}
        {showTranscript && (
          <div className="max-w-2xl mx-auto mb-4 max-h-48 overflow-y-auto bg-card/80 backdrop-blur-sm border border-border rounded p-4 animate-fade-up">
            <div className="space-y-3">
              {messages.map((msg) => (
                <div key={msg.id} className="flex gap-2 items-start">
                  <span
                    className={`font-mono text-[10px] font-bold mt-0.5 flex-shrink-0 ${
                      msg.role === "ai" ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    {msg.role === "ai" ? "AI" : t.studio.you}
                  </span>
                  <p className="text-xs text-foreground/70 leading-relaxed">{msg.content}</p>
                  <span className="font-mono text-[9px] text-muted-foreground/50 flex-shrink-0 mt-0.5">{msg.timestamp}</span>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center justify-center gap-6">
          {/* Mute toggle */}
          <button
            onClick={() => {
              setIsMuted(!isMuted);
              if (!isMuted) {
                setAIState("speaking");
              } else {
                setAIState("listening");
              }
            }}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 active:scale-95 ${
              isMuted
                ? "bg-destructive/20 text-destructive border border-destructive/30"
                : "bg-surface-alt border border-border text-foreground hover:border-primary/30"
            }`}
          >
            {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
          </button>

          {/* End call */}
          <button
            onClick={handleEndCall}
            className="w-14 h-14 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:brightness-110 transition-all active:scale-95"
          >
            <PhoneOff size={20} />
          </button>

          {/* Simulate next step (for prototype) */}
          <button
            onClick={simulatedConversation}
            className="w-12 h-12 rounded-full bg-surface-alt border border-border text-muted-foreground hover:text-primary hover:border-primary/30 flex items-center justify-center transition-all active:scale-95 font-mono text-[10px]"
            title="模拟下一步对话"
          >
            ▶
          </button>
        </div>
      </div>
    </div>
  );
}
