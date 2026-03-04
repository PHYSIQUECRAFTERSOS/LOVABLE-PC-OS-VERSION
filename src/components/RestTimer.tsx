import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, RotateCcw, SkipForward, Plus, Minus } from "lucide-react";

interface RestTimerProps {
  initialSeconds: number;
  onComplete?: () => void;
}

const RestTimer = ({ initialSeconds, onComplete }: RestTimerProps) => {
  const [seconds, setSeconds] = useState(initialSeconds);
  const [isActive, setIsActive] = useState(true);
  const [totalSeconds, setTotalSeconds] = useState(initialSeconds);
  const audioRef = useRef<AudioContext | null>(null);

  const playSound = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioRef.current = ctx;
      // Play a pleasant two-tone chime
      const playTone = (freq: number, start: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = "sine";
        gain.gain.setValueAtTime(0.3, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + start + duration);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + duration);
      };
      playTone(880, 0, 0.2);
      playTone(1100, 0.15, 0.2);
      playTone(1320, 0.3, 0.3);
    } catch {
      // Audio not available
    }
  }, []);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (isActive && seconds > 0) {
      interval = setInterval(() => {
        setSeconds((s) => {
          if (s <= 1) {
            setIsActive(false);
            playSound();
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [isActive, seconds, playSound]);

  useEffect(() => {
    return () => { audioRef.current?.close(); };
  }, []);

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
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="hsl(var(--muted))"
              strokeWidth={stroke}
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth={stroke}
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              className="transition-all duration-1000 ease-linear"
            />
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
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-9"
              onClick={() => setIsActive(!isActive)}
              disabled={isComplete}
            >
              {isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => {
                setSeconds(totalSeconds);
                setIsActive(true);
              }}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => {
                setSeconds(0);
                setIsActive(false);
                onComplete?.();
              }}
            >
              <SkipForward className="h-4 w-4" />
            </Button>
          </div>

          {/* Adjust time */}
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => {
                const newTotal = Math.max(15, totalSeconds - 15);
                setTotalSeconds(newTotal);
                setSeconds(s => Math.min(s, newTotal));
              }}
            >
              <Minus className="h-3 w-3 mr-0.5" /> 15s
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => {
                const newTotal = totalSeconds + 15;
                setTotalSeconds(newTotal);
                setSeconds(s => s + 15);
              }}
            >
              <Plus className="h-3 w-3 mr-0.5" /> 15s
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RestTimer;
