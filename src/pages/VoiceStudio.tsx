import { useState, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Mic, Square, Send } from "lucide-react";
import { useI18n } from "@/lib/i18n";

type Message = {
  id: number;
  role: "ai" | "user";
  content: string;
  timestamp: string;
};

export default function VoiceStudio() {
  const { t } = useI18n();

  const stages = t.studio.stages.map((label, i) => ({
    id: i + 1,
    label,
    key: ["topic", "material", "script", "voice", "generate"][i],
  }));

  const [currentStage, setCurrentStage] = useState(0);
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, role: "ai", content: t.studio.greeting, timestamp: "00:00" },
  ]);
  const [isRecording, setIsRecording] = useState(false);
  const [inputText, setInputText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const msgId = useRef(2);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, []);

  const addMessage = useCallback((role: "ai" | "user", content: string) => {
    const now = new Date();
    const ts = `${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
    setMessages(prev => [...prev, { id: msgId.current++, role, content, timestamp: ts }]);
    scrollToBottom();
  }, [scrollToBottom]);

  const getAIResponse = useCallback((userText: string): string => {
    const lower = userText.toLowerCase();
    const kw = t.studio.keywords;
    if (kw.keep.some(k => lower.includes(k))) return t.studio.responses.keep;
    if (kw.next.some(k => lower.includes(k))) return t.studio.responses.next;
    if (kw.script.some(k => lower.includes(k))) return t.studio.responses.script;
    if (kw.voice.some(k => lower.includes(k))) return t.studio.responses.voice;
    if (kw.generate.some(k => lower.includes(k))) return t.studio.responses.generate;
    return t.studio.responses.default;
  }, [t]);

  const handleSend = useCallback((text: string) => {
    if (!text.trim() || isProcessing) return;
    addMessage("user", text.trim());
    setInputText("");
    setIsProcessing(true);

    const kw = t.studio.keywords;
    setTimeout(() => {
      const response = getAIResponse(text);
      addMessage("ai", response);
      setIsProcessing(false);

      const lower = text.toLowerCase();
      if (currentStage === 0 && (kw.topic.some(k => lower.includes(k)) || text.length > 5)) {
        setCurrentStage(1);
      } else if (currentStage === 1 && kw.next.some(k => lower.includes(k))) {
        setCurrentStage(2);
      } else if (currentStage === 2 && kw.script.some(k => lower.includes(k))) {
        setCurrentStage(3);
      } else if (currentStage === 3 && kw.voice.some(k => lower.includes(k))) {
        setCurrentStage(4);
      }
    }, 1200);
  }, [addMessage, getAIResponse, isProcessing, currentStage, t]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      setIsRecording(false);
      addMessage("user", t.studio.mockVoiceInput);
      setIsProcessing(true);
      setTimeout(() => {
        addMessage("ai", t.studio.responses.default);
        setIsProcessing(false);
        if (currentStage === 0) setCurrentStage(1);
      }, 1500);
    } else {
      setIsRecording(true);
    }
  }, [isRecording, addMessage, currentStage, t]);

  return (
    <div className="h-screen flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <p className="font-mono text-[10px] text-muted-foreground tracking-widest uppercase">{t.studio.title}</p>
        </div>

        <div className="flex items-center gap-1">
          {stages.map((stage, i) => (
            <div key={stage.id} className="flex items-center">
              <div className={`
                flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono transition-all duration-300
                ${i <= currentStage ? "text-primary bg-primary/10" : "text-muted-foreground"}
              `}>
                <span className={`w-1.5 h-1.5 rounded-full ${i < currentStage ? "bg-primary" : i === currentStage ? "bg-primary animate-pulse-amber" : "bg-border"}`} />
                {stage.label}
              </div>
              {i < stages.length - 1 && (
                <div className={`w-4 h-px mx-0.5 ${i < currentStage ? "bg-primary/40" : "bg-border"}`} />
              )}
            </div>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-2xl mx-auto space-y-4">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-3 animate-fade-up ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
              <div className={`
                w-7 h-7 rounded flex items-center justify-center flex-shrink-0 text-[10px] font-mono font-bold
                ${msg.role === "ai" ? "bg-primary/10 text-primary" : "bg-surface-alt text-muted-foreground"}
              `}>
                {msg.role === "ai" ? "AI" : t.studio.you}
              </div>
              <div className={`
                max-w-[80%] rounded px-4 py-3 text-sm leading-relaxed
                ${msg.role === "ai" ? "bg-card border border-border" : "bg-surface-alt border border-border"}
              `}>
                {msg.content.split("\n").map((line, i) => (
                  <p key={i} className={`${i > 0 ? "mt-2" : ""} ${line.startsWith("**") ? "font-semibold" : ""}`}>
                    {line.replace(/\*\*/g, "")}
                  </p>
                ))}
                <span className="block mt-2 font-mono text-[10px] text-muted-foreground">{msg.timestamp}</span>
              </div>
            </div>
          ))}

          {isProcessing && (
            <div className="flex gap-3 animate-fade-up">
              <div className="w-7 h-7 rounded bg-primary/10 flex items-center justify-center text-[10px] font-mono font-bold text-primary">AI</div>
              <div className="bg-card border border-border rounded px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-amber" />
                  <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-amber" style={{ animationDelay: "300ms" }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-amber" style={{ animationDelay: "600ms" }} />
                  <span className="ml-2 font-mono text-[10px] text-muted-foreground">{t.studio.processing}</span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="border-t border-border bg-card/50 backdrop-blur-sm px-6 py-5">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-center gap-6 mb-4">
            <span className="font-mono text-[10px] text-muted-foreground tracking-widest uppercase">
              {isRecording ? t.studio.recording : t.studio.ready}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend(inputText)}
                placeholder={t.studio.inputPlaceholder}
                className="w-full bg-surface border border-border rounded px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors"
              />
            </div>

            {inputText.trim() && (
              <button
                onClick={() => handleSend(inputText)}
                className="w-10 h-10 rounded bg-primary text-primary-foreground flex items-center justify-center hover:brightness-110 transition-all active:scale-95"
              >
                <Send size={16} />
              </button>
            )}

            <button
              onMouseDown={() => !inputText.trim() && setIsRecording(true)}
              onMouseUp={() => isRecording && toggleRecording()}
              onMouseLeave={() => isRecording && toggleRecording()}
              className={`
                w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 active:scale-95
                ${isRecording
                  ? "bg-primary text-primary-foreground glow-amber-strong scale-110"
                  : "bg-surface-alt border border-border text-muted-foreground hover:text-foreground hover:border-primary/30"
                }
              `}
            >
              {isRecording ? <Square size={16} /> : <Mic size={18} />}
            </button>
          </div>

          {isRecording && (
            <div className="flex items-center justify-center gap-[2px] h-8 mt-4 animate-fade-up">
              {Array.from({ length: 40 }).map((_, i) => (
                <div
                  key={i}
                  className="w-[2px] bg-primary rounded-full"
                  style={{
                    height: `${Math.random() * 100}%`,
                    minHeight: 3,
                    animation: `waveform ${0.5 + Math.random() * 0.5}s ease-in-out ${i * 30}ms infinite alternate`,
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
