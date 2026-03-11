import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Youtube, Upload, Check, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const MUSCLE_GROUPS = [
  "Chest", "Back", "Shoulders", "Biceps", "Triceps", "Forearms",
  "Quadriceps", "Hamstrings", "Glutes", "Calves", "Core", "Full Body",
];

const EQUIPMENT_OPTIONS = [
  "Barbell", "Dumbbell", "Cable", "Machine", "Bodyweight", "Bands",
  "Kettlebell", "Smith Machine", "EZ Bar", "Other",
];

const EXERCISE_TYPES = [
  { value: "Strength", label: "Strength (Weight × Reps)" },
  { value: "Timed", label: "Timed Exercise" },
  { value: "Cardio", label: "Cardio" },
];

function getYouTubeThumbnail(url: string): string | null {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([^?&/]+)/);
  return match ? `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg` : null;
}

function getYouTubeVideoId(url: string): string | null {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([^?&/]+)/);
  return match ? match[1] : null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (newExercise?: any) => void;
  initialData?: any;
}

const AddExerciseModal = ({ open, onOpenChange, onCreated, initialData }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState(false);
  const [videoSource, setVideoSource] = useState<"youtube" | "upload">("youtube");
  const [uploading, setUploading] = useState(false);
  const [ytFetching, setYtFetching] = useState(false);
  const [ytTitle, setYtTitle] = useState("");

  const [form, setForm] = useState({
    name: "", primary_muscle: "", secondary_muscle: "", equipment: "",
    category: "Strength", youtube_url: "", video_url: "", thumbnail_url: "", instructions: "",
  });

  // Sync form when initialData changes (edit mode)
  useEffect(() => {
    if (open && initialData) {
      setForm({
        name: initialData.name || "",
        primary_muscle: initialData.primary_muscle || "",
        secondary_muscle: initialData.secondary_muscle || "",
        equipment: initialData.equipment || "",
        category: initialData.category || "Strength",
        youtube_url: initialData.youtube_url || "",
        video_url: initialData.video_url || "",
        thumbnail_url: initialData.youtube_thumbnail || "",
        instructions: initialData.description || "",
      });
    } else if (open && !initialData) {
      resetForm();
    }
  }, [open, initialData]);

  const resetForm = () => {
    setForm({ name: "", primary_muscle: "", secondary_muscle: "", equipment: "", category: "Strength", youtube_url: "", video_url: "", thumbnail_url: "", instructions: "" });
    setYtTitle("");
    setVideoSource("youtube");
  };

  // YouTube auto-import
  const handleYouTubeChange = async (url: string) => {
    setForm(f => ({ ...f, youtube_url: url }));
    const thumb = getYouTubeThumbnail(url);
    if (thumb) {
      setForm(f => ({ ...f, thumbnail_url: thumb }));
      // Fetch title via oEmbed
      setYtFetching(true);
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`, { signal: controller.signal });
        clearTimeout(timeout);
        const data = await res.json();
        if (data.title) {
          setYtTitle(data.title);
          if (!form.name) {
            setForm(f => ({ ...f, name: data.title }));
          }
        }
      } catch {
        // Timeout or error - no problem, just skip title
      } finally {
        setYtFetching(false);
      }
    }
  };

  // Video upload
  const handleFileUpload = async (file: File) => {
    if (!user) return;
    if (file.size > 100 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum 100MB", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("exercise-videos").upload(path, file);
      if (error) throw error;

      const { data: urlData } = supabase.storage.from("exercise-videos").getPublicUrl(path);
      setForm(f => ({ ...f, video_url: urlData.publicUrl, thumbnail_url: "" }));
      toast({ title: "Video uploaded" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!user || !form.name.trim()) return;
    setSaving(true);
    try {
      const isEditing = !!initialData?.id;

      if (!isEditing) {
        const { data: existing } = await supabase
          .from("exercises")
          .select("id, name")
          .ilike("name", form.name.trim())
          .limit(1);

        if (existing && existing.length > 0) {
          toast({
            title: `Similar exercise found: "${existing[0].name}"`,
            description: "Saving as new exercise anyway. Use the search to find the existing one.",
          });
        }
      }

      const payload = {
        name: form.name.trim(),
        primary_muscle: form.primary_muscle || null,
        secondary_muscle: form.secondary_muscle || null,
        equipment: form.equipment || null,
        youtube_url: form.youtube_url || null,
        youtube_thumbnail: form.thumbnail_url || null,
        video_url: form.video_url || null,
        description: form.instructions || null,
        category: form.category || "Strength",
      };

      if (isEditing) {
        const { data, error } = await supabase.from("exercises").update(payload).eq("id", initialData.id).select();
        if (error) throw error;
        if (!data || data.length === 0) throw new Error("Update returned no data — check permissions.");
        toast({ title: "Exercise updated" });
      } else {
        const { data, error } = await supabase.from("exercises").insert({
          ...payload,
          created_by: user.id,
        }).select("id, name");
        if (error) {
          console.error("[AddExercise] Insert error:", error);
          throw new Error(error.message);
        }
        if (!data || data.length === 0) {
          console.error("[AddExercise] Insert returned no rows. Check that your account has coach or admin role.");
          throw new Error("Exercise was not saved. Your account may not have coach permissions. Contact your admin.");
        }
        console.log("[AddExercise] Saved successfully:", data[0].id, data[0].name);
        toast({ title: `Exercise "${data[0].name}" created` });
        // Close modal first, then trigger re-fetch with new exercise data
        resetForm();
        onOpenChange(false);
        // Small delay to let modal unmount, then refresh the list
        await new Promise(r => setTimeout(r, 200));
        await onCreated({ ...payload, id: data[0].id, name: data[0].name, created_by: user.id, created_at: new Date().toISOString() });
        return;
      }

      // Close modal for edit case
      resetForm();
      onOpenChange(false);
      await new Promise(r => setTimeout(r, 200));
      await onCreated();
    } catch (err: any) {
      console.error("[AddExercise] Save failed:", err);
      toast({ title: "Failed to save exercise — please try again.", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initialData ? "Edit Exercise" : "Add Exercise"}</DialogTitle>
          <DialogDescription>Create a new exercise for your library.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Video Source Toggle */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Video Source</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={videoSource === "youtube" ? "default" : "outline"}
                onClick={() => setVideoSource("youtube")}
                className="flex-1"
              >
                <Youtube className="h-3.5 w-3.5 mr-1.5" /> YouTube
              </Button>
              <Button
                type="button"
                size="sm"
                variant={videoSource === "upload" ? "default" : "outline"}
                onClick={() => setVideoSource("upload")}
                className="flex-1"
              >
                <Upload className="h-3.5 w-3.5 mr-1.5" /> Upload
              </Button>
            </div>
          </div>

          {/* YouTube Input */}
          {videoSource === "youtube" && (
            <div className="space-y-2">
              <Label className="text-xs">YouTube URL</Label>
              <Input
                value={form.youtube_url}
                onChange={e => handleYouTubeChange(e.target.value)}
                placeholder="https://youtube.com/watch?v=..."
                className="h-9 text-sm"
              />
              {form.thumbnail_url && videoSource === "youtube" && (
                <div className="rounded-lg overflow-hidden border bg-muted">
                  <img src={form.thumbnail_url} alt="Preview" className="w-full aspect-video object-cover" />
                  {(ytTitle || ytFetching) && (
                    <div className="px-3 py-2 flex items-center gap-2">
                      {ytFetching ? (
                        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                      ) : (
                        <Check className="h-3 w-3 text-green-500" />
                      )}
                      <span className="text-xs text-muted-foreground truncate">{ytFetching ? "Fetching title..." : ytTitle}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Upload Input */}
          {videoSource === "upload" && (
            <div className="space-y-2">
              <Label className="text-xs">Upload Video (MP4, MOV — max 100MB)</Label>
              <input
                ref={fileRef}
                type="file"
                accept="video/mp4,video/quicktime"
                className="hidden"
                onChange={e => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]); }}
              />
              <Button
                type="button"
                variant="outline"
                className="w-full h-20 border-dashed"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Uploading...</>
                ) : form.video_url ? (
                  <><Check className="h-4 w-4 mr-2 text-green-500" /> Video uploaded</>
                ) : (
                  <><Upload className="h-4 w-4 mr-2" /> Click to upload video</>
                )}
              </Button>
            </div>
          )}

          {/* Exercise Name */}
          <div className="space-y-1">
            <Label className="text-xs">Exercise Name *</Label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Flat Barbell Bench Press" className="h-9 text-sm" />
          </div>

          {/* Exercise Type */}
          <div className="space-y-1">
            <Label className="text-xs">Exercise Type</Label>
            <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {EXERCISE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Muscles */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Primary Muscle</Label>
              <Select value={form.primary_muscle} onValueChange={v => setForm(f => ({ ...f, primary_muscle: v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>{MUSCLE_GROUPS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Secondary Muscle</Label>
              <Select value={form.secondary_muscle} onValueChange={v => setForm(f => ({ ...f, secondary_muscle: v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>{MUSCLE_GROUPS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          {/* Equipment */}
          <div className="space-y-1">
            <Label className="text-xs">Equipment</Label>
            <Select value={form.equipment} onValueChange={v => setForm(f => ({ ...f, equipment: v }))}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>{EQUIPMENT_OPTIONS.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          {/* Instructions */}
          <div className="space-y-1">
            <Label className="text-xs">Instructions</Label>
            <Textarea value={form.instructions} onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))} placeholder="Exercise description..." className="h-20 text-sm" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !form.name.trim()}>
            {saving && <Loader2 className="animate-spin mr-1.5 h-3.5 w-3.5" />}
            Save Exercise
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddExerciseModal;
