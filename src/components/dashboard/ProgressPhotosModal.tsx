import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Camera, ArrowLeftRight, X, RotateCcw } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";

interface Photo {
  id: string;
  storage_path: string;
  pose: string;
  photo_date: string;
  url: string;
}

interface ProgressPhotosModalProps {
  open: boolean;
  onClose: () => void;
  clientId: string;
  clientName?: string;
}

const ANGLE_FILTERS = ["All", "Front", "Side", "Back", "Other"] as const;

function mapPoseToAngle(pose: string): string {
  const p = pose?.toLowerCase() || "";
  if (p.includes("front")) return "Front";
  if (p.includes("side")) return "Side";
  if (p.includes("back")) return "Back";
  return "Other";
}

const ProgressPhotosModal = ({ open, onClose, clientId, clientName }: ProgressPhotosModalProps) => {
  const [allPhotos, setAllPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [angleFilter, setAngleFilter] = useState<string>("All");

  // Full-screen single photo view
  const [viewingIdx, setViewingIdx] = useState<number | null>(null);

  // Compare mode
  const [compareMode, setCompareMode] = useState(false);
  const [beforePhoto, setBeforePhoto] = useState<Photo | null>(null);
  const [afterPhoto, setAfterPhoto] = useState<Photo | null>(null);
  const [compareStep, setCompareStep] = useState<"before" | "after" | "view">("before");

  useEffect(() => {
    if (!open || !clientId) return;
    setLoading(true);
    const fetchPhotos = async () => {
      const { data } = await supabase
        .from("progress_photos")
        .select("id, storage_path, pose, photo_date")
        .eq("client_id", clientId)
        .order("photo_date", { ascending: false });

      if (data && data.length > 0) {
        const enriched = await Promise.all(
          data.map(async (p: any) => {
            const { data: urlData } = await supabase.storage
              .from("progress-photos")
              .createSignedUrl(p.storage_path, 3600);
            return { ...p, url: urlData?.signedUrl || "" } as Photo;
          })
        );
        setAllPhotos(enriched.filter((p) => p.url));
      } else {
        setAllPhotos([]);
      }
      setLoading(false);
    };
    fetchPhotos();
  }, [open, clientId]);

  const filteredPhotos = useMemo(() => {
    if (angleFilter === "All") return allPhotos;
    return allPhotos.filter((p) => mapPoseToAngle(p.pose) === angleFilter);
  }, [allPhotos, angleFilter]);

  const handleClose = () => {
    setViewingIdx(null);
    setCompareMode(false);
    setBeforePhoto(null);
    setAfterPhoto(null);
    onClose();
  };

  const enterCompare = () => {
    setCompareMode(true);
    setCompareStep("before");
    setBeforePhoto(null);
    setAfterPhoto(null);
  };

  const handleGridTap = (photo: Photo) => {
    if (!compareMode) {
      const idx = filteredPhotos.findIndex((p) => p.id === photo.id);
      setViewingIdx(idx);
      return;
    }
    if (compareStep === "before") {
      setBeforePhoto(photo);
      setCompareStep("after");
    } else if (compareStep === "after") {
      setAfterPhoto(photo);
      setCompareStep("view");
    }
  };

  const headerTitle = clientName ? `${clientName}'s Photos` : "Progress Photos";

  // Full-screen single view
  if (viewingIdx !== null && filteredPhotos[viewingIdx]) {
    const photo = filteredPhotos[viewingIdx];
    return (
      <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
        <DialogContent className="max-w-lg max-h-[95vh] p-0 overflow-hidden">
          <div className="flex flex-col h-full">
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewingIdx(null)}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium text-foreground truncate">
                {format(new Date(photo.photo_date), "MMM d, yyyy")} — {mapPoseToAngle(photo.pose)}
              </span>
            </div>
            <div className="flex-1 flex items-center justify-center bg-black/90 overflow-auto p-4 touch-manipulation">
              <img
                src={photo.url}
                alt={`${photo.pose} progress photo`}
                className="max-w-full max-h-[70vh] object-contain"
              />
            </div>
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <Button
                variant="ghost" size="sm"
                disabled={viewingIdx <= 0}
                onClick={() => setViewingIdx((viewingIdx ?? 0) - 1)}
              >← Previous</Button>
              <span className="text-xs text-muted-foreground">{(viewingIdx ?? 0) + 1} / {filteredPhotos.length}</span>
              <Button
                variant="ghost" size="sm"
                disabled={viewingIdx >= filteredPhotos.length - 1}
                onClick={() => setViewingIdx((viewingIdx ?? 0) + 1)}
              >Next →</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Compare view
  if (compareMode && compareStep === "view" && beforePhoto && afterPhoto) {
    const daysDiff = differenceInDays(new Date(afterPhoto.photo_date), new Date(beforePhoto.photo_date));
    return (
      <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
        <DialogContent className="max-w-lg max-h-[95vh] p-0 overflow-hidden">
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <Button variant="ghost" size="sm" className="gap-1" onClick={() => { setCompareStep("before"); setBeforePhoto(null); setAfterPhoto(null); }}>
                <RotateCcw className="h-3.5 w-3.5" /> Reselect
              </Button>
              <span className="text-sm font-medium text-foreground">Comparison</span>
              <Button variant="ghost" size="sm" className="gap-1" onClick={() => setCompareMode(false)}>
                <X className="h-3.5 w-3.5" /> Exit
              </Button>
            </div>
            <div className="flex-1 grid grid-cols-2 gap-1 p-2 bg-black/90 overflow-auto">
              {[{ photo: beforePhoto, label: "BEFORE" }, { photo: afterPhoto, label: "AFTER" }].map(({ photo, label }) => (
                <div key={label} className="relative flex flex-col items-center">
                  <span className={cn(
                    "absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded",
                    label === "BEFORE" ? "bg-primary/40 text-primary" : "bg-primary text-primary-foreground"
                  )}>{label}</span>
                  <img
                    src={photo.url}
                    alt={label}
                    className="w-full aspect-[3/4] object-cover rounded-lg"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {format(new Date(photo.photo_date), "MMM d, yyyy")} · {mapPoseToAngle(photo.pose)}
                  </p>
                </div>
              ))}
            </div>
            <div className="text-center py-2 border-t border-border">
              <span className="text-xs text-muted-foreground">↕ {Math.abs(daysDiff)} days apart</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Default grid view
  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-lg max-h-[95vh] p-0 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3 shrink-0">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleClose}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium text-foreground truncate flex-1">{headerTitle}</span>
        </div>

        {/* Filter chips */}
        <div className="flex gap-2 px-4 py-2 overflow-x-auto shrink-0">
          {ANGLE_FILTERS.map((a) => (
            <button
              key={a}
              onClick={() => setAngleFilter(a)}
              className={cn(
                "px-3 py-1 text-xs rounded-full font-medium transition-colors whitespace-nowrap border",
                angleFilter === a
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-secondary text-muted-foreground border-border hover:bg-secondary/80"
              )}
            >{a}</button>
          ))}
          <span className="text-[10px] text-muted-foreground self-center ml-auto whitespace-nowrap">
            {filteredPhotos.length} photo{filteredPhotos.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Compare mode instruction */}
        {compareMode && compareStep !== "view" && (
          <div className="px-4 py-2 bg-primary/10 border-b border-primary/20 shrink-0">
            <p className="text-xs text-primary font-medium text-center">
              {compareStep === "before" ? "Tap a photo to set as BEFORE" : "Now tap a photo to set as AFTER"}
            </p>
          </div>
        )}

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square rounded-lg" />
              ))}
            </div>
          ) : filteredPhotos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Camera className="h-10 w-10 opacity-30 mb-2" />
              <p className="text-sm">No photos match this filter</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {filteredPhotos.map((photo) => {
                const isSelectedBefore = compareMode && beforePhoto?.id === photo.id;
                const isSelectedAfter = compareMode && afterPhoto?.id === photo.id;
                return (
                  <button
                    key={photo.id}
                    onClick={() => handleGridTap(photo)}
                    className={cn(
                      "relative rounded-lg overflow-hidden border-2 transition-all",
                      isSelectedBefore || isSelectedAfter ? "border-primary ring-2 ring-primary/30" : "border-border/50 hover:border-border"
                    )}
                  >
                    <img
                      src={photo.url}
                      alt={`${photo.pose} pose`}
                      className="w-full aspect-square object-cover"
                      loading="lazy"
                    />
                    {/* Angle pill */}
                    <span className="absolute bottom-8 left-1.5 text-[9px] font-medium px-1.5 py-0.5 rounded bg-black/60 text-white">
                      {mapPoseToAngle(photo.pose)}
                    </span>
                    {/* Date */}
                    <p className="text-[10px] text-muted-foreground py-1 text-center bg-card">
                      {format(new Date(photo.photo_date), "MMM d, yyyy")}
                    </p>
                    {/* Selection label */}
                    {isSelectedBefore && (
                      <span className="absolute top-2 left-2 text-[9px] font-bold px-2 py-0.5 rounded bg-primary text-primary-foreground">Before</span>
                    )}
                    {isSelectedAfter && (
                      <span className="absolute top-2 left-2 text-[9px] font-bold px-2 py-0.5 rounded bg-primary text-primary-foreground">After</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Compare FAB */}
        {!compareMode && allPhotos.length >= 2 && (
          <div className="absolute bottom-4 right-4">
            <Button onClick={enterCompare} size="sm" className="gap-1.5 shadow-lg">
              <ArrowLeftRight className="h-3.5 w-3.5" /> Compare
            </Button>
          </div>
        )}

        {compareMode && compareStep !== "view" && (
          <div className="px-4 py-2 border-t border-border shrink-0">
            <Button variant="outline" size="sm" onClick={() => setCompareMode(false)} className="w-full">
              Cancel Compare
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ProgressPhotosModal;
