/**
 * ClientProgramTwoPane — Trainerize-inspired two-pane training layout for the
 * coach-side client profile. Left: phase list. Right: workout cards for the
 * selected phase with thumbnails, est. duration, exercise count, and drag-to-reorder.
 *
 * Reuses Master Libraries' SortableWorkoutCard, workoutMeta, and copyPhase helpers.
 * All mutations come from the parent TrainingTab via callbacks — this component
 * is purely presentational + handles selection + drag persistence.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

import { Plus, Download, Search, Dumbbell, ChevronRight, Link2, Unlink } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchWorkoutMeta, type WorkoutMeta } from "@/lib/workoutMeta";
import SortableWorkoutCard from "@/components/training/SortableWorkoutCard";
import PhaseActionsMenu from "./PhaseActionsMenu";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { derivePhaseDates, deriveProgramRange, formatPhaseDateRange, formatDaysLeft } from "@/lib/phaseDates";

interface ProgramWorkout {
  id: string;
  workout_id: string;
  workout_name: string;
  day_of_week: number;
  day_label: string;
  sort_order?: number | null;
  exclude_from_numbering?: boolean;
  custom_tag?: string | null;
}

interface Phase {
  id: string;
  name: string;
  description: string | null;
  phase_order: number;
  duration_weeks: number;
  training_style: string | null;
  intensity_system: string | null;
  progression_rule: string | null;
  directWorkouts: ProgramWorkout[];
}

interface Props {
  programName: string;
  programGoalType?: string | null;
  programStartDate?: string | null;
  programEndDate?: string | null;
  isLinkedToMaster: boolean;
  currentPhaseId?: string | null;
  currentWeekNumber?: number;
  phases: Phase[];
  loading: boolean;
  /** Mutations supplied by parent. */
  onNewWorkout: (phaseId: string) => void;
  onImport: (phaseId: string) => void;
  onOpenWorkout: (pw: ProgramWorkout) => void;
  onEditWorkout: (pw: ProgramWorkout) => void;
  onDuplicateWorkout: (pw: ProgramWorkout, phaseId: string) => void;
  onDeleteWorkout: (pwId: string, name: string) => void;
  onAddPhase: () => void;
  onRenamePhase: (phaseId: string, newName: string) => Promise<void> | void;
  onChangeDuration: (phaseId: string, weeks: number) => Promise<void> | void;
  onDuplicatePhase: (phase: Phase) => void;
  onDeletePhase: (phase: Phase) => void;
  onCopyPhaseToMaster: (phase: Phase) => void;
  onCopyPhaseToClient: (phase: Phase) => void;
  onAICreatePhase?: (phase: Phase) => void;
  onChangeProgram: () => void;
  onDetach?: () => void;
}

export const ClientProgramTwoPane = ({
  programName, programGoalType, programStartDate, programEndDate,
  isLinkedToMaster, currentPhaseId, currentWeekNumber,
  phases, loading,
  onNewWorkout, onImport, onOpenWorkout, onEditWorkout, onDuplicateWorkout, onDeleteWorkout,
  onAddPhase, onRenamePhase, onChangeDuration, onDuplicatePhase, onDeletePhase,
  onCopyPhaseToMaster, onCopyPhaseToClient, onAICreatePhase, onChangeProgram, onDetach,
}: Props) => {
  const { toast } = useToast();
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"position" | "name">("position");
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 8;
  const [meta, setMeta] = useState<Record<string, WorkoutMeta>>({});
  const [renamingPhase, setRenamingPhase] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [localWorkouts, setLocalWorkouts] = useState<Record<string, ProgramWorkout[]>>({});
  const dragInFlightRef = useRef(false);

  // Default-select active or first phase whenever phase list changes.
  // Keep the user's selection sticky across refetches: if phases is briefly
  // empty during a reload, do nothing so we don't snap back to the current phase.
  useEffect(() => {
    if (!phases.length) return;
    if (selectedPhaseId && phases.some(p => p.id === selectedPhaseId)) return;
    setSelectedPhaseId(currentPhaseId && phases.some(p => p.id === currentPhaseId)
      ? currentPhaseId
      : phases[0].id);
  }, [phases, currentPhaseId, selectedPhaseId]);

  // Sync local workouts with incoming phases (used for optimistic drag updates).
  useEffect(() => {
    const map: Record<string, ProgramWorkout[]> = {};
    for (const p of phases) {
      map[p.id] = [...p.directWorkouts].sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999));
    }
    setLocalWorkouts(map);
  }, [phases]);

  // Batch-fetch meta for all visible workouts.
  useEffect(() => {
    const ids = phases.flatMap(p => p.directWorkouts.map(w => w.workout_id));
    if (ids.length === 0) return;
    fetchWorkoutMeta(ids).then(setMeta).catch(() => { /* non-fatal */ });
  }, [phases]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const selectedPhase = phases.find(p => p.id === selectedPhaseId) || null;
  const selectedPhaseWorkouts = selectedPhase ? (localWorkouts[selectedPhase.id] || []) : [];

  // Derived phase dates (State B: computed from program.start_date + duration_weeks).
  const dateMap = useMemo(
    () => derivePhaseDates(programStartDate || null, phases),
    [programStartDate, phases],
  );
  const programRange = useMemo(
    () => deriveProgramRange(programStartDate || null, programEndDate || null, dateMap),
    [programStartDate, programEndDate, dateMap],
  );

  const filteredWorkouts = useMemo(() => {
    let list = [...selectedPhaseWorkouts];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(w => w.workout_name.toLowerCase().includes(q));
    }
    if (sortBy === "name") {
      list.sort((a, b) => a.workout_name.localeCompare(b.workout_name));
    }
    return list;
  }, [selectedPhaseWorkouts, search, sortBy]);

  // Reset to page 1 whenever the phase, search, or sort changes.
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedPhaseId, search, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredWorkouts.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pagedWorkouts = filteredWorkouts.slice(pageStart, pageStart + PAGE_SIZE);
  // Drag-to-reorder must operate on the FULL phase order, not just the visible page.
  // Disable drag whenever pagination, search, or non-position sort would make indices ambiguous.
  const dragDisabled = sortBy !== "position" || !!search.trim() || totalPages > 1;

  const handleDragEnd = async (e: DragEndEvent) => {
    if (!selectedPhase || dragInFlightRef.current) return;
    const { active, over } = e;
    if (!over || active.id === over.id) return;

    const list = [...selectedPhaseWorkouts];
    const oldIdx = list.findIndex(w => w.id === active.id);
    const newIdx = list.findIndex(w => w.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;

    const reordered = arrayMove(list, oldIdx, newIdx).map((w, i) => ({ ...w, sort_order: i }));
    // Optimistic
    setLocalWorkouts(prev => ({ ...prev, [selectedPhase.id]: reordered }));

    dragInFlightRef.current = true;
    try {
      await Promise.all(
        reordered.map(w => supabase.from("program_workouts").update({ sort_order: w.sort_order }).eq("id", w.id))
      );
    } catch (err: any) {
      toast({ title: "Failed to save new order", description: err?.message || "Please try again.", variant: "destructive" });
      // Revert
      setLocalWorkouts(prev => ({ ...prev, [selectedPhase.id]: list }));
    } finally {
      dragInFlightRef.current = false;
    }
  };

  if (loading && phases.length === 0) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-4">
        <Skeleton className="h-64 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Program header (above the two panes) */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-semibold text-foreground text-base truncate">{programName}</h3>
              {programRange.start && programRange.end && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatPhaseDateRange(programRange.start, programRange.end)}
                </p>
              )}
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {programGoalType && <Badge variant="secondary" className="text-[10px]">{programGoalType}</Badge>}
                <span className="text-xs text-muted-foreground">
                  Week {currentWeekNumber || 1} · {phases.length} phase{phases.length !== 1 ? "s" : ""}
                </span>
                {isLinkedToMaster ? (
                  <Badge className="text-[10px] gap-1 bg-primary/20 text-primary"><Link2 className="h-2.5 w-2.5" /> Linked to Master</Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] gap-1"><Unlink className="h-2.5 w-2.5" /> Detached</Badge>
                )}
              </div>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              {isLinkedToMaster && onDetach && (
                <Button variant="outline" size="sm" onClick={onDetach}>
                  <Unlink className="h-3.5 w-3.5 mr-1" /> Detach & Edit
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={onChangeProgram}>Change</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Two-pane grid */}
      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4">
        {/* LEFT: Phases list */}
        <div className="space-y-2">
          {/* Mobile: horizontal pill bar */}
          <div className="md:hidden -mx-1 overflow-x-auto pb-1">
            <div className="flex gap-2 px-1">
              {phases.map(p => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPhaseId(p.id)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-colors",
                    selectedPhaseId === p.id
                      ? "bg-primary/15 text-primary border-primary/40"
                      : "bg-card text-muted-foreground border-border hover:bg-muted/50"
                  )}
                >
                  {p.name}
                </button>
              ))}
              <button
                onClick={onAddPhase}
                className="px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border border-dashed border-border text-muted-foreground hover:text-foreground"
              >
                <Plus className="h-3 w-3 inline mr-1" />Add
              </button>
            </div>
          </div>

          {/* Desktop: vertical list */}
          <Card className="hidden md:block">
            <CardContent className="p-2">
              <div className="space-y-1">
                {phases.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-6">No phases yet.</p>
                )}
                {phases.map(p => {
                  const isSelected = selectedPhaseId === p.id;
                  const dd = dateMap[p.id];
                  const isCurrent = (dd?.isCurrent) || currentPhaseId === p.id;
                  const isUpcoming = !!dd?.isUpcoming;
                  const isCompleted = !!dd?.isCompleted;
                  const totalWorkouts = p.directWorkouts.length;
                  const dateRange = formatPhaseDateRange(dd?.start_date, dd?.end_date);
                  return (
                    <div
                      key={p.id}
                      onClick={() => setSelectedPhaseId(p.id)}
                      className={cn(
                        "group relative rounded-md px-3 py-2 cursor-pointer transition-colors border-l-2",
                        isSelected
                          ? "bg-primary/10 border-primary"
                          : isCurrent
                            ? "border-primary/70 hover:bg-muted/40"
                            : "border-transparent hover:bg-muted/40",
                        isCompleted && "opacity-60"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          {renamingPhase === p.id ? (
                            <Input
                              autoFocus
                              value={renameValue}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onBlur={async () => {
                                if (renameValue.trim() && renameValue.trim() !== p.name) {
                                  await onRenamePhase(p.id, renameValue.trim());
                                }
                                setRenamingPhase(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                if (e.key === "Escape") setRenamingPhase(null);
                              }}
                              className="h-6 text-sm"
                            />
                          ) : (
                            <div className="flex items-center gap-1.5 min-w-0">
                              <p className={cn("text-sm font-medium truncate", isSelected ? "text-foreground" : "text-foreground/90")}>
                                {p.name}
                              </p>
                              {isCurrent && <Badge className="text-[9px] h-4 px-1.5 flex-shrink-0">Current</Badge>}
                            </div>
                          )}
                          {dateRange && (
                            <p
                              className={cn(
                                "text-[10px] mt-0.5 truncate",
                                isCurrent
                                  ? "text-primary font-medium"
                                  : isUpcoming
                                    ? "text-muted-foreground/70"
                                    : "text-muted-foreground"
                              )}
                            >
                              {dateRange}
                              {isCurrent && dd?.daysLeft !== null && (
                                <span className="ml-1.5 text-primary/90">· {formatDaysLeft(dd!.daysLeft)}</span>
                              )}
                            </p>
                          )}
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] text-muted-foreground">
                              {p.duration_weeks}w · {totalWorkouts} workout{totalWorkouts !== 1 ? "s" : ""}
                            </span>
                          </div>
                        </div>
                        <PhaseActionsMenu
                          onRename={() => { setRenameValue(p.name); setRenamingPhase(p.id); }}
                          onChangeDuration={() => onChangeDuration(p.id, p.duration_weeks) as any}
                          onDuplicate={() => onDuplicatePhase(p)}
                          onDelete={() => onDeletePhase(p)}
                          onCopyToMaster={() => onCopyPhaseToMaster(p)}
                          onCopyToClient={() => onCopyPhaseToClient(p)}
                          onAICreate={onAICreatePhase ? () => onAICreatePhase(p) : undefined}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <Button variant="ghost" size="sm" className="w-full mt-2 text-xs h-8" onClick={onAddPhase}>
                <Plus className="h-3 w-3 mr-1" /> Add Phase
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT: Workouts for selected phase */}
        <Card>
          <CardContent className="p-4 space-y-3">
            {!selectedPhase ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                Select a phase to view its workouts.
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <h4 className="font-semibold text-foreground text-base truncate flex items-center gap-1.5">
                      {selectedPhase.name}
                      <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                      <span className="text-sm text-muted-foreground font-normal">
                        {selectedPhase.duration_weeks}w · {selectedPhaseWorkouts.length} workout{selectedPhaseWorkouts.length !== 1 ? "s" : ""}
                      </span>
                    </h4>
                    {selectedPhase.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{selectedPhase.description}</p>
                    )}
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => onNewWorkout(selectedPhase.id)}>
                      <Plus className="h-3 w-3 mr-1" /> New
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => onImport(selectedPhase.id)}>
                      <Download className="h-3 w-3 mr-1" /> Import
                    </Button>
                  </div>
                </div>

                {/* Search + sort */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search workouts in this phase…"
                      className="h-8 pl-8 text-xs"
                    />
                  </div>
                  <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
                    <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="position">By position</SelectItem>
                      <SelectItem value="name">By name</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Workout list (paginated, 8 per page) */}
                <div className="-mx-1">
                  <div className="px-1 space-y-2">
                    {filteredWorkouts.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <Dumbbell className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                        <p className="text-sm">
                          {search.trim() ? "No workouts match your search." : "No workouts in this phase yet."}
                        </p>
                        {!search.trim() && (
                          <Button size="sm" variant="outline" className="mt-3 h-8 text-xs" onClick={() => onNewWorkout(selectedPhase.id)}>
                            <Plus className="h-3 w-3 mr-1" /> Create your first workout
                          </Button>
                        )}
                      </div>
                    ) : (
                      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <SortableContext
                          items={pagedWorkouts.map(w => w.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          {(() => {
                            // Continue position numbering across pages so Day numbers stay correct.
                            let dayCounter = 1;
                            // Pre-walk all filtered workouts to establish numbering, then slice.
                            const numbered = filteredWorkouts.map(pw => {
                              const isExcluded = pw.exclude_from_numbering;
                              const pos = isExcluded ? null : (sortBy === "position" ? dayCounter++ : null);
                              return { pw, pos, isExcluded };
                            }).slice(pageStart, pageStart + PAGE_SIZE);

                            return numbered.map(({ pw, pos, isExcluded }) => (
                              <SortableWorkoutCard
                                key={pw.id}
                                dndId={pw.id}
                                workoutId={pw.workout_id}
                                workoutName={pw.workout_name}
                                displayPosition={pos}
                                customTag={isExcluded ? pw.custom_tag : null}
                                meta={meta[pw.workout_id]}
                                dragDisabled={dragDisabled}
                                onPrimaryClick={() => onOpenWorkout(pw)}
                                onEdit={() => onEditWorkout(pw)}
                                onDuplicate={() => onDuplicateWorkout(pw, selectedPhase.id)}
                                onDelete={() => onDeleteWorkout(pw.id, pw.workout_name)}
                              />
                            ));
                          })()}
                        </SortableContext>
                      </DndContext>
                    )}
                  </div>
                </div>

                {/* Pagination controls */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/40">
                    <span className="text-xs text-muted-foreground">
                      Showing {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filteredWorkouts.length)} of {filteredWorkouts.length}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-2 text-xs"
                        disabled={safePage === 1}
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      >
                        Prev
                      </Button>
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
                        <Button
                          key={n}
                          size="sm"
                          variant={n === safePage ? "default" : "outline"}
                          className={cn("h-8 w-8 p-0 text-xs", n === safePage && "bg-primary text-primary-foreground")}
                          onClick={() => setCurrentPage(n)}
                        >
                          {n}
                        </Button>
                      ))}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-2 text-xs"
                        disabled={safePage === totalPages}
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ClientProgramTwoPane;
