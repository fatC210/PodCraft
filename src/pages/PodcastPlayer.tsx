import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Play, Pause, SkipBack, Volume2, Loader2, Headphones } from "lucide-react";
import { fetchPodcast, type PodcastHistoryItem, type PodcastSegment } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

// ── Waveform animation ────────────────────────────────────────────────────────

const BAR_HEIGHTS = [10, 20, 32, 24, 14, 28, 20, 36, 18, 12, 30, 22, 16, 28, 20, 10, 24, 34, 18, 26, 14, 32, 20, 12];

function Waveform({ playing }: { playing: boolean }) {
  return (
    <div className="flex items-end justify-center gap-[3px] h-10">
      {BAR_HEIGHTS.map((h, i) => (
        <div
          key={i}
          className={`w-[3px] rounded-full bg-primary/70 transition-all duration-500 ${playing ? "animate-waveform-bar" : ""}`}
          style={{
            height: `${playing ? h : Math.max(h * 0.15, 3)}px`,
            animationDuration: `${0.45 + (i % 5) * 0.09}s`,
            animationDelay: `${(i % 7) * 0.06}s`,
          }}
        />
      ))}
    </div>
  );
}

// ── Segment parsing ───────────────────────────────────────────────────────────

function parseSegments(item: PodcastHistoryItem): PodcastSegment[] {
  if (item.segments_json) {
    try {
      const parsed = JSON.parse(item.segments_json);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].start_ms >= 0) {
        return parsed;
      }
    } catch { /* fall through */ }
  }
  if (!item.script) return [];
  const lines = item.script.split("\n").map((l) => l.trim()).filter((l) => l);
  return lines.map((line) => {
    const m = line.match(/^([^：:]+)[：:]\s*(.+)$/);
    return { role: m?.[1]?.trim() ?? "", text: m?.[2]?.trim() ?? line, start_ms: -1, duration_ms: -1 };
  });
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PodcastPlayer() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();

  const [podcast, setPodcast] = useState<PodcastHistoryItem | null>(null);
  const [segments, setSegments] = useState<PodcastSegment[]>([]);
  const [loading, setLoading] = useState(true);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [activeIdx, setActiveIdx] = useState(-1);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const progressRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const wasPlayingRef = useRef(false);

  // ── Data loading ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!id) return;
    fetchPodcast(id)
      .then((p) => { setPodcast(p); setSegments(parseSegments(p)); })
      .catch(() => navigate("/history"))
      .finally(() => setLoading(false));
  }, [id]);

  // ── Audio setup ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!podcast?.audio_url) return;
    const audio = new Audio(podcast.audio_url);
    audioRef.current = audio;
    audio.onloadedmetadata = () => setDuration(audio.duration);
    audio.ontimeupdate = () => setCurrentTime(audio.currentTime);
    audio.onplay = () => setPlaying(true);
    audio.onpause = () => { if (!isDragging.current) setPlaying(false); };
    audio.onended = () => { setPlaying(false); setCurrentTime(0); };
    audio.play().catch(() => {});
    return () => { audio.pause(); audio.src = ""; };
  }, [podcast]);

  // ── Subtitle highlight ────────────────────────────────────────────────────

  useEffect(() => {
    if (segments.length === 0) return;
    const hasTimestamps = segments[0].start_ms >= 0;
    if (!hasTimestamps) {
      const pct = duration > 0 ? currentTime / duration : 0;
      setActiveIdx(Math.min(Math.floor(pct * segments.length), segments.length - 1));
      return;
    }
    const ms = currentTime * 1000;
    let idx = -1;
    for (let i = segments.length - 1; i >= 0; i--) {
      // Segment i is active while ms is within [start_ms, start_ms + duration_ms)
      const end = segments[i].duration_ms > 0
        ? segments[i].start_ms + segments[i].duration_ms
        : (segments[i + 1]?.start_ms ?? Infinity);
      if (ms >= segments[i].start_ms && ms < end) { idx = i; break; }
    }
    setActiveIdx(idx);
  }, [currentTime, duration, segments]);

  useEffect(() => {
    if (activeIdx >= 0) {
      lineRefs.current[activeIdx]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [activeIdx]);

  // ── Controls ──────────────────────────────────────────────────────────────

  const togglePlay = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    playing ? a.pause() : a.play();
  }, [playing]);

  const restart = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = 0;
    a.play();
  }, []);

  const seekTo = useCallback((time: number) => {
    const a = audioRef.current;
    if (!a || !duration) return;
    a.currentTime = Math.max(0, Math.min(time, duration));
  }, [duration]);

  // ── Draggable progress bar ────────────────────────────────────────────────

  const seekByClientX = useCallback((clientX: number) => {
    if (!progressRef.current || !duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min((clientX - rect.left) / rect.width, 1));
    seekTo(pct * duration);
  }, [duration, seekTo]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    isDragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    const a = audioRef.current;
    wasPlayingRef.current = !!a && !a.paused;
    if (a && !a.paused) a.pause();
    seekByClientX(e.clientX);
  }, [seekByClientX]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    seekByClientX(e.clientX);
  }, [seekByClientX]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    seekByClientX(e.clientX);
    if (wasPlayingRef.current && audioRef.current) {
      audioRef.current.play().catch(() => {});
    }
  }, [seekByClientX]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const fmtTime = (s: number) =>
    `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

  const roleColors: Record<string, string> = {};
  const palette = ["text-primary", "text-emerald-400", "text-amber-400", "text-purple-400"];
  segments.forEach((seg) => {
    if (!roleColors[seg.role]) {
      roleColors[seg.role] = palette[Object.keys(roleColors).length % palette.length];
    }
  });

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!podcast) return null;

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto p-6 gap-5">

      {/* Header */}
      <div className="flex items-center gap-3 animate-fade-up flex-shrink-0">
        <button
          onClick={() => navigate("/history")}
          className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-surface-alt transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-mono text-[10px] text-muted-foreground tracking-widest uppercase">{t.history.podcastBreadcrumb}</p>
          <h1 className="text-lg font-semibold truncate">{podcast.title}</h1>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Headphones size={14} />
          <span className="font-mono text-xs">{(!podcast.duration || podcast.duration === "未知") ? t.history.durationUnknown : podcast.duration}</span>
        </div>
      </div>

      {/* Player panel — at the top */}
      <div
        className="bg-card border border-border rounded-lg px-5 pt-4 pb-4 animate-fade-up flex-shrink-0"
        style={{ animationDelay: "40ms" }}
      >
        {/* Waveform */}
        <div className="flex items-center justify-center mb-4">
          <Waveform playing={playing} />
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-3 mb-4">
          <span className="font-mono text-[11px] text-muted-foreground w-10 text-right select-none">
            {fmtTime(currentTime)}
          </span>

          {/* Custom draggable track */}
          <div
            ref={progressRef}
            className="relative flex-1 h-2 rounded-full bg-border cursor-pointer group"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            {/* Played fill */}
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width] duration-100"
              style={{ width: `${pct}%` }}
            />
            {/* Thumb */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-primary border-2 border-background shadow-sm opacity-0 group-hover:opacity-100 transition-opacity -translate-x-1/2"
              style={{ left: `${pct}%` }}
            />
          </div>

          <span className="font-mono text-[11px] text-muted-foreground w-10 select-none">
            {fmtTime(duration)}
          </span>
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-center gap-5">
          <button
            onClick={restart}
            className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-surface-alt transition-colors active:scale-95"
          >
            <SkipBack size={16} />
          </button>
          <button
            onClick={togglePlay}
            className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center transition-transform active:scale-95 hover:opacity-90"
          >
            {playing ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
          </button>
          <button className="w-9 h-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-surface-alt transition-colors">
            <Volume2 size={16} />
          </button>
        </div>
      </div>

      {/* Script / subtitles — below player */}
      <div
        className="flex-1 overflow-y-auto rounded border border-border bg-card px-5 py-4 space-y-2 animate-fade-up"
        style={{ animationDelay: "80ms", minHeight: 0 }}
      >
        {segments.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">{t.history.noScript}</p>
        ) : (
          segments.map((seg, i) => (
            <div
              key={i}
              ref={(el) => { lineRefs.current[i] = el; }}
              onClick={() => seg.start_ms >= 0 && seekTo(seg.start_ms / 1000)}
              className={`flex gap-3 rounded px-2 py-1.5 transition-all duration-300 ${
                seg.start_ms >= 0 ? "cursor-pointer" : ""
              } ${i === activeIdx ? "bg-primary/8" : "hover:bg-surface-alt/50"}`}
            >
              <span
                className={`font-mono text-[11px] font-medium flex-shrink-0 w-16 text-right mt-0.5 transition-colors duration-300 ${
                  roleColors[seg.role] ?? "text-muted-foreground"
                } ${i !== activeIdx ? "opacity-40" : ""}`}
              >
                {seg.role}
              </span>
              <p
                className={`text-sm leading-relaxed transition-all duration-300 ${
                  i === activeIdx ? "text-foreground font-medium" : "text-muted-foreground/60"
                }`}
              >
                {seg.text}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
