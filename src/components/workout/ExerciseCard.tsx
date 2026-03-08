import { useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Check, Trophy, Plus, MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  onUpdateLog: (setIdx: number, field: string, value: unknown) => void;
  onCompleteSet: (setIdx: number) => void;
  onAddSet: () => void;
  onDeleteExercise?: () => void;
  onSwitchExercise?: () => void;
}

function getYouTubeId(url: string): string | null {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|shorts\/))([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

function displayWeight(weight: number | null | undefined): string {
  if (weight === 0 || weight === null || weight === undefined) return "BW";
  return `${weight}`;
}

const isBodyweight = (equipment: string | null | undefined): boolean => {
  if (!equipment) return false;
  const lower = equipment.toLowerCase();
  return lower === "bodyweight" || lower === "none" || lower === "body weight";
};

const ExerciseCard = ({
  name,
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
  onUpdateLog,
  onCompleteSet,
  onAddSet,
  onDeleteExercise,
  onSwitchExercise,
}: ExerciseCardProps) => {
  const allDone = logs.every(l => l.completed);
  const videoId = videoUrl ? getYouTubeId(videoUrl) : null;
  const isBW = isBodyweight(equipment);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

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
    // Weight can be 0 (bodyweight), only reps must be > 0
    const hasWeight = log.weight !== undefined && log.weight !== null && log.weight >= 0;
    const hasReps = !!log.reps && log.reps > 0;
    return hasWeight && hasReps;
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

        {allTimePR && (
          <p className="text-xs text-primary mt-1 flex items-center gap-1">
            <Trophy className="h-3 w-3" /> All-Time PR: {allTimePR.weight} lbs × {allTimePR.reps} reps
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
          <span className="text-[10px] font-medium text-muted-foreground uppercase">lbs</span>
          <span className="text-[10px] font-medium text-muted-foreground uppercase">Reps</span>
          <span className="w-14" />
        </div>

        {logs.map((log, setIdx) => {
          const prev = previousSets.find(p => p.set_number === log.setNumber);
          const prevLabel = prev && (prev.weight !== null && prev.weight !== undefined)
            ? `${prev.weight === 0 ? "BW" : prev.weight}×${prev.reps}${prev.rir != null ? ` @${prev.rir}` : ""}`
            : "—";

          return (
            <div
              key={setIdx}
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
                <Input
                  type="text"
                  inputMode="numeric"
                  value={log.weight !== undefined && log.weight !== null ? String(log.weight) : ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "" || val === "0") {
                      onUpdateLog(setIdx, "weight", val === "" ? undefined : 0);
                    } else {
                      const num = parseFloat(val);
                      if (!isNaN(num) && num >= 0) onUpdateLog(setIdx, "weight", num);
                    }
                  }}
                  placeholder={isBW ? "BW" : "0"}
                  className="text-sm h-8"
                  disabled={log.completed}
                />
                {isBW && (log.weight === 0 || log.weight === undefined) && !log.completed && (
                  <span className="absolute -bottom-3.5 left-0 text-[9px] text-muted-foreground">Bodyweight</span>
                )}
              </div>

              <Input
                type="number"
                value={log.reps ?? ""}
                onChange={(e) => onUpdateLog(setIdx, "reps", e.target.value ? parseInt(e.target.value) : undefined)}
                placeholder="0"
                className="text-sm h-8"
                disabled={log.completed}
              />

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
        })}

        {isBW && (
          <p className="text-[10px] text-muted-foreground mt-1">💡 Bodyweight exercise — use 0 lbs or add weight for resistance</p>
        )}

        <Button variant="ghost" size="sm" className="w-full text-xs mt-1" onClick={onAddSet}>
          <Plus className="h-3 w-3 mr-1" /> Add Set
        </Button>
      </CardContent>
    </Card>
  );
};

export default ExerciseCard;
