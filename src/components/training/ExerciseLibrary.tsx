import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus, Search, Dumbbell, Play, Pencil, Trash2, Upload, Link, X, Loader2, Video,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const MUSCLE_GROUPS = [
  "Chest", "Back", "Shoulders", "Biceps", "Triceps", "Forearms",
  "Quads", "Hamstrings", "Glutes", "Calves", "Abs", "Obliques",
  "Traps", "Lats", "Rear Delts", "Hip Flexors", "Adductors", "Abductors",
];

const EQUIPMENT = [
  "Barbell", "Dumbbell", "Cable", "Machine", "Bodyweight", "Kettlebell",
  "Resistance Band", "Smith Machine", "EZ Bar", "Trap Bar", "Landmine",
  "Suspension Trainer", "Medicine Ball", "Other",
];

const MOVEMENT_PATTERNS = [
  "Push", "Pull", "Hinge", "Squat", "Lunge", "Carry", "Rotation", "Isolation",
];

interface Exercise {
  id: string;
  name: string;
  category: string;
  description: string | null;
  video_url: string | null;
  youtube_url: string | null;
  youtube_thumbnail: string | null;
  primary_muscle: string | null;
  secondary_muscle: string | null;
  equipment: string | null;
  movement_pattern: string | null;
  coaching_cues: string | null;
  tags: string[];
  created_by: string | null;
}

interface ExerciseLibraryProps {
  onSelectExercise?: (exercise: Exercise) => void;
  selectionMode?: boolean;
}

const getYouTubeThumbnail = (url: string): string | null => {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  return match ? `https://img.youtube.com/vi/${match[1]}/mqdefault.jpg` : null;
};

const getYouTubeEmbedUrl = (url: string): string | null => {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  return match ? `https://www.youtube.com/embed/${match[1]}` : null;
};

const ExerciseLibrary = ({ onSelectExercise, selectionMode = false }: ExerciseLibraryProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMuscle, setFilterMuscle] = useState<string>("all");
  const [filterEquipment, setFilterEquipment] = useState<string>("all");
  const [filterPattern, setFilterPattern] = useState<string>("all");
  const [showForm, setShowForm] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
  const [saving, setSaving] = useState(false);
  const [viewExercise, setViewExercise] = useState<Exercise | null>(null);
  const [uploading, setUploading] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formPrimaryMuscle, setFormPrimaryMuscle] = useState("");
  const [formSecondaryMuscle, setFormSecondaryMuscle] = useState("");
  const [formEquipment, setFormEquipment] = useState("");
  const [formMovementPattern, setFormMovementPattern] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formCoachingCues, setFormCoachingCues] = useState("");
  const [formVideoUrl, setFormVideoUrl] = useState("");
  const [formYoutubeUrl, setFormYoutubeUrl] = useState("");
  const [formTags, setFormTags] = useState("");

  const loadExercises = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("exercises")
      .select("*")
      .order("name");
    if (!error) setExercises((data as Exercise[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadExercises();
  }, [loadExercises]);

  const filtered = exercises.filter((ex) => {
    const matchSearch = !searchQuery ||
      ex.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ex.tags?.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchMuscle = filterMuscle === "all" || ex.primary_muscle === filterMuscle || ex.secondary_muscle === filterMuscle;
    const matchEquip = filterEquipment === "all" || ex.equipment === filterEquipment;
    const matchPattern = filterPattern === "all" || ex.movement_pattern === filterPattern;
    return matchSearch && matchMuscle && matchEquip && matchPattern;
  });

  const resetForm = () => {
    setFormName(""); setFormCategory(""); setFormPrimaryMuscle(""); setFormSecondaryMuscle("");
    setFormEquipment(""); setFormMovementPattern(""); setFormDescription(""); setFormCoachingCues("");
    setFormVideoUrl(""); setFormYoutubeUrl(""); setFormTags("");
    setEditingExercise(null);
  };

  const openEditForm = (ex: Exercise) => {
    setFormName(ex.name);
    setFormCategory(ex.category);
    setFormPrimaryMuscle(ex.primary_muscle || "");
    setFormSecondaryMuscle(ex.secondary_muscle || "");
    setFormEquipment(ex.equipment || "");
    setFormMovementPattern(ex.movement_pattern || "");
    setFormDescription(ex.description || "");
    setFormCoachingCues(ex.coaching_cues || "");
    setFormVideoUrl(ex.video_url || "");
    setFormYoutubeUrl(ex.youtube_url || "");
    setFormTags(ex.tags?.join(", ") || "");
    setEditingExercise(ex);
    setShowForm(true);
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    const path = `${user.id}/${Date.now()}_${file.name}`;
    const { error } = await supabase.storage.from("exercise-videos").upload(path, file);
    if (error) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    } else {
      const { data: urlData } = supabase.storage.from("exercise-videos").getPublicUrl(path);
      setFormVideoUrl(urlData.publicUrl);
      toast({ title: "Video uploaded" });
    }
    setUploading(false);
  };

  const [ytImporting, setYtImporting] = useState(false);
  const [ytPreview, setYtPreview] = useState<{ thumbnail: string; title?: string } | null>(null);

  const extractVideoId = (url: string): string | null => {
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : null;
  };

  const handleYoutubeImport = async () => {
    if (!formYoutubeUrl) return;

    const videoId = extractVideoId(formYoutubeUrl);
    if (!videoId) {
      toast({ title: "Invalid YouTube URL", description: "Please paste a valid youtube.com or youtu.be link.", variant: "destructive" });
      return;
    }

    // Instant thumbnail preview — no network needed
    const thumbUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    setYtPreview({ thumbnail: thumbUrl });
    setYtImporting(true);

    // Attempt oEmbed metadata fetch with 4s hard timeout
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
      const result = await Promise.race([
        fetch(oembedUrl).then(r => r.ok ? r.json() : null),
        new Promise<null>((_, reject) => setTimeout(() => reject(new Error("timeout")), 4000)),
      ]);

      if (result?.title) {
        setYtPreview({ thumbnail: thumbUrl, title: result.title });
        // Auto-fill exercise name if empty
        if (!formName) setFormName(result.title);
        toast({ title: "YouTube video imported", description: result.title });
      } else {
        toast({ title: "YouTube link imported", description: "Metadata unavailable — thumbnail loaded." });
      }
    } catch {
      // Timeout or network error — still have thumbnail, that's fine
      toast({ title: "YouTube link imported", description: "Couldn't fetch title — thumbnail loaded." });
    } finally {
      setYtImporting(false);
    }
  };

  const [saveSuccess, setSaveSuccess] = useState(false);

  const saveExercise = async () => {
    if (!user || !formName || !formCategory) {
      toast({ title: "Name and category are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    setSaveSuccess(false);
    const startTime = performance.now();
    console.log("[ExerciseLibrary] Save started at", new Date().toISOString());

    const tags = formTags.split(",").map(t => t.trim()).filter(Boolean);
    // Extract thumbnail client-side only — no API call
    const thumbnail = formYoutubeUrl ? getYouTubeThumbnail(formYoutubeUrl) : null;

    const payload = {
      name: formName,
      category: formCategory,
      primary_muscle: formPrimaryMuscle || null,
      secondary_muscle: formSecondaryMuscle || null,
      equipment: formEquipment || null,
      movement_pattern: formMovementPattern || null,
      description: formDescription || null,
      coaching_cues: formCoachingCues || null,
      video_url: formVideoUrl || null,
      youtube_url: formYoutubeUrl || null,
      youtube_thumbnail: thumbnail,
      tags,
    };

    // 8-second timeout protection
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const dbStart = performance.now();
      let error: any = null;

      if (editingExercise) {
        const res = await supabase.from("exercises").update(payload).eq("id", editingExercise.id).abortSignal(controller.signal);
        error = res.error;
      } else {
        const res = await supabase.from("exercises").insert({ ...payload, created_by: user.id }).abortSignal(controller.signal);
        error = res.error;
      }

      clearTimeout(timeout);
      console.log("[ExerciseLibrary] DB write completed in", Math.round(performance.now() - dbStart), "ms");

      if (error) {
        console.error("[ExerciseLibrary] Save error:", error);
        toast({ title: "Unable to save. Please try again.", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }

      // Show success state briefly then close
      setSaveSuccess(true);
      setSaving(false);
      console.log("[ExerciseLibrary] Total save flow:", Math.round(performance.now() - startTime), "ms");

      setTimeout(() => {
        setShowForm(false);
        resetForm();
        setSaveSuccess(false);
        loadExercises();
      }, 1200);
    } catch (err: any) {
      clearTimeout(timeout);
      console.error("[ExerciseLibrary] Save aborted/failed:", err);
      setSaving(false);
      if (err.name === "AbortError") {
        toast({ title: "Save timed out", description: "Please check your connection and try again.", variant: "destructive" });
      } else {
        toast({ title: "Unable to save. Please try again.", variant: "destructive" });
      }
    }
  };

  const deleteExercise = async (id: string) => {
    const { error } = await supabase.from("exercises").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Exercise deleted" });
      loadExercises();
    }
  };

  return (
    <div className="space-y-4">
      {/* Search & Filters */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search exercises..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          {!selectionMode && (
            <Button onClick={() => { resetForm(); setShowForm(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Add Exercise
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={filterMuscle} onValueChange={setFilterMuscle}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue placeholder="Muscle" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Muscles</SelectItem>
              {MUSCLE_GROUPS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterEquipment} onValueChange={setFilterEquipment}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue placeholder="Equipment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Equipment</SelectItem>
              {EQUIPMENT.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterPattern} onValueChange={setFilterPattern}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue placeholder="Pattern" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Patterns</SelectItem>
              {MOVEMENT_PATTERNS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          {(filterMuscle !== "all" || filterEquipment !== "all" || filterPattern !== "all") && (
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => {
              setFilterMuscle("all"); setFilterEquipment("all"); setFilterPattern("all");
            }}>
              <X className="h-3 w-3 mr-1" /> Clear
            </Button>
          )}
        </div>
      </div>

      {/* Exercise List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">No exercises found. Add your first exercise to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((ex) => (
            <Card
              key={ex.id}
              className={`border-border bg-card hover:border-primary/30 transition-colors ${selectionMode ? "cursor-pointer" : ""}`}
              onClick={selectionMode ? () => onSelectExercise?.(ex) : undefined}
            >
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-3">
                  {ex.youtube_thumbnail ? (
                    <img
                      src={ex.youtube_thumbnail}
                      alt={ex.name}
                      className="w-12 h-9 rounded object-cover bg-secondary"
                    />
                  ) : (
                    <div className="w-12 h-9 rounded bg-secondary flex items-center justify-center">
                      <Dumbbell className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-foreground block truncate">{ex.name}</span>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {ex.primary_muscle && <span className="text-[10px] text-muted-foreground">{ex.primary_muscle}</span>}
                      {ex.equipment && <span className="text-[10px] text-muted-foreground">• {ex.equipment}</span>}
                      {ex.movement_pattern && <span className="text-[10px] text-muted-foreground">• {ex.movement_pattern}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {ex.tags?.slice(0, 2).map(t => (
                      <Badge key={t} variant="outline" className="text-[10px] px-1.5 py-0">{t}</Badge>
                    ))}
                    {(ex.video_url || ex.youtube_url) && (
                      <Play className="h-3.5 w-3.5 text-primary" />
                    )}
                  </div>
                  {!selectionMode && (
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setViewExercise(ex); }}>
                        <Dumbbell className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEditForm(ex); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); deleteExercise(ex.id); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* View Exercise Dialog */}
      <Dialog open={!!viewExercise} onOpenChange={(open) => !open && setViewExercise(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          {viewExercise && (
            <>
              <DialogHeader>
                <DialogTitle>{viewExercise.name}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {/* Video */}
                {viewExercise.youtube_url ? (
                  <div className="aspect-video rounded-lg overflow-hidden bg-secondary">
                    <iframe
                      src={getYouTubeEmbedUrl(viewExercise.youtube_url) || ""}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                ) : viewExercise.video_url ? (
                  <video src={viewExercise.video_url} controls className="w-full rounded-lg" />
                ) : null}

                <div className="flex flex-wrap gap-2">
                  {viewExercise.primary_muscle && <Badge>{viewExercise.primary_muscle}</Badge>}
                  {viewExercise.secondary_muscle && <Badge variant="secondary">{viewExercise.secondary_muscle}</Badge>}
                  {viewExercise.equipment && <Badge variant="outline">{viewExercise.equipment}</Badge>}
                  {viewExercise.movement_pattern && <Badge variant="outline">{viewExercise.movement_pattern}</Badge>}
                </div>

                {viewExercise.description && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-1">Description</h4>
                    <p className="text-sm text-foreground">{viewExercise.description}</p>
                  </div>
                )}

                {viewExercise.coaching_cues && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-1">Coaching Cues</h4>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{viewExercise.coaching_cues}</p>
                  </div>
                )}

                {viewExercise.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {viewExercise.tags.map(t => <Badge key={t} variant="outline" className="text-xs">{t}</Badge>)}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Add/Edit Form Dialog */}
      <Dialog open={showForm} onOpenChange={(open) => { if (!open) { setShowForm(false); resetForm(); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingExercise ? "Edit Exercise" : "Add Exercise"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-2">
                <Label>Exercise Name *</Label>
                <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Barbell Back Squat" />
              </div>
              <div className="space-y-2">
                <Label>Category *</Label>
                <Select value={formCategory} onValueChange={setFormCategory}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {MUSCLE_GROUPS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Primary Muscle</Label>
                <Select value={formPrimaryMuscle} onValueChange={setFormPrimaryMuscle}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {MUSCLE_GROUPS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Secondary Muscle</Label>
                <Select value={formSecondaryMuscle} onValueChange={setFormSecondaryMuscle}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {MUSCLE_GROUPS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Equipment</Label>
                <Select value={formEquipment} onValueChange={setFormEquipment}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {EQUIPMENT.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Movement Pattern</Label>
                <Select value={formMovementPattern} onValueChange={setFormMovementPattern}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {MOVEMENT_PATTERNS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="Brief description of the exercise" rows={2} />
            </div>

            <div className="space-y-2">
              <Label>Coaching Cues</Label>
              <Textarea value={formCoachingCues} onChange={(e) => setFormCoachingCues(e.target.value)} placeholder="Key coaching points, one per line" rows={3} />
            </div>

            {/* Video Section */}
            <div className="space-y-3">
              <Label className="text-xs font-semibold text-muted-foreground uppercase">Video Reference</Label>
              <Tabs defaultValue="youtube" className="w-full">
                <TabsList className="grid w-full grid-cols-2 h-8">
                  <TabsTrigger value="youtube" className="text-xs gap-1"><Link className="h-3 w-3" /> YouTube</TabsTrigger>
                  <TabsTrigger value="upload" className="text-xs gap-1"><Upload className="h-3 w-3" /> Upload</TabsTrigger>
                </TabsList>
                <TabsContent value="youtube" className="space-y-2">
                  <div className="flex gap-2">
                    <Input value={formYoutubeUrl} onChange={(e) => { setFormYoutubeUrl(e.target.value); setYtPreview(null); }} placeholder="https://youtube.com/watch?v=..." className="flex-1" />
                    <Button variant="outline" size="sm" onClick={handleYoutubeImport} disabled={ytImporting || !formYoutubeUrl}>
                      {ytImporting ? <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Loading…</> : "Import"}
                    </Button>
                  </div>
                  {ytPreview && (
                    <div className="space-y-1.5">
                      <img src={ytPreview.thumbnail} alt="YouTube Preview" className="w-full rounded-lg bg-secondary" />
                      {ytPreview.title && <p className="text-xs text-muted-foreground truncate">{ytPreview.title}</p>}
                    </div>
                  )}
                  {!ytPreview && formYoutubeUrl && getYouTubeThumbnail(formYoutubeUrl) && (
                    <img src={getYouTubeThumbnail(formYoutubeUrl)!} alt="Preview" className="w-full rounded-lg opacity-50" />
                  )}
                </TabsContent>
                <TabsContent value="upload" className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Input type="file" accept="video/*" onChange={handleVideoUpload} disabled={uploading} />
                    {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
                  </div>
                  {formVideoUrl && (
                    <div className="flex items-center gap-2 text-xs text-primary">
                      <Video className="h-3 w-3" /> Video uploaded
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>

            <div className="space-y-2">
              <Label>Tags (comma separated)</Label>
              <Input value={formTags} onChange={(e) => setFormTags(e.target.value)} placeholder="compound, beginner, lower body" />
            </div>

            <Button onClick={saveExercise} disabled={saving || saveSuccess} className="w-full">
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {saveSuccess ? "Saved ✓" : saving ? "Saving…" : editingExercise ? "Update Exercise" : "Save Exercise"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ExerciseLibrary;
