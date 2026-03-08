import { useState, useEffect, useRef, useCallback } from "react";
import { SkipForward } from "lucide-react";

interface InlineRestTimerProps {
  seconds: number;
  onComplete: () => void;
  onSkip: () => void;
}

const InlineRestTimer = ({ seconds: initialSeconds, onComplete, onSkip }: InlineRestTimerProps) => {
  const [timeRemaining, setTimeRemaining] = useState(initialSeconds);
  const endTimeRef = useRef(Date.now() + initialSeconds * 1000);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const completedRef = useRef(false);
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
    endTimeRef.current = Date.now() + initialSeconds * 1000;
    completedRef.current = false;

    intervalRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000));
      setTimeRemaining(remaining);

      if (remaining <= 0 && !completedRef.current) {
        completedRef.current = true;
        if (intervalRef.current) clearInterval(intervalRef.current);
        playSound();
        // Brief flash then auto-remove
        setTimeout(onComplete, 800);
      }
    }, 500);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [initialSeconds, playSound, onComplete]);

  useEffect(() => {
    return () => { audioRef.current?.close(); };
  }, []);

  const handleSkip = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    onSkip();
  }, [onSkip]);

  const mins = Math.floor(timeRemaining / 60);
  const secs = timeRemaining % 60;
  const progress = initialSeconds > 0 ? ((initialSeconds - timeRemaining) / initialSeconds) * 100 : 100;
  const isComplete = timeRemaining <= 0;

  return (
    <div className={`relative w-full h-11 rounded-lg border-l-4 border-l-primary flex items-center px-3 transition-colors ${
      isComplete ? "bg-foreground/10" : "bg-primary/15"
    }`}>
      {/* Top progress line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-primary/20 rounded-t-lg overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-500 ease-linear"
          style={{ width: `${100 - progress}%` }}
        />
      </div>

      {/* Timer display */}
      <div className="flex items-center gap-2 flex-1">
        <span className="text-sm">⏱</span>
        <span className="text-sm font-bold tabular-nums text-foreground">
          {isComplete ? "Ready!" : `${mins}:${secs.toString().padStart(2, "0")}`}
        </span>
      </div>

      {/* Skip button */}
      <button
        onClick={handleSkip}
        className="h-7 px-2.5 rounded-full bg-background/80 border border-border text-xs font-medium flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
      >
        <SkipForward className="h-3 w-3" />
      </button>
    </div>
  );
};

export default InlineRestTimer;
