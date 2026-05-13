import { useState, useEffect, forwardRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUnitPreferences } from "@/hooks/useUnitPreferences";
import { useAuth } from "@/hooks/useAuth";
import { useHealthSync } from "@/hooks/useHealthSync";
import { useNavigate } from "react-router-dom";
import { format, subDays } from "date-fns";
import { Footprints, Camera, Flame, MapPin } from "lucide-react";
import CurrentWeightCard from "./CurrentWeightCard";
import WeightHistoryScreen from "./WeightHistoryScreen";
import StepTrendModal from "./StepTrendModal";
import DistanceTrendModal from "./DistanceTrendModal";
import ProgressPhotosModal from "./ProgressPhotosModal";
import SleepCard from "./SleepCard";
import SleepHistoryModal from "./SleepHistoryModal";

interface SparkData {
  value: number;
}

const MiniSparkline = forwardRef<SVGSVGElement, { data: SparkData[]; color?: string }>(
  ({ data, color = "hsl(var(--gold))" }, ref) => {
    if (data.length < 2) return null;
    const max = Math.max(...data.map(d => d.value), 1);
    const min = Math.min(...data.map(d => d.value), 0);
    const range = max - min || 1;
    const w = 80;
    const h = 24;
    const points = data.map((d, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((d.value - min) / range) * h;
      return `${x},${y}`;
    }).join(" ");

    return (
      <svg ref={ref} width={w} height={h} className="mt-1">
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
      </svg>
    );
  }
);

MiniSparkline.displayName = "MiniSparkline";

const ProgressWidgetGrid = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { todayMetrics, weekMetrics, isNative, connection } = useHealthSync();
  const { convertDistance, distanceLabel } = useUnitPreferences();

  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [todayCals, setTodayCals] = useState<number>(0);
  const [calSpark, setCalSpark] = useState<SparkData[]>([]);
  const [dbSteps, setDbSteps] = useState<number | null>(null);
  const [dbDistance, setDbDistance] = useState<number | null>(null);
  const [stepsSpark, setStepsSpark] = useState<SparkData[]>([]);
  const [distanceSpark, setDistanceSpark] = useState<SparkData[]>([]);
  const [stepGoal, setStepGoal] = useState(10000);
  const [weightHistoryOpen, setWeightHistoryOpen] = useState(false);
  const [stepTrendOpen, setStepTrendOpen] = useState(false);
  const [distanceTrendOpen, setDistanceTrendOpen] = useState(false);
  const [photosModalOpen, setPhotosModalOpen] = useState(false);

  const today = format(new Date(), "yyyy-MM-dd");
  const [refreshKey, setRefreshKey] = useState(0);

  // Listen for photo/weight updates to refresh instantly
  useEffect(() => {
    const handler = () => setRefreshKey(k => k + 1);
    window.addEventListener("photos-uploaded", handler);
    window.addEventListener("weight-logged", handler);
    return () => {
      window.removeEventListener("photos-uploaded", handler);
      window.removeEventListener("weight-logged", handler);
    };
  }, []);

  useEffect(() => {
    if (!user) return;

    // Fetch steps + distance from daily_health_metrics (source of truth)
    const fetchHealthMetrics = async () => {
      const sevenAgo = format(subDays(new Date(), 7), "yyyy-MM-dd");
      const { data } = await supabase
        .from("daily_health_metrics")
        .select("metric_date, steps, walking_running_distance_km, step_goal")
        .eq("user_id", user.id)
        .gte("metric_date", sevenAgo)
        .order("metric_date", { ascending: true });

      if (data) {
        const todayRow = data.find((d: any) => d.metric_date === today);
        setDbSteps(todayRow?.steps ?? null);
        setDbDistance(todayRow?.walking_running_distance_km ?? null);
        if (todayRow?.step_goal) setStepGoal(todayRow.step_goal);

        const sSpark: SparkData[] = [];
        const dSpark: SparkData[] = [];
        for (let i = 6; i >= 0; i--) {
          const d = format(subDays(new Date(), i), "yyyy-MM-dd");
          const row = data.find((r: any) => r.metric_date === d);
          sSpark.push({ value: row?.steps ?? 0 });
          dSpark.push({ value: row?.walking_running_distance_km ?? 0 });
        }
        setStepsSpark(sSpark);
        setDistanceSpark(dSpark);
      }
    };

    // Fetch recent photos
    const fetchPhotos = async () => {
      const { data } = await supabase
        .from("progress_photos")
        .select("storage_path")
        .eq("client_id", user.id)
        .order("created_at", { ascending: false })
        .limit(2);
      if (data && data.length > 0) {
        const urls = await Promise.all(
          data.map(async (p) => {
            const { data: urlData } = await supabase.storage
              .from("progress-photos")
              .createSignedUrl(p.storage_path, 3600);
            return urlData?.signedUrl || "";
          })
        );
        setPhotoUrls(urls.filter(Boolean));
      }
    };

    // Fetch calorie data (last 7 days)
    const fetchCalories = async () => {
      const sevenAgo = format(subDays(new Date(), 7), "yyyy-MM-dd");
      const { data } = await supabase
        .from("nutrition_logs")
        .select("calories, logged_at")
        .eq("client_id", user.id)
        .gte("logged_at", sevenAgo)
        .order("logged_at", { ascending: true });
      if (data) {
        const dayMap: Record<string, number> = {};
        data.forEach(d => {
          const day = d.logged_at;
          dayMap[day] = (dayMap[day] || 0) + Number(d.calories || 0);
        });
        setTodayCals(dayMap[today] || 0);
        const spark: SparkData[] = [];
        for (let i = 6; i >= 0; i--) {
          const d = format(subDays(new Date(), i), "yyyy-MM-dd");
          spark.push({ value: dayMap[d] || 0 });
        }
        setCalSpark(spark);
      }
    };

    fetchHealthMetrics();
    fetchPhotos();
    fetchCalories();
  }, [user, today, refreshKey]);

  // Merge: take the higher of DB value or live HealthKit value
  const isConnected = (isNative && connection?.is_connected) || todayMetrics?.source === "apple_health";
  const liveSteps = isConnected ? todayMetrics?.steps ?? null : null;
  const finalSteps = Math.max(dbSteps ?? 0, liveSteps ?? 0);
  const hasSteps = (dbSteps !== null && dbSteps > 0) || (liveSteps !== null && liveSteps > 0);

  const liveDistance = isConnected ? todayMetrics?.walking_running_distance_km ?? null : null;
  const finalDistance = Math.max(dbDistance ?? 0, liveDistance ?? 0);
  const hasDistance = (dbDistance !== null && dbDistance > 0) || (liveDistance !== null && liveDistance > 0);

  const stepPct = stepGoal > 0 ? Math.min(100, Math.round((finalSteps / stepGoal) * 100)) : 0;

  // Use live sparklines from weekMetrics if connected, otherwise DB-fetched
  const finalStepsSpark = isConnected && weekMetrics.length > 0
    ? weekMetrics.map(d => ({ value: d.steps ?? 0 }))
    : stepsSpark;

  return (
    <>
      <div className="space-y-3">
        {/* Steps — Full Width Bar */}
        <button
          onClick={() => setStepTrendOpen(true)}
          className="w-full rounded-xl bg-card border border-border p-3 sm:p-4 text-left transition-colors hover:bg-secondary/30 overflow-hidden"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Footprints className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground">Steps</span>
            </div>
            <div className="flex items-center gap-3">
              <MiniSparkline data={finalStepsSpark} />
              <span className="text-xs text-muted-foreground">
                Goal: {(stepGoal / 1000).toFixed(0)}K
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold text-foreground tabular-nums">
              {hasSteps ? finalSteps.toLocaleString() : "–"}
            </span>
            <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${stepPct}%` }}
              />
            </div>
            <span className="text-xs font-medium text-foreground tabular-nums">{stepPct}%</span>
          </div>
        </button>

        {/* 2x2 Grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* Current Weight */}
          <CurrentWeightCard onClick={() => setWeightHistoryOpen(true)} />

          {/* Progress Photos */}
          <button
            onClick={() => setPhotosModalOpen(true)}
            className="rounded-xl bg-card border border-border p-3 sm:p-4 text-left transition-colors hover:bg-secondary/30 overflow-hidden"
          >
            <div className="flex items-center gap-1.5 mb-1">
              <Camera className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground truncate">Progress Photos</span>
            </div>
            {photoUrls.length > 0 ? (
              <div className="flex gap-1.5 mt-1">
                {photoUrls.map((url, i) => (
                  <img
                    key={i}
                    src={url}
                    alt="Progress"
                    className="h-10 w-10 rounded-md object-cover border border-border/50"
                    loading="lazy"
                  />
                ))}
              </div>
            ) : (
              <div className="text-xl font-bold text-foreground">–</div>
            )}
          </button>

          {/* Caloric Intake */}
          <button
            onClick={() => navigate("/nutrition")}
            className="rounded-xl bg-card border border-border p-3 sm:p-4 text-left transition-colors hover:bg-secondary/30 overflow-hidden"
          >
            <div className="flex items-center gap-1.5 mb-1">
              <Flame className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground truncate">Calories Today</span>
            </div>
            <div className="text-lg sm:text-xl font-bold text-foreground tabular-nums">
              {todayCals > 0 ? todayCals.toLocaleString() : "–"}
            </div>
            <MiniSparkline data={calSpark} />
          </button>

          {/* Distance */}
          <button
            onClick={() => setDistanceTrendOpen(true)}
            className="rounded-xl bg-card border border-border p-3 sm:p-4 text-left transition-colors hover:bg-secondary/30 overflow-hidden"
          >
            <div className="flex items-center gap-1.5 mb-1">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground truncate">Distance</span>
            </div>
            <div className="text-lg sm:text-xl font-bold text-foreground tabular-nums">
              {hasDistance ? `${convertDistance(finalDistance).toFixed(1)} ${distanceLabel}` : "–"}
            </div>
            <MiniSparkline data={distanceSpark} />
          </button>
        </div>
      </div>

      <WeightHistoryScreen
        open={weightHistoryOpen}
        onClose={() => setWeightHistoryOpen(false)}
      />
      <StepTrendModal
        open={stepTrendOpen}
        onClose={() => setStepTrendOpen(false)}
        clientId={user?.id}
      />
      <DistanceTrendModal
        open={distanceTrendOpen}
        onClose={() => setDistanceTrendOpen(false)}
        clientId={user?.id}
      />
      {user && (
        <ProgressPhotosModal
          open={photosModalOpen}
          onClose={() => setPhotosModalOpen(false)}
          clientId={user.id}
        />
      )}
    </>
  );
};

export default ProgressWidgetGrid;
