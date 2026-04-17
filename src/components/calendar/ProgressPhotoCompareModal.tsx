import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Camera, X, ArrowLeftRight } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Photo {
  id: string;
  storage_path: string;
  pose: string;
  photo_date: string;
  created_at: string | null;
  url: string;
}

interface ProgressPhotoCompareModalProps {
  open: boolean;
  onClose: () => void;
  clientId: string;
  clientName?: string;
  initialDate?: string; // YYYY-MM-DD — defaults the "After" side
}

const ANGLE_FILTERS = ["All", "Front", "Side", "Back", "Other"] as const;
type AngleFilter = (typeof ANGLE_FILTERS)[number];
const ANGLES = ["Front", "Side", "Back", "Other"] as const;
type Angle = (typeof ANGLES)[number];

function mapPoseToAngle(pose: string): Angle {
  const p = pose?.toLowerCase() || "";
  if (p.includes("front")) return "Front";
  if (p.includes("side")) return "Side";
  if (p.includes("back")) return "Back";
  return "Other";
}

function fmtDate(iso: string) {
  // en-CA local-safe parse
  return format(new Date(iso + "T12:00:00"), "MMM d, yyyy");
}

const ProgressPhotoCompareModal = ({
  open,
  onClose,
  clientId,
  clientName,
  initialDate,
}: ProgressPhotoCompareModalProps) => {
  const [loading, setLoading] = useState(true);
  const [allPhotos, setAllPhotos] = useState<Photo[]>([]);
  const [angleFilter, setAngleFilter] = useState<AngleFilter>("All");
  const [beforeDate, setBeforeDate] = useState<string | null>(null);
  const [afterDate, setAfterDate] = useState<string | null>(null);
  // Per-angle swap toggle. When true, the displayed Before/After are swapped for that angle row.
  const [swapped, setSwapped] = useState<Record<Angle, boolean>>({
    Front: false,
    Side: false,
    Back: false,
    Other: false,
  });

  // Reset transient state on close
  useEffect(() => {
    if (!open) {
      setSwapped({ Front: false, Side: false, Back: false, Other: false });
      setAngleFilter("All");
    }
  }, [open]);

  // Fetch all photos for client
  useEffect(() => {
    if (!open || !clientId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("progress_photos")
        .select("id, storage_path, pose, photo_date, created_at")
        .eq("client_id", clientId)
        .order("photo_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (!data || data.length === 0) {
        if (!cancelled) {
          setAllPhotos([]);
          setLoading(false);
        }
        return;
      }

      const enriched = await Promise.allSettled(
        data.map(async (p: any) => {
          const { data: urlData } = await supabase.storage
            .from("progress-photos")
            .createSignedUrl(p.storage_path, 3600);
          return { ...p, url: urlData?.signedUrl || "" } as Photo;
        })
      );
      if (cancelled) return;
      const valid = enriched
        .filter((r): r is PromiseFulfilledResult<Photo> => r.status === "fulfilled")
        .map((r) => r.value)
        .filter((p) => p.url);
      setAllPhotos(valid);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, clientId]);

  // Distinct check-in dates (descending)
  const availableDates = useMemo(() => {
    const set = new Set<string>();
    allPhotos.forEach((p) => set.add(p.photo_date));
    return Array.from(set).sort((a, b) => (a < b ? 1 : -1));
  }, [allPhotos]);

  // Default Before/After to the two most recent dates whenever data loads
  useEffect(() => {
    if (!open || availableDates.length === 0) return;
    const defaultAfter = initialDate && availableDates.includes(initialDate)
      ? initialDate
      : availableDates[0];
    const defaultBefore = availableDates.find((d) => d !== defaultAfter) ?? null;
    setAfterDate((curr) => curr ?? defaultAfter);
    setBeforeDate((curr) => curr ?? defaultBefore);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, availableDates.join("|")]);

  // Group photos by date → angle (most recent created_at wins per angle/date)
  const photosByDateAndAngle = useMemo(() => {
    const map = new Map<string, Partial<Record<Angle, Photo>>>();
    for (const p of allPhotos) {
      const angle = mapPoseToAngle(p.pose);
      const existing = map.get(p.photo_date) ?? {};
      // allPhotos is sorted by created_at desc → first occurrence wins
      if (!existing[angle]) {
        existing[angle] = p;
        map.set(p.photo_date, existing);
      }
    }
    return map;
  }, [allPhotos]);

  const handleClose = useCallback(() => {
    setBeforeDate(null);
    setAfterDate(null);
    onClose();
  }, [onClose]);

  // Keyboard: Escape (Dialog handles), no extra wiring needed.
  // Filter rows: include angle if photo exists on either selected date
  const visibleAngles = useMemo<Angle[]>(() => {
    if (!beforeDate || !afterDate) return [];
    const beforeMap = photosByDateAndAngle.get(beforeDate) ?? {};
    const afterMap = photosByDateAndAngle.get(afterDate) ?? {};
    const all = ANGLES.filter((a) => beforeMap[a] || afterMap[a]);
    if (angleFilter === "All") return all;
    return all.filter((a) => a === angleFilter);
  }, [photosByDateAndAngle, beforeDate, afterDate, angleFilter]);

  const toggleSwap = (angle: Angle) => {
    setSwapped((s) => ({ ...s, [angle]: !s[angle] }));
  };

  const headerTitle = clientName
    ? `Compare · ${clientName}`
    : "Compare Progress Photos";

  const onlyOneDate = availableDates.length === 1;
  const noDates = availableDates.length === 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent
        className={cn(
          "p-0 overflow-hidden flex flex-col gap-0 border-border",
          // Full-screen on mobile, large on desktop
          "max-w-none w-screen h-[100dvh] sm:w-[95vw] sm:h-[92vh] sm:max-w-[1200px] sm:rounded-xl",
          "bg-[#0a0a0a]"
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3 shrink-0 bg-[#0a0a0a]">
          <ArrowLeftRight className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-semibold text-foreground truncate flex-1">
            {headerTitle}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleClose}
            aria-label="Close comparison"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Filter pills */}
        <div className="flex gap-2 px-4 py-2.5 overflow-x-auto shrink-0 border-b border-border bg-[#0a0a0a]">
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
            >
              {a}
            </button>
          ))}
        </div>

        {/* Date selectors */}
        {!noDates && !onlyOneDate && (
          <div className="grid grid-cols-2 gap-3 px-4 py-3 shrink-0 border-b border-border bg-[#0a0a0a]">
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Before
              </label>
              <Select
                value={beforeDate ?? undefined}
                onValueChange={(v) => setBeforeDate(v)}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Pick a date" />
                </SelectTrigger>
                <SelectContent>
                  {availableDates.map((d) => (
                    <SelectItem
                      key={d}
                      value={d}
                      disabled={d === afterDate}
                      className="text-xs"
                    >
                      {fmtDate(d)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                After
              </label>
              <Select
                value={afterDate ?? undefined}
                onValueChange={(v) => setAfterDate(v)}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Pick a date" />
                </SelectTrigger>
                <SelectContent>
                  {availableDates.map((d) => (
                    <SelectItem
                      key={d}
                      value={d}
                      disabled={d === beforeDate}
                      className="text-xs"
                    >
                      {fmtDate(d)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 bg-[#0a0a0a]">
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="grid grid-cols-2 gap-3">
                  <Skeleton className="aspect-[3/4] rounded-lg" />
                  <Skeleton className="aspect-[3/4] rounded-lg" />
                </div>
              ))}
            </div>
          ) : noDates ? (
            <EmptyState
              title="No progress photos yet"
              subtitle="This client hasn't uploaded any progress photos."
            />
          ) : onlyOneDate ? (
            <EmptyState
              title="Only one check-in date has photos so far"
              subtitle="Comparison requires two dates. Once another set is uploaded, it will appear here."
            />
          ) : visibleAngles.length === 0 ? (
            <EmptyState
              title="No photos for this filter"
              subtitle="Try a different angle or date pair."
            />
          ) : (
            <div className="space-y-6">
              {visibleAngles.map((angle) => {
                const beforeMap = photosByDateAndAngle.get(beforeDate!) ?? {};
                const afterMap = photosByDateAndAngle.get(afterDate!) ?? {};
                const isSwapped = swapped[angle];
                // Logical sides
                const leftPhoto = isSwapped ? afterMap[angle] : beforeMap[angle];
                const rightPhoto = isSwapped ? beforeMap[angle] : afterMap[angle];
                const leftDate = isSwapped ? afterDate! : beforeDate!;
                const rightDate = isSwapped ? beforeDate! : afterDate!;

                return (
                  <div key={angle} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-primary">
                        {angle}
                      </h3>
                      <span className="text-[10px] text-muted-foreground">
                        Tap a photo to swap Before / After
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <ComparePhotoCell
                        photo={leftPhoto ?? null}
                        label="BEFORE"
                        date={leftDate}
                        angle={angle}
                        onTap={() => toggleSwap(angle)}
                      />
                      <ComparePhotoCell
                        photo={rightPhoto ?? null}
                        label="AFTER"
                        date={rightDate}
                        angle={angle}
                        onTap={() => toggleSwap(angle)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border shrink-0 bg-[#0a0a0a]">
          <Button
            variant="outline"
            size="sm"
            onClick={handleClose}
            className="w-full border-primary/40 text-primary hover:bg-primary/10"
          >
            Exit Comparison
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const ComparePhotoCell = ({
  photo,
  label,
  date,
  angle,
  onTap,
}: {
  photo: Photo | null;
  label: "BEFORE" | "AFTER";
  date: string;
  angle: Angle;
  onTap: () => void;
}) => {
  const [errored, setErrored] = useState(false);
  const dateLabel = fmtDate(date);

  if (!photo || errored) {
    return (
      <div
        role="img"
        aria-label="Photo not submitted"
        className="aspect-[3/4] rounded-lg border border-dashed border-[#333333] flex flex-col items-center justify-center bg-[#111111] relative"
      >
        <span
          className={cn(
            "absolute top-2 left-2 text-[9px] font-bold px-2 py-0.5 rounded",
            label === "BEFORE"
              ? "bg-primary/30 text-primary"
              : "bg-primary text-primary-foreground"
          )}
        >
          {label}
        </span>
        <Camera className="h-7 w-7 text-[#555555]" />
        <p className="text-[11px] text-[#777777] mt-2 font-medium">
          {errored && photo ? "Photo unavailable" : "Not submitted"}
        </p>
        <p className="text-[10px] text-muted-foreground mt-1">{dateLabel}</p>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onTap}
      className="group relative aspect-[3/4] rounded-lg overflow-hidden border border-border bg-[#111111] hover:ring-2 hover:ring-primary/50 transition-all cursor-pointer"
    >
      <img
        src={photo.url}
        alt={`${angle}, ${dateLabel}`}
        className="w-full h-full object-cover"
        loading="lazy"
        onError={() => setErrored(true)}
      />
      <span
        className={cn(
          "absolute top-2 left-2 text-[9px] font-bold px-2 py-0.5 rounded",
          label === "BEFORE"
            ? "bg-primary/40 text-primary backdrop-blur-sm"
            : "bg-primary text-primary-foreground"
        )}
      >
        {label}
      </span>
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/85 to-transparent px-2 py-1.5">
        <p className="text-[10px] text-white/90 font-medium">{dateLabel}</p>
      </div>
    </button>
  );
};

const EmptyState = ({ title, subtitle }: { title: string; subtitle: string }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <Camera className="h-12 w-12 text-[#444444] mb-3" />
    <p className="text-sm font-semibold text-foreground">{title}</p>
    <p className="text-xs text-muted-foreground mt-1 max-w-xs">{subtitle}</p>
  </div>
);

export default ProgressPhotoCompareModal;
