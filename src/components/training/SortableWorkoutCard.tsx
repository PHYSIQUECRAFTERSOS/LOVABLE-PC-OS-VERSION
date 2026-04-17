/**
 * SortableWorkoutCard — shared workout list-item used by both
 * Master Libraries' ProgramDetailView and the client-profile two-pane layout.
 *
 * Lifted from ProgramDetailView and parameterized via callback props so each
 * surface can wire its own edit / preview / delete / copy mutations.
 */
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dumbbell, MoreHorizontal, Pencil, Trash2, Copy, GripVertical, Clock, Play, Users, Library, CalendarPlus,
} from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { WorkoutMeta } from "@/lib/workoutMeta";

export interface SortableWorkoutCardProps {
  /** Stable DnD id (use program_workouts.id when available). */
  dndId: string;
  /** workout_id (the actual workout record). */
  workoutId: string;
  workoutName: string;
  /** "Day N" position number after numbering rules; null when excluded. */
  displayPosition: number | null;
  /** Custom tag shown when displayPosition is null. */
  customTag?: string | null;
  /** Optional secondary description line (truncated). */
  summary?: string | null;
  meta: WorkoutMeta | undefined;

  /** Toggle handler for "Custom Tag" inline UI. Pass undefined to hide. */
  onToggleCustomTag?: (exclude: boolean, tag: string | null) => void;
  initialExcludeFromNumbering?: boolean;

  /** Selection (multi-select) */
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelected?: () => void;

  /** Action callbacks. Anything left undefined hides that menu item. */
  onPrimaryClick?: () => void;
  onEdit?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onSchedule?: () => void;
  onCopyToClient?: () => void;
  onCopyToMaster?: () => void;
  onMoveToPhase?: () => void;
  /** Disable drag listener (when card is read-only). */
  dragDisabled?: boolean;
}

export const SortableWorkoutCard = ({
  dndId, workoutId: _workoutId, workoutName, displayPosition, customTag, summary, meta,
  onToggleCustomTag, initialExcludeFromNumbering,
  selectionMode, selected, onToggleSelected,
  onPrimaryClick, onEdit, onDuplicate, onDelete, onSchedule, onCopyToClient, onCopyToMaster, onMoveToPhase,
  dragDisabled,
}: SortableWorkoutCardProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: dndId, disabled: dragDisabled });
  const [tagInput, setTagInput] = useState(customTag || "");
  const [showTagInput, setShowTagInput] = useState(initialExcludeFromNumbering || false);
  const [tagError, setTagError] = useState("");

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  const handleToggleCustomTag = (checked: boolean) => {
    setShowTagInput(checked);
    if (!checked) {
      setTagInput("");
      setTagError("");
      onToggleCustomTag?.(false, null);
    }
  };

  const handleTagBlur = () => {
    const trimmed = tagInput.trim();
    if (showTagInput && !trimmed) {
      setTagError("Please enter a tag name");
      return;
    }
    setTagError("");
    if (showTagInput) onToggleCustomTag?.(true, trimmed);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex flex-col gap-2 p-3 border rounded-lg bg-card group hover:ring-1 hover:ring-primary/30 transition-all"
    >
      <div className="flex items-start gap-3">
        {/* Drag handle */}
        {!dragDisabled && (
          <div {...attributes} {...listeners} className="touch-none flex-shrink-0">
            <GripVertical className="h-4 w-4 text-muted-foreground/40 cursor-grab active:cursor-grabbing mt-1" />
          </div>
        )}

        {/* Multi-select checkbox */}
        {selectionMode && (
          <Checkbox
            checked={!!selected}
            onCheckedChange={onToggleSelected}
            className="mt-1 flex-shrink-0"
            onClick={(e) => e.stopPropagation()}
          />
        )}

        {/* Thumbnail */}
        <div className="w-20 h-14 rounded-md overflow-hidden bg-muted flex-shrink-0">
          {meta?.thumbnailUrl ? (
            <div className="relative w-full h-full group/thumb">
              <img
                src={meta.thumbnailUrl}
                alt=""
                loading="lazy"
                className="w-full h-full object-cover"
                onError={(e) => {
                  // Hide broken thumbnail gracefully → fall back to placeholder.
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                  const sibling = (e.currentTarget.nextElementSibling as HTMLElement | null);
                  if (sibling) sibling.style.display = "flex";
                }}
              />
              <div
                className="absolute inset-0 hidden items-center justify-center bg-muted"
                aria-hidden="true"
              >
                <Dumbbell className="h-5 w-5 text-muted-foreground/30" />
              </div>
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover/thumb:opacity-100 transition-opacity pointer-events-none">
                <Play className="h-5 w-5 text-white" />
              </div>
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Dumbbell className="h-5 w-5 text-muted-foreground/30" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            {customTag ? (
              <Badge className="text-[10px] px-1.5 bg-slate-600/30 text-slate-300 border-slate-500/30">
                {customTag}
              </Badge>
            ) : displayPosition != null ? (
              <Badge variant="secondary" className="text-[10px] px-1.5">
                Day {displayPosition}
              </Badge>
            ) : null}
          </div>
          <button
            className="text-sm font-semibold truncate text-left hover:text-primary transition-colors block w-full"
            onClick={onPrimaryClick}
          >
            {workoutName}
          </button>
          <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
            {meta && meta.exerciseCount > 0 && (
              <>
                <span className="flex items-center gap-1">
                  <Dumbbell className="h-3 w-3" />
                  {meta.exerciseCount} exercise{meta.exerciseCount !== 1 ? "s" : ""}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Est. {meta.estimatedMinutes} min
                </span>
              </>
            )}
          </div>
          {summary && (
            <p className="mt-1 text-[11px] text-muted-foreground/80 truncate">{summary}</p>
          )}
        </div>

        {/* Right-side actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {onSchedule && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 opacity-60 group-hover:opacity-100 transition-opacity"
              onClick={onSchedule}
              title="Schedule"
            >
              <CalendarPlus className="h-3.5 w-3.5" />
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="h-7 w-7 opacity-60 group-hover:opacity-100 transition-opacity">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onEdit && (
                <DropdownMenuItem onClick={onEdit}><Pencil className="h-3 w-3 mr-2" /> Edit</DropdownMenuItem>
              )}
              {onDuplicate && (
                <DropdownMenuItem onClick={onDuplicate}><Copy className="h-3 w-3 mr-2" /> Duplicate</DropdownMenuItem>
              )}
              {onMoveToPhase && (
                <DropdownMenuItem onClick={onMoveToPhase}><GripVertical className="h-3 w-3 mr-2" /> Move to phase…</DropdownMenuItem>
              )}
              {onCopyToClient && (
                <DropdownMenuItem onClick={onCopyToClient}><Users className="h-3 w-3 mr-2" /> Copy to client…</DropdownMenuItem>
              )}
              {onCopyToMaster && (
                <DropdownMenuItem onClick={onCopyToMaster}><Library className="h-3 w-3 mr-2" /> Copy to master…</DropdownMenuItem>
              )}
              {onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive" onClick={onDelete}>
                    <Trash2 className="h-3 w-3 mr-2" /> Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Custom Tag Toggle (only if onToggleCustomTag wired) */}
      {onToggleCustomTag && (
        <div className="flex items-center gap-2 pl-7">
          <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-muted-foreground">
            <input
              type="checkbox"
              checked={showTagInput}
              onChange={(e) => handleToggleCustomTag(e.target.checked)}
              className="h-3 w-3 rounded border-muted-foreground/30"
            />
            Custom Tag
          </label>
          {showTagInput && (
            <div className="flex items-center gap-1.5 flex-1">
              <Input
                value={tagInput}
                onChange={(e) => {
                  const val = e.target.value.slice(0, 20);
                  setTagInput(val);
                  if (val.trim()) setTagError("");
                }}
                onBlur={handleTagBlur}
                placeholder="e.g. Core, Bonus, Daily"
                className="h-6 text-[11px] max-w-[160px]"
              />
              <span className="text-[9px] text-muted-foreground shrink-0">{tagInput.length}/20</span>
              {tagError && <span className="text-[9px] text-destructive shrink-0">{tagError}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SortableWorkoutCard;
