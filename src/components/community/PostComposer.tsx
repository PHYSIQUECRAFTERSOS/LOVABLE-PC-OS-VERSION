import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ImagePlus, Send, Megaphone } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCreatePost } from "@/hooks/useCommunity";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface PostComposerProps {
  postType?: "feed" | "announcement";
}

const PostComposer = ({ postType = "feed" }: PostComposerProps) => {
  const { user, role } = useAuth();
  const isCoach = role === "coach" || role === "admin";
  const createPost = useCreatePost();
  const [content, setContent] = useState("");
  const [uploading, setUploading] = useState(false);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Only coaches can post announcements
  if (postType === "announcement" && !isCoach) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${user.id}/${Date.now()}.${ext}`;

    const { error } = await supabase.storage.from("community-media").upload(path, file);
    if (error) {
      toast.error("Upload failed");
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("community-media").getPublicUrl(path);
    setMediaUrl(urlData.publicUrl);
    setMediaType(file.type.startsWith("video") ? "video" : "image");
    setUploading(false);
  };

  const handlePost = () => {
    if (!content.trim() && !mediaUrl) return;
    createPost.mutate(
      {
        content: content.trim(),
        postType,
        mediaUrl: mediaUrl || undefined,
        mediaType: mediaType || undefined,
      },
      {
        onSuccess: () => {
          setContent("");
          setMediaUrl(null);
          setMediaType(null);
          toast.success(postType === "announcement" ? "Announcement posted" : "Post shared");
        },
      }
    );
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      {postType === "announcement" && (
        <div className="flex items-center gap-2 text-primary">
          <Megaphone className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase tracking-wider">New Announcement</span>
        </div>
      )}
      <Textarea
        placeholder={postType === "announcement" ? "Write an announcement for the community..." : "Share something with the community..."}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="min-h-[80px] resize-none bg-secondary/30 border-0 focus-visible:ring-1"
      />

      {mediaUrl && (
        <div className="relative rounded-md overflow-hidden border border-border">
          {mediaType === "image" ? (
            <img src={mediaUrl} alt="Upload preview" className="w-full max-h-48 object-cover" />
          ) : (
            <video src={mediaUrl} controls className="w-full max-h-48" />
          )}
          <button
            onClick={() => { setMediaUrl(null); setMediaType(null); }}
            className="absolute top-2 right-2 bg-background/80 rounded-full p-1 text-xs text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFileUpload} />
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground gap-1.5 text-xs"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            <ImagePlus className="h-4 w-4" />
            {uploading ? "Uploading..." : "Media"}
          </Button>
        </div>
        <Button
          size="sm"
          onClick={handlePost}
          disabled={(!content.trim() && !mediaUrl) || createPost.isPending}
          className="gap-1.5"
        >
          <Send className="h-3.5 w-3.5" />
          {postType === "announcement" ? "Announce" : "Post"}
        </Button>
      </div>
    </div>
  );
};

export default PostComposer;
