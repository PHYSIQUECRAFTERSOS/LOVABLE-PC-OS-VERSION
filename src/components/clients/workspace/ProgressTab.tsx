import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { BarChart3, Camera, X, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface Photo {
  id: string;
  storage_path: string;
  created_at: string;
  photo_type?: string;
  pose?: string;
  url?: string;
}

const PHOTO_FILTERS = ["all", "front", "side", "back", "other"] as const;

const ClientWorkspaceProgress = ({ clientId }: { clientId: string }) => {
  const { toast } = useToast();
  const [measurements, setMeasurements] = useState<any[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [measurementsEnabled, setMeasurementsEnabled] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [measRes, photoRes, profileRes] = await Promise.all([
        supabase
          .from("body_measurements")
          .select("*")
          .eq("client_id", clientId)
          .order("measured_at", { ascending: false })
          .limit(5),
        supabase
          .from("progress_photos")
          .select("id, storage_path, created_at, pose")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false }),
        supabase
          .from("profiles")
          .select("measurements_enabled")
          .eq("user_id", clientId)
          .single(),
      ]);
      setMeasurements(measRes.data || []);
      setMeasurementsEnabled(profileRes.data?.measurements_enabled ?? false);

      const photoData = (photoRes.data || []) as Photo[];
      // Get signed URLs
      const enriched = await Promise.all(
        photoData.map(async (p) => {
          const { data: urlData } = await supabase.storage
            .from("progress-photos")
            .createSignedUrl(p.storage_path, 3600);
          return { ...p, url: urlData?.signedUrl || "", photo_type: p.pose || "other" };
        })
      );
      setPhotos(enriched);
      setLoading(false);
    };
    load();
  }, [clientId]);

  const filteredPhotos = activeFilter === "all"
    ? photos
    : photos.filter(p => (p.photo_type || p.pose || "other").toLowerCase().includes(activeFilter));

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-[200px] rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="pt-5 pb-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Progress Photos</p>
              <p className="text-2xl font-bold mt-1">{photos.length}</p>
            </div>
            <Camera className="h-8 w-8 text-muted-foreground/30" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Measurements Logged</p>
              <p className="text-2xl font-bold mt-1">{measurements.length}</p>
            </div>
            <BarChart3 className="h-8 w-8 text-muted-foreground/30" />
          </CardContent>
        </Card>
      </div>

      {/* Coach toggle for measurements */}
      <Card>
        <CardContent className="pt-4 pb-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Enable Body Measurements</p>
            <p className="text-[10px] text-muted-foreground">Client will see measurement fields when logging body stats</p>
          </div>
          <Switch
            checked={measurementsEnabled}
            onCheckedChange={async (checked) => {
              setMeasurementsEnabled(checked);
              const { error } = await supabase
                .from("profiles")
                .update({ measurements_enabled: checked } as any)
                .eq("user_id", clientId);
              if (error) {
                setMeasurementsEnabled(!checked);
                toast({ title: "Failed to update setting", variant: "destructive" });
              } else {
                toast({ title: checked ? "Measurements enabled" : "Measurements disabled" });
              }
            }}
          />
        </CardContent>
      </Card>

      {/* Photo Gallery */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Camera className="h-4 w-4 text-primary" />
              Progress Photos
              <Badge variant="secondary" className="text-[10px]">{photos.length}</Badge>
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex gap-2 mb-4 overflow-x-auto">
            {PHOTO_FILTERS.map(filter => (
              <Button
                key={filter}
                variant={activeFilter === filter ? "default" : "outline"}
                size="sm"
                className="text-xs capitalize shrink-0"
                onClick={() => setActiveFilter(filter)}
              >
                {filter}
              </Button>
            ))}
          </div>

          {filteredPhotos.length === 0 ? (
            <div className="text-center py-8">
              <Camera className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No photos found</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {filteredPhotos.map((photo, idx) => (
                <button
                  key={photo.id}
                  onClick={() => setLightboxIndex(idx)}
                  className="relative rounded-lg overflow-hidden border border-border aspect-square group"
                >
                  <img
                    src={photo.url}
                    alt="Progress"
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 py-1">
                    <p className="text-[10px] text-white/80">
                      {format(new Date(photo.created_at), "MMM d, yyyy")}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Measurements */}
      {measurements.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Recent Measurements</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {measurements.map((m: any) => (
                <div key={m.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <span className="text-sm text-muted-foreground">
                    {format(new Date(m.measured_at), "MMM d, yyyy")}
                  </span>
                  <div className="flex gap-2">
                    {m.waist && <Badge variant="outline" className="text-[10px]">Waist: {m.waist}"</Badge>}
                    {m.chest && <Badge variant="outline" className="text-[10px]">Chest: {m.chest}"</Badge>}
                    {m.body_fat_pct && <Badge variant="secondary" className="text-[10px]">BF: {m.body_fat_pct}%</Badge>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lightbox */}
      {lightboxIndex !== null && filteredPhotos[lightboxIndex] && (
        <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center">
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 text-white hover:bg-white/10 z-10"
            onClick={() => setLightboxIndex(null)}
          >
            <X className="h-6 w-6" />
          </Button>
          {lightboxIndex > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/10"
              onClick={() => setLightboxIndex(lightboxIndex - 1)}
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>
          )}
          {lightboxIndex < filteredPhotos.length - 1 && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/10"
              onClick={() => setLightboxIndex(lightboxIndex + 1)}
            >
              <ChevronRight className="h-6 w-6" />
            </Button>
          )}
          <div className="max-w-3xl max-h-[85vh] px-4">
            <img
              src={filteredPhotos[lightboxIndex].url}
              alt="Progress"
              className="max-w-full max-h-[80vh] object-contain rounded-lg"
            />
            <p className="text-center text-sm text-white/70 mt-2">
              {format(new Date(filteredPhotos[lightboxIndex].created_at), "MMMM d, yyyy")}
              {filteredPhotos[lightboxIndex].photo_type && filteredPhotos[lightboxIndex].photo_type !== "other" && (
                <span className="ml-2 capitalize">· {filteredPhotos[lightboxIndex].photo_type}</span>
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientWorkspaceProgress;
