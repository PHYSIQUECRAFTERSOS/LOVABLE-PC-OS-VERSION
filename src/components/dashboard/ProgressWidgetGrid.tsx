import { useState, useEffect, forwardRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUnitPreferences } from "@/hooks/useUnitPreferences";
import { useAuth } from "@/hooks/useAuth";
import { useHealthSync } from "@/hooks/useHealthSync";
import { useCoachStepGoal } from "@/hooks/useCoachStepGoal";
import { useDataFetch, invalidateCacheByPrefix } from "@/hooks/useDataFetch";
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
import { getLocalDateString } from "@/utils/localDate";
import { readSnapshotSlice, writeSnapshotSlice, type ProgressWidgetSlice } from "@/lib/dashboardSnapshot";


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

const STALE = 5 * 60 * 1000;

interface HealthMetricsResult {
  dbSteps: number | null;
  dbDistance: number | null;
  dbStepGoal: number | null;
  stepsSpark: SparkData[];
  distanceSpark: SparkData[];
}

interface CaloriesResult {
  todayCals: number;
  calSpark: SparkData[];
}

const ProgressWidgetGrid = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { todayMetrics, weekMetrics, isNative, connection } = useHealthSync();
  const { convertDistance, distanceLabel } = useUnitPreferences();

  const [weightHistoryOpen, setWeightHistoryOpen] = useState(false);
  const [stepTrendOpen, setStepTrendOpen] = useState(false);
  const [distanceTrendOpen, setDistanceTrendOpen] = useState(false);
  const [photosModalOpen, setPhotosModalOpen] = useState(false);
  const [sleepHistoryOpen, setSleepHistoryOpen] = useState(false);

  const today = getLocalDateString();
  const uid = user?.id ?? "anon";

  const { data: photoData, refetch: refetchPhotos } = useDataFetch<string[]>({
    queryKey: `progress-photos-${uid}`,
    enabled: !!user,
    staleTime: STALE,
    fallback: [],
    queryFn: async () => {
      const { data } = await supabase
        .from("progress_photos")
        .select("storage_path")
        .eq("client_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(2);
      if (!data || data.length === 0) return [];
      const results = await Promise.allSettled(
        data.map((p) =>
          supabase.storage.from("progress-photos").createSignedUrl(p.storage_path, 3600)
        )
      );
      return results
        .map((r) => (r.status === "fulfilled" ? r.value.data?.signedUrl || "" : ""))
        .filter(Boolean);
    },
  });

  const { data: metricsData, refetch: refetchMetrics } = useDataFetch<HealthMetricsResult>({
    queryKey: `progress-metrics-${uid}-${today}`,
    enabled: !!user,
    staleTime: STALE,
    fallback: { dbSteps: null, dbDistance: null, dbStepGoal: null, stepsSpark: [], distanceSpark: [] },
    queryFn: async () => {
      // Duplicate registration returns same cached result via queryKey.
      const sevenAgo = format(subDays(new Date(), 7), "yyyy-MM-dd");
      const { data } = await supabase
        .from("daily_health_metrics")
        .select("metric_date, steps, walking_running_distance_km, step_goal")
        .eq("user_id", user!.id)
        .gte("metric_date", sevenAgo)
        .order("metric_date", { ascending: true });
      const rows = data ?? [];
      const todayRow = rows.find((d) => d.metric_date === today);
      const sSpark: SparkData[] = [];
      const dSpark: SparkData[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = format(subDays(new Date(), i), "yyyy-MM-dd");
        const row = rows.find((r) => r.metric_date === d);
        sSpark.push({ value: row?.steps ?? 0 });
        dSpark.push({ value: row?.walking_running_distance_km ?? 0 });
      }
      return {
        dbSteps: todayRow?.steps ?? null,
        dbDistance: todayRow?.walking_running_distance_km ?? null,
        dbStepGoal: todayRow?.step_goal ?? null,
        stepsSpark: sSpark,
        distanceSpark: dSpark,
      };
    },
  });

  const { data: caloriesData } = useDataFetch<CaloriesResult>({
    queryKey: `progress-calories-${uid}-${today}`,
    enabled: !!user,
    staleTime: STALE,
    fallback: { todayCals: 0, calSpark: [] },
    queryFn: async () => {
      const sevenAgo = format(subDays(new Date(), 7), "yyyy-MM-dd");
      const { data } = await supabase
        .from("nutrition_logs")
        .select("calories, logged_at")
        .eq("client_id", user!.id)
        .gte("logged_at", sevenAgo)
        .order("logged_at", { ascending: true });
      const dayMap: Record<string, number> = {};
      (data ?? []).forEach((d) => {
        const day = d.logged_at;
        dayMap[day] = (dayMap[day] || 0) + Number(d.calories || 0);
      });
      const spark: SparkData[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = format(subDays(new Date(), i), "yyyy-MM-dd");
        spark.push({ value: dayMap[d] || 0 });
      }
      return { todayCals: dayMap[today] || 0, calSpark: spark };
    },
  });

  // Listen for external updates → invalidate + refetch the affected key.
  useEffect(() => {
    const onPhotos = () => {
      invalidateCacheByPrefix(`progress-photos-${uid}`);
      refetchPhotos();
    };
    const onWeight = () => {
      // Weight card is separate, but metrics may also refresh.
      invalidateCacheByPrefix(`progress-metrics-${uid}-`);
      refetchMetrics();
    };
    window.addEventListener("photos-uploaded", onPhotos);
    window.addEventListener("weight-logged", onWeight);
    return () => {
      window.removeEventListener("photos-uploaded", onPhotos);
      window.removeEventListener("weight-logged", onWeight);
    };
  }, [uid, refetchPhotos, refetchMetrics]);

  // Snapshot hydration: fall back to last-known values when the live fetches
  // haven't populated yet (cold boot after CacheBuster wipes web caches).
  const snapshot = user ? readSnapshotSlice(user.id, "progressWidget", today) : null;

  const dbSteps = metricsData?.dbSteps ?? snapshot?.dbSteps ?? null;
  const dbDistance = metricsData?.dbDistance ?? snapshot?.dbDistance ?? null;
  const dbStepGoal = metricsData?.dbStepGoal ?? snapshot?.dbStepGoal ?? null;
  const stepsSpark = metricsData?.stepsSpark ?? snapshot?.stepsSpark ?? [];
  const distanceSpark = metricsData?.distanceSpark ?? snapshot?.distanceSpark ?? [];
  const photoUrls = photoData ?? snapshot?.photoUrls ?? [];
  const todayCals = caloriesData?.todayCals ?? snapshot?.todayCals ?? 0;
  const calSpark = caloriesData?.calSpark ?? snapshot?.calSpark ?? [];

  // Persist current merged state back to the snapshot whenever any slice
  // resolves. Writes are tiny and validated inside the helper.
  useEffect(() => {
    if (!user?.id) return;
    if (!metricsData && !photoData && !caloriesData) return;
    const slice: ProgressWidgetSlice = {
      dbSteps: metricsData?.dbSteps ?? snapshot?.dbSteps ?? null,
      dbDistance: metricsData?.dbDistance ?? snapshot?.dbDistance ?? null,
      dbStepGoal: metricsData?.dbStepGoal ?? snapshot?.dbStepGoal ?? null,
      stepsSpark: metricsData?.stepsSpark ?? snapshot?.stepsSpark ?? [],
      distanceSpark: metricsData?.distanceSpark ?? snapshot?.distanceSpark ?? [],
      photoUrls: photoData ?? snapshot?.photoUrls ?? [],
      todayCals: caloriesData?.todayCals ?? snapshot?.todayCals ?? 0,
      calSpark: caloriesData?.calSpark ?? snapshot?.calSpark ?? [],
    };
    writeSnapshotSlice(user.id, "progressWidget", slice, today);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metricsData, photoData, caloriesData, user?.id, today]);


  // Merge: take the higher of DB value or live HealthKit value
  const isConnected = (isNative && connection?.is_connected) || todayMetrics?.source === "apple_health";
  const liveSteps = isConnected ? todayMetrics?.steps ?? null : null;
  const finalSteps = Math.max(dbSteps ?? 0, liveSteps ?? 0);
  const hasSteps = (dbSteps !== null && dbSteps > 0) || (liveSteps !== null && liveSteps > 0);

  const liveDistance = isConnected ? todayMetrics?.walking_running_distance_km ?? null : null;
  const finalDistance = Math.max(dbDistance ?? 0, liveDistance ?? 0);
  const hasDistance = (dbDistance !== null && dbDistance > 0) || (liveDistance !== null && liveDistance > 0);
  const stepGoal = useCoachStepGoal(dbStepGoal);

  const stepPct = stepGoal > 0 ? Math.min(100, Math.round((finalSteps / stepGoal) * 100)) : 0;

  // Use live sparklines from weekMetrics if connected, otherwise DB-fetched
  const finalStepsSpark = isConnected && weekMetrics.length > 0
    ? weekMetrics.map(d => ({ value: d.steps ?? 0 }))
    : stepsSpark;

  return (
    <>
      <div className="space-y-3">
        {/* Steps + Sleep — 2-col row */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setStepTrendOpen(true)}
            className="rounded-xl bg-card border border-border p-3 sm:p-4 text-left transition-colors hover:bg-secondary/30 overflow-hidden"
          >
            <div className="flex items-center gap-1.5 mb-1">
              <Footprints className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground truncate">Steps</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg sm:text-xl font-bold text-foreground tabular-nums">
                {hasSteps ? finalSteps.toLocaleString() : "–"}
              </span>
              <span className="text-[10px] text-muted-foreground tabular-nums">/ {(stepGoal / 1000).toFixed(0)}K</span>
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${stepPct}%` }}
                />
              </div>
              <span className="text-[10px] font-medium text-foreground tabular-nums">{stepPct}%</span>
            </div>
          </button>

          <SleepCard onClick={() => setSleepHistoryOpen(true)} />
        </div>

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
      <SleepHistoryModal
        open={sleepHistoryOpen}
        onClose={() => setSleepHistoryOpen(false)}
      />
    </>
  );
};

export default ProgressWidgetGrid;
