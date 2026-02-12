import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import { ImageIcon } from "lucide-react";

interface Photo {
  id: string;
  storage_path: string;
  pose: string;
  photo_date: string;
}

const PhotoTimeline = () => {
  const { user } = useAuth();
  const [photos, setPhotos] = useState<(Photo & { url: string })[]>([]);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const { data } = await supabase
        .from("progress_photos")
        .select("*")
        .eq("client_id", user.id)
        .order("photo_date", { ascending: false })
        .limit(20);

      if (data && data.length > 0) {
        const enriched = await Promise.all(
          (data as Photo[]).map(async (p) => {
            const { data: urlData } = await supabase.storage
              .from("progress-photos")
              .createSignedUrl(p.storage_path, 3600);
            return { ...p, url: urlData?.signedUrl || "" };
          })
        );
        setPhotos(enriched);
      }
    };
    fetch();
  }, [user]);

  if (photos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <ImageIcon className="h-10 w-10 opacity-30 mb-2" />
        <p className="text-sm">No progress photos yet</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {photos.map((photo) => (
        <div key={photo.id} className="relative group rounded-lg overflow-hidden border border-border bg-card">
          <img
            src={photo.url}
            alt={`${photo.pose} pose`}
            className="w-full aspect-[3/4] object-cover"
            loading="lazy"
          />
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-2">
            <p className="text-xs font-medium text-white capitalize">{photo.pose.replace("-", " ")}</p>
            <p className="text-[10px] text-white/70">{format(new Date(photo.photo_date), "MMM d, yyyy")}</p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default PhotoTimeline;
