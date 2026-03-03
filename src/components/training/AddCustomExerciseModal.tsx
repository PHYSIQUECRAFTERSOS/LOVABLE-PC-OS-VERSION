import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Link, Upload, Loader2, Video, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

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

const EXERCISE_TYPES = [
  { value: "strength", label: "Strength (Weight × Reps)" },
  { value: "bodyweight", label: "Bodyweight" },
  { value: "cardio", label: "Cardio (Time-based)" },
  { value: "mobility", label: "Mobility" },
  { value: "custom", label: "Custom" },
];

interface AddCustomExerciseModalProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  onExerciseCreated: (exercise: {
    id: string;
    name: string;
    primary_muscle: string | null;
    equipment: string | null;
    youtube_thumbnail: string | null;
    tags: string[];
  }) => void;
}

const getYouTubeThumbnail = (url: string): string | null => {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  return match ? `https://img.youtube.com/vi/${match[1]}/mqdefault.jpg` : null;
};

const extractVideoId = (url: string): string | null => {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
};

const AddCustomExerciseModal = ({ open, onClose, userId, onExerciseCreated }: AddCustomExerciseModalProps) => {
  const { toast } = useToast();

  // Form state
  const [title, setTitle] = useState("");
  const [exerciseType, setExerciseType] = useState("strength");
  const [primaryMuscle, setPrimaryMuscle] = useState("");
  const [secondaryMuscle, setSecondaryMuscle] = useState("");
  const [equipment, setEquipment] = useState("");
  const [instructions, setInstructions] = useState("");

  // Video state
  const [videoTab, setVideoTab] = useState("youtube");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [ytPreview, setYtPreview] = useState<{ thumbnail: string; title?: string } | null>(null);
  const [ytImporting, setYtImporting] = useState(false);
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Save state
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const resetForm = useCallback(() => {
    setTitle(""); setExerciseType("strength"); setPrimaryMuscle(""); setSecondaryMuscle("");
    setEquipment(""); setInstructions(""); setYoutubeUrl(""); setYtPreview(null);
    setUploadedVideoUrl(""); setUploadProgress(0); setSaveSuccess(false); setVideoTab("youtube");
  }, []);

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleYoutubeImport = async () => {
    if (!youtubeUrl) return;
    const videoId = extractVideoId(youtubeUrl);
    if (!videoId) {
      toast({ title: "Invalid YouTube URL", variant: "destructive" });
      return;
    }
    const thumbUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    setYtPreview({ thumbnail: thumbUrl });
    setYtImporting(true);

    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
      const result = await Promise.race([
        fetch(oembedUrl).then(r => r.ok ? r.json() : null),
        new Promise<null>((_, reject) => setTimeout(() => reject(new Error("timeout")), 4000)),
      ]);
      if (result?.title) {
        setYtPreview({ thumbnail: thumbUrl, title: result.title });
        if (!title) setTitle(result.title);
      }
    } catch {
      // Fine — we have thumbnail
    } finally {
      setYtImporting(false);
    }
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 100MB limit
    if (file.size > 100 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum 100MB", variant: "destructive" });
      return;
    }

    const validTypes = ["video/mp4", "video/quicktime", "video/webm"];
    if (!validTypes.includes(file.type)) {
      toast({ title: "Invalid file type", description: "Accepted: .mp4, .mov, .webm", variant: "destructive" });
      return;
    }

    setUploading(true);
    setUploadProgress(30);
    const path = `${userId}/${Date.now()}_${file.name}`;

    try {
      setUploadProgress(60);
      const { error } = await supabase.storage.from("exercise-videos").upload(path, file);
      if (error) throw error;
      setUploadProgress(90);

      const { data: urlData } = supabase.storage.from("exercise-videos").getPublicUrl(path);
      setUploadedVideoUrl(urlData.publicUrl);
      setUploadProgress(100);
      toast({ title: "Video uploaded" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
      setUploadProgress(0);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    const startTime = performance.now();

    const thumbnail = youtubeUrl ? getYouTubeThumbnail(youtubeUrl) : null;

    const payload = {
      name: title.trim(),
      category: primaryMuscle || exerciseType,
      primary_muscle: primaryMuscle || null,
      secondary_muscle: secondaryMuscle || null,
      equipment: equipment || null,
      description: instructions || null,
      youtube_url: youtubeUrl || null,
      youtube_thumbnail: thumbnail,
      video_url: uploadedVideoUrl || null,
      tags: [exerciseType],
      created_by: userId,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const { data, error } = await supabase.from("exercises")
        .insert(payload)
        .select("id, name, primary_muscle, equipment, youtube_thumbnail, tags")
        .single();
      clearTimeout(timeout);

      if (error) throw error;

      console.log(`[CustomExercise] Saved in ${Math.round(performance.now() - startTime)}ms`);
      setSaveSuccess(true);

      // Notify parent immediately — auto-add to workout
      onExerciseCreated(data);

      // Brief success flash then close
      setTimeout(() => {
        handleClose();
      }, 600);
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.name === "AbortError") {
        toast({ title: "Save timed out", description: "Check your connection and try again.", variant: "destructive" });
      } else {
        toast({ title: "Failed to save", description: err.message, variant: "destructive" });
      }
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-3xl h-[75vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
          <DialogTitle>Add Custom Exercise</DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex overflow-hidden">
          {/* LEFT — Video Section */}
          <div className="w-[45%] flex flex-col border-r overflow-hidden">
            <ScrollArea className="flex-1">
              <div className="p-5 space-y-4">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Video</Label>

                <Tabs value={videoTab} onValueChange={setVideoTab} className="w-full">
                  <TabsList className="grid w-full grid-cols-2 h-9">
                    <TabsTrigger value="youtube" className="text-xs gap-1.5">
                      <Link className="h-3 w-3" /> YouTube Video
                    </TabsTrigger>
                    <TabsTrigger value="upload" className="text-xs gap-1.5">
                      <Upload className="h-3 w-3" /> Upload Video
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="youtube" className="space-y-3 mt-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">YouTube URL</Label>
                      <div className="flex gap-2">
                        <Input
                          value={youtubeUrl}
                          onChange={(e) => { setYoutubeUrl(e.target.value); setYtPreview(null); }}
                          placeholder="https://youtube.com/watch?v=..."
                          className="flex-1 h-9 text-xs"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleYoutubeImport}
                          disabled={ytImporting || !youtubeUrl}
                          className="h-9"
                        >
                          {ytImporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Preview"}
                        </Button>
                      </div>
                    </div>

                    {ytPreview && (
                      <div className="space-y-2">
                        <div className="aspect-video rounded-lg overflow-hidden bg-secondary">
                          <img src={ytPreview.thumbnail} alt="Preview" className="w-full h-full object-cover" />
                        </div>
                        {ytPreview.title && (
                          <p className="text-xs text-muted-foreground truncate">{ytPreview.title}</p>
                        )}
                      </div>
                    )}
                    {!ytPreview && youtubeUrl && getYouTubeThumbnail(youtubeUrl) && (
                      <div className="aspect-video rounded-lg overflow-hidden bg-secondary">
                        <img src={getYouTubeThumbnail(youtubeUrl)!} alt="Preview" className="w-full h-full object-cover opacity-50" />
                      </div>
                    )}
                    {!youtubeUrl && !ytPreview && (
                      <div className="aspect-video rounded-lg bg-secondary/50 border-2 border-dashed border-border flex items-center justify-center">
                        <div className="text-center">
                          <Link className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                          <p className="text-xs text-muted-foreground">Paste a YouTube link above</p>
                        </div>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="upload" className="space-y-3 mt-3">
                    {!uploadedVideoUrl ? (
                      <label className="block aspect-video rounded-lg bg-secondary/50 border-2 border-dashed border-border cursor-pointer hover:border-primary/40 transition-colors">
                        <div className="h-full flex flex-col items-center justify-center">
                          {uploading ? (
                            <>
                              <Loader2 className="h-8 w-8 text-primary animate-spin mb-2" />
                              <p className="text-xs text-muted-foreground">Uploading... {uploadProgress}%</p>
                              <div className="w-32 h-1.5 bg-secondary rounded-full mt-2 overflow-hidden">
                                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
                              </div>
                            </>
                          ) : (
                            <>
                              <Upload className="h-8 w-8 text-muted-foreground/30 mb-2" />
                              <p className="text-xs text-muted-foreground">Click or drag to upload</p>
                              <p className="text-[10px] text-muted-foreground/60 mt-1">.mp4, .mov — Max 100MB</p>
                            </>
                          )}
                        </div>
                        <input type="file" accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm" onChange={handleVideoUpload} className="hidden" disabled={uploading} />
                      </label>
                    ) : (
                      <div className="space-y-2">
                        <div className="aspect-video rounded-lg overflow-hidden bg-secondary">
                          <video src={uploadedVideoUrl} controls className="w-full h-full object-cover" />
                        </div>
                        <div className="flex items-center gap-2 text-xs text-primary">
                          <Video className="h-3.5 w-3.5" /> Video uploaded successfully
                        </div>
                        <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => { setUploadedVideoUrl(""); setUploadProgress(0); }}>
                          Replace video
                        </Button>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            </ScrollArea>
          </div>

          {/* RIGHT — Exercise Details */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <ScrollArea className="flex-1">
              <div className="p-5 space-y-4">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Exercise Details</Label>

                <div className="space-y-1.5">
                  <Label className="text-xs">Title <span className="text-destructive">*</span></Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Barbell Back Squat" className="h-9" autoFocus />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Exercise Type</Label>
                  <Select value={exerciseType} onValueChange={setExerciseType}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EXERCISE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Primary Muscle</Label>
                    <Select value={primaryMuscle} onValueChange={setPrimaryMuscle}>
                      <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {MUSCLE_GROUPS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Secondary Muscle</Label>
                    <Select value={secondaryMuscle} onValueChange={setSecondaryMuscle}>
                      <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Optional" /></SelectTrigger>
                      <SelectContent>
                        {MUSCLE_GROUPS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Equipment</Label>
                  <Select value={equipment} onValueChange={setEquipment}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Optional" /></SelectTrigger>
                    <SelectContent>
                      {EQUIPMENT.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Instructions</Label>
                  <Textarea
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    placeholder="Describe the movement, key cues, common mistakes..."
                    rows={4}
                    className="text-xs resize-none"
                  />
                </div>
              </div>
            </ScrollArea>

            {/* Save button footer */}
            <div className="p-4 border-t flex-shrink-0">
              <Button
                onClick={handleSave}
                disabled={saving || saveSuccess || !title.trim()}
                className="w-full h-10"
              >
                {saveSuccess ? (
                  <><CheckCircle2 className="h-4 w-4 mr-2" /> Saved to Library</>
                ) : saving ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
                ) : (
                  "Save to Exercise Library"
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddCustomExerciseModal;
