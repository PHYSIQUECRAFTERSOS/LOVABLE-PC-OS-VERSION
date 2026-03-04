import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, Dumbbell, Loader2, Play } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

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
  const { toast } = useToast();
  const [exercises, setExercises] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [muscleFilter, setMuscleFilter] = useState("All");
  const [equipFilter, setEquipFilter] = useState("All");

  // Add exercise modal
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "", primary_muscle: "", secondary_muscle: "", equipment: "",
    youtube_url: "", instructions: "",
  });

  const loadExercises = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("exercises")
      .select("id, name, primary_muscle, secondary_muscle, equipment, youtube_url, youtube_thumbnail, description, created_at")
      .order("name");
    setExercises(data || []);
    setLoading(false);
  };

  useEffect(() => { loadExercises(); }, []);

  const filtered = useMemo(() => {
    return exercises.filter(e => {
      if (searchQuery && !e.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (muscleFilter !== "All" && e.primary_muscle?.toLowerCase() !== muscleFilter.toLowerCase()) return false;
      if (equipFilter !== "All" && e.equipment?.toLowerCase() !== equipFilter.toLowerCase()) return false;
      return true;
    });
  }, [exercises, searchQuery, muscleFilter, equipFilter]);

  const handleSave = async () => {
    if (!user || !form.name.trim()) return;
    setSaving(true);
    try {
      // Check duplicate
      const { data: existing } = await supabase
        .from("exercises")
        .select("id, name")
        .ilike("name", form.name.trim())
        .limit(1);

      if (existing && existing.length > 0) {
        const useit = confirm(`"${existing[0].name}" already exists. Use existing exercise?`);
        if (useit) {
          setShowAdd(false);
          setSaving(false);
          return;
        }
      }

      const thumbnail = getYouTubeThumbnail(form.youtube_url);

      const { error } = await supabase.from("exercises").insert({
        name: form.name.trim(),
        primary_muscle: form.primary_muscle || null,
        secondary_muscle: form.secondary_muscle || null,
        equipment: form.equipment || null,
        youtube_url: form.youtube_url || null,
        youtube_thumbnail: thumbnail,
        description: form.instructions || null,
        category: form.primary_muscle || "General",
        created_by: user.id,
      });
      if (error) throw error;

      toast({ title: "Exercise created" });
      setShowAdd(false);
      setForm({ name: "", primary_muscle: "", secondary_muscle: "", equipment: "", youtube_url: "", instructions: "" });
      loadExercises();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const previewThumb = getYouTubeThumbnail(form.youtube_url);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Exercise Library</h2>
          <p className="text-xs text-muted-foreground">{exercises.length} exercises</p>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
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
              <Card key={ex.id} className="overflow-hidden group cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all">
                <div className="relative aspect-video bg-muted">
                  {thumb ? (
                    <img src={thumb} alt={ex.name} loading="lazy" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Dumbbell className="h-8 w-8 text-muted-foreground/30" />
                    </div>
                  )}
                  {thumb && (
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

      {/* Add Exercise Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Exercise</DialogTitle>
            <DialogDescription>Create a new exercise for your library.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Exercise Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Flat Barbell Bench Press" className="h-9 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Primary Muscle</Label>
                <Select value={form.primary_muscle} onValueChange={v => setForm(f => ({ ...f, primary_muscle: v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>{MUSCLE_GROUPS.filter(m => m !== "All").map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Secondary Muscle</Label>
                <Select value={form.secondary_muscle} onValueChange={v => setForm(f => ({ ...f, secondary_muscle: v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>{MUSCLE_GROUPS.filter(m => m !== "All").map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Equipment</Label>
              <Select value={form.equipment} onValueChange={v => setForm(f => ({ ...f, equipment: v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>{EQUIPMENT_OPTIONS.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">YouTube Link</Label>
              <Input value={form.youtube_url} onChange={e => setForm(f => ({ ...f, youtube_url: e.target.value }))} placeholder="https://youtube.com/watch?v=..." className="h-9 text-sm" />
              {previewThumb && (
                <img src={previewThumb} alt="Preview" className="w-full aspect-video object-cover rounded-md mt-1" />
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Instructions</Label>
              <Textarea value={form.instructions} onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))} placeholder="Exercise description for clients..." className="h-20 text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !form.name.trim()}>
              {saving && <Loader2 className="animate-spin mr-1.5 h-3.5 w-3.5" />}
              Save Exercise
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ExerciseLibrary;
