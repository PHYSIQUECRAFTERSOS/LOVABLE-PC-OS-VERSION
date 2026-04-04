import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Dumbbell, Loader2, Filter, Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AddCustomExerciseModal from "./AddCustomExerciseModal";

const MUSCLE_GROUPS = [
  "Chest", "Back", "Shoulders", "Biceps", "Triceps", "Forearms",
  "Quads", "Hamstrings", "Glutes", "Calves", "Abs", "Obliques",
  "Traps", "Lats", "Rear Delts",
];

interface Exercise {
  id: string;
  name: string;
  primary_muscle: string | null;
  equipment: string | null;
  youtube_thumbnail: string | null;
}

interface MobileExercisePickerSheetProps {
  open: boolean;
  onClose: () => void;
  onAdd: (exercises: Exercise[]) => void;
}

const MobileExercisePickerSheet = ({ open, onClose, onAdd }: MobileExercisePickerSheetProps) => {
  const { user } = useAuth();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMuscle, setFilterMuscle] = useState("all");
  const [showFilter, setShowFilter] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showCustom, setShowCustom] = useState(false);

  const loadLibrary = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("exercises")
      .select("id, name, primary_muscle, equipment, youtube_thumbnail")
      .order("name");
    setExercises((data as Exercise[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) {
      loadLibrary();
      setSelected(new Set());
      setSearchQuery("");
      setFilterMuscle("all");
    }
  }, [open, loadLibrary]);

  const filtered = exercises.filter((ex) => {
    const matchSearch = !searchQuery || (() => {
      const name = ex.name.toLowerCase();
      const tokens = searchQuery.toLowerCase().split(/\s+/).filter(Boolean);
      return tokens.every(token => name.includes(token));
    })();
    const matchMuscle = filterMuscle === "all" || ex.primary_muscle === filterMuscle;
    return matchSearch && matchMuscle;
  });

  const toggleExercise = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAdd = () => {
    const selectedExercises = exercises.filter(ex => selected.has(ex.id));
    onAdd(selectedExercises);
    onClose();
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-[65] bg-[hsl(var(--background))] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border safe-top">
          <button onClick={onClose} className="text-sm text-muted-foreground">Cancel</button>
          <span className="text-sm font-semibold text-foreground">Add Exercises</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowFilter(!showFilter)} className="p-1">
              <Filter className={`h-4 w-4 ${filterMuscle !== "all" ? "text-primary" : "text-muted-foreground"}`} />
            </button>
            <button
              onClick={handleAdd}
              disabled={selected.size === 0}
              className="text-sm font-semibold text-primary disabled:opacity-50"
            >
              Add{selected.size > 0 ? ` (${selected.size})` : ""}
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-4 py-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search exercises..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 bg-[hsl(var(--muted))] border-0"
              autoFocus
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>

        {/* Filter row */}
        {showFilter && (
          <div className="px-4 py-2 border-b border-border">
            <Select value={filterMuscle} onValueChange={setFilterMuscle}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Filter by muscle" />
              </SelectTrigger>
              <SelectContent className="z-[70]">
                <SelectItem value="all">All Muscles</SelectItem>
                {MUSCLE_GROUPS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Exercise list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">No exercises found</p>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map(ex => {
                const isSelected = selected.has(ex.id);
                return (
                  <button
                    key={ex.id}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${isSelected ? "bg-primary/10" : ""}`}
                    onClick={() => toggleExercise(ex.id)}
                  >
                    {/* Thumbnail */}
                    <div className="h-10 w-14 rounded-lg overflow-hidden bg-[hsl(var(--muted))] flex-shrink-0 flex items-center justify-center">
                      {ex.youtube_thumbnail ? (
                        <img src={ex.youtube_thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <Dumbbell className="h-4 w-4 text-muted-foreground/50" />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{ex.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {ex.primary_muscle && <span className="text-[10px] text-muted-foreground">{ex.primary_muscle}</span>}
                        {ex.equipment && <span className="text-[10px] text-muted-foreground">• {ex.equipment}</span>}
                      </div>
                    </div>

                    {/* Checkbox */}
                    <Checkbox checked={isSelected} className="shrink-0 pointer-events-none" />
                  </button>
                );
              })}
            </div>
          )}

          {/* Add custom exercise */}
          <button
            onClick={() => setShowCustom(true)}
            className="w-full flex items-center gap-3 px-4 py-4 text-left border-t border-border"
          >
            <div className="h-10 w-14 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Plus className="h-5 w-5 text-primary" />
            </div>
            <span className="text-sm font-medium text-primary">Add Custom Exercise</span>
          </button>
        </div>
      </div>

      {/* Custom exercise modal */}
      <AddCustomExerciseModal
        open={showCustom}
        onClose={() => setShowCustom(false)}
        userId={user?.id || ""}
        onExerciseCreated={(newEx) => {
          setExercises(prev => [...prev, {
            id: newEx.id, name: newEx.name,
            primary_muscle: newEx.primary_muscle, equipment: newEx.equipment,
            youtube_thumbnail: newEx.youtube_thumbnail,
          }]);
          setSelected(prev => new Set(prev).add(newEx.id));
          loadLibrary();
        }}
      />
    </>
  );
};

export default MobileExercisePickerSheet;
