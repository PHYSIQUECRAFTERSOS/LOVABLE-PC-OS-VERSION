import { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Dumbbell, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import ExercisePreviewModal from "./ExercisePreviewModal";
import AddExerciseModal from "./AddExerciseModal";

const MUSCLE_GROUPS = [
  "All", "Chest", "Back", "Shoulders", "Biceps", "Triceps", "Forearms",
  "Quadriceps", "Hamstrings", "Glutes", "Calves", "Core", "Full Body",
];

const EQUIPMENT_OPTIONS = [
  "Barbell", "Dumbbell", "Cable", "Machine", "Bodyweight", "Bands",
  "Kettlebell", "Smith Machine", "EZ Bar", "Other",
];

function getYouTubeThumbnail(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([^?&/]+)/);
  return match ? `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg` : null;
}

const ExerciseLibrary = () => {
  const { user } = useAuth();
  const [exercises, setExercises] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [muscleFilter, setMuscleFilter] = useState("All");
  const [equipFilter, setEquipFilter] = useState("All");

  const [showAdd, setShowAdd] = useState(false);
  const [previewExercise, setPreviewExercise] = useState<any | null>(null);
  const [editExercise, setEditExercise] = useState<any | null>(null);

  const loadExercises = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("exercises")
      .select("id, name, primary_muscle, secondary_muscle, equipment, youtube_url, youtube_thumbnail, video_url, description, category, created_at, created_by")
      .order("created_at", { ascending: false })
      .order("name", { ascending: true });
    if (error) console.error("[ExerciseLibrary] Load error:", error);
    console.log("[ExerciseLibrary] Loaded", data?.length ?? 0, "exercises");
    setExercises(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadExercises(); }, [loadExercises]);

  const filtered = useMemo(() => {
    return exercises.filter(e => {
      if (searchQuery && !e.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (muscleFilter !== "All" && e.primary_muscle?.toLowerCase() !== muscleFilter.toLowerCase()) return false;
      if (equipFilter !== "All" && e.equipment?.toLowerCase() !== equipFilter.toLowerCase()) return false;
      return true;
    });
  }, [exercises, searchQuery, muscleFilter, equipFilter]);

  const handleEdit = (exercise: any) => {
    setPreviewExercise(null);
    setEditExercise(exercise);
    setShowAdd(true);
  };

  const handleExerciseCreated = useCallback(async (createdExercise?: any) => {
    if (createdExercise) {
      setExercises(prev => [createdExercise, ...prev.filter(ex => ex.id !== createdExercise.id)]);
    }
    await loadExercises();
  }, [loadExercises]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Exercise Library</h2>
          <p className="text-xs text-muted-foreground">{exercises.length} exercises</p>
        </div>
        <Button size="sm" onClick={() => { setEditExercise(null); setShowAdd(true); }}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Exercise
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Search exercises..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-8 h-9 text-sm" />
        </div>
        <Select value={muscleFilter} onValueChange={setMuscleFilter}>
          <SelectTrigger className="w-40 h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>{MUSCLE_GROUPS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={equipFilter} onValueChange={setEquipFilter}>
          <SelectTrigger className="w-40 h-9 text-sm"><SelectValue placeholder="Equipment" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Equipment</SelectItem>
            {EQUIPMENT_OPTIONS.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="aspect-[4/3] rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Dumbbell className="h-12 w-12 text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground">No exercises found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {filtered.map(ex => {
            const thumb = ex.youtube_thumbnail || getYouTubeThumbnail(ex.youtube_url);
            return (
              <Card
                key={ex.id}
                className="overflow-hidden group cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all"
                onClick={() => setPreviewExercise(ex)}
              >
                <div className="relative aspect-video bg-muted">
                  {thumb ? (
                    <img src={thumb} alt={ex.name} loading="lazy" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Dumbbell className="h-8 w-8 text-muted-foreground/30" />
                    </div>
                  )}
                  {(thumb || ex.video_url) && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Play className="h-8 w-8 text-white" />
                    </div>
                  )}
                </div>
                <CardContent className="p-2.5">
                  <p className="text-xs font-semibold truncate">{ex.name}</p>
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {ex.primary_muscle && <Badge variant="secondary" className="text-[9px] px-1 py-0">{ex.primary_muscle}</Badge>}
                    {ex.equipment && <Badge variant="outline" className="text-[9px] px-1 py-0">{ex.equipment}</Badge>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Preview Modal */}
      <ExercisePreviewModal
        exercise={previewExercise}
        open={!!previewExercise}
        onOpenChange={open => { if (!open) setPreviewExercise(null); }}
        onEdit={handleEdit}
      />

      {/* Add/Edit Modal */}
      <AddExerciseModal
        open={showAdd}
        onOpenChange={setShowAdd}
        onCreated={loadExercises}
        initialData={editExercise}
      />
    </div>
  );
};

export default ExerciseLibrary;
