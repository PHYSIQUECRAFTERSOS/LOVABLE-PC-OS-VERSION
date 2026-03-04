import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Check, Trophy, Play, Plus } from "lucide-react";
import { AspectRatio } from "@/components/ui/aspect-ratio";

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
  logs: SetLog[];
  previousSets: PreviousSet[];
  allTimePR: { weight: number; reps: number } | null;
  onUpdateLog: (setIdx: number, field: string, value: unknown) => void;
  onCompleteSet: (setIdx: number) => void;
  onAddSet: () => void;
}

function getYouTubeId(url: string): string | null {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|shorts\/))([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

const ExerciseCard = ({
  name,
  sets,
  reps,
  tempo,
  restSeconds,
  rir,
  notes,
  videoUrl,
  logs,
  previousSets,
  allTimePR,
  onUpdateLog,
  onCompleteSet,
  onAddSet,
}: ExerciseCardProps) => {
  const [showVideo, setShowVideo] = useState(false);
  const allDone = logs.every(l => l.completed);
  const videoId = videoUrl ? getYouTubeId(videoUrl) : null;

  return (
    <Card className={`transition-colors ${allDone ? "border-primary/30 bg-primary/5" : ""}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle
            className="text-base cursor-pointer hover:text-primary transition-colors flex items-center gap-2"
            onClick={() => videoId && setShowVideo(!showVideo)}
          >
            {name}
            {videoId && <Play className="h-3.5 w-3.5 text-muted-foreground" />}
          </CardTitle>
          {allDone && <Check className="h-5 w-5 text-primary" />}
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

      {showVideo && videoId && (
        <div className="px-4 pb-2">
          <AspectRatio ratio={16 / 9}>
            <iframe
              src={`https://www.youtube.com/embed/${videoId}?rel=0`}
              title={name}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="w-full h-full rounded-lg"
            />
          </AspectRatio>
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
          const prevLabel = prev && prev.weight ? `${prev.weight}×${prev.reps}${prev.rir != null ? ` @${prev.rir}` : ""}` : "—";

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

              <Input
                type="number"
                value={log.weight ?? ""}
                onChange={(e) => onUpdateLog(setIdx, "weight", e.target.value ? parseFloat(e.target.value) : undefined)}
                placeholder="0"
                className="text-sm h-8"
                disabled={log.completed}
              />

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
                  disabled={log.completed || !log.weight || !log.reps}
                  onClick={() => onCompleteSet(setIdx)}
                >
                  {log.completed ? <Check className="h-3.5 w-3.5" /> : "Log"}
                </Button>
              </div>
            </div>
          );
        })}

        <Button variant="ghost" size="sm" className="w-full text-xs mt-1" onClick={onAddSet}>
          <Plus className="h-3 w-3 mr-1" /> Add Set
        </Button>
      </CardContent>
    </Card>
  );
};

export default ExerciseCard;
