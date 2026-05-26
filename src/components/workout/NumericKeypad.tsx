import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ChevronRight, Delete, Check, Target, ArrowLeft } from "lucide-react";
import { hapticTap, hapticTick, hapticWarn } from "@/utils/haptics";

interface NumericKeypadProps {
  open: boolean;
  mode: "weight" | "reps";
  value: string;
  label: string;
  previous?: string | null;
  unit?: string;
  currentRPE?: number;
  onChange: (next: string) => void;
  onClose: () => void;
  onNext?: () => void;
  onLog?: () => void;
  onSelectRPE?: (rpe: number | undefined) => void;
  canLog?: boolean;
}

const RPE_VALUES = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];

/**
 * Compact Strong-style numeric keypad. Renders as a fixed bottom sheet that
 * REPLACES the native mobile keyboard for set logging.
 */
const NumericKeypad = ({
  open,
  mode,
  value,
  label,
  previous,
  unit,
  currentRPE,
  onChange,
  onClose,
  onNext,
  onLog,
  onSelectRPE,
  canLog,
}: NumericKeypadProps) => {
  const freshRef = useRef(true);
  const [showRPE, setShowRPE] = useState(false);

  useEffect(() => {
    if (open) {
      freshRef.current = true;
      setShowRPE(false);
    }
  }, [open, label]);

  if (!open) return null;

  const allowDecimal = mode === "weight";
  const step = mode === "weight" ? 2.5 : 1;

  const pressDigit = (d: string) => {
    hapticTap();
    let next: string;
    if (freshRef.current) { next = d; freshRef.current = false; }
    else { next = (value || "") + d; }
    if (next.length > 1 && next.startsWith("0") && !next.startsWith("0.")) {
      next = next.replace(/^0+/, "") || "0";
    }
    if (next.replace(".", "").length > 6) { hapticWarn(); return; }
    onChange(next);
  };

  const pressDecimal = () => {
    if (!allowDecimal) return;
    hapticTap();
    if (freshRef.current) { onChange("0."); freshRef.current = false; return; }
    if (!value) { onChange("0."); return; }
    if (value.includes(".")) { hapticWarn(); return; }
    onChange(value + ".");
  };

  const pressBackspace = () => {
    hapticTick();
    if (freshRef.current || !value) { onChange(""); freshRef.current = false; return; }
    onChange(value.slice(0, -1));
  };

  const adjust = (delta: number) => {
    hapticTick();
    const current = parseFloat(value || "0") || 0;
    const next = Math.max(0, current + delta);
    const rounded = mode === "reps" ? Math.round(next) : Math.round(next * 2) / 2;
    onChange(String(rounded));
    freshRef.current = false;
  };

  const handleLog = () => {
    if (!canLog) { hapticWarn(); return; }
    onLog?.();
  };

  // Compact key styles — tuned to match Strong's compact footprint
  const keyCls =
    "h-10 rounded-lg bg-secondary/60 hover:bg-secondary active:bg-secondary/90 text-lg font-semibold tabular-nums transition-colors select-none touch-manipulation";

  return createPortal(
    <>
      <div className="fixed inset-0 z-[85] bg-transparent" onClick={onClose} />
      <div
        className={cn(
          "fixed bottom-0 left-0 right-0 z-[90] bg-background border-t border-border",
          "pb-[max(env(safe-area-inset-bottom),0.25rem)] pt-1.5 px-2",
          "shadow-[0_-12px_40px_-8px_hsl(0_0%_0%/0.5)]",
          "animate-in slide-in-from-bottom-4 duration-150",
        )}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-1.5 pb-1.5">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] text-muted-foreground truncate leading-tight">{label}</p>
            <p className="text-base font-bold tabular-nums leading-tight">
              {value || <span className="text-muted-foreground/40">0</span>}
              {unit && <span className="text-[10px] text-muted-foreground ml-1">{unit}</span>}
              {previous && (
                <span className="text-[10px] text-muted-foreground ml-2 font-normal">Prev: {previous}</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            {onSelectRPE && !showRPE && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px]"
                onClick={() => { hapticTick(); setShowRPE(true); }}
              >
                <Target className="h-3 w-3 mr-1" />
                {currentRPE != null ? `@${currentRPE}` : "RPE"}
              </Button>
            )}
            <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>

        {showRPE ? (
          <div className="px-1 pb-1">
            <div className="flex items-center justify-between pb-1.5">
              <button
                onClick={() => setShowRPE(false)}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-3 w-3" /> Back
              </button>
              <p className="text-[11px] font-semibold text-muted-foreground">Rate of Perceived Exertion</p>
              {currentRPE != null ? (
                <button
                  onClick={() => { hapticTick(); onSelectRPE?.(undefined); setShowRPE(false); }}
                  className="text-[11px] text-muted-foreground hover:text-foreground"
                >Clear</button>
              ) : <span className="w-8" />}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {RPE_VALUES.map(rpe => (
                <button
                  key={rpe}
                  onClick={() => { hapticTap(); onSelectRPE?.(rpe); setShowRPE(false); }}
                  className={cn(
                    "h-10 rounded-lg text-sm font-semibold tabular-nums transition-colors",
                    currentRPE === rpe
                      ? "bg-primary/20 text-primary border border-primary/40"
                      : "bg-secondary/60 hover:bg-secondary",
                  )}
                >
                  @{rpe}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-1.5 pt-1.5">
              <Button variant="secondary" className="h-9 text-sm" onClick={() => setShowRPE(false)}>
                Back to keypad
              </Button>
              <Button className="h-9 text-sm" onClick={handleLog} disabled={!canLog}>
                <Check className="h-4 w-4 mr-1" /> Log Set
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Quick adjusters */}
            <div className="grid grid-cols-4 gap-1 px-0.5 pb-1">
              <button onClick={() => adjust(-step * 2)} className="h-7 rounded-md bg-secondary/40 text-[11px] font-medium hover:bg-secondary">−{step * 2}</button>
              <button onClick={() => adjust(-step)} className="h-7 rounded-md bg-secondary/40 text-[11px] font-medium hover:bg-secondary">−{step}</button>
              <button onClick={() => adjust(step)} className="h-7 rounded-md bg-secondary/40 text-[11px] font-medium hover:bg-secondary">+{step}</button>
              <button onClick={() => adjust(step * 2)} className="h-7 rounded-md bg-secondary/40 text-[11px] font-medium hover:bg-secondary">+{step * 2}</button>
            </div>

            {/* Number grid */}
            <div className="grid grid-cols-3 gap-1 px-0.5">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(d => (
                <button key={d} className={keyCls} onClick={() => pressDigit(d)}>{d}</button>
              ))}
              <button
                className={cn(keyCls, "text-base", !allowDecimal && "opacity-30 pointer-events-none")}
                onClick={pressDecimal}
                disabled={!allowDecimal}
              >.</button>
              <button className={keyCls} onClick={() => pressDigit("0")}>0</button>
              <button className={cn(keyCls, "flex items-center justify-center")} onClick={pressBackspace}>
                <Delete className="h-5 w-5" />
              </button>
            </div>

            {/* Action row */}
            <div className="grid grid-cols-2 gap-1 px-0.5 pt-1">
              <Button
                variant="secondary"
                className="h-9 text-sm font-semibold"
                onClick={() => { hapticTick(); onNext?.(); }}
                disabled={!onNext}
              >
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
              <Button className="h-9 text-sm font-semibold" onClick={handleLog} disabled={!canLog}>
                <Check className="h-4 w-4 mr-1" /> Log Set
              </Button>
            </div>
          </>
        )}
      </div>
    </>,
    document.body,
  );
};

export default NumericKeypad;
