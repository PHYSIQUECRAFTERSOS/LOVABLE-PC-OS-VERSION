import { useState, useEffect, useRef, useCallback } from "react";
import { SkipForward } from "lucide-react";
import { restTimerAudio } from "@/services/RestTimerAudioService";
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
  const countdownFiredRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    setTimeRemaining(initialSeconds);
    completedRef.current = false;
    countdownFiredRef.current = false;

    const endTime = Date.now() + initialSeconds * 1000;
    const worker = createTimerWorker();
    workerRef.current = worker;

    worker.onmessage = (e) => {
      const msg = e.data;

      if (msg.type === "tick") {
        setTimeRemaining(msg.remaining);

        // Trigger countdown audio at <= 3 seconds remaining
        if (msg.remainingMs <= 3000 && msg.remainingMs > 0 && !countdownFiredRef.current) {
          countdownFiredRef.current = true;
          restTimerAudio.playCountdown();
        }
      }

      if (msg.type === "done" && !completedRef.current) {
        completedRef.current = true;
        setTimeRemaining(0);
        // Fire countdown if it never fired (e.g., timer was < 3s)
        if (!countdownFiredRef.current) {
          countdownFiredRef.current = true;
          restTimerAudio.playCountdown();
        }
        setTimeout(() => onCompleteRef.current(), 800);
      }
    };

    worker.postMessage({ type: "start", endTime });

    // Start keepalive to prevent iOS from suspending AudioContext
    restTimerAudio.startKeepAlive();

    // Visibility change handler — recalculate on return
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        // Resume AudioContext
        restTimerAudio.unlock();
        // Worker is still running, but force a re-check
        const remainingMs = Math.max(0, endTime - Date.now());
        if (remainingMs <= 3000 && remainingMs > 0 && !countdownFiredRef.current) {
          countdownFiredRef.current = true;
          restTimerAudio.playCountdown();
        }
        if (remainingMs <= 0 && !completedRef.current) {
          completedRef.current = true;
          setTimeRemaining(0);
          worker.postMessage({ type: "stop" });
          setTimeout(() => onCompleteRef.current(), 800);
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
    restTimerAudio.stopCountdown();
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
