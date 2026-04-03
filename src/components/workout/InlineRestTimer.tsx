import { useState, useEffect, useRef, useCallback } from "react";
import { SkipForward, Check } from "lucide-react";
import { createTimerWorker } from "@/services/timerWorker";

interface InlineRestTimerProps {
  seconds: number;
  onComplete: () => void;
  onSkip: () => void;
}

const InlineRestTimer = ({ seconds: initialSeconds, onComplete, onSkip }: InlineRestTimerProps) => {
  const [timeRemaining, setTimeRemaining] = useState(initialSeconds);
  const workerRef = useRef<Worker | null>(null);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    setTimeRemaining(initialSeconds);
    completedRef.current = false;

    const endTime = Date.now() + initialSeconds * 1000;
    const worker = createTimerWorker();
    workerRef.current = worker;

    const handleDone = () => {
      if (completedRef.current) return;
      completedRef.current = true;
      setTimeRemaining(0);
      // Haptic feedback
      if ("vibrate" in navigator) {
        navigator.vibrate([200, 100, 200]);
      }
      setTimeout(() => onCompleteRef.current(), 800);
    };

    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === "tick") {
        setTimeRemaining(msg.remaining);
      }
      if (msg.type === "done") {
        handleDone();
      }
    };

    worker.postMessage({ type: "start", endTime });

    // Visibility change handler — recalculate on return
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        const remainingMs = Math.max(0, endTime - Date.now());
        if (remainingMs <= 0) {
          worker.postMessage({ type: "stop" });
          handleDone();
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      worker.postMessage({ type: "stop" });
      worker.terminate();
      workerRef.current = null;
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [initialSeconds]);

  const handleSkip = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: "stop" });
      workerRef.current.terminate();
      workerRef.current = null;
    }
    onSkip();
  }, [onSkip]);

  const mins = Math.floor(timeRemaining / 60);
  const secs = timeRemaining % 60;
  const progress = initialSeconds > 0 ? ((initialSeconds - timeRemaining) / initialSeconds) * 100 : 100;
  const isComplete = timeRemaining <= 0;

  return (
    <div className={`relative w-full h-11 rounded-lg border-l-4 flex items-center px-3 transition-colors ${
      isComplete ? "border-l-primary bg-primary/20 animate-pulse" : "border-l-primary bg-primary/15"
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
        {isComplete ? (
          <Check className="h-4 w-4 text-primary" />
        ) : (
          <span className="text-sm">⏱</span>
        )}
        <span className={`text-sm font-bold tabular-nums ${isComplete ? "text-primary" : "text-foreground"}`}>
          {isComplete ? "Next set ready! 💪" : `${mins}:${secs.toString().padStart(2, "0")}`}
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
