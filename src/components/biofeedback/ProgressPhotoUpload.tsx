import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Camera, Upload, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const POSES = ["front", "back", "side-left", "side-right", "front-relaxed", "back-relaxed"];

const ProgressPhotoUpload = ({ onUploaded }: { onUploaded?: () => void }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [pose, setPose] = useState("front");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    if (!user) return;
    setUploading(true);

    const ext = file.name.split(".").pop();
    const path = `${user.id}/${Date.now()}_${pose}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("progress-photos")
      .upload(path, file);

    if (uploadError) {
      toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" });
      setUploading(false);
      return;
    }

    const { error: dbError } = await supabase.from("progress_photos").insert({
      client_id: user.id,
      storage_path: path,
      pose,
    });

    setUploading(false);
    if (dbError) {
      toast({ title: "Error", description: dbError.message, variant: "destructive" });
    } else {
      toast({ title: "Photo uploaded! 📸" });
      window.dispatchEvent(new Event("photos-uploaded"));
      onUploaded?.();
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Camera className="h-5 w-5" /> Progress Photos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Pose</Label>
          <Select value={pose} onValueChange={setPose}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {POSES.map(p => (
                <SelectItem key={p} value={p} className="capitalize">{p.replace("-", " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          className="hidden"
          onChange={onFileChange}
        />

        <Button
          onClick={() => { try { setTimeout(() => fileRef.current?.click(), 0); } catch (e) { console.warn("[ProgressPhoto] File picker error:", e); } }}
          disabled={uploading}
          variant="outline"
          className="w-full gap-2"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? "Uploading..." : "Upload Photo"}
        </Button>
      </CardContent>
    </Card>
  );
};

export default ProgressPhotoUpload;
