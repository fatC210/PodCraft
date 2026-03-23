import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { PhoneOff, Mic, MicOff, ChevronDown, ChevronUp, AlertCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n";

// ── Types ──────────────────────────────────────────────────────────────────────

type AIState = "connecting" | "speaking" | "listening" | "thinking" | "generating";

type Message = {
  id: number;
  role: "ai" | "user";
  content: string;
  timestamp: string;
};

type WSMessage =
  | { type: "session_id"; session_id: string }
  | { type: "transcript"; text: string }
  | { type: "ai_text"; text: string; stage: number }
  | { type: "audio"; data: string }           // base64 audio
  | { type: "stage_change"; stage: number }
  | { type: "generating_podcast" }
  | { type: "podcast_done"; id: string; audio_url: string }
  | { type: "error"; message: string };

// ── Helpers ────────────────────────────────────────────────────────────────────

function nowTimestamp() {
  const d = new Date();
  return `${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function VoiceOrb({ state }: { state: AIState }) {
  const rings = state === "speaking" ? 4 : state === "listening" ? 3 : 2;
  return (
    <div className="relative flex items-center justify-center">
      {Array.from({ length: rings }).map((_, i) => (
        <div
          key={i}
          className={`absolute rounded-full border transition-all duration-700 ${
            state === "speaking"
              ? "border-primary/30"
              : state === "listening"
              ? "border-success/20"
              : state === "thinking" || state === "generating"
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
                : state === "thinking" || state === "generating"
                ? `pulse-ring ${2.5 + i * 0.5}s ease-in-out infinite`
                : "none",
            opacity: 1 - i * 0.25,
          }}
        />
      ))}
      <div
        className={`relative w-28 h-28 rounded-full flex items-center justify-center transition-all duration-500 ${
          state === "speaking"
            ? "bg-primary/20 glow-amber-strong"
            : state === "listening"
            ? "bg-success/10"
            : state === "thinking" || state === "generating"
            ? "bg-primary/10"
            : "bg-surface-alt"
        }`}
        style={{
          animation:
            state === "speaking"
              ? "orb-breathe 1.2s ease-in-out infinite"
              : state === "thinking" || state === "generating"
              ? "orb-breathe 2s ease-in-out infinite"
              : "none",
        }}
      >
        <div
          className={`w-16 h-16 rounded-full transition-all duration-500 ${
            state === "speaking"
              ? "bg-primary/40"
              : state === "listening"
              ? "bg-success/20"
              : state === "thinking" || state === "generating"
              ? "bg-primary/20 animate-pulse-amber"
              : "bg-border/30"
          }`}
        />
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
        {state === "listening" && (
          <div className="absolute flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
          </div>
        )}
      </div>
    </div>
  );
}

function CallTimer({ startTime }: { startTime: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [startTime]);
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  return <span>{mm}:{ss}</span>;
}

// ── Main Component ────────────────────────────────────────────────────────────

const SILENCE_THRESHOLD = 0.01;  // RMS threshold for silence detection
const SILENCE_DURATION = 1200;   // ms of silence before auto-send

export default function VoiceStudio() {
  const { t } = useI18n();
  const navigate = useNavigate();

  const stages = t.studio.stages.map((label: string, i: number) => ({
    id: i + 1, label,
    key: ["topic", "material", "params", "script", "voice", "generate"][i],
  }));

  const [aiState, setAIState] = useState<AIState>("connecting");
  const [currentStage, setCurrentStage] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [startTime] = useState(Date.now());

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSpeakingRef = useRef(false);
  const msgId = useRef(1);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const playQueueRef = useRef<string[]>([]);
  const isPlayingRef = useRef(false);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, []);

  const addMessage = useCallback((role: "ai" | "user", content: string) => {
    setMessages(prev => [...prev, { id: msgId.current++, role, content, timestamp: nowTimestamp() }]);
    scrollToBottom();
  }, [scrollToBottom]);

  // ── Audio playback queue ──────────────────────────────────────────────────

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
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => {
        isPlayingRef.current = false;
        if (playQueueRef.current.length > 0) {
          playNextAudio();
        } else {
          setAIState("listening");
        }
      };
      source.start();
    } catch {
      isPlayingRef.current = false;
      setAIState("listening");
    }
  }, []);

  const enqueueAudio = useCallback((b64: string) => {
    playQueueRef.current.push(b64);
    playNextAudio();
  }, [playNextAudio]);

  // ── WebSocket ─────────────────────────────────────────────────────────────

  const connectWebSocket = useCallback(() => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${protocol}://localhost:8000/api/voice/stream`;
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
            // session established
            break;
          case "transcript":
            addMessage("user", msg.text);
            break;
          case "ai_text":
            addMessage("ai", msg.text);
            setCurrentStage(msg.stage);
            setAIState("thinking");
            break;
          case "audio":
            enqueueAudio(msg.data);
            break;
          case "stage_change":
            setCurrentStage(msg.stage);
            break;
          case "generating_podcast":
            setAIState("generating");
            break;
          case "podcast_done":
            setAIState("listening");
            // Could navigate to history here
            break;
          case "error":
            setError(msg.message);
            setAIState("listening");
            break;
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onerror = () => {
      setError("连接后端失败，请确保后端服务已启动（python backend/main.py）");
      setAIState("connecting");
    };

    ws.onclose = () => {
      setAIState("connecting");
    };
  }, [addMessage, enqueueAudio]);

  // ── Microphone & VAD ──────────────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    if (isMuted || isRecording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Set up analyser for VAD
      const ctx = audioContextRef.current ?? new AudioContext();
      audioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyserRef.current = analyser;

      // MediaRecorder
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.start(100); // collect chunks every 100ms
      setIsRecording(true);
      isSpeakingRef.current = false;

      // VAD loop
      const checkSilence = () => {
        if (!analyserRef.current) return;
        const data = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(data);
        const rms = Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length);

        if (rms > SILENCE_THRESHOLD) {
          // User is speaking
          isSpeakingRef.current = true;
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
        } else if (isSpeakingRef.current) {
          // Just went silent after speaking
          if (!silenceTimerRef.current) {
            silenceTimerRef.current = setTimeout(() => {
              sendAudio();
            }, SILENCE_DURATION);
          }
        }

        if (isRecording) requestAnimationFrame(checkSilence);
      };

      requestAnimationFrame(checkSilence);
    } catch (e) {
      setError("无法访问麦克风，请检查权限设置");
    }
  }, [isMuted, isRecording]);

  const sendAudio = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    const ws = wsRef.current;
    if (!recorder || recorder.state === "inactive" || !ws || ws.readyState !== WebSocket.OPEN) return;

    recorder.stop();
    setIsRecording(false);
    isSpeakingRef.current = false;
    setAIState("thinking");

    recorder.onstop = async () => {
      const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
      audioChunksRef.current = [];

      if (blob.size < 1000) {
        // Too small, ignore
        setAIState("listening");
        startRecording();
        return;
      }

      // Send binary audio to WS
      const buffer = await blob.arrayBuffer();
      ws.send(buffer);

      // Signal end of speech
      ws.send(JSON.stringify({ type: "end_speech" }));
    };

    // Restart recording after sending
    setTimeout(() => startRecording(), 500);
  }, [startRecording]);

  const stopAll = useCallback(() => {
    mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    setIsRecording(false);
  }, []);

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  useEffect(() => {
    connectWebSocket();
    return () => {
      stopAll();
      wsRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Start recording once WS is connected and not muted
  useEffect(() => {
    if (aiState === "listening" && !isMuted && !isRecording) {
      startRecording();
    }
  }, [aiState, isMuted, isRecording, startRecording]);

  const handleEndCall = useCallback(() => {
    stopAll();
    wsRef.current?.close();
    navigate("/");
  }, [stopAll, navigate]);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      if (!prev) {
        // Muting: stop recording
        stopAll();
      }
      return !prev;
    });
  }, [stopAll]);

  const stateLabel =
    aiState === "connecting"
      ? t.studio.connecting
      : aiState === "speaking"
      ? t.studio.speaking
      : aiState === "thinking"
      ? t.studio.processing
      : aiState === "generating"
      ? (t.studio.generatingPodcast ?? "正在生成播客…")
      : t.studio.listening;

  return (
    <div className="h-screen flex flex-col bg-background relative overflow-hidden">
      {/* Ambient */}
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
          <CallTimer startTime={startTime} />
        </div>
      </header>

      {/* Error banner */}
      {error && (
        <div className="relative z-20 mx-6 mt-3 flex items-start gap-2 bg-destructive/10 border border-destructive/20 rounded px-4 py-3 text-sm text-destructive animate-fade-up">
          <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-xs opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Main voice area */}
      <div className="flex-1 flex flex-col items-center justify-center relative z-10">
        <VoiceOrb state={aiState} />
        <p className="mt-8 font-mono text-xs text-muted-foreground tracking-widest uppercase animate-fade-up">
          {stateLabel}
        </p>
        {isRecording && !isMuted && (
          <div className="mt-2 font-mono text-[10px] text-success animate-pulse">
            ● {t.studio.recording ?? "录音中"}
          </div>
        )}
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
        <button
          onClick={() => setShowTranscript(!showTranscript)}
          className="mx-auto flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors mb-4 font-mono text-[10px] tracking-widest uppercase"
        >
          {t.studio.transcript}
          {showTranscript ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
        </button>

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

        <div className="flex items-center justify-center gap-6">
          <button
            onClick={toggleMute}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 active:scale-95 ${
              isMuted
                ? "bg-destructive/20 text-destructive border border-destructive/30"
                : "bg-surface-alt border border-border text-foreground hover:border-primary/30"
            }`}
          >
            {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
          </button>

          <button
            onClick={handleEndCall}
            className="w-14 h-14 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:brightness-110 transition-all active:scale-95"
          >
            <PhoneOff size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
