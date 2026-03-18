import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, RotateCcw, SkipForward, Plus, Minus } from "lucide-react";
import { playCountdownSound, stopCountdownSound } from "@/utils/restTimerAudio";

interface RestTimerProps {
  initialSeconds: number;
  onComplete?: () => void;
}

const RestTimer = ({ initialSeconds, onComplete }: RestTimerProps) => {
  const [seconds, setSeconds] = useState(initialSeconds);
  const [isActive, setIsActive] = useState(true);
  const [totalSeconds, setTotalSeconds] = useState(initialSeconds);
  const countdownFiredRef = useRef(false);

  useEffect(() => {
    countdownFiredRef.current = false;
  }, [totalSeconds]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (isActive && seconds > 0) {
      interval = setInterval(() => {
        setSeconds((s) => {
          const next = s - 1;
          // Play countdown at 3 seconds remaining
          if (next <= 3 && next > 0 && !countdownFiredRef.current) {
            countdownFiredRef.current = true;
            playCountdownSound();
          }
          if (next <= 0) {
            setIsActive(false);
            return 0;
          }
          return next;
        });
      }, 1000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [isActive, seconds]);

  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const isComplete = seconds === 0;
  const progress = totalSeconds > 0 ? ((totalSeconds - seconds) / totalSeconds) * 100 : 100;

  // SVG ring dimensions
  const size = 120;
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (progress / 100) * circumference;

  return (
    <div className={`rounded-xl p-4 border transition-colors ${isComplete ? "border-primary bg-primary/10" : "border-border bg-card"}`}>
      <div className="flex items-center gap-4">
        {/* Circular countdown ring */}
        <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="transform -rotate-90">
            <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth={stroke} />
            <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="hsl(var(--primary))" strokeWidth={stroke} strokeDasharray={circumference} strokeDashoffset={dashOffset} strokeLinecap="round" className="transition-all duration-1000 ease-linear" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-display font-bold text-foreground tabular-nums">
              {minutes}:{secs.toString().padStart(2, "0")}
            </span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Rest</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex-1 space-y-3">
          {isComplete && (
            <div className="p-2 rounded-lg bg-primary/20 text-center text-sm font-medium text-primary">
              Ready for next set! 💪
            </div>
          )}

          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" className="flex-1 h-9" onClick={() => setIsActive(!isActive)} disabled={isComplete}>
              {isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <Button variant="outline" size="sm" className="h-9" onClick={() => { countdownFiredRef.current = false; setSeconds(totalSeconds); setIsActive(true); }}>
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-9" onClick={() => { setSeconds(0); setIsActive(false); stopCountdownSound(); onComplete?.(); }}>
              <SkipForward className="h-4 w-4" />
            </Button>
          </div>

          {/* Adjust time */}
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => { const newTotal = Math.max(15, totalSeconds - 15); setTotalSeconds(newTotal); setSeconds(s => Math.min(s, newTotal)); }}>
              <Minus className="h-3 w-3 mr-0.5" /> 15s
            </Button>
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => { const newTotal = totalSeconds + 15; setTotalSeconds(newTotal); setSeconds(s => s + 15); }}>
              <Plus className="h-3 w-3 mr-0.5" /> 15s
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RestTimer;
