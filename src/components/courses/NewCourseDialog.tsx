import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { parseYouTubeId, fetchYouTubeOEmbed, ytThumbnail } from "@/utils/youtube";
import { Course, CourseModule } from "@/hooks/useCourses";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  modules: CourseModule[];
  existing?: Course;
  onSaved: () => void;
}

const NewCourseDialog = ({ open, onOpenChange, modules, existing, onSaved }: Props) => {
  const { user } = useAuth();
  const [url, setUrl] = useState(existing?.youtube_url || "");
  const [title, setTitle] = useState(existing?.title || "");
  const [description, setDescription] = useState(existing?.description || "");
  const [moduleId, setModuleId] = useState<string>(existing?.module_id || (modules[0]?.id ?? ""));
  const [tagsText, setTagsText] = useState((existing?.tags || []).join(", "));
  const [pinned, setPinned] = useState(existing?.is_pinned || false);
  const [postedAt, setPostedAt] = useState<string>(
    (existing?.posted_at || new Date().toISOString()).slice(0, 10)
  );
  const [duration, setDuration] = useState<string>(
    existing?.duration_seconds ? String(existing.duration_seconds) : ""
  );
  const [crossPost, setCrossPost] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(existing?.thumbnail_url || null);
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);

  // Auto-fetch metadata on URL change
  useEffect(() => {
    const id = parseYouTubeId(url);
    if (!id || existing) return;
    setThumbnailUrl(ytThumbnail(id));
    if (title.trim()) return;
    setFetching(true);
    fetchYouTubeOEmbed(url).then((meta) => {
      if (meta) {
        if (!title.trim()) setTitle(meta.title);
        if (meta.thumbnail_url) setThumbnailUrl(meta.thumbnail_url);
      }
      setFetching(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const handleSave = async () => {
    if (!user) return;
    const videoId = parseYouTubeId(url);
    if (!videoId) {
      toast.error("Invalid YouTube URL");
      return;
    }
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    setSaving(true);
    const tags = tagsText
      .split(",")
      .map((t) => t.trim().replace(/^#/, ""))
      .filter(Boolean);
    const payload = {
      title: title.trim(),
      youtube_url: url.trim(),
      youtube_video_id: videoId,
      thumbnail_url: thumbnailUrl,
      duration_seconds: duration ? parseInt(duration, 10) : null,
      description: description.trim() || null,
      module_id: moduleId || null,
      tags,
      is_pinned: pinned,
      posted_at: new Date(postedAt + "T12:00:00").toISOString(),
    };

    let error: any = null;
    let savedId = existing?.id;
    if (existing) {
      const res = await supabase.from("courses").update(payload).eq("id", existing.id);
      error = res.error;
    } else {
      const res = await supabase
        .from("courses")
        .insert({ ...payload, created_by: user.id })
        .select("id")
        .single();
      error = res.error;
      savedId = res.data?.id;
    }

    if (error) {
      setSaving(false);
      toast.error("Could not save", { description: error.message });
      return;
    }

    // Optional cross-post to community
    if (!existing && crossPost && savedId) {
      const body = `📺 New training replay: ${title.trim()}\n\n${url.trim()}`;
      await supabase
        .from("community_posts")
        .insert({ author_id: user.id, content: body });
    }

    setSaving(false);
    toast.success(existing ? "Video updated" : "Video added");
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit video" : "Add new video"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="yt-url">YouTube URL</Label>
            <div className="relative">
              <Input
                id="yt-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://youtu.be/…"
              />
              {fetching && (
                <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
            </div>
          </div>

          {thumbnailUrl && (
            <div className="overflow-hidden rounded-lg border border-border">
              <img src={thumbnailUrl} alt="preview" className="aspect-video w-full object-cover" />
            </div>
          )}

          <div>
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Module</Label>
              <Select value={moduleId} onValueChange={setModuleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select module" />
                </SelectTrigger>
                <SelectContent>
                  {modules.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="posted">Posted date</Label>
              <Input
                id="posted"
                type="date"
                value={postedAt}
                onChange={(e) => setPostedAt(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="tags">Tags (comma separated)</Label>
            <Input
              id="tags"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="macros, cutting, mindset"
            />
          </div>

          <div>
            <Label htmlFor="duration">Duration (seconds, optional)</Label>
            <Input
              id="duration"
              type="number"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="e.g. 3600"
            />
          </div>

          <div>
            <Label htmlFor="desc">Description / show notes</Label>
            <Textarea
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="What did we cover…"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <Label className="text-sm">Pin to top</Label>
              <p className="text-xs text-muted-foreground">Featured in the pinned strip.</p>
            </div>
            <Switch checked={pinned} onCheckedChange={setPinned} />
          </div>

          {!existing && (
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="flex items-start gap-2">
                <MessageSquare className="mt-0.5 h-4 w-4 text-primary" />
                <div>
                  <Label className="text-sm">Also post to Community</Label>
                  <p className="text-xs text-muted-foreground">Announce this replay in the feed.</p>
                </div>
              </div>
              <Switch checked={crossPost} onCheckedChange={setCrossPost} />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : existing ? "Save" : "Add video"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NewCourseDialog;
