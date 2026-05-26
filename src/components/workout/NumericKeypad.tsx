import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ChevronRight, Delete, Check, Target } from "lucide-react";
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
  onOpenRPE?: () => void;
  canLog?: boolean;
}

/**
 * Strong-style custom numeric keypad. Renders as a fixed bottom sheet that
 * REPLACES the native mobile keyboard for set logging. Behavior:
 *  - Tapping a digit appends; first tap after open replaces (select-on-focus parity)
 *  - Decimal only available in weight mode and only one allowed
 *  - +/- adjusters add or subtract step (weight: ±2.5, reps: ±1)
 *  - Next → advance focus; Log → commit set
 *  - All taps are haptic
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
  onOpenRPE,
  canLog,
}: NumericKeypadProps) => {
  const freshRef = useRef(true);

  // Reset "fresh" each time the keypad opens for a new field.
  useEffect(() => {
    if (open) freshRef.current = true;
  }, [open, label]);

  if (!open) return null;

  const allowDecimal = mode === "weight";
  const step = mode === "weight" ? 2.5 : 1;

  const pressDigit = (d: string) => {
    hapticTap();
    let next: string;
    if (freshRef.current) {
      next = d;
      freshRef.current = false;
    } else {
      next = (value || "") + d;
    }
    // Strip leading zeros (but allow "0." and just "0")
    if (next.length > 1 && next.startsWith("0") && !next.startsWith("0.")) {
      next = next.replace(/^0+/, "") || "0";
    }
    // Limit length
    if (next.replace(".", "").length > 6) {
      hapticWarn();
      return;
    }
    onChange(next);
  };

  const pressDecimal = () => {
    if (!allowDecimal) return;
    hapticTap();
    if (freshRef.current) {
      onChange("0.");
      freshRef.current = false;
      return;
    }
    if (!value) {
      onChange("0.");
      return;
    }
    if (value.includes(".")) {
      hapticWarn();
      return;
    }
    onChange(value + ".");
  };

  const pressBackspace = () => {
    hapticTick();
    if (freshRef.current || !value) {
      onChange("");
      freshRef.current = false;
      return;
    }
    onChange(value.slice(0, -1));
  };

  const adjust = (delta: number) => {
    hapticTick();
    const current = parseFloat(value || "0") || 0;
    const next = Math.max(0, current + delta);
    // For reps, integer; for weight, allow .5 precision
    const rounded = mode === "reps" ? Math.round(next) : Math.round(next * 2) / 2;
    onChange(String(rounded));
    freshRef.current = false;
  };

  const handleNext = () => {
    hapticTick();
    onNext?.();
  };

  const handleLog = () => {
    if (!canLog) {
      hapticWarn();
      return;
    }
    onLog?.();
  };

  const keyCls =
    "h-14 rounded-xl bg-secondary/60 hover:bg-secondary active:bg-secondary/90 text-2xl font-semibold tabular-nums transition-colors select-none touch-manipulation";

  return createPortal(
    <>
      {/* Tap-outside scrim — closes keypad without committing */}
      <div
        className="fixed inset-0 z-[85] bg-transparent"
        onClick={onClose}
      />
      <div
        className={cn(
          "fixed bottom-0 left-0 right-0 z-[90] bg-background border-t border-border",
          "pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 px-2",
          "shadow-[0_-12px_40px_-8px_hsl(0_0%_0%/0.5)]",
          "animate-in slide-in-from-bottom-4 duration-150",
        )}
        // Prevent scrim click bubbling
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-2 pb-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground truncate">{label}</p>
            <p className="text-lg font-bold tabular-nums leading-tight">
              {value || <span className="text-muted-foreground/40">0</span>}
              {unit && <span className="text-xs text-muted-foreground ml-1.5">{unit}</span>}
            </p>
            {previous && (
              <p className="text-[10px] text-muted-foreground mt-0.5">Prev: {previous}</p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {onOpenRPE && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-2 text-xs"
                onClick={() => { hapticTick(); onOpenRPE(); }}
              >
                <Target className="h-3.5 w-3.5 mr-1" />
                {currentRPE != null ? `@${currentRPE}` : "RPE"}
              </Button>
            )}
            <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>

        {/* Quick adjusters */}
        <div className="grid grid-cols-4 gap-1.5 px-1 pb-2">
          <button onClick={() => adjust(-step * 2)} className="h-9 rounded-lg bg-secondary/40 text-xs font-medium hover:bg-secondary">
            −{step * 2}
          </button>
          <button onClick={() => adjust(-step)} className="h-9 rounded-lg bg-secondary/40 text-xs font-medium hover:bg-secondary">
            −{step}
          </button>
          <button onClick={() => adjust(step)} className="h-9 rounded-lg bg-secondary/40 text-xs font-medium hover:bg-secondary">
            +{step}
          </button>
          <button onClick={() => adjust(step * 2)} className="h-9 rounded-lg bg-secondary/40 text-xs font-medium hover:bg-secondary">
            +{step * 2}
          </button>
        </div>

        {/* Number grid */}
        <div className="grid grid-cols-3 gap-1.5 px-1">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(d => (
            <button key={d} className={keyCls} onClick={() => pressDigit(d)}>{d}</button>
          ))}
          <button
            className={cn(keyCls, "text-xl", !allowDecimal && "opacity-30 pointer-events-none")}
            onClick={pressDecimal}
            disabled={!allowDecimal}
          >
            .
          </button>
          <button className={keyCls} onClick={() => pressDigit("0")}>0</button>
          <button className={cn(keyCls, "flex items-center justify-center")} onClick={pressBackspace}>
            <Delete className="h-6 w-6" />
          </button>
        </div>

        {/* Action row */}
        <div className="grid grid-cols-2 gap-1.5 px-1 pt-2">
          <Button
            variant="secondary"
            className="h-12 text-base font-semibold"
            onClick={handleNext}
            disabled={!onNext}
          >
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
          <Button
            className="h-12 text-base font-semibold"
            onClick={handleLog}
            disabled={!canLog}
          >
            <Check className="h-4 w-4 mr-1" /> Log Set
          </Button>
        </div>
      </div>
    </>,
    document.body,
  );
};

export default NumericKeypad;
