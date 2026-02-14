import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, startOfWeek, getWeek, isAfter } from "date-fns";
import { ImageIcon, ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from "lucide-react";

interface Photo {
  id: string;
  storage_path: string;
  pose: string;
  photo_date: string;
  url?: string;
}

interface WeekGroup {
  week: number;
  year: number;
  startDate: Date;
  photos: Photo[];
}

const PhotoComparisonSlider = () => {
  const { user } = useAuth();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [weekGroups, setWeekGroups] = useState<WeekGroup[]>([]);
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [selectedPose, setSelectedPose] = useState("front");
  const [comparisonMode, setComparisonMode] = useState<"timeline" | "sidebyside">("timeline");
  const [selectedComparisonWeeks, setSelectedComparisonWeeks] = useState<[number, number]>([0, 0]);

  // Fetch photos
  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const { data } = await supabase
        .from("progress_photos")
        .select("*")
        .eq("client_id", user.id)
        .order("photo_date", { ascending: false })
        .limit(50);

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

  // Group photos by week
  useEffect(() => {
    if (photos.length === 0) return;

    const groups: Map<string, WeekGroup> = new Map();

    photos.forEach((photo) => {
      const photoDate = new Date(photo.photo_date);
      const week = getWeek(photoDate);
      const year = photoDate.getFullYear();
      const key = `${year}-W${week}`;
      const startDate = startOfWeek(photoDate);

      if (!groups.has(key)) {
        groups.set(key, {
          week,
          year,
          startDate,
          photos: [],
        });
      }

      groups.get(key)!.photos.push(photo);
    });

    const sorted = Array.from(groups.values()).sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.week - a.week;
    });

    setWeekGroups(sorted);
    if (sorted.length > 0) {
      setSelectedComparisonWeeks([0, Math.min(1, sorted.length - 1)]);
    }
  }, [photos]);

  if (photos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <ImageIcon className="h-10 w-10 opacity-30 mb-2" />
        <p className="text-sm">No progress photos yet</p>
      </div>
    );
  }

  const currentWeek = weekGroups[selectedWeekIndex];
  const photosInWeek = currentWeek?.photos || [];
  const poseOptions = [...new Set(photos.map((p) => p.pose))];
  const filteredPhotos = photosInWeek.filter((p) => p.pose === selectedPose);

  return (
    <div className="space-y-6">
      <Tabs defaultValue="timeline" onValueChange={(v) => setComparisonMode(v as "timeline" | "sidebyside")}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="sidebyside">Side-by-Side</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="space-y-4 mt-4">
          {/* Pose Filter */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            {poseOptions.map((pose) => (
              <Button
                key={pose}
                variant={selectedPose === pose ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedPose(pose)}
                className="capitalize whitespace-nowrap"
              >
                {pose.replace("-", " ")}
              </Button>
            ))}
          </div>

          {/* Week Navigation */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">
                    Week {currentWeek?.week}, {currentWeek?.year}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {currentWeek && format(currentWeek.startDate, "MMM d")} -{" "}
                    {currentWeek && format(new Date(currentWeek.startDate.getTime() + 6 * 24 * 60 * 60 * 1000), "MMM d")}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedWeekIndex(Math.min(selectedWeekIndex + 1, weekGroups.length - 1))}
                    disabled={selectedWeekIndex >= weekGroups.length - 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedWeekIndex(Math.max(selectedWeekIndex - 1, 0))}
                    disabled={selectedWeekIndex <= 0}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Zoom Controls */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setZoomLevel(Math.max(50, zoomLevel - 25))}
                  disabled={zoomLevel <= 50}
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium w-12">{zoomLevel}%</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setZoomLevel(Math.min(200, zoomLevel + 25))}
                  disabled={zoomLevel >= 200}
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
              </div>

              {/* Timeline Photos */}
              {filteredPhotos.length > 0 ? (
                <div className="space-y-4">
                  {filteredPhotos.map((photo) => (
                    <div key={photo.id} className="border border-border rounded-lg overflow-hidden bg-muted">
                      <div className="overflow-x-auto flex justify-center p-4">
                        <img
                          src={photo.url}
                          alt={`${photo.pose} pose`}
                          style={{ width: `${zoomLevel}%`, height: "auto" }}
                          className="object-contain transition-all duration-200"
                        />
                      </div>
                      <div className="px-4 pb-4">
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(photo.photo_date), "PPP")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <p className="text-sm">No photos for this week in {selectedPose} pose</p>
                </div>
              )}

              {/* Week Timeline Selector */}
              <div className="pt-4 border-t">
                <p className="text-xs font-medium text-muted-foreground mb-3">Other Weeks</p>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                  {weekGroups.map((week, idx) => {
                    const weekPhotos = week.photos.filter((p) => p.pose === selectedPose);
                    const isSelected = idx === selectedWeekIndex;
                    return (
                      <button
                        key={`${week.year}-W${week.week}`}
                        onClick={() => setSelectedWeekIndex(idx)}
                        className={`p-2 rounded-lg border text-xs transition-all ${
                          isSelected
                            ? "border-primary bg-primary/10 font-medium"
                            : "border-border hover:border-primary/50"
                        } ${weekPhotos.length === 0 ? "opacity-50" : ""}`}
                        disabled={weekPhotos.length === 0}
                      >
                        <p>W{week.week}</p>
                        <p className="text-[10px] text-muted-foreground">{week.year}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sidebyside" className="space-y-4 mt-4">
          {/* Pose Filter */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            {poseOptions.map((pose) => (
              <Button
                key={pose}
                variant={selectedPose === pose ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedPose(pose)}
                className="capitalize whitespace-nowrap"
              >
                {pose.replace("-", " ")}
              </Button>
            ))}
          </div>

          {/* Zoom Controls */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setZoomLevel(Math.max(50, zoomLevel - 25))}
              disabled={zoomLevel <= 50}
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium w-12">{zoomLevel}%</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setZoomLevel(Math.min(200, zoomLevel + 25))}
              disabled={zoomLevel >= 200}
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>

          {/* Week Selection for Comparison */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Compare Weeks</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Week 1 Selector */}
                <div className="space-y-2">
                  <p className="text-sm font-medium">Earlier Week</p>
                  <div className="border border-border rounded-lg p-3">
                    <div className="grid grid-cols-2 gap-2 max-h-[200px] overflow-y-auto">
                      {weekGroups.map((week, idx) => {
                        const weekPhotos = week.photos.filter((p) => p.pose === selectedPose);
                        const isSelected = idx === selectedComparisonWeeks[0];
                        return (
                          <button
                            key={`w1-${week.year}-W${week.week}`}
                            onClick={() => setSelectedComparisonWeeks([idx, selectedComparisonWeeks[1]])}
                            className={`p-2 rounded border text-xs transition-all ${
                              isSelected
                                ? "border-primary bg-primary/10 font-medium"
                                : "border-border hover:border-primary/50"
                            } ${weekPhotos.length === 0 ? "opacity-50" : ""}`}
                            disabled={weekPhotos.length === 0}
                          >
                            <p>W{week.week}</p>
                            <p className="text-[10px] text-muted-foreground">{week.year}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Week 2 Selector */}
                <div className="space-y-2">
                  <p className="text-sm font-medium">Recent Week</p>
                  <div className="border border-border rounded-lg p-3">
                    <div className="grid grid-cols-2 gap-2 max-h-[200px] overflow-y-auto">
                      {weekGroups.map((week, idx) => {
                        const weekPhotos = week.photos.filter((p) => p.pose === selectedPose);
                        const isSelected = idx === selectedComparisonWeeks[1];
                        return (
                          <button
                            key={`w2-${week.year}-W${week.week}`}
                            onClick={() => setSelectedComparisonWeeks([selectedComparisonWeeks[0], idx])}
                            className={`p-2 rounded border text-xs transition-all ${
                              isSelected
                                ? "border-primary bg-primary/10 font-medium"
                                : "border-border hover:border-primary/50"
                            } ${weekPhotos.length === 0 ? "opacity-50" : ""}`}
                            disabled={weekPhotos.length === 0}
                          >
                            <p>W{week.week}</p>
                            <p className="text-[10px] text-muted-foreground">{week.year}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Side-by-Side Comparison */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                {[0, 1].map((idx) => {
                  const weekIndex = selectedComparisonWeeks[idx];
                  const week = weekGroups[weekIndex];
                  const photo = week?.photos.find((p) => p.pose === selectedPose);

                  return (
                    <div key={idx} className="space-y-2">
                      <div className="text-sm font-medium">
                        Week {week?.week}, {week?.year}
                      </div>
                      <div className="border border-border rounded-lg overflow-hidden bg-muted flex items-center justify-center aspect-[3/4]">
                        {photo ? (
                          <div className="w-full h-full flex items-center justify-center p-4">
                            <img
                              src={photo.url}
                              alt={`${photo.pose} pose`}
                              style={{ width: `${zoomLevel}%`, height: "auto", maxHeight: "100%" }}
                              className="object-contain"
                            />
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">No photo available</p>
                        )}
                      </div>
                      {photo && (
                        <p className="text-xs text-muted-foreground text-center">
                          {format(new Date(photo.photo_date), "MMM d, yyyy")}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PhotoComparisonSlider;
