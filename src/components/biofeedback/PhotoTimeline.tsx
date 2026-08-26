import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import { ImageIcon, Download } from "lucide-react";
import { downloadPhoto, photoFilename } from "@/lib/downloadPhoto";
import { signedThumbUrl, signStoragePaths } from "@/lib/supabaseImage";



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
    let cancelled = false;
    const fetch = async () => {
      const { data } = await supabase
        .from("progress_photos")
        .select("*")
        .eq("client_id", user.id)
        .order("photo_date", { ascending: false })
        .limit(20);

      if (data && data.length > 0) {
        const urlMap = await signStoragePaths(
          supabase,
          "progress-photos",
          (data as Photo[]).map((p) => p.storage_path)
        );
        if (cancelled) return;
        setPhotos(
          (data as Photo[])
            .map((p) => ({ ...p, url: urlMap[p.storage_path] || "" }))
            .filter((p) => p.url)
        );
      }
    };
    fetch();
    return () => {
      cancelled = true;
    };
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
            src={signedThumbUrl(photo.url, { width: 400, height: 533, quality: 60 })}
            alt={`${photo.pose} pose`}
            className="w-full aspect-[3/4] object-cover"
            loading="lazy"
            decoding="async"
            onError={(e) => {
              const img = e.currentTarget;
              if (img.src !== photo.url) img.src = photo.url;
            }}
          />

          <button
            type="button"
            aria-label="Download photo"
            onClick={() => downloadPhoto(photo.url, photoFilename(photo.pose, photo.photo_date))}
            className="absolute top-2 right-2 p-1.5 rounded-full bg-background/70 text-foreground hover:bg-background active:scale-95 transition"
          >
            <Download className="h-4 w-4" />
          </button>
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-background/70 to-transparent px-2 py-2">
            <p className="text-xs font-medium text-foreground capitalize">{photo.pose.replace("-", " ")}</p>
            <p className="text-[10px] text-foreground/70">{format(new Date(photo.photo_date), "MMM d, yyyy")}</p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default PhotoTimeline;
