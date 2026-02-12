import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Play, Pause, RotateCcw } from "lucide-react";

interface RestTimerProps {
  initialSeconds: number;
  onComplete?: () => void;
}

const RestTimer = ({ initialSeconds, onComplete }: RestTimerProps) => {
  const [seconds, setSeconds] = useState(initialSeconds);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (isActive && seconds > 0) {
      interval = setInterval(() => {
        setSeconds((s) => {
          if (s <= 1) {
            setIsActive(false);
            onComplete?.();
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isActive, seconds, onComplete]);

  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const isComplete = seconds === 0;

  return (
    <Card className={isComplete ? "border-primary/50 glow-gold" : ""}>
      <CardHeader>
        <CardTitle className="text-center">Rest Time</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-6xl font-display font-bold text-center text-primary">
          {minutes.toString().padStart(2, "0")}:{secs.toString().padStart(2, "0")}
        </div>
        {isComplete && (
          <div className="p-3 rounded bg-primary/20 text-center text-sm font-medium text-primary">
            Ready for next set! 💪
          </div>
        )}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsActive(!isActive)}
            className="flex-1"
          >
            {isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSeconds(initialSeconds);
              setIsActive(false);
            }}
            className="flex-1"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default RestTimer;
