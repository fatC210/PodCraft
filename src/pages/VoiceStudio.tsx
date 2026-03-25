import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { PhoneOff, Mic, MicOff, AlertCircle, Play, Pause, Send } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { fetchSettings, fetchVoices, type Voice } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────────

type AIState = "connecting" | "speaking" | "listening" | "thinking" | "generating";

type RichContent =
  | { type: "voices"; voices: Voice[] }
  | { type: "script"; text: string }
  | { type: "materials"; items: Array<{ url: string; title: string; snippet: string }> }
  | { type: "loading"; label: string };

type Message = {
  id: number;
  role: "ai" | "user";
  content: string;
  timestamp: string;
  richContent?: RichContent;
};

type WSMessage =
  | { type: "session_id"; session_id: string }
  | { type: "session_restored"; stage: number; history: Array<{ role: string; content: string }>; materials: Array<{ url: string; title: string; snippet: string }>; script: string }
  | { type: "transcript"; text: string }
  | { type: "ai_text"; text: string; stage: number }
  | { type: "audio"; data: string }
  | { type: "stage_change"; stage: number }
  | { type: "materials"; items: Array<{ url: string; title: string; snippet: string }> }
  | { type: "script_ready"; text: string }
  | { type: "generating_podcast" }
  | { type: "progress"; task: string }
  | { type: "podcast_done"; id: string; audio_url: string }
  | { type: "no_speech" }
  | { type: "error"; message: string };

/** 无用户说话时追问间隔；有进度条/后台任务时不应启动此计时器 */
const FOLLOW_UP_TIMEOUT_MS = 60 * 1000;

// ── Helpers ────────────────────────────────────────────────────────────────────

function nowTimestamp() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Mini animated status orb */
function StatusOrb({ state }: { state: AIState }) {
  const color =
    state === "speaking" ? "bg-primary" :
    state === "listening" ? "bg-success" :
    state === "thinking" || state === "generating" ? "bg-amber-400" :
    "bg-muted-foreground/40";

  const pulse =
    state === "speaking" ? "animate-pulse" :
    state === "listening" ? "" :
    state === "thinking" || state === "generating" ? "animate-pulse" :
    "";

  return (
    <div className="relative flex items-center justify-center w-8 h-8">
      {(state === "speaking" || state === "listening") && (
        <div className={`absolute w-8 h-8 rounded-full ${state === "speaking" ? "bg-primary/20" : "bg-success/20"} animate-ping`} />
      )}
      <div className={`w-3 h-3 rounded-full ${color} ${pulse} transition-colors duration-500`} />
    </div>
  );
}

/** Waveform bars shown when AI is speaking */
function WaveformBars() {
  return (
    <div className="flex items-center gap-[2px] h-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="w-[2px] bg-primary rounded-full"
          style={{
            animation: `waveform ${0.4 + i * 0.1}s ease-in-out ${i * 60}ms infinite alternate`,
            height: "14px",
          }}
        />
      ))}
    </div>
  );
}

function CallTimer({ startTime, paused }: { startTime: number; paused: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  const accumulatedRef = useRef(0);
  const pausedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (paused) {
      pausedAtRef.current = Date.now();
      return;
    }
    // resuming: shift startTime equivalent by adding pause duration to accumulated
    if (pausedAtRef.current !== null) {
      accumulatedRef.current += Date.now() - pausedAtRef.current;
      pausedAtRef.current = null;
    }
    const iv = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime - accumulatedRef.current) / 1000));
    }, 1000);
    return () => clearInterval(iv);
  }, [paused, startTime]);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  return <span>{mm}:{ss}</span>;
}

/** Voice selection cards shown below AI message */
function VoiceCards({ voices }: { voices: Voice[] }) {
  const [playing, setPlaying] = useState<string | null>(null);

  const playPreview = useCallback((voice: Voice) => {
    if (!voice.preview_url) return;
    setPlaying(voice.id);
    const audio = new Audio(voice.preview_url);
    audio.onended = () => setPlaying(null);
    audio.onerror = () => setPlaying(null);
    audio.play().catch(() => setPlaying(null));
  }, []);

  if (voices.length === 0) return null;
  return (
    <div className="mt-2 grid grid-cols-2 gap-2 max-w-xs">
      {voices.slice(0, 6).map((v) => (
        <button
          key={v.id}
          onClick={() => playPreview(v)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-background/50 hover:border-primary/50 hover:bg-primary/5 transition-all text-left group"
        >
          <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold transition-all ${
            playing === v.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground group-hover:bg-primary/20"
          }`}>
            {playing === v.id
              ? <Play size={10} className="fill-current" />
              : v.name[0]?.toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground truncate">{v.name}</p>
            {v.labels?.gender && (
              <p className="text-[10px] text-muted-foreground capitalize">{v.labels.gender}</p>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}

/** Script display card */
function ScriptCard({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const preview = text.slice(0, 300);
  const hasMore = text.length > 300;
  return (
    <div className="mt-2 max-w-sm bg-background/60 border border-border rounded-lg p-3">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">脚本全文</p>
        <span className="text-[10px] font-mono text-muted-foreground">{text.length} 字</span>
      </div>
      <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap">
        {expanded ? text : preview}{hasMore && !expanded ? "…" : ""}
      </p>
      {hasMore && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="mt-2 text-[10px] font-mono text-primary hover:underline"
        >
          {expanded ? "收起" : "展开全部"}
        </button>
      )}
    </div>
  );
}

/** Loading / progress indicator shown while AI is working */
function LoadingIndicator({ label }: { label: string }) {
  return (
    <div className="mt-2 flex items-center gap-2.5 px-3 py-2 rounded-lg border border-border bg-background/50 max-w-xs">
      <div className="flex gap-1">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-primary/70"
            style={{ animation: `bounce 1s ease-in-out ${i * 160}ms infinite` }}
          />
        ))}
      </div>
      <span className="text-xs text-muted-foreground font-mono">{label}</span>
    </div>
  );
}

/** Search result materials card with clickable links */
function MaterialsCard({ items }: { items: Array<{ url: string; title: string; snippet: string }> }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-2 space-y-1.5 max-w-sm">
      {items.map((item, i) => (
        <a
          key={i}
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-start gap-2 px-3 py-2 rounded-lg border border-border bg-background/50 hover:border-primary/40 hover:bg-primary/5 transition-all group"
        >
          <span className="flex-shrink-0 mt-0.5 w-4 h-4 rounded text-[9px] font-bold font-mono bg-muted text-muted-foreground flex items-center justify-center group-hover:bg-primary/20 group-hover:text-primary transition-colors">
            {i + 1}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-primary truncate group-hover:underline">{item.title}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">{item.snippet}</p>
          </div>
        </a>
      ))}
    </div>
  );
}

/** Single chat message bubble */
function ChatMessage({ msg, aiName }: { msg: Message; aiName: string }) {
  const isAI = msg.role === "ai";

  return (
    <div className={`flex gap-3 ${isAI ? "justify-start" : "justify-end"} animate-fade-up`}>
      {isAI && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-[11px] font-bold text-primary mt-1">
          {aiName[0]?.toUpperCase() ?? "A"}
        </div>
      )}

      <div className={`flex flex-col ${isAI ? "items-start" : "items-end"} max-w-[70%]`}>
        <div className="flex items-center gap-2 mb-1">
          {isAI && (
            <span className="text-[11px] font-semibold text-primary">{aiName}</span>
          )}
          <span className="text-[10px] text-muted-foreground/60 font-mono">{msg.timestamp}</span>
          {!isAI && (
            <span className="text-[11px] font-semibold text-muted-foreground">你</span>
          )}
        </div>

        {(!isAI || String(msg.content ?? "").trim() !== "") && (
          <div
            className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
              isAI
                ? "bg-card border border-border rounded-tl-sm text-foreground"
                : "bg-primary/15 border border-primary/25 rounded-tr-sm text-foreground"
            }`}
          >
            {msg.content}
          </div>
        )}

        {/* Rich content below AI bubble */}
        {isAI && msg.richContent?.type === "voices" && (
          <VoiceCards voices={msg.richContent.voices} />
        )}
        {isAI && msg.richContent?.type === "script" && (
          <ScriptCard text={msg.richContent.text} />
        )}
        {isAI && msg.richContent?.type === "materials" && (
          <MaterialsCard items={msg.richContent.items} />
        )}
        {isAI && msg.richContent?.type === "loading" && (
          <LoadingIndicator label={msg.richContent.label} />
        )}
      </div>

      {!isAI && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted border border-border flex items-center justify-center text-[11px] font-bold text-muted-foreground mt-1">
          你
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

const SILENCE_THRESHOLD = 0.02;
const MIN_SPEAKING_FRAMES = 6; // ~100ms 持续语音才算真正发言，过滤背景噪音
const SILENCE_DURATION = 500;
// 打断检测：持续帧数要求（~170ms @60fps），避免笑声/掌声等短暂突发误触发
const INTERRUPT_FRAMES_NEEDED = 10;

function translateBackendError(msg: string, t: ReturnType<typeof useI18n>["t"]): string {
  if (msg.startsWith("TTS 失败:")) return `${t.studio.errTts}: ${msg.slice("TTS 失败:".length).trim()}`;
  if (msg.startsWith("STT 失败:")) return `${t.studio.errStt}: ${msg.slice("STT 失败:".length).trim()}`;
  return msg;
}

export default function VoiceStudio() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const resumeId: string | undefined = (location.state as any)?.resumeId;

  const stages = t.studio.stages.map((label: string, i: number) => ({
    id: i + 1, label,
    key: ["topic", "material", "params", "script", "voice", "generate"][i],
  }));

  const [aiState, setAIState] = useState<AIState>("connecting");
  const [currentStage, setCurrentStage] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [startTime] = useState(Date.now());
  const [aiName, setAiName] = useState("AI");
  const [textInput, setTextInput] = useState("");

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSpeakingRef = useRef(false);
  const isRecordingRef = useRef(false);
  const msgId = useRef(1);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const playQueueRef = useRef<string[]>([]);
  const isPlayingRef = useRef(false);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const isPausedRef = useRef(false);
  const discardAudioRef = useRef(false);
  const pendingRichContent = useRef<RichContent | null>(null);
  const followUpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const followUpAttemptRef = useRef(0);
  const interruptCheckingRef = useRef(false);
  // 后台内容生成中（搜索/生成脚本），音频播完后不切到 listening，保持 thinking
  const isWaitingContentRef = useRef(false);
  const messagesRef = useRef<Message[]>([]);
  const aiStateRef = useRef<AIState>("connecting");

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    aiStateRef.current = aiState;
  }, [aiState]);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, []);

  const addMessage = useCallback((role: "ai" | "user", content: string, richContent?: RichContent) => {
    setMessages(prev => [...prev, { id: msgId.current++, role, content, timestamp: nowTimestamp(), richContent }]);
    scrollToBottom();
  }, [scrollToBottom]);

  // 将最近一条带 loading richContent 的消息替换为真实内容
  const replaceLoadingContent = useCallback((rich: RichContent) => {
    setMessages(prev => {
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].richContent?.type === "loading") {
          const updated = [...prev];
          updated[i] = { ...updated[i], richContent: rich };
          return updated;
        }
      }
      // 没有 loading 消息时降级为 pendingRichContent
      pendingRichContent.current = rich;
      return prev;
    });
  }, []);

  // Fetch AI voice name from settings
  useEffect(() => {
    fetchSettings()
      .then(s => {
        if (s.assistant_voice_id) {
          fetchVoices()
            .then(voices => {
              const v = voices.find(v => v.id === s.assistant_voice_id);
              if (v) setAiName(v.name.split(" - ")[0].trim());
            })
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  // ── Audio playback queue ──────────────────────────────────────────────────

  const shouldDeferFollowUp = useCallback(() => {
    if (isWaitingContentRef.current) return true;
    if (messagesRef.current.some(m => m.richContent?.type === "loading")) return true;
    if (aiStateRef.current === "generating") return true;
    return false;
  }, []);

  const sendFollowUp = useCallback(function sendFollowUpFn() {
    if (isPausedRef.current) {
      followUpTimerRef.current = null;
      return;
    }
    if (shouldDeferFollowUp()) {
      followUpTimerRef.current = setTimeout(sendFollowUpFn, FOLLOW_UP_TIMEOUT_MS);
      return;
    }
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    followUpAttemptRef.current += 1;
    console.log(`[follow_up] 前端发送追问 attempt=${followUpAttemptRef.current}`);
    ws.send(JSON.stringify({ type: "follow_up", attempt: followUpAttemptRef.current }));
    followUpTimerRef.current = setTimeout(sendFollowUpFn, FOLLOW_UP_TIMEOUT_MS);
  }, [shouldDeferFollowUp]);

  const startFollowUpTimer = useCallback(() => {
    if (isPausedRef.current) return;
    if (shouldDeferFollowUp()) return;
    if (followUpTimerRef.current) clearTimeout(followUpTimerRef.current);
    followUpAttemptRef.current = 0;
    followUpTimerRef.current = setTimeout(sendFollowUp, FOLLOW_UP_TIMEOUT_MS);
  }, [sendFollowUp, shouldDeferFollowUp]);

  // ── AI 打断 ───────────────────────────────────────────────────────────────

  const interruptAI = useCallback(() => {
    interruptCheckingRef.current = false;
    discardAudioRef.current = true;
    if (audioSourceRef.current) {
      audioSourceRef.current.onended = null;
      try { audioSourceRef.current.stop(); } catch { /* already stopped */ }
      audioSourceRef.current = null;
    }
    playQueueRef.current = [];
    isPlayingRef.current = false;
  }, []);

  const startInterruptMonitor = useCallback(() => {
    if (interruptCheckingRef.current) return;
    interruptCheckingRef.current = true;
    let speechFrames = 0;

    const check = () => {
      if (!interruptCheckingRef.current || !isPlayingRef.current || isPausedRef.current || isMuted) {
        interruptCheckingRef.current = false;
        speechFrames = 0;
        return;
      }
      const analyser = analyserRef.current;
      const ctx = audioContextRef.current;
      if (!analyser || !ctx) { interruptCheckingRef.current = false; return; }

      // 用频域检测人声，而非宽带 RMS（避免音乐/笑声误触发）
      const freqData = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(freqData);

      const binWidth = ctx.sampleRate / analyser.fftSize;

      // 人声主要频段：200-3500 Hz（基音 + 共振峰）
      const sLow  = Math.round(200  / binWidth);
      const sHigh = Math.round(3500 / binWidth);
      // 高频段：4000-8000 Hz（音乐/噪声往往在此更突出）
      const hLow  = Math.round(4000 / binWidth);
      const hHigh = Math.min(Math.round(8000 / binWidth), freqData.length - 1);

      let speechSum = 0;
      for (let i = sLow; i < sHigh; i++) speechSum += freqData[i];
      const speechAvg = speechSum / (sHigh - sLow);

      let highSum = 0;
      for (let i = hLow; i < hHigh; i++) highSum += freqData[i];
      const highAvg = hHigh > hLow ? highSum / (hHigh - hLow) : 0;

      // 判断为语音：人声频段有足够能量 且 高频能量不超过人声（排除音乐/噪声）
      const isSpeechLike = speechAvg > 55 && speechAvg > highAvg * 1.3;

      if (isSpeechLike) {
        speechFrames++;
        if (speechFrames >= INTERRUPT_FRAMES_NEEDED) {
          speechFrames = 0;
          interruptAI();
          if (followUpTimerRef.current) { clearTimeout(followUpTimerRef.current); followUpTimerRef.current = null; }
          setAIState("listening");
          return;
        }
      } else {
        // 衰减：非语音帧不立即归零，给一点容忍窗口
        speechFrames = Math.max(0, speechFrames - 2);
      }

      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  }, [interruptAI, isMuted]);

  const playNextAudio = useCallback(async () => {
    if (isPlayingRef.current || playQueueRef.current.length === 0) return;
    const b64 = playQueueRef.current.shift()!;
    isPlayingRef.current = true;
    setAIState("speaking");

    try {
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const ctx = audioContextRef.current ?? new AudioContext();
      audioContextRef.current = ctx;
      const buffer = await ctx.decodeAudioData(bytes.buffer);
      const source = ctx.createBufferSource();
      audioSourceRef.current = source;
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => {
        isPlayingRef.current = false;
        audioSourceRef.current = null;
        if (playQueueRef.current.length > 0) {
          playNextAudio();
        } else if (isWaitingContentRef.current) {
          // 后台还在生成内容，保持 thinking 状态，不进入 listening
          setAIState("thinking");
        } else {
          setAIState("listening");
          startFollowUpTimer();
        }
      };
      source.start();
      // 延迟启动打断检测，让浏览器 echo cancellation 有时间收敛，避免误触发
      setTimeout(() => startInterruptMonitor(), 600);
    } catch {
      isPlayingRef.current = false;
      audioSourceRef.current = null;
      setAIState("listening");
      startFollowUpTimer();
    }
  }, [startFollowUpTimer, startInterruptMonitor]);

  const enqueueAudio = useCallback((b64: string) => {
    if (isPausedRef.current || discardAudioRef.current) return;
    playQueueRef.current.push(b64);
    playNextAudio();
  }, [playNextAudio]);

  // ── WebSocket ─────────────────────────────────────────────────────────────

  const connectWebSocket = useCallback(() => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const base = `${protocol}://localhost:8000/api/voice/stream`;
    const wsUrl = resumeId ? `${base}?resume_id=${resumeId}` : base;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setAIState("listening");
      setError(null);
    };

    ws.onmessage = (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data);
        switch (msg.type) {
          case "session_id":
            break;
          case "session_restored": {
            setCurrentStage(msg.stage);

            // 把 rich content 挂到历史中对应的那条 AI 消息下
            const materialsRich: RichContent | undefined =
              msg.materials.length > 0 ? { type: "materials", items: msg.materials } : undefined;
            const scriptRich: RichContent | undefined =
              msg.script ? { type: "script", text: msg.script } : undefined;

            let materialsAttached = false;
            let scriptAttached = false;

            const restored: Message[] = msg.history.map((h) => {
              let richContent: RichContent | undefined;
              if (h.role === "assistant") {
                if (!materialsAttached && materialsRich &&
                  (h.content.includes("条素材") || h.content.includes("相关内容") || h.content.includes("找到"))) {
                  richContent = materialsRich;
                  materialsAttached = true;
                } else if (!scriptAttached && scriptRich &&
                  (h.content.includes("脚本已生成") || h.content.includes("完整脚本"))) {
                  richContent = scriptRich;
                  scriptAttached = true;
                }
              }
              return {
                id: msgId.current++,
                role: h.role === "user" ? "user" : "ai",
                content: h.content,
                timestamp: nowTimestamp(),
                richContent,
              };
            });

            setMessages(restored);
            scrollToBottom();

            const resumeNotice: Message = {
              id: msgId.current++,
              role: "ai",
              content: "欢迎回来！我们继续上次的对话。",
              timestamp: nowTimestamp(),
            };
            setMessages(prev => [...prev, resumeNotice]);
            scrollToBottom();
            break;
          }
          case "transcript":
            addMessage("user", msg.text);
            followUpAttemptRef.current = 0;
            if (followUpTimerRef.current) {
              clearTimeout(followUpTimerRef.current);
              followUpTimerRef.current = null;
            }
            break;
          case "ai_text": {
            if (followUpTimerRef.current) { clearTimeout(followUpTimerRef.current); followUpTimerRef.current = null; }
            discardAudioRef.current = false;
            const rich = pendingRichContent.current ?? undefined;
            pendingRichContent.current = null;
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (
                last?.role === "ai" &&
                last.richContent?.type === "loading" &&
                !String(last.content ?? "").trim()
              ) {
                const nextRich = rich ?? last.richContent;
                return [...prev.slice(0, -1), { ...last, content: msg.text, richContent: nextRich }];
              }
              return [...prev, {
                id: msgId.current++,
                role: "ai",
                content: msg.text,
                timestamp: nowTimestamp(),
                richContent: rich,
              }];
            });
            setCurrentStage(msg.stage);
            setAIState("thinking");
            scrollToBottom();
            break;
          }
          case "audio":
            enqueueAudio(msg.data);
            break;
          case "progress": {
            const label = msg.task === "searching" ? "搜索中…" : "生成脚本中…";
            pendingRichContent.current = { type: "loading", label };
            isWaitingContentRef.current = true;
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (
                last?.role === "ai" &&
                last.richContent?.type === "loading" &&
                !String(last.content ?? "").trim()
              ) {
                return prev.map((m, i) =>
                  i === prev.length - 1 ? { ...m, richContent: { type: "loading", label } } : m
                );
              }
              return [...prev, {
                id: msgId.current++,
                role: "ai",
                content: "",
                timestamp: nowTimestamp(),
                richContent: { type: "loading", label },
              }];
            });
            scrollToBottom();
            break;
          }
          case "materials": {
            // 清除过渡消息的 loading，将素材卡挂到下一条 ai_text 消息下方
            isWaitingContentRef.current = false;
            setMessages(prev => {
              for (let i = prev.length - 1; i >= 0; i--) {
                if (prev[i].richContent?.type === "loading") {
                  const updated = [...prev];
                  updated[i] = { ...updated[i], richContent: undefined };
                  return updated;
                }
              }
              return prev;
            });
            pendingRichContent.current = { type: "materials", items: msg.items };
            break;
          }
          case "script_ready": {
            // 清除过渡消息的 loading，将脚本卡挂到下一条 ai_text 消息下方
            isWaitingContentRef.current = false;
            setMessages(prev => {
              for (let i = prev.length - 1; i >= 0; i--) {
                if (prev[i].richContent?.type === "loading") {
                  const updated = [...prev];
                  updated[i] = { ...updated[i], richContent: undefined };
                  return updated;
                }
              }
              return prev;
            });
            pendingRichContent.current = { type: "script", text: msg.text };
            break;
          }
          case "stage_change":
            setCurrentStage(msg.stage);
            // Voice selection stage: pre-fetch voices to attach as rich content
            if (msg.stage === 4) {
              fetchVoices()
                .then(voices => { pendingRichContent.current = { type: "voices", voices }; })
                .catch(() => {});
            }
            break;
          case "generating_podcast":
            setAIState("generating");
            isWaitingContentRef.current = true;
            break;
          case "podcast_done":
            setAIState("listening");
            isWaitingContentRef.current = false;
            break;
          case "no_speech":
            setAIState("listening");
            break;
          case "error":
            setError(translateBackendError(msg.message, t));
            setAIState("listening");
            break;
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onerror = () => {
      setError(t.studio.errConnection);
      setAIState("connecting");
    };

    ws.onclose = () => {
      setAIState("connecting");
    };
  }, [addMessage, enqueueAudio, scrollToBottom, resumeId]);

  // ── Microphone & VAD ──────────────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    if (isMuted || isRecording) return;
    try {
      // 复用已有的麦克风流，避免重复申请权限
      let stream = streamRef.current;
      if (!stream || stream.getTracks().some(t => t.readyState === "ended")) {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        streamRef.current = stream;
        // 只在首次创建时设置 AudioContext 和 AnalyserNode
        const ctx = audioContextRef.current ?? new AudioContext();
        audioContextRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        analyserRef.current = analyser;
      }

      const analyser = analyserRef.current!;
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.start(50);
      setIsRecording(true);
      isRecordingRef.current = true;
      isSpeakingRef.current = false;
      let speakingFrames = 0;

      const checkSilence = () => {
        if (!analyserRef.current) return;
        const data = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(data);
        const rms = Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length);

        if (rms > SILENCE_THRESHOLD) {
          speakingFrames++;
          if (speakingFrames >= MIN_SPEAKING_FRAMES) {
            isSpeakingRef.current = true;
          }
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
        } else if (isSpeakingRef.current) {
          speakingFrames = 0;
          if (!silenceTimerRef.current) {
            silenceTimerRef.current = setTimeout(() => {
              sendAudio();
            }, SILENCE_DURATION);
          }
        }

        if (isRecordingRef.current) requestAnimationFrame(checkSilence);
      };

      requestAnimationFrame(checkSilence);
    } catch {
      setError(t.studio.errMic);
    }
  }, [isMuted, isRecording]);

  const sendAudio = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    const ws = wsRef.current;
    if (!recorder || recorder.state === "inactive" || !ws || ws.readyState !== WebSocket.OPEN) return;

    recorder.stop();
    setIsRecording(false);
    isRecordingRef.current = false;
    isSpeakingRef.current = false;

    recorder.onstop = async () => {
      const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
      audioChunksRef.current = [];

      if (blob.size < 1000) {
        // 音频太短，静默重启录音，不改变 aiState（保持计时器不重置）
        startRecording();
        return;
      }

      setAIState("thinking");
      const buffer = await blob.arrayBuffer();
      ws.send(buffer);
      ws.send(JSON.stringify({ type: "end_speech" }));
    };
  }, [startRecording]);

  const stopAll = useCallback(() => {
    mediaRecorderRef.current?.stop();
    // 保留 stream 以便打断监听继续工作；完全销毁由 stopStream 负责
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    setIsRecording(false);
    isRecordingRef.current = false;
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
  }, []);

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  useEffect(() => {
    connectWebSocket();
    return () => {
      stopAll();
      stopStream();
      interruptCheckingRef.current = false;
      if (followUpTimerRef.current) { clearTimeout(followUpTimerRef.current); followUpTimerRef.current = null; }
      wsRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (aiState === "listening" && !isMuted && !isRecording && !isPaused) {
      startRecording();
    }
  }, [aiState, isMuted, isRecording, isPaused, startRecording]);

  useEffect(() => {
    // 仅在暂停变化时处理：暂停则清除计时器
    if (isPaused) {
      if (followUpTimerRef.current) { clearTimeout(followUpTimerRef.current); followUpTimerRef.current = null; }
    }
  }, [isPaused]);

  const handleEndCall = useCallback(() => {
    interruptCheckingRef.current = false;
    stopAll();
    stopStream();
    if (followUpTimerRef.current) { clearTimeout(followUpTimerRef.current); followUpTimerRef.current = null; }
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "end_call" }));
    }
    wsRef.current?.close();
    navigate("/");
  }, [stopAll, stopStream, navigate]);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      if (!prev) stopAll();
      return !prev;
    });
  }, [stopAll]);

  const togglePause = useCallback(() => {
    setIsPaused(prev => {
      const pausing = !prev;
      isPausedRef.current = pausing;
      if (pausing) {
        // 停止录音
        stopAll();
        // 停止 AI 正在播放的音频并清空队列
        if (audioSourceRef.current) {
          audioSourceRef.current.onended = null;
          audioSourceRef.current.stop();
          audioSourceRef.current = null;
        }
        playQueueRef.current = [];
        isPlayingRef.current = false;
        setAIState("listening");
      }
      return pausing;
    });
  }, [stopAll]);

  const sendTextInput = useCallback(() => {
    const text = textInput.trim();
    if (!text) return;
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    // 停止 AI 正在播放的音频（模拟打断）
    interruptAI();
    if (followUpTimerRef.current) { clearTimeout(followUpTimerRef.current); followUpTimerRef.current = null; }

    setTextInput("");
    setAIState("thinking");
    ws.send(JSON.stringify({ type: "text_input", text }));
  }, [textInput, interruptAI]);

  const stateLabel =
    isPaused ? "已暂停" :
    aiState === "connecting" ? t.studio.connecting :
    aiState === "speaking" ? t.studio.speaking :
    aiState === "thinking" ? t.studio.processing :
    aiState === "generating" ? (t.studio.generatingPodcast ?? "正在生成播客…") :
    t.studio.listening;

  return (
    <div className="h-screen flex flex-col bg-background relative overflow-hidden">
      {/* Ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            aiState === "speaking"
              ? "radial-gradient(circle at 50% 100%, hsl(43 100% 50% / 0.04) 0%, transparent 60%)"
              : aiState === "listening"
              ? "radial-gradient(circle at 50% 100%, hsl(142 71% 45% / 0.03) 0%, transparent 60%)"
              : "none",
          transition: "background 1s ease",
        }}
      />

      {/* Top bar */}
      <header className="relative flex items-center justify-between px-6 py-3 border-b border-border/50 bg-background/80 backdrop-blur-sm z-10 flex-shrink-0">
        <div className="flex items-center gap-1">
          {stages.map((stage: { id: number; label: string }, i: number) => (
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
        <div className="font-mono text-[11px] text-muted-foreground flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${aiState === "connecting" ? "bg-amber-500 animate-pulse" : "bg-success animate-pulse"}`} />
          <CallTimer startTime={startTime} paused={isPaused} />
        </div>
      </header>

      {/* Error banner */}
      {error && (
        <div className="relative z-20 mx-6 mt-3 flex items-start gap-2 bg-destructive/10 border border-destructive/20 rounded px-4 py-3 text-sm text-destructive animate-fade-up flex-shrink-0">
          <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-xs opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Chat messages area */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5 relative z-10">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-3">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-base font-bold text-primary">
                  {aiName[0]?.toUpperCase() ?? "A"}
                </div>
              </div>
              <p className="text-sm text-muted-foreground font-mono">{aiName}</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                {aiState === "connecting" ? t.studio.connecting : "等待对话开始…"}
              </p>
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <ChatMessage key={msg.id} msg={msg} aiName={aiName} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Bottom status + controls */}
      <div className="relative z-10 flex-shrink-0 border-t border-border/50 bg-background/80 backdrop-blur-sm px-6 py-4">
        {/* Text input row */}
        <div className="flex items-center gap-2 mb-3">
          <input
            type="text"
            value={textInput}
            onChange={e => setTextInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendTextInput(); } }}
            placeholder="输入文字代替语音（按 Enter 发送）…"
            className="flex-1 h-9 px-3 rounded-lg bg-muted/50 border border-border text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 focus:bg-background transition-all"
          />
          <button
            onClick={sendTextInput}
            disabled={!textInput.trim()}
            className="w-9 h-9 rounded-lg flex items-center justify-center bg-primary/15 border border-primary/30 text-primary hover:bg-primary/25 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95"
          >
            <Send size={14} />
          </button>
        </div>

        <div className="flex items-center justify-between">
          {/* Status indicator */}
          <div className="flex items-center gap-2.5">
            <StatusOrb state={aiState} />
            <div className="flex items-center gap-2">
              {aiState === "speaking" && <WaveformBars />}
              <span className="font-mono text-[11px] text-muted-foreground tracking-wider">
                {stateLabel}
              </span>
            </div>
            {isRecording && !isMuted && (
              <span className="font-mono text-[10px] text-success animate-pulse ml-1">
                ● {t.studio.recording ?? "录音中"}
              </span>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3">
            <button
              onClick={toggleMute}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 active:scale-95 ${
                isMuted
                  ? "bg-destructive/20 text-destructive border border-destructive/30"
                  : "bg-surface-alt border border-border text-foreground hover:border-primary/30"
              }`}
            >
              {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
            </button>

            <button
              onClick={togglePause}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 active:scale-95 ${
                isPaused
                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                  : "bg-surface-alt border border-border text-foreground hover:border-amber-500/30"
              }`}
              title={isPaused ? "继续对话" : "暂停对话"}
            >
              {isPaused ? <Play size={16} /> : <Pause size={16} />}
            </button>

            <button
              onClick={handleEndCall}
              className="w-12 h-12 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:brightness-110 transition-all active:scale-95"
            >
              <PhoneOff size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
