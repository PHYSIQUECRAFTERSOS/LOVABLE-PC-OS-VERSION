import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { SkipForward, Check } from "lucide-react";
import { createTimerWorker } from "@/services/timerWorker";

interface FloatingRestTimerProps {
  seconds: number;
  onComplete: () => void;
}

const FloatingRestTimer = ({ seconds: initialSeconds, onComplete }: FloatingRestTimerProps) => {
  const [timeRemaining, setTimeRemaining] = useState(initialSeconds);
  const [showComplete, setShowComplete] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const completedRef = useRef(false);

  useEffect(() => {
    setTimeRemaining(initialSeconds);
    setShowComplete(false);
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
      setShowComplete(true);
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

  // Auto-dismiss after completion flash
  useEffect(() => {
    if (!showComplete) return;
    const t = setTimeout(onComplete, 1500);
    return () => clearTimeout(t);
  }, [showComplete, onComplete]);

  const handleSkip = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: "stop" });
      workerRef.current.terminate();
      workerRef.current = null;
    }
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
              {showComplete ? (
                <span className="flex items-center gap-1.5">
                  <Check className="h-5 w-5" /> Next set ready!
                </span>
              ) : `${mins}:${secs.toString().padStart(2, "0")}`}
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
