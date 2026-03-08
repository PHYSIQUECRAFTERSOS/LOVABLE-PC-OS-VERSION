import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { SkipForward } from "lucide-react";

interface FloatingRestTimerProps {
  seconds: number;
  onComplete: () => void;
}

const FloatingRestTimer = ({ seconds: initialSeconds, onComplete }: FloatingRestTimerProps) => {
  const [timeRemaining, setTimeRemaining] = useState(initialSeconds);
  const [showComplete, setShowComplete] = useState(false);
  const endTimeRef = useRef(Date.now() + initialSeconds * 1000);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const completedRef = useRef(false);

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

  // Date-based countdown — resilient to backgrounding on iOS
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
        setShowComplete(true);
      }
    }, 500);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [initialSeconds, playSound]);

  // Auto-dismiss after completion flash
  useEffect(() => {
    if (!showComplete) return;
    const t = setTimeout(onComplete, 1500);
    return () => clearTimeout(t);
  }, [showComplete, onComplete]);

  // Cleanup audio
  useEffect(() => {
    return () => { audioRef.current?.close(); };
  }, []);

  const handleSkip = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    onComplete();
  }, [onComplete]);

  const mins = Math.floor(timeRemaining / 60);
  const secs = timeRemaining % 60;
  const progress = initialSeconds > 0 ? ((initialSeconds - timeRemaining) / initialSeconds) * 100 : 100;

  return (
    <div className={`fixed bottom-20 left-4 right-4 z-30 rounded-xl border p-3 backdrop-blur-md transition-all ${
      showComplete ? "bg-primary/20 border-primary" : "bg-card/95 border-border"
    }`}>
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Rest Timer</span>
            <span className={`text-lg font-bold tabular-nums ${showComplete ? "text-primary" : "text-foreground"}`}>
              {showComplete ? "Rest complete! ✓" : `${mins}:${secs.toString().padStart(2, "0")}`}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500 ease-linear"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
        </div>
        <Button variant="outline" size="sm" className="h-9" onClick={handleSkip}>
          <SkipForward className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default FloatingRestTimer;
