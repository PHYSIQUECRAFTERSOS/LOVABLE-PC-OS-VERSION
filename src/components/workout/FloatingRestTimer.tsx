import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { SkipForward } from "lucide-react";
import { scheduleCountdownSoundForDuration, stopCountdownSound } from "@/utils/restTimerAudio";

interface FloatingRestTimerProps {
  seconds: number;
  onComplete: () => void;
}

const FloatingRestTimer = ({ seconds: initialSeconds, onComplete }: FloatingRestTimerProps) => {
  const [timeRemaining, setTimeRemaining] = useState(initialSeconds);
  const [showComplete, setShowComplete] = useState(false);
  const endTimeRef = useRef(Date.now() + initialSeconds * 1000);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const completedRef = useRef(false);

  useEffect(() => {
    setTimeRemaining(initialSeconds);
    setShowComplete(false);
    endTimeRef.current = Date.now() + initialSeconds * 1000;
    completedRef.current = false;
    if (initialSeconds > 0) {
      void scheduleCountdownSoundForDuration(initialSeconds);
    }

    intervalRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000));
      setTimeRemaining(remaining);

      if (remaining <= 0 && !completedRef.current) {
        completedRef.current = true;
        stopCountdownSound();
        if (intervalRef.current) clearInterval(intervalRef.current);
        setShowComplete(true);
      }
    }, 500);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      stopCountdownSound();
    };
  }, [initialSeconds]);

  // Auto-dismiss after completion flash
  useEffect(() => {
    if (!showComplete) return;
    const t = setTimeout(onComplete, 1500);
    return () => clearTimeout(t);
  }, [showComplete, onComplete]);

  const handleSkip = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    stopCountdownSound();
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
