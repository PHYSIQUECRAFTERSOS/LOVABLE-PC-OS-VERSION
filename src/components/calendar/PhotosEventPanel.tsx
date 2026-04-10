import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Camera, ChevronLeft, ChevronRight, X } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface Photo {
  id: string;
  storage_path: string;
  pose: string;
  photo_date: string;
  signedUrl: string | null;
}

interface PhotosEventPanelProps {
  clientId: string;
  eventDate: string; // YYYY-MM-DD
}

const ANGLES = ["front", "back", "side"] as const;

function mapPose(pose: string): string {
  const p = pose?.toLowerCase() || "";
  if (p.includes("front")) return "front";
  if (p.includes("back")) return "back";
  if (p.includes("side")) return "side";
  return "other";
}

function getAdjacentDate(date: string, offset: number): string {
  const d = new Date(date + "T12:00:00");
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString("en-CA");
}

const PhotosEventPanel = ({ clientId, eventDate }: PhotosEventPanelProps) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [isNearbyDate, setIsNearbyDate] = useState(false);
  const [actualDate, setActualDate] = useState(eventDate);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  // Compare state
  const [compareMode, setCompareMode] = useState(false);
  const [prevPhotos, setPrevPhotos] = useState<Photo[]>([]);
  const [loadingPrev, setLoadingPrev] = useState(false);
  const [noPrevious, setNoPrevious] = useState(false);

  useEffect(() => {
    const fetchPhotos = async () => {
      setLoading(true);
      const prevDay = getAdjacentDate(eventDate, -1);
      const nextDay = getAdjacentDate(eventDate, 1);

      const { data } = await supabase
        .from("progress_photos")
        .select("id, storage_path, pose, photo_date")
        .eq("client_id", clientId)
        .gte("photo_date", prevDay)
        .lte("photo_date", nextDay)
        .order("photo_date", { ascending: false })
        .limit(10);

      if (data && data.length > 0) {
        // Check if exact match or nearby
        const exactMatch = data.filter(p => p.photo_date === eventDate);
        const usePhotos = exactMatch.length > 0 ? exactMatch : data;
        const photoDate = usePhotos[0].photo_date;
        setIsNearbyDate(photoDate !== eventDate);
        setActualDate(photoDate);

        const enriched = await Promise.allSettled(
          usePhotos.map(async (p: any) => {
            const { data: urlData } = await supabase.storage
              .from("progress-photos")
              .createSignedUrl(p.storage_path, 3600);
            return { ...p, signedUrl: urlData?.signedUrl ?? null } as Photo;
          })
        );

        setPhotos(
          enriched
            .filter((r): r is PromiseFulfilledResult<Photo> => r.status === "fulfilled")
            .map(r => r.value)
            .filter(p => p.signedUrl)
        );
      } else {
        setPhotos([]);
      }
      setLoading(false);
    };
    fetchPhotos();
  }, [clientId, eventDate]);

  const anglePhotos = useMemo(() => {
    const map: Record<string, Photo | null> = { front: null, back: null, side: null };
    photos.forEach(p => {
      const angle = mapPose(p.pose);
      if (angle in map && !map[angle]) map[angle] = p;
    });
    return map;
  }, [photos]);

  const orderedPhotos = useMemo(() => {
    return ANGLES.map(a => anglePhotos[a]).filter(Boolean) as Photo[];
  }, [anglePhotos]);

  const handleCompare = async () => {
    if (compareMode) {
      setCompareMode(false);
      return;
    }
    setLoadingPrev(true);
    const { data } = await supabase
      .from("progress_photos")
      .select("id, storage_path, pose, photo_date")
      .eq("client_id", clientId)
      .lt("photo_date", actualDate)
      .order("photo_date", { ascending: false })
      .limit(10);

    if (!data || data.length === 0) {
      setNoPrevious(true);
      setLoadingPrev(false);
      return;
    }

    const prevDate = data[0].photo_date;
    const sameDatePhotos = data.filter(p => p.photo_date === prevDate);
    const enriched = await Promise.allSettled(
      sameDatePhotos.map(async (p: any) => {
        const { data: urlData } = await supabase.storage
          .from("progress-photos")
          .createSignedUrl(p.storage_path, 3600);
        return { ...p, signedUrl: urlData?.signedUrl ?? null } as Photo;
      })
    );
    setPrevPhotos(
      enriched
        .filter((r): r is PromiseFulfilledResult<Photo> => r.status === "fulfilled")
        .map(r => r.value)
        .filter(p => p.signedUrl)
    );
    setCompareMode(true);
    setLoadingPrev(false);
  };

  const prevAnglePhotos = useMemo(() => {
    const map: Record<string, Photo | null> = { front: null, back: null, side: null };
    prevPhotos.forEach(p => {
      const angle = mapPose(p.pose);
      if (angle in map && !map[angle]) map[angle] = p;
    });
    return map;
  }, [prevPhotos]);

  if (loading) {
    return (
      <div className="my-3 space-y-2">
        <Skeleton className="h-6 w-32" />
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3].map(i => <Skeleton key={i} className="aspect-[3/4] rounded-lg" />)}
        </div>
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <div className="my-3 rounded-xl border border-dashed border-[#333333] p-4 text-center">
        <Camera className="h-8 w-8 text-[#555555] mx-auto mb-2" />
        <p className="text-sm text-[#555555] font-medium">No photos submitted for this check-in</p>
        <p className="text-xs text-[#555555] mt-1">Client has not uploaded their progress photos</p>
      </div>
    );
  }

  const renderPhotoGrid = (angleMap: Record<string, Photo | null>, label?: string) => (
    <div className="space-y-1.5">
      {label && <p className="text-xs text-[#888888] text-center">{label}</p>}
      <div className="grid grid-cols-3 gap-2">
        {ANGLES.map(angle => {
          const photo = angleMap[angle];
          return (
            <div key={angle} className="space-y-1">
              <p className="text-[11px] text-[#888888] text-center capitalize">{angle}</p>
              {photo?.signedUrl ? (
                <div
                  className="aspect-[3/4] rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
                  onClick={() => {
                    const idx = orderedPhotos.findIndex(p => p.id === photo.id);
                    setLightboxIdx(idx >= 0 ? idx : 0);
                  }}
                >
                  <img
                    src={photo.signedUrl}
                    alt={`${angle} pose`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
              ) : (
                <div className="aspect-[3/4] rounded-lg border border-dashed border-[#333333] flex flex-col items-center justify-center">
                  <Camera className="h-5 w-5 text-[#555555]" />
                  <p className="text-[10px] text-[#555555] mt-1">Not submitted</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="my-3 space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-foreground">Progress Photos</h4>
        <p className="text-xs text-[#888888]">
          {isNearbyDate ? (
            <span className="text-[#FFAA44]">Nearest submission: {format(new Date(actualDate + "T12:00:00"), "MMMM d, yyyy")}</span>
          ) : (
            <>Submitted {format(new Date(actualDate + "T12:00:00"), "MMMM d, yyyy")}</>
          )}
        </p>
      </div>

      {compareMode ? (
        <div className="grid grid-cols-2 gap-3">
          {renderPhotoGrid(prevAnglePhotos, prevPhotos[0] ? format(new Date(prevPhotos[0].photo_date + "T12:00:00"), "MMM d") : "Previous")}
          {renderPhotoGrid(anglePhotos, format(new Date(actualDate + "T12:00:00"), "MMM d"))}
        </div>
      ) : (
        renderPhotoGrid(anglePhotos)
      )}

      <Button
        variant="outline"
        onClick={handleCompare}
        disabled={noPrevious || loadingPrev}
        className="w-full border-primary/50 text-primary hover:bg-primary/10"
      >
        {loadingPrev ? "Loading..." : compareMode ? "Exit Comparison" : noPrevious ? "No previous photos to compare" : "Compare to previous check-in"}
      </Button>

      <button
        onClick={() => navigate("/progress")}
        className="text-xs text-primary hover:underline"
      >
        View full progress history →
      </button>

      {/* Lightbox */}
      {lightboxIdx !== null && orderedPhotos[lightboxIdx] && (
        <div
          className="fixed inset-0 z-[200] bg-black/92 flex items-center justify-center"
          onClick={() => setLightboxIdx(null)}
        >
          <button
            className="absolute top-4 right-4 text-white z-10 p-2"
            onClick={(e) => { e.stopPropagation(); setLightboxIdx(null); }}
          >
            <X className="h-6 w-6" />
          </button>

          <p className="absolute top-4 left-1/2 -translate-x-1/2 text-sm text-white font-medium capitalize">
            {mapPose(orderedPhotos[lightboxIdx].pose)}
          </p>

          {lightboxIdx > 0 && (
            <button
              className="absolute left-3 top-1/2 -translate-y-1/2 p-2 text-white/80 hover:text-white z-10"
              onClick={(e) => { e.stopPropagation(); setLightboxIdx(lightboxIdx - 1); }}
            >
              <ChevronLeft className="h-8 w-8" />
            </button>
          )}
          {lightboxIdx < orderedPhotos.length - 1 && (
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-white/80 hover:text-white z-10"
              onClick={(e) => { e.stopPropagation(); setLightboxIdx(lightboxIdx + 1); }}
            >
              <ChevronRight className="h-8 w-8" />
            </button>
          )}

          <img
            src={orderedPhotos[lightboxIdx].signedUrl!}
            alt="Progress photo"
            className="max-w-[90vw] max-h-[85vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
};

export default PhotosEventPanel;
