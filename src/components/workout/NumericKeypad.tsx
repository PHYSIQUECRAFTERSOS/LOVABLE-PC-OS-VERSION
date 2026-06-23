import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Delete, Check, Target, ChevronRight, ArrowLeft, Minus, Plus, ChevronDown } from "lucide-react";
import { hapticTap, hapticTick, hapticWarn } from "@/utils/haptics";

interface NumericKeypadProps {
  open: boolean;
  mode: "weight" | "reps";
  value: string;
  /** Stable identity of the active target (setIdx + field) — when this changes, the buffer is "fresh" and the next digit overwrites. */
  fieldKey?: string;
  label?: string;
  previous?: string | null;
  unit?: string;
  currentRPE?: number;
  onChange: (next: string) => void;
  onClose: () => void;
  onNext?: () => void;
  onLog?: () => void;
  onSelectRPE?: (rpe: number | undefined) => void;
  canLog?: boolean;
  logLabel?: string;
}

const RPE_VALUES = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];

/**
 * Strong-style numeric keypad. Bottom sheet, white surface, 3-col digit grid
 * with a right-side action stack (RPE / Next / − + / Log Set).
 *
 * IMPORTANT: No click-blocking overlay — taps on other set rows pass through
 * and re-target the keypad atomically via the parent's openKeypad().
 */
const NumericKeypad = ({
  open,
  mode,
  value,
  fieldKey,
  previous,
  unit,
  currentRPE,
  onChange,
  onClose,
  onNext,
  onLog,
  onSelectRPE,
  canLog,
  logLabel,
}: NumericKeypadProps) => {
  const freshRef = useRef(true);
  const [showRPE, setShowRPE] = useState(false);

  // Reset "fresh" flag whenever the active target changes (new set or new field)
  useEffect(() => {
    if (open) {
      freshRef.current = true;
      setShowRPE(false);
    }
  }, [open, fieldKey, mode]);

  if (!open) return null;

  const allowDecimal = mode === "weight";
  const adjustStep = mode === "weight" ? 5 : 1;

  const pressDigit = (d: string) => {
    hapticTap();
    let next: string;
    if (freshRef.current) {
      next = d;
      freshRef.current = false;
    } else {
      next = (value || "") + d;
    }
    if (next.length > 1 && next.startsWith("0") && !next.startsWith("0.")) {
      next = next.replace(/^0+/, "") || "0";
    }
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
    const rounded = mode === "reps" ? Math.round(next) : Math.round(next * 2) / 2;
    onChange(String(rounded));
    freshRef.current = false;
  };

  const handleLog = () => {
    if (!canLog) {
      hapticWarn();
      return;
    }
    onLog?.();
  };

  // White surface, black text — high contrast pop. Active = subtle gray.
  const digitCls =
    "h-14 rounded-xl bg-white text-black text-2xl font-semibold tabular-nums " +
    "active:bg-zinc-200 transition-colors select-none touch-manipulation " +
    "shadow-sm border border-zinc-200";

  const sideBtnCls =
    "rounded-xl bg-white text-black text-sm font-semibold " +
    "active:bg-zinc-200 transition-colors select-none touch-manipulation " +
    "shadow-sm border border-zinc-200 flex items-center justify-center";

  return createPortal(
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-[90] bg-zinc-900",
        "pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 px-2",
        "shadow-[0_-12px_40px_-8px_hsl(0_0%_0%/0.6)]",
        "animate-in slide-in-from-bottom-4 duration-150",
      )}
      onClick={e => e.stopPropagation()}
    >
      {/* Compact header: current value + unit, with dismiss chevron */}
      <div className="flex items-center justify-between px-1.5 pb-1.5">
        <p className="text-base font-bold tabular-nums text-white leading-tight">
          {value || <span className="text-white/30">0</span>}
          {unit && <span className="text-xs text-white/60 ml-1.5">{unit}</span>}
          {previous && (
            <span className="text-[11px] text-white/40 ml-2 font-normal">Prev: {previous}</span>
          )}
          {currentRPE != null && (
            <span className="text-[11px] text-primary ml-2 font-semibold">@{currentRPE}</span>
          )}
        </p>
        <button
          onClick={onClose}
          className="h-7 w-7 rounded-md bg-white/10 active:bg-white/20 text-white flex items-center justify-center"
          aria-label="Close keypad"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>

      {showRPE ? (
        <div className="px-1 pb-1">
          <div className="flex items-center justify-between pb-1.5">
            <button
              onClick={() => setShowRPE(false)}
              className="flex items-center gap-1 text-[11px] text-white/70 active:text-white"
            >
              <ArrowLeft className="h-3 w-3" /> Back
            </button>
            <p className="text-[11px] font-semibold text-white/70">Rate of Perceived Exertion</p>
            {currentRPE != null ? (
              <button
                onClick={() => { hapticTick(); onSelectRPE?.(undefined); setShowRPE(false); }}
                className="text-[11px] text-white/70 active:text-white"
              >Clear</button>
            ) : <span className="w-8" />}
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {RPE_VALUES.map(rpe => (
              <button
                key={rpe}
                onClick={() => { hapticTap(); onSelectRPE?.(rpe); setShowRPE(false); }}
                className={cn(
                  "h-12 rounded-xl text-base font-semibold tabular-nums transition-colors shadow-sm border",
                  currentRPE === rpe
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-white text-black border-zinc-200 active:bg-zinc-200",
                )}
              >
                @{rpe}
              </button>
            ))}
          </div>
          {onLog && (
            <button
              className={cn(
                "mt-2 w-full h-11 rounded-xl text-sm font-bold flex items-center justify-center gap-1 shadow-sm transition-colors",
                canLog
                  ? "bg-primary text-primary-foreground active:bg-primary/90"
                  : "bg-primary/40 text-primary-foreground/70 pointer-events-none",
              )}
              onClick={handleLog}
              disabled={!canLog}
            >
              <Check className="h-4 w-4" /> {logLabel || "Log Set"}
            </button>
          )}
        </div>
      ) : (
        // 4-column grid: cols 1-3 = digits (3 wide), col 4 = side actions
        <div className="grid grid-cols-4 gap-1.5 px-1">
          {/* DIGITS — col-span-3, internal 3-col grid */}
          <div className="col-span-3 grid grid-cols-3 gap-1.5">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(d => (
              <button key={d} className={digitCls} onClick={() => pressDigit(d)}>{d}</button>
            ))}
            <button
              className={cn(digitCls, "text-xl", !allowDecimal && "opacity-30 pointer-events-none")}
              onClick={pressDecimal}
              disabled={!allowDecimal}
            >.</button>
            <button className={digitCls} onClick={() => pressDigit("0")}>0</button>
            <button className={cn(digitCls, "flex items-center justify-center")} onClick={pressBackspace}>
              <Delete className="h-6 w-6" />
            </button>
          </div>

          {/* SIDE STACK — col-span-1 */}
          <div className="col-span-1 grid grid-rows-4 gap-1.5">
            {/* RPE */}
            <button
              className={sideBtnCls}
              onClick={() => { hapticTick(); setShowRPE(true); }}
              disabled={!onSelectRPE}
            >
              <Target className="h-4 w-4 mr-1" />
              RPE
            </button>

            {/* Next */}
            <button
              className={cn(sideBtnCls, !onNext && "opacity-40 pointer-events-none")}
              onClick={() => { hapticTick(); onNext?.(); }}
              disabled={!onNext}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-0.5" />
            </button>

            {/* − / + split adjuster (±5 weight, ±1 reps) */}
            <div className="grid grid-cols-2 gap-1">
              <button className={cn(sideBtnCls, "h-full")} onClick={() => adjust(-adjustStep)} aria-label={`Minus ${adjustStep}`}>
                <Minus className="h-4 w-4" />
              </button>
              <button className={cn(sideBtnCls, "h-full")} onClick={() => adjust(adjustStep)} aria-label={`Plus ${adjustStep}`}>
                <Plus className="h-4 w-4" />
              </button>
            </div>

            {/* Log Set — gold/primary, prominent */}
            <button
              className={cn(
                "rounded-xl text-sm font-bold flex items-center justify-center gap-1 shadow-sm transition-colors",
                canLog
                  ? "bg-primary text-primary-foreground active:bg-primary/90"
                  : "bg-primary/40 text-primary-foreground/70 pointer-events-none",
              )}
              onClick={handleLog}
              disabled={!canLog}
            >
              <Check className="h-4 w-4" />
              {logLabel || "Log"}
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
};

export default NumericKeypad;
