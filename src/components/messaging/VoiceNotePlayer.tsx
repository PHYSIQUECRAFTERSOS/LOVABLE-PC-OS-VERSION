import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface VoiceNotePlayerProps {
  url: string;
  isOwn: boolean;
}

const BAR_COUNT = 44;

// Cache decoded peaks across re-renders so each note decodes once per session.
const peakCache = new Map<string, number[]>();
const inflight = new Map<string, Promise<number[]>>();

async function decodePeaks(url: string): Promise<number[]> {
  if (peakCache.has(url)) return peakCache.get(url)!;
  if (inflight.has(url)) return inflight.get(url)!;

  const run = (async () => {
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    const AC: typeof AudioContext =
      (window.AudioContext as typeof AudioContext) ||
      ((window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    const ctx = new AC();
    try {
      const audioBuf = await ctx.decodeAudioData(buf.slice(0));
      const channel = audioBuf.getChannelData(0);
      const block = Math.max(1, Math.floor(channel.length / BAR_COUNT));
      const peaks: number[] = [];
      for (let i = 0; i < BAR_COUNT; i++) {
        let sum = 0;
        const start = i * block;
        const end = Math.min(channel.length, start + block);
        for (let j = start; j < end; j++) sum += Math.abs(channel[j]);
        peaks.push(sum / (end - start));
      }
      const max = Math.max(...peaks, 0.0001);
      const normalized = peaks.map(p => Math.max(0.08, p / max));
      peakCache.set(url, normalized);
      return normalized;
    } finally {
      try { await ctx.close(); } catch { /* ignore */ }
    }
  })();

  inflight.set(url, run);
  try {
    return await run;
  } finally {
    inflight.delete(url);
  }
}

const formatTime = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

const VoiceNotePlayer = ({ url, isOwn }: VoiceNotePlayerProps) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const barsRef = useRef<HTMLDivElement>(null);
  const [peaks, setPeaks] = useState<number[] | null>(peakCache.get(url) ?? null);
  const [peaksFailed, setPeaksFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);

  // Decode peaks lazily
  useEffect(() => {
    let cancelled = false;
    if (peaks) return;
    decodePeaks(url)
      .then(p => { if (!cancelled) setPeaks(p); })
      .catch(() => { if (!cancelled) setPeaksFailed(true); });
    return () => { cancelled = true; };
  }, [url, peaks]);

  // Audio events
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => {
      setCurrent(a.currentTime);
      if (a.duration && isFinite(a.duration)) setProgress(a.currentTime / a.duration);
    };
    const onMeta = () => { if (isFinite(a.duration)) setDuration(a.duration); };
    const onEnd = () => { setPlaying(false); setProgress(0); setCurrent(0); a.currentTime = 0; };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("durationchange", onMeta);
    a.addEventListener("ended", onEnd);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("durationchange", onMeta);
      a.removeEventListener("ended", onEnd);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
    };
  }, []);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => { /* ignore autoplay errors */ });
    else a.pause();
  };

  const seekFromEvent = (clientX: number) => {
    const a = audioRef.current;
    const bars = barsRef.current;
    if (!a || !bars || !a.duration || !isFinite(a.duration)) return;
    const rect = bars.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    a.currentTime = ratio * a.duration;
    setProgress(ratio);
  };

  const displayBars = useMemo(() => {
    if (peaks) return peaks;
    if (peaksFailed) return Array.from({ length: BAR_COUNT }, () => 0.45);
    return null;
  }, [peaks, peaksFailed]);

  return (
    <div
      className={cn(
        "flex items-center gap-3 min-w-[220px] max-w-[300px] py-1 pr-1",
        isOwn ? "text-primary-foreground" : "text-foreground"
      )}
    >
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause voice note" : "Play voice note"}
        className={cn(
          "shrink-0 h-10 w-10 rounded-full flex items-center justify-center transition-transform active:scale-95",
          isOwn
            ? "bg-primary-foreground/20 hover:bg-primary-foreground/30 text-primary-foreground"
            : "bg-primary text-primary-foreground hover:bg-primary/90"
        )}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
      </button>

      <div
        ref={barsRef}
        className="flex-1 h-10 flex items-center gap-[2px] cursor-pointer select-none"
        onClick={(e) => seekFromEvent(e.clientX)}
        onTouchStart={(e) => { if (e.touches[0]) seekFromEvent(e.touches[0].clientX); }}
      >
        {displayBars ? (
          displayBars.map((p, i) => {
            const filled = i / BAR_COUNT <= progress;
            return (
              <div
                key={i}
                className={cn(
                  "w-[3px] rounded-full transition-colors duration-150",
                  filled
                    ? (isOwn ? "bg-primary-foreground" : "bg-primary")
                    : (isOwn ? "bg-primary-foreground/30" : "bg-primary/25")
                )}
                style={{ height: `${Math.round(p * 100)}%` }}
              />
            );
          })
        ) : (
          <div className="flex items-center gap-1 text-xs opacity-70">
            <Loader2 className="h-3 w-3 animate-spin" /> loading…
          </div>
        )}
      </div>

      <span className={cn("text-[11px] tabular-nums shrink-0 opacity-80", isOwn ? "text-primary-foreground" : "text-foreground")}>
        {formatTime(playing || current > 0 ? current : duration)}
      </span>

      {/* Hidden native audio element for actual playback */}
      <audio ref={audioRef} src={url} preload="metadata" className="hidden" />
    </div>
  );
};

export default VoiceNotePlayer;
