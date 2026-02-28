import { Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LoadPhase } from "@/hooks/useTimedLoader";

interface TimedLoaderProps {
  phase: LoadPhase;
  onRetry?: () => void;
  /** Message shown during slow phase */
  slowMessage?: string;
  /** Message shown on failure */
  failMessage?: string;
  className?: string;
}

/**
 * Standardized loading UI that enforces the No-Spinner Policy.
 * 
 * - loading: spinner (max 3s)
 * - slow: "Still working..." with spinner
 * - failed: error + retry button
 */
export function TimedLoader({
  phase,
  onRetry,
  slowMessage = "Still working...",
  failMessage = "This is taking too long. Please try again.",
  className = "",
}: TimedLoaderProps) {
  if (phase === "idle") return null;

  return (
    <div className={`flex flex-col items-center justify-center gap-3 py-8 ${className}`}>
      {phase === "loading" && (
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      )}

      {phase === "slow" && (
        <>
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{slowMessage}</p>
        </>
      )}

      {phase === "failed" && (
        <>
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <p className="text-sm text-muted-foreground">{failMessage}</p>
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry} className="gap-2">
              <RefreshCw className="h-4 w-4" /> Retry
            </Button>
          )}
        </>
      )}
    </div>
  );
}
