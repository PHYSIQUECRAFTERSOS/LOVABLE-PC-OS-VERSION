import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { SkipForward } from "lucide-react";

interface FloatingRestTimerProps {
  seconds: number;
  onComplete: () => void;
}

const FloatingRestTimer = ({ seconds: initialSeconds, onComplete }: FloatingRestTimerProps) => {
  const [seconds, setSeconds] = useState(initialSeconds);
  const [pulsing, setPulsing] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);

  const playSound = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioRef.current = ctx;
      const playTone = (freq: number, start: number, dur: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = "sine";
        gain.gain.setValueAtTime(0.3, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + start + dur);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + dur);
      };
      playTone(880, 0, 0.2);
      playTone(1100, 0.15, 0.2);
      playTone(1320, 0.3, 0.3);
    } catch { /* Audio not available */ }
  }, []);

  useEffect(() => {
    if (seconds <= 0) {
      setPulsing(true);
      playSound();
      const t = setTimeout(onComplete, 3000);
      return () => clearTimeout(t);
    }
    const interval = setInterval(() => setSeconds(s => s - 1), 1000);
    return () => clearInterval(interval);
  }, [seconds, onComplete, playSound]);

  useEffect(() => {
    return () => { audioRef.current?.close(); };
  }, []);

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const progress = initialSeconds > 0 ? ((initialSeconds - seconds) / initialSeconds) * 100 : 100;

  return (
    <div className={`fixed bottom-20 left-4 right-4 z-30 rounded-xl border p-3 backdrop-blur-md transition-all ${
      pulsing ? "bg-primary/20 border-primary animate-pulse" : "bg-card/95 border-border"
    }`}>
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Rest Timer</span>
            <span className="text-lg font-bold tabular-nums text-foreground">
              {pulsing ? "GO!" : `${mins}:${secs.toString().padStart(2, "0")}`}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-1000 ease-linear"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
        </div>
        <Button variant="outline" size="sm" className="h-9" onClick={onComplete}>
          <SkipForward className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default FloatingRestTimer;
