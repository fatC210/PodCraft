import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Play, Pause, SkipBack, Volume2, Loader2, Headphones,
} from "lucide-react";
import { fetchPodcast, type PodcastHistoryItem, type PodcastSegment } from "@/lib/api";

function parseSegments(item: PodcastHistoryItem): PodcastSegment[] {
  if (item.segments_json) {
    try {
      const parsed = JSON.parse(item.segments_json);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].start_ms >= 0) {
        return parsed;
      }
    } catch { /* fall through */ }
  }
  // 降级：从 script 文本均等分
  if (!item.script) return [];
  const lines = item.script
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l);
  return lines.map((line) => {
    const m = line.match(/^([^：:]+)[：:]\s*(.+)$/);
    return { role: m?.[1]?.trim() ?? "", text: m?.[2]?.trim() ?? line, start_ms: -1, duration_ms: -1 };
  });
}

export default function PodcastPlayer() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [podcast, setPodcast] = useState<PodcastHistoryItem | null>(null);
  const [segments, setSegments] = useState<PodcastSegment[]>([]);
  const [loading, setLoading] = useState(true);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [activeIdx, setActiveIdx] = useState(-1);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scriptRef = useRef<HTMLDivElement | null>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (!id) return;
    fetchPodcast(id)
      .then((p) => {
        setPodcast(p);
        setSegments(parseSegments(p));
      })
      .catch(() => navigate("/history"))
      .finally(() => setLoading(false));
  }, [id]);

  // 初始化音频
  useEffect(() => {
    if (!podcast?.audio_url) return;
    const audio = new Audio(podcast.audio_url);
    audioRef.current = audio;

    audio.onloadedmetadata = () => setDuration(audio.duration);
    audio.ontimeupdate = () => setCurrentTime(audio.currentTime);
    audio.onplay = () => setPlaying(true);
    audio.onpause = () => setPlaying(false);
    audio.onended = () => { setPlaying(false); setCurrentTime(0); };

    // 自动播放
    audio.play().catch(() => {});

    return () => {
      audio.pause();
      audio.src = "";
    };
  }, [podcast]);

  // 根据时间更新高亮行
  useEffect(() => {
    if (segments.length === 0) return;
    const hasTimestamps = segments[0].start_ms >= 0;
    if (!hasTimestamps) {
      // 均等分配
      const pct = duration > 0 ? currentTime / duration : 0;
      const idx = Math.min(Math.floor(pct * segments.length), segments.length - 1);
      setActiveIdx(idx);
      return;
    }
    const ms = currentTime * 1000;
    let idx = -1;
    for (let i = segments.length - 1; i >= 0; i--) {
      if (ms >= segments[i].start_ms) { idx = i; break; }
    }
    setActiveIdx(idx);
  }, [currentTime, duration, segments]);

  // 滚动高亮行到视图中
  useEffect(() => {
    if (activeIdx >= 0) {
      lineRefs.current[activeIdx]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [activeIdx]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) audio.pause(); else audio.play();
  }, [playing]);

  const restart = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.play();
  }, []);

  const seek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Number(e.target.value);
  }, []);

  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60);
    const ss = Math.floor(s % 60);
    return `${m}:${ss.toString().padStart(2, "0")}`;
  };

  // 角色颜色
  const roleColors: Record<string, string> = {};
  const palette = ["text-primary", "text-emerald-400", "text-amber-400", "text-purple-400"];
  segments.forEach((seg) => {
    if (!roleColors[seg.role]) {
      roleColors[seg.role] = palette[Object.keys(roleColors).length % palette.length];
    }
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!podcast) return null;

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto p-6 gap-6">
      {/* Header */}
      <div className="flex items-center gap-3 animate-fade-up">
        <button
          onClick={() => navigate("/history")}
          className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-surface-alt transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-mono text-[10px] text-muted-foreground tracking-widest uppercase">播客</p>
          <h1 className="text-lg font-semibold truncate">{podcast.title}</h1>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Headphones size={14} />
          <span className="font-mono text-xs">{podcast.duration}</span>
        </div>
      </div>

      {/* Script */}
      <div
        ref={scriptRef}
        className="flex-1 overflow-y-auto rounded border border-border bg-card px-5 py-4 space-y-3 animate-fade-up"
        style={{ animationDelay: "60ms", minHeight: 0 }}
      >
        {segments.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">暂无脚本</p>
        ) : (
          segments.map((seg, i) => (
            <div
              key={i}
              ref={(el) => { lineRefs.current[i] = el; }}
              className={`flex gap-3 transition-all duration-300 rounded px-2 py-1.5 ${
                i === activeIdx ? "bg-primary/8" : ""
              }`}
            >
              <span
                className={`font-mono text-[11px] font-medium flex-shrink-0 w-16 text-right mt-0.5 transition-colors duration-300 ${
                  roleColors[seg.role] ?? "text-muted-foreground"
                } ${i !== activeIdx ? "opacity-50" : ""}`}
              >
                {seg.role}
              </span>
              <p
                className={`text-sm leading-relaxed transition-all duration-300 ${
                  i === activeIdx
                    ? "text-foreground font-medium"
                    : "text-muted-foreground"
                }`}
              >
                {seg.text}
              </p>
            </div>
          ))
        )}
      </div>

      {/* Player controls */}
      <div
        className="bg-card border border-border rounded-lg px-5 py-4 animate-fade-up"
        style={{ animationDelay: "120ms" }}
      >
        {/* Progress */}
        <div className="flex items-center gap-3 mb-3">
          <span className="font-mono text-[11px] text-muted-foreground w-10 text-right">
            {fmtTime(currentTime)}
          </span>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={currentTime}
            onChange={seek}
            className="flex-1 h-1 appearance-none bg-border rounded-full cursor-pointer accent-primary"
          />
          <span className="font-mono text-[11px] text-muted-foreground w-10">
            {fmtTime(duration)}
          </span>
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-center gap-4">
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
    </div>
  );
}
