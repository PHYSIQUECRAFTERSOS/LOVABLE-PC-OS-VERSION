import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useHealthSync } from "@/hooks/useHealthSync";
import { useNavigate } from "react-router-dom";
import { format, subDays } from "date-fns";
import { Footprints, Camera, Flame } from "lucide-react";
import CurrentWeightCard from "./CurrentWeightCard";
import WeightHistoryScreen from "./WeightHistoryScreen";

interface SparkData {
  value: number;
}

const MiniSparkline = ({ data, color = "hsl(var(--gold))" }: { data: SparkData[]; color?: string }) => {
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
    <svg width={w} height={h} className="mt-1">
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
};

const ProgressWidgetGrid = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { todayMetrics, weekMetrics, isNative, connection } = useHealthSync();

  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [todayCals, setTodayCals] = useState<number>(0);
  const [calSpark, setCalSpark] = useState<SparkData[]>([]);
  const [manualSteps, setManualSteps] = useState<number | null>(null);
  const [weightHistoryOpen, setWeightHistoryOpen] = useState(false);

  const today = format(new Date(), "yyyy-MM-dd");

  useEffect(() => {
    if (!user) return;

    // Fetch weight data - try weight_logs first, fallback to onboarding_profiles
    const fetchWeight = async () => {
      const thirtyAgo = format(subDays(new Date(), 30), "yyyy-MM-dd");
      const { data } = await supabase
        .from("weight_logs")
        .select("weight, logged_at")
        .eq("client_id", user.id)
        .gte("logged_at", thirtyAgo)
        .order("logged_at", { ascending: true })
        .limit(30);
      if (data && data.length > 0) {
        setLatestWeight(Number(data[data.length - 1].weight));
        setWeightSpark(data.map(d => ({ value: Number(d.weight) })));
      } else {
        // Fallback: check onboarding_profiles directly
        const { data: onboard } = await supabase
          .from("onboarding_profiles")
          .select("weight_lb")
          .eq("user_id", user.id)
          .maybeSingle();
        if (onboard?.weight_lb && Number(onboard.weight_lb) > 0) {
          setLatestWeight(Number(onboard.weight_lb));
        }
      }
    };

    // Fetch recent photos - use created_at (correct column name)
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

    // Fetch manual steps from daily_health_metrics
    const fetchManualSteps = async () => {
      const { data } = await supabase
        .from("daily_health_metrics")
        .select("steps")
        .eq("user_id", user.id)
        .eq("metric_date", today)
        .maybeSingle();
      if (data?.steps) setManualSteps(data.steps);
    };

    fetchWeight();
    fetchPhotos();
    fetchCalories();
    fetchManualSteps();
  }, [user, today]);

  // Steps data from health sync
  const steps = todayMetrics?.steps ?? null;
  const isConnected = isNative && connection?.is_connected;
  const stepsSpark: SparkData[] = weekMetrics.map(d => ({ value: d.steps ?? 0 }));

  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Steps */}
      <button
        onClick={() => navigate("/progress?tab=steps")}
        className="rounded-xl bg-card border border-border p-4 text-left transition-colors hover:bg-secondary/30"
      >
        <div className="flex items-center gap-1.5 mb-1">
          <Footprints className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Steps</span>
        </div>
        <div className="text-xl font-bold text-foreground tabular-nums">
          {isConnected && steps !== null ? steps.toLocaleString() : manualSteps !== null ? manualSteps.toLocaleString() : "–"}
        </div>
        {isConnected || manualSteps !== null ? (
          <MiniSparkline data={stepsSpark} />
        ) : (
          <span className="text-[10px] text-muted-foreground/60">Connect Health App</span>
        )}
      </button>

      {/* Body Weight */}
      <button
        onClick={() => navigate("/progress?tab=weight")}
        className="rounded-xl bg-card border border-border p-4 text-left transition-colors hover:bg-secondary/30"
      >
        <div className="flex items-center gap-1.5 mb-1">
          <Scale className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Body Weight</span>
        </div>
        <div className="text-xl font-bold text-foreground tabular-nums">
          {latestWeight !== null ? `${latestWeight} lbs` : "–"}
        </div>
        <MiniSparkline data={weightSpark} />
      </button>

      {/* Progress Photos */}
      <button
        onClick={() => navigate("/progress?tab=photos")}
        className="rounded-xl bg-card border border-border p-4 text-left transition-colors hover:bg-secondary/30"
      >
        <div className="flex items-center gap-1.5 mb-1">
          <Camera className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Progress Photos</span>
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
        className="rounded-xl bg-card border border-border p-4 text-left transition-colors hover:bg-secondary/30"
      >
        <div className="flex items-center gap-1.5 mb-1">
          <Flame className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Calories Today</span>
        </div>
        <div className="text-xl font-bold text-foreground tabular-nums">
          {todayCals > 0 ? todayCals.toLocaleString() : "–"}
        </div>
        <MiniSparkline data={calSpark} />
      </button>
    </div>
  );
};

export default ProgressWidgetGrid;
