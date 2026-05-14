import { useState, useRef, useCallback, useMemo } from "react";
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
import { cn } from "@/lib/utils";
import { useUnitPreferences } from "@/hooks/useUnitPreferences";

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

// --- RPE Selector Popover ---
const RPESelector = ({
  currentRPE,
  onSelect,
  children,
}: {
  currentRPE?: number;
  onSelect: (rpe: number | undefined) => void;
  children: React.ReactNode;
}) => {
  const [open, setOpen] = useState(false);

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
}: ExerciseCardProps) => {
  const allDone = logs.every(l => l.completed);
  const videoId = videoUrl ? getYouTubeId(videoUrl) : null;
  const isBW = isBodyweight(equipment);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const { convertWeight, weightLabel } = useUnitPreferences();

  // Local string state for weight inputs to preserve trailing decimals (e.g. "105.")
  const [weightStrings, setWeightStrings] = useState<Record<number, string>>({});

  // Long-press support
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

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
      className={`transition-colors ${allDone ? "border-primary/30 bg-primary/5" : ""}`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchEnd}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2 flex-1 min-w-0">
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

        {/* Header row */}
        <div className="grid grid-cols-[2rem_1fr_1fr_1fr_auto] gap-1.5 px-1 items-center">
          <span className="text-[10px] font-medium text-muted-foreground uppercase">Set</span>
          <span className="text-[10px] font-medium text-muted-foreground uppercase">Previous</span>
          <span className="text-[10px] font-medium text-muted-foreground uppercase">{weightLabel}</span>
          <span className="text-[10px] font-medium text-muted-foreground uppercase">Reps</span>
          <span className="w-14" />
        </div>

        {logs.map((log, setIdx) => {
          const prev = previousSets.find(p => p.set_number === log.setNumber);
          const prevLabel = prev && (prev.weight !== null && prev.weight !== undefined)
            ? `${prev.weight === 0 ? "BW" : displayPrevWeight(prev.weight, prev.weight_unit)}×${prev.reps}${prev.rir != null ? ` @${prev.rir}` : ""}`
            : "—";

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
                  <span className="text-sm font-medium text-center">{log.setNumber}</span>
                )}
              </div>

              <span className="text-xs text-muted-foreground truncate tabular-nums">{prevLabel}</span>

              <div className="relative">
                 {/* Weight input — stores RAW value in client's preferred unit (no conversion) */}
                 <Input
                   type="text"
                   inputMode="decimal"
                   value={weightStrings[setIdx] !== undefined ? weightStrings[setIdx] : (log.weight !== undefined && log.weight !== null ? String(log.weight) : "")}
                   onChange={(e) => {
                     const val = e.target.value;
                     if (val === "") {
                       setWeightStrings(prev => ({ ...prev, [setIdx]: "" }));
                       onUpdateLog(setIdx, "weight", undefined);
                     } else if (/^\d*\.?\d*$/.test(val)) {
                       setWeightStrings(prev => ({ ...prev, [setIdx]: val }));
                       // Commit the raw numeric value (no unit conversion)
                       if (!val.endsWith(".")) {
                         const num = parseFloat(val);
                         if (!isNaN(num) && num >= 0) onUpdateLog(setIdx, "weight", num);
                       }
                     }
                   }}
                   onBlur={() => {
                     // On blur, commit any trailing-decimal value and clear local string state
                     const str = weightStrings[setIdx];
                     if (str !== undefined && str !== "") {
                       const num = parseFloat(str);
                       if (!isNaN(num) && num >= 0) onUpdateLog(setIdx, "weight", num);
                     }
                     setWeightStrings(prev => { const n = { ...prev }; delete n[setIdx]; return n; });
                   }}
                   placeholder={isBW ? "BW" : "0"}
                   className="text-sm h-8"
                 />
                {isBW && (log.weight === 0 || log.weight === undefined) && !log.completed && (
                  <span className="absolute -bottom-3.5 left-0 text-[9px] text-muted-foreground">Bodyweight</span>
                )}
              </div>

              {/* Reps field — editable even after completion, with RPE selector */}
              <div className="relative">
                {log.completed ? (
                  <div className="flex items-center gap-0.5">
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={log.reps ?? ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "") {
                          onUpdateLog(setIdx, "reps", undefined);
                        } else {
                          const num = parseInt(val);
                          if (!isNaN(num) && num >= 0) onUpdateLog(setIdx, "reps", num);
                        }
                      }}
                      className="text-sm h-8 w-[52px] text-center tabular-nums"
                    />
                    <RPESelector
                      currentRPE={log.rpe}
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
                ) : (
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={log.reps ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "") {
                        onUpdateLog(setIdx, "reps", undefined);
                      } else {
                        const num = parseInt(val);
                        if (!isNaN(num) && num >= 0) onUpdateLog(setIdx, "reps", num);
                      }
                    }}
                    placeholder="0"
                    className="text-sm h-8"
                  />
                )}
              </div>

              <div className="flex items-center gap-1">
                {log.isPR && <Trophy className="h-3.5 w-3.5 text-yellow-500 animate-bounce" />}
                <Button
                  size="sm"
                  className="h-8 px-3"
                  variant={log.completed ? "secondary" : "default"}
                  disabled={log.completed || !canLogSet(log)}
                  onClick={() => onCompleteSet(setIdx)}
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
    </Card>
  );
};

export default ExerciseCard;
