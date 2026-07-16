import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Check, Trophy, Plus, MoreVertical, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import InlineRestTimer from "@/components/workout/InlineRestTimer";
import PersonalExerciseNote from "@/components/workout/PersonalExerciseNote";
import NumericKeypad from "@/components/workout/NumericKeypad";
import { cn } from "@/lib/utils";
import { useUnitPreferences } from "@/hooks/useUnitPreferences";
import { useIsMobile } from "@/hooks/use-mobile";
import { hapticSuccess, hapticCelebrate } from "@/utils/haptics";

interface SetLog {
  setNumber: number;
  weight?: number;
  reps?: number;
  rpe?: number;
  completed?: boolean;
  isPR?: boolean;
}

interface PreviousSet {
  set_number: number;
  weight: number | null;
  reps: number | null;
  rir: number | null;
  weight_unit?: string;
  session_created_at?: string;
}

interface ExerciseCardProps {
  name: string;
  exerciseId: string;
  sets: number;
  reps: string;
  tempo: string;
  restSeconds: number;
  rir?: number;
  notes: string;
  videoUrl?: string | null;
  equipment?: string | null;
  logs: SetLog[];
  previousSets: PreviousSet[];
  allTimePR: { weight: number; reps: number } | null;
  clientWeightUnit?: string;
  activeTimerAfterSetIndex: number | null;
  timerSeconds: number;
  onTimerComplete: () => void;
  onTimerSkip: () => void;
  onUpdateLog: (setIdx: number, field: string, value: unknown) => void;
  onCompleteSet: (setIdx: number) => void;
  onAddSet: () => void;
  onDeleteSet?: (setIdx: number) => void;
  onDeleteExercise?: () => void;
  onSwitchExercise?: () => void;
  // Grouping (superset / circuit / giant set) visual + behavior props
  groupLabel?: string;       // e.g. "SUPERSET A"
  groupIndex?: number;       // 1-based position within the group
  groupSize?: number;        // total members in the group
  isInGroup?: boolean;
  isFirstInGroup?: boolean;
  isLastInGroup?: boolean;
  suppressRestAfterSet?: boolean; // informational; parent already gates timer
}

function getYouTubeId(url: string): string | null {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|shorts\/))([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

const isBodyweight = (equipment: string | null | undefined): boolean => {
  if (!equipment) return false;
  const lower = equipment.toLowerCase();
  return lower === "bodyweight" || lower === "none" || lower === "body weight";
};

// RPE values from 6 to 10 in 0.5 increments (like Strong app)
const RPE_VALUES = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];

const RPE_LABELS: Record<number, string> = {
  6: "Could do 4+ more",
  6.5: "",
  7: "Could do 3 more",
  7.5: "",
  8: "Could do 2 more",
  8.5: "",
  9: "Could do 1 more",
  9.5: "Maybe 1 more",
  10: "Maximum effort",
};

// --- RPE Selector Popover (supports external open control for keypad wiring) ---
const RPESelector = ({
  currentRPE,
  onSelect,
  children,
  open: openProp,
  onOpenChange,
}: {
  currentRPE?: number;
  onSelect: (rpe: number | undefined) => void;
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp !== undefined ? openProp : internalOpen;
  const setOpen = (o: boolean) => {
    if (onOpenChange) onOpenChange(o);
    else setInternalOpen(o);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-56 p-2" side="top" align="end">
        <div className="space-y-0.5">
          <p className="text-xs font-semibold text-muted-foreground px-2 pb-1">Rate Perceived Exertion</p>
          {RPE_VALUES.map(rpe => (
            <button
              key={rpe}
              onClick={() => { onSelect(rpe); setOpen(false); }}
              className={cn(
                "w-full flex items-center justify-between px-2 py-1.5 rounded-md text-sm transition-colors",
                currentRPE === rpe
                  ? "bg-primary/20 text-primary font-semibold"
                  : "hover:bg-secondary text-foreground"
              )}
            >
              <span className="font-medium">RPE {rpe}</span>
              {RPE_LABELS[rpe] && (
                <span className="text-[10px] text-muted-foreground">{RPE_LABELS[rpe]}</span>
              )}
            </button>
          ))}
          {currentRPE != null && (
            <button
              onClick={() => { onSelect(undefined); setOpen(false); }}
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground py-1.5 mt-1 border-t border-border"
            >
              Clear RPE
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

// --- Swipeable Set Row (delete on swipe) ---
const SwipeableSetRow = ({
  children,
  onDelete,
  disabled,
}: {
  children: React.ReactNode;
  onDelete: () => void;
  disabled?: boolean;
}) => {
  const startXRef = useRef(0);
  const currentXRef = useRef(0);
  const rowRef = useRef<HTMLDivElement>(null);
  const [swiped, setSwiped] = useState(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (disabled) return;
    startXRef.current = e.touches[0].clientX;
    currentXRef.current = 0;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (disabled) return;
    const diff = e.touches[0].clientX - startXRef.current;
    currentXRef.current = diff;
    if (diff < -20 && rowRef.current) {
      rowRef.current.style.transform = `translateX(${Math.max(diff, -80)}px)`;
    }
  };

  const handleTouchEnd = () => {
    if (disabled) return;
    if (currentXRef.current < -60) {
      setSwiped(true);
    } else if (rowRef.current) {
      rowRef.current.style.transform = "translateX(0)";
    }
  };

  if (swiped) {
    return (
      <div className="flex items-center justify-between bg-destructive/10 border border-destructive/30 rounded-lg p-2">
        <span className="text-xs text-destructive font-medium">Delete this set?</span>
        <div className="flex gap-1.5">
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setSwiped(false); if (rowRef.current) rowRef.current.style.transform = "translateX(0)"; }}>
            Cancel
          </Button>
          <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={onDelete}>
            <Trash2 className="h-3 w-3 mr-1" /> Delete
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden">
      <div className="absolute right-0 top-0 bottom-0 w-20 flex items-center justify-center bg-destructive/20 rounded-r-lg">
        <Trash2 className="h-4 w-4 text-destructive" />
      </div>
      <div
        ref={rowRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="relative z-10 bg-background transition-transform"
      >
        {children}
      </div>
    </div>
  );
};

// --- Main ExerciseCard ---
const ExerciseCard = ({
  name,
  exerciseId,
  sets,
  reps,
  tempo,
  restSeconds,
  rir,
  notes,
  videoUrl,
  equipment,
  logs,
  previousSets,
  allTimePR,
  clientWeightUnit,
  activeTimerAfterSetIndex,
  timerSeconds,
  onTimerComplete,
  onTimerSkip,
  onUpdateLog,
  onCompleteSet,
  onAddSet,
  onDeleteSet,
  onDeleteExercise,
  onSwitchExercise,
  groupLabel,
  groupIndex,
  groupSize,
  isInGroup,
  isFirstInGroup,
  isLastInGroup,
  suppressRestAfterSet,
}: ExerciseCardProps) => {
  const allDone = logs.every(l => l.completed);
  const videoId = videoUrl ? getYouTubeId(videoUrl) : null;
  const isBW = isBodyweight(equipment);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const { convertWeight, weightLabel } = useUnitPreferences();
  const isMobile = useIsMobile();

  // Local string state for weight inputs to preserve trailing decimals (e.g. "105.")
  const [weightStrings, setWeightStrings] = useState<Record<number, string>>({});

  // Custom keypad state (mobile-only): which set/field is being edited
  const [keypadField, setKeypadField] = useState<{ setIdx: number; field: "weight" | "reps" } | null>(null);
  const [keypadValue, setKeypadValue] = useState("");
  const [rpePopoverSetIdx, setRpePopoverSetIdx] = useState<number | null>(null);

  // Long-press support
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Open the keypad targeted at a specific set/field, prefilling the buffer.
  const openKeypad = useCallback((setIdx: number, field: "weight" | "reps") => {
    const log = logs[setIdx];
    if (!log) return;
    // Allow editing even after a set is logged — users can correct weight/reps;
    // PR detection re-evaluates on Finish from the final values.
    const current = field === "weight" ? log.weight : log.reps;
    setKeypadValue(current !== undefined && current !== null ? String(current) : "");
    setKeypadField({ setIdx, field });
  }, [logs]);

  const commitKeypadValue = useCallback((raw: string) => {
    if (!keypadField) return;
    setKeypadValue(raw);
    if (raw === "" || raw === ".") {
      onUpdateLog(keypadField.setIdx, keypadField.field, undefined);
      return;
    }
    const num = keypadField.field === "weight" ? parseFloat(raw) : parseInt(raw, 10);
    if (!isNaN(num) && num >= 0) {
      onUpdateLog(keypadField.setIdx, keypadField.field, num);
    }
  }, [keypadField, onUpdateLog]);

  // Trigger PR celebration haptic when any set transitions to isPR=true
  const prFlagsRef = useRef<boolean[]>([]);
  useEffect(() => {
    logs.forEach((l, i) => {
      const wasPR = prFlagsRef.current[i] === true;
      if (l.isPR && !wasPR) hapticCelebrate();
    });
    prFlagsRef.current = logs.map(l => !!l.isPR);
  }, [logs]);

  const handleTouchStart = useCallback(() => {
    longPressTimer.current = setTimeout(() => {
      setMenuOpen(true);
    }, 500);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  }, []);

  const canLogSet = (log: SetLog) => {
    const weightOk = log.weight === undefined || log.weight === null || log.weight >= 0;
    const hasReps = !!log.reps && log.reps > 0;
    return weightOk && hasReps;
  };

  // Only allow deleting if there's more than 1 set
  const canDeleteSet = logs.length > 1;

  /** Convert a previous-performance weight to the client's display unit.
   *  Old data has no weight_unit (stored in lbs) → use convertWeight (lbs→client unit).
   *  New data has weight_unit matching client → show raw. */
  const displayPrevWeight = (w: number, unit?: string) => {
    if (!unit || unit === 'lbs') return convertWeight(w);
    if (unit === (clientWeightUnit || weightLabel)) return w;
    // Edge case: stored in kg but client uses lbs
    if (unit === 'kg') return Number((w * 2.20462).toFixed(1));
    return w;
  };

  return (
    <Card
      className={cn(
        "transition-colors relative",
        allDone && !isInGroup && "border-primary/30 bg-primary/5",
        isInGroup && "border-[#D4A017] border-2",
        isInGroup && allDone && "bg-primary/5",
        isInGroup && !isFirstInGroup && "rounded-t-md",
      )}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchEnd}
    >
      {/* Group rail — continuous gold connector on the left edge spanning all cards in the group. */}
      {isInGroup && (
        <>
          <div
            aria-hidden
            className="absolute left-0 w-[3px] bg-[#D4A017] pointer-events-none"
            style={{
              top: isFirstInGroup ? 8 : -12,
              bottom: isLastInGroup ? 8 : -12,
              borderTopLeftRadius: isFirstInGroup ? 9999 : 0,
              borderBottomLeftRadius: isLastInGroup ? 9999 : 0,
            }}
          />
          {/* Group pill — sits at the top of every card in the group. */}
          <div className="px-4 pt-3">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#D4A017]/15 text-[#D4A017] border border-[#D4A017]/40">
              {groupLabel}
              {typeof groupIndex === "number" && typeof groupSize === "number" && (
                <span className="opacity-80">· {groupIndex} of {groupSize}</span>
              )}
              {suppressRestAfterSet && (
                <span className="opacity-70 normal-case tracking-normal">· no rest</span>
              )}
            </span>
          </div>
        </>
      )}

      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2 flex-1 min-w-0 font-bold tracking-tight">
            <span className="truncate">{name}</span>
          </CardTitle>

          <div className="flex items-center gap-1 shrink-0">
            {allDone && <Check className="h-5 w-5 text-primary" />}
            {(onDeleteExercise || onSwitchExercise) && (
              <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {onSwitchExercise && (
                    <DropdownMenuItem onClick={onSwitchExercise}>
                      🔄 Switch Exercise
                    </DropdownMenuItem>
                  )}
                  {onDeleteExercise && (
                    <DropdownMenuItem onClick={() => { setMenuOpen(false); setShowConfirmDelete(true); }} className="text-destructive">
                      🗑️ Delete Exercise
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 mt-1">
          <span className="text-xs bg-secondary px-2 py-0.5 rounded">{sets}s × {reps}</span>
          {tempo && <span className="text-xs bg-secondary px-2 py-0.5 rounded">Tempo: {tempo}</span>}
          {rir != null && <span className="text-xs bg-secondary px-2 py-0.5 rounded">RIR: {rir}</span>}
          {restSeconds > 0 && <span className="text-xs bg-secondary px-2 py-0.5 rounded">Rest: {restSeconds}s</span>}
        </div>

        {/* All-time PR is stored in lbs in personal_records — convert to client unit for display */}
        {allTimePR && (
          <p className="text-xs text-primary mt-1 flex items-center gap-1">
            <Trophy className="h-3 w-3" /> All-Time PR: {convertWeight(allTimePR.weight)} {weightLabel} × {allTimePR.reps} reps
          </p>
        )}
      </CardHeader>

      {/* Delete confirmation inline */}
      {showConfirmDelete && (
        <div className="mx-4 mb-2 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
          <p className="text-sm text-foreground mb-2">Remove <strong>{name}</strong> from this session?</p>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setShowConfirmDelete(false)}>Keep</Button>
            <Button size="sm" variant="destructive" onClick={() => { setShowConfirmDelete(false); onDeleteExercise?.(); }}>
              Remove
            </Button>
          </div>
        </div>
      )}

      {videoId && (
        <div className="px-4 pb-2">
          <iframe
            src={`https://www.youtube.com/embed/${videoId}?playsinline=1&rel=0&modestbranding=1`}
            title={name}
            width="100%"
            height="200"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            loading="lazy"
            className="rounded-lg"
          />
        </div>
      )}

      <CardContent className="space-y-1.5 pt-0">
        {notes && (
          <div className="p-2 rounded bg-secondary/50 text-xs text-muted-foreground">{notes}</div>
        )}

        <PersonalExerciseNote exerciseId={exerciseId} />


        {/* Header row */}
        <div className="grid grid-cols-[2rem_1fr_1fr_1fr_auto] gap-1.5 px-1 items-center">
          <span className="text-[10px] font-medium text-muted-foreground uppercase">Set</span>
          <span className="text-[10px] font-medium text-muted-foreground uppercase">Previous</span>
          <span className="text-[10px] font-medium text-muted-foreground uppercase">{weightLabel}</span>
          <span className="text-[10px] font-medium text-muted-foreground uppercase">Reps</span>
          <span className="w-14" />
        </div>

        {logs.map((log, setIdx) => {
          // Prefer exact set-number match; fall back to nearest lower set,
          // then to the last recorded set. Ensures set 4 today shows set 3
          // from last week rather than "—".
          const prev =
            previousSets.find((p) => p.set_number === log.setNumber) ||
            [...previousSets]
              .filter((p) => p.set_number < log.setNumber)
              .sort((a, b) => b.set_number - a.set_number)[0] ||
            previousSets[previousSets.length - 1];
          const prevW = prev && prev.weight !== null && prev.weight !== undefined
            ? (prev.weight === 0 ? "BW" : String(displayPrevWeight(prev.weight, prev.weight_unit)))
            : (isBW ? "BW" : "0");
          const prevR = prev && prev.reps !== null && prev.reps !== undefined ? String(prev.reps) : "0";
          const prevLabel = prev && (prev.weight !== null && prev.weight !== undefined)
            ? `${prev.weight === 0 ? "BW" : displayPrevWeight(prev.weight, prev.weight_unit)}×${prev.reps}${prev.rir != null ? ` @${prev.rir}` : ""}`
            : "—";
          const isKeypadActiveWeight = keypadField?.setIdx === setIdx && keypadField.field === "weight";
          const isKeypadActiveReps = keypadField?.setIdx === setIdx && keypadField.field === "reps";

          // Mobile uses a tap-target button that opens the custom keypad; desktop keeps native Inputs.
          const weightDisplay = log.weight !== undefined && log.weight !== null ? String(log.weight) : "";
          const repsDisplay = log.reps !== undefined && log.reps !== null ? String(log.reps) : "";

          const setRow = (
            <div
              className={`grid grid-cols-[2rem_1fr_1fr_1fr_auto] gap-1.5 items-center p-1.5 rounded-lg transition-colors ${
                log.completed ? "bg-primary/5 border border-primary/20" : "bg-card border border-border"
              }`}
            >
              <div className="flex items-center justify-center">
                {log.completed ? (
                  <Check className="h-4 w-4 text-primary" />
                ) : (
                  <span className="text-sm font-extrabold text-center font-workout-mono tabular-nums">{log.setNumber}</span>
                )}
              </div>

              <span className="text-xs text-muted-foreground truncate tabular-nums font-workout-mono">{prevLabel}</span>

              <div className="relative">
                {isMobile ? (
                  <button
                    type="button"
                    onClick={() => openKeypad(setIdx, "weight")}
                    className={cn(
                      "w-full h-8 px-2 rounded-md border bg-background text-base font-extrabold font-workout-mono text-left tabular-nums transition-colors",

                      isKeypadActiveWeight ? "border-primary ring-1 ring-primary/40" : "border-input",
                      !weightDisplay && "text-muted-foreground/50",
                    )}
                  >
                    {weightDisplay || prevW}
                  </button>
                ) : (
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={weightStrings[setIdx] !== undefined ? weightStrings[setIdx] : weightDisplay}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "") {
                        setWeightStrings(prev => ({ ...prev, [setIdx]: "" }));
                        onUpdateLog(setIdx, "weight", undefined);
                      } else if (/^\d*\.?\d*$/.test(val)) {
                        setWeightStrings(prev => ({ ...prev, [setIdx]: val }));
                        if (!val.endsWith(".")) {
                          const num = parseFloat(val);
                          if (!isNaN(num) && num >= 0) onUpdateLog(setIdx, "weight", num);
                        }
                      }
                    }}
                    onFocus={(e) => e.currentTarget.select()}
                    onBlur={() => {
                      const str = weightStrings[setIdx];
                      if (str !== undefined && str !== "") {
                        const num = parseFloat(str);
                        if (!isNaN(num) && num >= 0) onUpdateLog(setIdx, "weight", num);
                      }
                      setWeightStrings(prev => { const n = { ...prev }; delete n[setIdx]; return n; });
                    }}
                    placeholder={prevW}
                    className="text-base font-extrabold font-workout-mono tabular-nums h-8"

                  />
                )}
                {isBW && (log.weight === 0 || log.weight === undefined) && !log.completed && (
                  <span className="absolute -bottom-3.5 left-0 text-[9px] text-muted-foreground">Bodyweight</span>
                )}
              </div>

              {/* Reps cell — editable. RPE shown inline when completed. */}
              <div className="relative">
                {log.completed ? (
                  <div className="flex items-center gap-0.5">
                    {isMobile ? (
                      <button
                        type="button"
                        onClick={() => openKeypad(setIdx, "reps")}
                        className={cn(
                          "flex-1 min-w-[52px] h-8 px-2 rounded-md border bg-background text-base font-extrabold font-workout-mono text-center tabular-nums transition-colors",
                          isKeypadActiveReps ? "border-primary ring-1 ring-primary/40" : "border-input",
                        )}
                      >
                        {repsDisplay || "—"}
                      </button>
                    ) : (
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={repsDisplay}
                        onFocus={(e) => e.currentTarget.select()}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === "") {
                            onUpdateLog(setIdx, "reps", undefined);
                          } else {
                            const num = parseInt(val);
                            if (!isNaN(num) && num >= 0) onUpdateLog(setIdx, "reps", num);
                          }
                        }}
                        className="text-base font-extrabold font-workout-mono h-8 flex-1 min-w-[52px] text-center tabular-nums"
                      />
                    )}
                    <RPESelector
                      currentRPE={log.rpe}
                      open={rpePopoverSetIdx === setIdx}
                      onOpenChange={(o) => setRpePopoverSetIdx(o ? setIdx : null)}
                      onSelect={(rpe) => onUpdateLog(setIdx, "rpe", rpe)}
                    >
                      <button className="h-8 px-1.5 rounded-md border border-border bg-secondary/40 text-[10px] font-semibold flex items-center justify-center hover:bg-secondary transition-colors shrink-0">
                        {log.rpe != null ? (
                          <span className="text-primary">@{log.rpe}</span>
                        ) : (
                          <span className="text-muted-foreground/60">RPE</span>
                        )}
                      </button>
                    </RPESelector>
                  </div>
                ) : isMobile ? (
                  <button
                    type="button"
                    onClick={() => openKeypad(setIdx, "reps")}
                    className={cn(
                      "w-full h-8 px-2 rounded-md border bg-background text-base font-extrabold font-workout-mono text-left tabular-nums transition-colors",
                      isKeypadActiveReps ? "border-primary ring-1 ring-primary/40" : "border-input",
                      !repsDisplay && "text-muted-foreground/50",
                    )}
                  >
                    {repsDisplay || prevR}
                  </button>
                ) : (
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={repsDisplay}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "") {
                        onUpdateLog(setIdx, "reps", undefined);
                      } else {
                        const num = parseInt(val);
                        if (!isNaN(num) && num >= 0) onUpdateLog(setIdx, "reps", num);
                      }
                    }}
                    placeholder={prevR}
                    className="text-base font-extrabold font-workout-mono tabular-nums h-8"
                  />
                )}
              </div>

              <div className="flex items-center gap-1">
                {log.isPR && <Trophy className="h-3.5 w-3.5 text-warn animate-bounce" />}
                <Button
                  size="sm"
                  className="h-8 px-3"
                  variant={log.completed ? "secondary" : "default"}
                  disabled={log.completed || !canLogSet(log)}
                  onClick={() => {
                    hapticSuccess();
                    setKeypadField(null);
                    onCompleteSet(setIdx);
                  }}
                >
                  {log.completed ? <Check className="h-3.5 w-3.5" /> : "Log"}
                </Button>
              </div>
            </div>
          );

          return (
            <div key={setIdx}>
              {canDeleteSet && onDeleteSet && !log.completed ? (
                <SwipeableSetRow
                  onDelete={() => onDeleteSet(setIdx)}
                  disabled={log.completed}
                >
                  {setRow}
                </SwipeableSetRow>
              ) : (
                setRow
              )}

              {/* Inline rest timer between sets */}
              {activeTimerAfterSetIndex === setIdx && (
                <div className="my-1.5">
                  <InlineRestTimer
                    seconds={timerSeconds}
                    onComplete={onTimerComplete}
                    onSkip={onTimerSkip}
                  />
                </div>
              )}
            </div>
          );
        })}

        {isBW && (
          <p className="text-[10px] text-muted-foreground mt-1">💡 Bodyweight exercise — use 0 {weightLabel} or add weight for resistance</p>
        )}

        <Button variant="ghost" size="sm" className="w-full text-xs mt-1" onClick={onAddSet}>
          <Plus className="h-3 w-3 mr-1" /> Add Set
        </Button>
      </CardContent>

      {/* Custom numeric keypad (mobile only) */}
      {isMobile && keypadField && (() => {
        const activeLog = logs[keypadField.setIdx];
        if (!activeLog) return null;
        const prev = previousSets.find(p => p.set_number === activeLog.setNumber);
        const prevStr = prev && prev.weight !== null && prev.weight !== undefined
          ? `${prev.weight === 0 ? "BW" : displayPrevWeight(prev.weight, prev.weight_unit)} × ${prev.reps}`
          : null;
        const weightFilled = activeLog.weight !== undefined && activeLog.weight !== null;
        const repsFilled = activeLog.reps !== undefined && activeLog.reps !== null && activeLog.reps > 0;
        const isEditingCompleted = !!activeLog.completed;
        const canLog = (weightFilled || isBW) && repsFilled;
        return (
          <NumericKeypad
            open
            mode={keypadField.field}
            value={keypadValue}
            fieldKey={`${keypadField.setIdx}:${keypadField.field}`}
            unit={keypadField.field === "weight" ? weightLabel : "reps"}
            previous={prevStr}
            currentRPE={activeLog.rpe}
            canLog={canLog}
            logLabel={isEditingCompleted ? "Save" : undefined}
            onChange={commitKeypadValue}
            onClose={() => setKeypadField(null)}
            onNext={keypadField.field === "weight"
              ? () => openKeypad(keypadField.setIdx, "reps")
              : () => {
                  const nextIdx = logs.findIndex((l, i) => i > keypadField.setIdx && !l.completed);
                  if (nextIdx !== -1) openKeypad(nextIdx, "weight");
                  else setKeypadField(null);
                }
            }
            onLog={canLog ? () => {
              hapticSuccess();
              if (isEditingCompleted) {
                // Edits already auto-persist via onUpdateLog → persistSet.
                // "Save" just confirms and closes the keypad.
                setKeypadField(null);
                return;
              }
              const idx = keypadField.setIdx;
              onCompleteSet(idx);
              // Auto-advance keypad to next unlogged set's weight (Strong-style).
              // Parent's completeSet pre-fills the next empty set with this set's
              // weight/reps; keypad opens fresh so first digit overwrites.
              const nextIdx = logs.findIndex((l, i) => i > idx && !l.completed);
              if (nextIdx !== -1) openKeypad(nextIdx, "weight");
              else setKeypadField(null);
            } : undefined}
            onSelectRPE={(rpe) => onUpdateLog(keypadField.setIdx, "rpe", rpe)}
          />

        );
      })()}
    </Card>
  );
};

export default ExerciseCard;
