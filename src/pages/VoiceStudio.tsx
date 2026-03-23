import { useState, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Mic, Square, Send } from "lucide-react";

const STAGES = [
  { id: 1, label: "确定主题", key: "topic" },
  { id: 2, label: "筛选素材", key: "material" },
  { id: 3, label: "生成脚本", key: "script" },
  { id: 4, label: "选择音色", key: "voice" },
  { id: 5, label: "生成播客", key: "generate" },
] as const;

type Message = {
  id: number;
  role: "ai" | "user";
  content: string;
  timestamp: string;
};

const initialMessages: Message[] = [
  {
    id: 1,
    role: "ai",
    content: "你好！我是你的播客制作助手。请告诉我你想制作什么主题的播客？你可以按住麦克风按钮说话，也可以输入文字。",
    timestamp: "00:00",
  },
];

const mockResponses: Record<string, string> = {
  default: "收到！让我为你搜索相关资料……已找到 3 条相关内容，我来逐一播报：\n\n**1.** 该领域最新研究进展综述，来源：Nature Science Review\n\n**2.** 行业专家访谈摘要，来源：Tech Insights Daily\n\n**3.** 相关技术应用案例分析，来源：MIT Technology Review\n\n你想保留哪些素材？可以说"保留第一条"或"跳过第二条"。",
  keep: "好的，已保留该素材。还有其他需要调整的吗？如果素材确认完毕，我们可以进入下一步——设置播客参数。",
  next: "素材已确认完毕。现在让我们设置播客参数：\n\n• **输出语言**：中文\n• **角色数量**：2 位\n• **角色名称**：待确认\n\n请告诉我角色名称，例如"主持人叫小明，嘉宾叫小红"。",
  script: "脚本已生成！以下是概要：\n\n**开场**（0:00-0:30）：主持人介绍本期主题\n**正文**（0:30-4:00）：围绕素材展开深入讨论\n**总结**（4:00-5:00）：回顾要点并展望\n\n总时长约 5 分钟。你想试听或修改脚本吗？",
  voice: "现在为角色选择音色。我为你准备了几个音色样本：\n\n🔊 **音色 1** — Roger：沉稳专业的男声\n🔊 **音色 2** — Sarah：温和清晰的女声\n🔊 **音色 3** — George：富有磁性的男声\n\n说"试听第一个"来预览，或直接选择。",
  generate: "所有参数已确认！开始合成播客音频……\n\n⏳ 正在处理脚本段落 1/6\n⏳ 正在合成角色语音\n⏳ 正在拼接音频片段\n\n预计需要 30 秒左右完成。",
};

export default function VoiceStudio() {
  const [currentStage, setCurrentStage] = useState(0);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
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
    if (lower.includes("保留") || lower.includes("keep")) return mockResponses.keep;
    if (lower.includes("下一步") || lower.includes("确认") || lower.includes("没问题")) return mockResponses.next;
    if (lower.includes("脚本") || lower.includes("script")) return mockResponses.script;
    if (lower.includes("音色") || lower.includes("voice") || lower.includes("试听")) return mockResponses.voice;
    if (lower.includes("生成") || lower.includes("开始")) return mockResponses.generate;
    return mockResponses.default;
  }, []);

  const handleSend = useCallback((text: string) => {
    if (!text.trim() || isProcessing) return;
    addMessage("user", text.trim());
    setInputText("");
    setIsProcessing(true);

    setTimeout(() => {
      const response = getAIResponse(text);
      addMessage("ai", response);
      setIsProcessing(false);

      // Advance stage based on keywords
      const lower = text.toLowerCase();
      if (currentStage === 0 && (lower.includes("播客") || lower.includes("主题") || text.length > 5)) {
        setCurrentStage(1);
      } else if (currentStage === 1 && (lower.includes("确认") || lower.includes("下一步"))) {
        setCurrentStage(2);
      } else if (currentStage === 2 && lower.includes("脚本")) {
        setCurrentStage(3);
      } else if (currentStage === 3 && lower.includes("音色")) {
        setCurrentStage(4);
      }
    }, 1200);
  }, [addMessage, getAIResponse, isProcessing, currentStage]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      setIsRecording(false);
      // Simulate voice input
      addMessage("user", "我想做一期关于量子计算最新进展的播客");
      setIsProcessing(true);
      setTimeout(() => {
        addMessage("ai", mockResponses.default);
        setIsProcessing(false);
        if (currentStage === 0) setCurrentStage(1);
      }, 1500);
    } else {
      setIsRecording(true);
    }
  }, [isRecording, addMessage, currentStage]);

  return (
    <div className="h-screen flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <p className="font-mono text-[10px] text-muted-foreground tracking-widest uppercase">语音创作工作台</p>
          </div>
        </div>

        {/* Stage indicator */}
        <div className="flex items-center gap-1">
          {STAGES.map((stage, i) => (
            <div key={stage.id} className="flex items-center">
              <div className={`
                flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono transition-all duration-300
                ${i <= currentStage
                  ? "text-primary bg-primary/10"
                  : "text-muted-foreground"
                }
              `}>
                <span className={`w-1.5 h-1.5 rounded-full ${i < currentStage ? "bg-primary" : i === currentStage ? "bg-primary animate-pulse-amber" : "bg-border"}`} />
                {stage.label}
              </div>
              {i < STAGES.length - 1 && (
                <div className={`w-4 h-px mx-0.5 ${i < currentStage ? "bg-primary/40" : "bg-border"}`} />
              )}
            </div>
          ))}
        </div>
      </header>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-2xl mx-auto space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 animate-fade-up ${msg.role === "user" ? "flex-row-reverse" : ""}`}
            >
              <div className={`
                w-7 h-7 rounded flex items-center justify-center flex-shrink-0 text-[10px] font-mono font-bold
                ${msg.role === "ai"
                  ? "bg-primary/10 text-primary"
                  : "bg-surface-alt text-muted-foreground"
                }
              `}>
                {msg.role === "ai" ? "AI" : "你"}
              </div>
              <div className={`
                max-w-[80%] rounded px-4 py-3 text-sm leading-relaxed
                ${msg.role === "ai"
                  ? "bg-card border border-border"
                  : "bg-surface-alt border border-border"
                }
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
              <div className="w-7 h-7 rounded bg-primary/10 flex items-center justify-center text-[10px] font-mono font-bold text-primary">
                AI
              </div>
              <div className="bg-card border border-border rounded px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-amber" />
                  <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-amber" style={{ animationDelay: "300ms" }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-amber" style={{ animationDelay: "600ms" }} />
                  <span className="ml-2 font-mono text-[10px] text-muted-foreground">处理中</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="border-t border-border bg-card/50 backdrop-blur-sm px-6 py-5">
        <div className="max-w-2xl mx-auto">
          {/* Mode tabs */}
          <div className="flex items-center justify-center gap-6 mb-4">
            <span className="font-mono text-[10px] text-muted-foreground tracking-widest uppercase">
              {isRecording ? "● 录音中" : "准备就绪"}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Text input */}
            <div className="flex-1 relative">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend(inputText)}
                placeholder="输入文字消息，或按住麦克风说话…"
                className="w-full bg-surface border border-border rounded px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors"
              />
            </div>

            {/* Send button */}
            {inputText.trim() && (
              <button
                onClick={() => handleSend(inputText)}
                className="w-10 h-10 rounded bg-primary text-primary-foreground flex items-center justify-center hover:brightness-110 transition-all active:scale-95"
              >
                <Send size={16} />
              </button>
            )}

            {/* Mic button */}
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

          {/* Recording waveform */}
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
