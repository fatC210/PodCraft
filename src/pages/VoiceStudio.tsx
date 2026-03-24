import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { PhoneOff, Mic, MicOff, AlertCircle, Play, Pause } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { fetchSettings, fetchVoices, type Voice } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────────

type AIState = "connecting" | "speaking" | "listening" | "thinking" | "generating";

type RichContent =
  | { type: "voices"; voices: Voice[] }
  | { type: "script"; text: string };

type Message = {
  id: number;
  role: "ai" | "user";
  content: string;
  timestamp: string;
  richContent?: RichContent;
};

type WSMessage =
  | { type: "session_id"; session_id: string }
  | { type: "transcript"; text: string }
  | { type: "ai_text"; text: string; stage: number }
  | { type: "audio"; data: string }
  | { type: "stage_change"; stage: number }
  | { type: "generating_podcast" }
  | { type: "podcast_done"; id: string; audio_url: string }
  | { type: "no_speech" }
  | { type: "error"; message: string };

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
  return (
    <div className="mt-2 max-w-sm bg-background/60 border border-border rounded-lg p-3">
      <p className="text-[10px] font-mono text-muted-foreground mb-1.5 uppercase tracking-wider">脚本预览</p>
      <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap">{text}</p>
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

        <div
          className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
            isAI
              ? "bg-card border border-border rounded-tl-sm text-foreground"
              : "bg-primary/15 border border-primary/25 rounded-tr-sm text-foreground"
          }`}
        >
          {msg.content}
        </div>

        {/* Rich content below AI bubble */}
        {isAI && msg.richContent?.type === "voices" && (
          <VoiceCards voices={msg.richContent.voices} />
        )}
        {isAI && msg.richContent?.type === "script" && (
          <ScriptCard text={msg.richContent.text} />
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

const SILENCE_THRESHOLD = 0.01;
const SILENCE_DURATION = 1200;

function translateBackendError(msg: string, t: ReturnType<typeof useI18n>["t"]): string {
  if (msg.startsWith("TTS 失败:")) return `${t.studio.errTts}: ${msg.slice("TTS 失败:".length).trim()}`;
  if (msg.startsWith("STT 失败:")) return `${t.studio.errStt}: ${msg.slice("STT 失败:".length).trim()}`;
  return msg;
}

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
  const [isPaused, setIsPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [startTime] = useState(Date.now());
  const [aiName, setAiName] = useState("AI");

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
  const pendingRichContent = useRef<RichContent | null>(null);
  const followUpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const followUpAttemptRef = useRef(0);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, []);

  const addMessage = useCallback((role: "ai" | "user", content: string, richContent?: RichContent) => {
    setMessages(prev => [...prev, { id: msgId.current++, role, content, timestamp: nowTimestamp(), richContent }]);
    scrollToBottom();
  }, [scrollToBottom]);

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

  const startFollowUpTimer = useCallback(() => {
    if (isPausedRef.current) return;
    if (followUpTimerRef.current) clearTimeout(followUpTimerRef.current);
    followUpAttemptRef.current = 0;
    followUpTimerRef.current = setTimeout(sendFollowUp, FOLLOW_UP_TIMEOUT);
  }, []);

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
        } else {
          setAIState("listening");
          startFollowUpTimer();
        }
      };
      source.start();
    } catch {
      isPlayingRef.current = false;
      audioSourceRef.current = null;
      setAIState("listening");
      startFollowUpTimer();
    }
  }, [startFollowUpTimer]);

  const enqueueAudio = useCallback((b64: string) => {
    if (isPausedRef.current) return;
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
            break;
          case "transcript":
            addMessage("user", msg.text);
            // User spoke — reset follow-up counter and clear pending timer
            followUpAttemptRef.current = 0;
            if (followUpTimerRef.current) {
              clearTimeout(followUpTimerRef.current);
              followUpTimerRef.current = null;
            }
            break;
          case "ai_text": {
            // AI 开始回复，清除 follow-up 计时器（音频播完后会重新启动）
            if (followUpTimerRef.current) { clearTimeout(followUpTimerRef.current); followUpTimerRef.current = null; }
            const rich = pendingRichContent.current ?? undefined;
            pendingRichContent.current = null;
            addMessage("ai", msg.text, rich);
            setCurrentStage(msg.stage);
            setAIState("thinking");
            break;
          }
          case "audio":
            enqueueAudio(msg.data);
            break;
          case "stage_change":
            setCurrentStage(msg.stage);
            // Voice selection stage: pre-fetch voices to attach as rich content
            if (msg.stage === 3) {
              fetchVoices()
                .then(voices => { pendingRichContent.current = { type: "voices", voices }; })
                .catch(() => {});
            }
            break;
          case "generating_podcast":
            setAIState("generating");
            break;
          case "podcast_done":
            setAIState("listening");
            break;
          case "no_speech":
            // 噪音或无效语音，切回聆听，不打断 follow-up 计时器
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
  }, [addMessage, enqueueAudio]);

  // ── Microphone & VAD ──────────────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    if (isMuted || isRecording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const ctx = audioContextRef.current ?? new AudioContext();
      audioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyserRef.current = analyser;

      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.start(100);
      setIsRecording(true);
      isRecordingRef.current = true;
      isSpeakingRef.current = false;

      const checkSilence = () => {
        if (!analyserRef.current) return;
        const data = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(data);
        const rms = Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length);

        if (rms > SILENCE_THRESHOLD) {
          isSpeakingRef.current = true;
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
        } else if (isSpeakingRef.current) {
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
    streamRef.current?.getTracks().forEach(t => t.stop());
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    setIsRecording(false);
    isRecordingRef.current = false;
  }, []);

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  useEffect(() => {
    connectWebSocket();
    return () => {
      stopAll();
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

  // ── Follow-up timer (3 min silence → AI re-prompts) ───────────────────────

  const FOLLOW_UP_TIMEOUT = 20 * 1000; // 20秒无回复则追问

  const sendFollowUp = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    followUpAttemptRef.current += 1;
    ws.send(JSON.stringify({ type: "follow_up", attempt: followUpAttemptRef.current }));
    // Schedule next follow-up
    followUpTimerRef.current = setTimeout(sendFollowUp, FOLLOW_UP_TIMEOUT);
  }, []);

  useEffect(() => {
    // 仅在暂停变化时处理：暂停则清除计时器
    if (isPaused) {
      if (followUpTimerRef.current) { clearTimeout(followUpTimerRef.current); followUpTimerRef.current = null; }
    }
  }, [isPaused]);

  const handleEndCall = useCallback(() => {
    stopAll();
    if (followUpTimerRef.current) { clearTimeout(followUpTimerRef.current); followUpTimerRef.current = null; }
    wsRef.current?.close();
    navigate("/");
  }, [stopAll, navigate]);

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
