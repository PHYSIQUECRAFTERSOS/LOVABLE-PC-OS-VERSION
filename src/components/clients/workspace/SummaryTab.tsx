import { useState, useEffect, forwardRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dumbbell,
  UtensilsCrossed,
  TrendingDown,
  TrendingUp,
  Activity,
  CalendarDays,
  Target,
  Camera,
  Scale,
  Flame,
  Footprints,
  MapPin,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Circle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import StepTrendModal from "@/components/dashboard/StepTrendModal";
import DistanceTrendModal from "@/components/dashboard/DistanceTrendModal";
import SleepCard from "@/components/dashboard/SleepCard";
import SleepHistoryModal from "@/components/dashboard/SleepHistoryModal";
import WeightHistoryScreen from "@/components/dashboard/WeightHistoryScreen";
import ProgressPhotosModal from "@/components/dashboard/ProgressPhotosModal";
import DateNavigator from "@/components/dashboard/DateNavigator";
import EventDetailModal from "@/components/calendar/EventDetailModal";
import TierBadge from "@/components/ranked/TierBadge";
import PlacementTracker from "@/components/ranked/PlacementTracker";
import { calculateTierAndDivision, getDivisionLabel, getTierColor } from "@/utils/rankedXP";
import { CalendarEvent } from "@/components/calendar/CalendarGrid";
import { format, subDays, addDays, isToday } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatServingDisplay } from "@/utils/formatServingDisplay";
import { MEAL_SECTIONS, mapMealNameToKey } from "@/hooks/useMealPlanTracker";

/* ─── MiniSparkline ─── */
const MiniSparkline = forwardRef<SVGSVGElement, { data: { value: number }[]; color?: string }>(
  ({ data, color = "hsl(var(--primary))" }, ref) => {
    if (data.length < 2) return null;
    const max = Math.max(...data.map(d => d.value), 1);
    const min = Math.min(...data.map(d => d.value), 0);
    const range = max - min || 1;
    const w = 80, h = 24;
    const points = data.map((d, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((d.value - min) / range) * h;
      return `${x},${y}`;
    }).join(" ");
    return (
      <svg ref={ref} width={w} height={h} className="mt-1">
        <polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={points} />
      </svg>
    );
  }
);
MiniSparkline.displayName = "MiniSparkline";

/* ─── types ─── */
interface SummaryData {
  currentWeight: number | null;
  weightTrend: "up" | "down" | "stable";
  streak: number;
  lastCheckin: string | null;
  currentPhase: string | null;
  programName: string | null;
}

interface RankedProfile {
  total_xp: number;
  current_tier: string;
  current_division: number | null;
  current_streak: number;
  placement_status: string | null;
  placement_days_completed: number | null;
}

interface CalendarAction {
  id: string;
  event_type: string;
  title: string;
  is_completed: boolean;
  linked_workout_id?: string | null;
  event_date?: string;
  description?: string | null;
  notes?: string | null;
  event_time?: string | null;
  end_time?: string | null;
  is_recurring?: boolean;
  recurrence_pattern?: string | null;
  color?: string | null;
  completed_at?: string | null;
}

interface NutritionTargets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface LoggedMacros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface FoodLogEntry {
  id: string;
  meal_type: string;
  food_name: string;
  brand?: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  servings: number;
  quantity_display: number | null;
  quantity_unit: string | null;
  serving_info: { serving_size: number; serving_unit: string; serving_label: string | null } | null;
}

interface ComplianceDay {
  date: string;
  dayLabel: string;
  logged: number;
  target: number | null;
  status: "on_target" | "close" | "missed" | "no_target";
}

interface MacroAverages {
  averages: { calories: number; protein: number; carbs: number; fat: number };
  targets: { calories: number | null; protein: number | null; carbs: number | null; fat: number | null };
  daysTracked: number;
}

/* ─── Macro Ring SVG ─── */
const MacroRing = ({
  value, target, label, color, unit = "",
}: {
  value: number; target: number; label: string; color: string; unit?: string;
}) => {
  const pct = target > 0 ? Math.min(value / target, 1) : 0;
  const r = 28;
  const circ = 2 * Math.PI * r;
  const offset = circ - pct * circ;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={72} height={72} className="-rotate-90">
        <circle cx={36} cy={36} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={5} />
        <circle cx={36} cy={36} r={r} fill="none" stroke={color} strokeWidth={5}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <span className="text-sm font-bold text-foreground -mt-[52px]">
        {Math.round(value)}{unit}
      </span>
      <p className="text-[10px] text-muted-foreground mt-6">{label}</p>
      {target > 0 && (
        <p className="text-[10px] text-muted-foreground">/ {target}{unit}</p>
      )}
    </div>
  );
};

/* ─── 7-Day Compliance Strip ─── */
const ComplianceStrip = ({
  compliance, onDayClick, selectedDate,
}: {
  compliance: ComplianceDay[]; onDayClick: (date: string) => void; selectedDate: string;
}) => {
  const colorMap: Record<string, string> = {
    on_target: "hsl(142 71% 45%)",
    close: "hsl(var(--primary))",
    missed: "hsl(var(--destructive))",
    no_target: "hsl(var(--muted-foreground) / 0.3)",
  };

  return (
    <div className="mb-4">
      <div className="flex justify-between items-end mb-2 px-1">
        {compliance.map((day) => (
          <button
            key={day.date}
            onClick={() => onDayClick(day.date)}
            className="flex flex-col items-center gap-1 group"
          >
            <div
              className={cn(
                "w-3 h-3 rounded-full transition-transform group-hover:scale-125",
                selectedDate === day.date && "ring-2 ring-foreground ring-offset-2 ring-offset-background"
              )}
              style={{ backgroundColor: colorMap[day.status] }}
            />
            <span className="text-[10px] text-muted-foreground">{day.dayLabel}</span>
          </button>
        ))}
      </div>
      <div className="flex gap-3 mt-1 px-1">
        {[
          { label: "On target", cls: "bg-green-500" },
          { label: "Close", cls: "bg-primary" },
          { label: "Missed", cls: "bg-destructive" },
        ].map(({ label, cls }) => (
          <span key={label} className="flex items-center gap-1">
            <span className={cn("w-2 h-2 rounded-full inline-block", cls)} />
            <span className="text-[10px] text-muted-foreground">{label}</span>
          </span>
        ))}
      </div>
    </div>
  );
};

/* ─── 7-Day Macro Comparison Chart ─── */
const MacroComparisonChart = ({ averages, targets, daysTracked }: MacroAverages) => {
  const rows = [
    { label: "Calories", avg: averages.calories, target: targets.calories, unit: "" },
    { label: "Protein", avg: averages.protein, target: targets.protein, unit: "g" },
    { label: "Carbs", avg: averages.carbs, target: targets.carbs, unit: "g" },
    { label: "Fat", avg: averages.fat, target: targets.fat, unit: "g" },
  ];

  const getBarClasses = (pct: number) => {
    if (pct >= 0.9 && pct <= 1.1) return "bg-green-500";
    if (pct >= 0.7 && pct <= 1.3) return "bg-primary";
    return "bg-destructive";
  };

  const getBadgeClasses = (pct: number) => {
    if (pct >= 0.9 && pct <= 1.1) return "bg-green-500/15 text-green-400";
    if (pct >= 0.7 && pct <= 1.3) return "bg-primary/15 text-primary";
    return "bg-destructive/15 text-destructive";
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">7-Day Macro Averages</CardTitle>
          <span className="text-xs text-muted-foreground">{daysTracked}/7 days tracked</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3.5">
        {rows.map(({ label, avg, target, unit }) => {
          const pct = target ? avg / target : 0;
          const barWidth = Math.min(pct * 100, 120);
          const pctDisplay = target ? Math.round(pct * 100) : null;

          return (
            <div key={label}>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-foreground w-16">{label}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-foreground">{avg}{unit}</span>
                  {target && (
                    <span className="text-xs text-muted-foreground">/ {target}{unit}</span>
                  )}
                  {pctDisplay !== null && (
                    <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", getBadgeClasses(pct))}>
                      {pctDisplay}%
                    </span>
                  )}
                </div>
              </div>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all duration-500", target ? getBarClasses(pct) : "bg-muted-foreground/30")}
                  style={{ width: `${Math.min(barWidth, 100)}%` }}
                />
              </div>
            </div>
          );
        })}
        {daysTracked === 0 && (
          <p className="text-xs text-muted-foreground text-center py-2">
            No nutrition data tracked in the past 7 days
          </p>
        )}
      </CardContent>
    </Card>
  );
};

/* ─── Main Component ─── */
const ClientWorkspaceSummary = ({ clientId }: { clientId: string }) => {
  const { user } = useAuth();
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);

  // Date navigator state
  const [selectedDate, setSelectedDate] = useState(new Date());
  const selectedDateStr = format(selectedDate, "yyyy-MM-dd");

  // Extended data
  const [actions, setActions] = useState<CalendarAction[]>([]);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [todayCals, setTodayCals] = useState(0);
  const [targets, setTargets] = useState<NutritionTargets | null>(null);
  const [loggedMacros, setLoggedMacros] = useState<LoggedMacros>({ calories: 0, protein: 0, carbs: 0, fat: 0 });

  // Food log with date nav
  const [logDate, setLogDate] = useState(new Date());
  const [foodLog, setFoodLog] = useState<FoodLogEntry[]>([]);
  const [foodLogLoading, setFoodLogLoading] = useState(false);
  const [openMeals, setOpenMeals] = useState<Record<string, boolean>>(
    () => Object.fromEntries(MEAL_SECTIONS.map(s => [s.key, true]))
  );

  // Momentum
  const [weightTrend30, setWeightTrend30] = useState<string>("—");
  const [workouts7d, setWorkouts7d] = useState(0);

  // 7-day compliance + macro averages
  const [compliance7d, setCompliance7d] = useState<ComplianceDay[]>([]);
  const [macroAvg, setMacroAvg] = useState<MacroAverages | null>(null);

  // Steps data
  const [todaySteps, setTodaySteps] = useState<number | null>(null);
  const [stepGoal, setStepGoal] = useState(10000);
  const [stepsLastSynced, setStepsLastSynced] = useState<string | null>(null);
  const [stepsProvider, setStepsProvider] = useState<string | null>(null);
  const [stepTrendOpen, setStepTrendOpen] = useState(false);
  const [sleepHistoryOpen, setSleepHistoryOpen] = useState(false);
  const [clientNameForSteps, setClientNameForSteps] = useState("");
  const [weightHistoryOpen, setWeightHistoryOpen] = useState(false);
  const [photosModalOpen, setPhotosModalOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState<CalendarEvent | null>(null);
  const [showEventDetail, setShowEventDetail] = useState(false);

  // Ranked profile
  const [rankedProfile, setRankedProfile] = useState<RankedProfile | null>(null);

  // Distance + sparklines
  const [distanceToday, setDistanceToday] = useState<number | null>(null);
  const [stepsSpark, setStepsSpark] = useState<{ value: number }[]>([]);
  const [distanceSpark, setDistanceSpark] = useState<{ value: number }[]>([]);
  const [calSpark, setCalSpark] = useState<{ value: number }[]>([]);
  const [distanceTrendOpen, setDistanceTrendOpen] = useState(false);

  const today = format(new Date(), "yyyy-MM-dd");

  /* ─── Load summary cards ─── */
  useEffect(() => {
    if (!clientId || !user) return;
    const load = async () => {
      setLoading(true);
      const last7 = Array.from({ length: 7 }, (_, i) =>
        format(subDays(new Date(), i), "yyyy-MM-dd")
      ).reverse();

      const [sessionsRes, weightsRes, checkinRes, assignmentRes] = await Promise.all([
        supabase.from("workout_sessions").select("created_at, completed_at")
          .eq("client_id", clientId).gte("created_at", `${last7[0]}T00:00:00`),
        supabase.from("weight_logs").select("weight, logged_at")
          .eq("client_id", clientId).order("logged_at", { ascending: false }).limit(7),
        supabase.from("checkin_submissions").select("submitted_at")
          .eq("client_id", clientId).eq("status", "submitted")
          .order("submitted_at", { ascending: false }).limit(1),
        supabase.from("client_program_assignments")
          .select("current_week_number, program_id, current_phase_id, programs(name), program_phases(name)")
          .eq("client_id", clientId).eq("status", "active").limit(1).maybeSingle(),
      ]);

      const sessions = sessionsRes.data || [];

      let streak = 0;
      for (let i = 6; i >= 0; i--) {
        if (sessions.some((s) => format(new Date(s.created_at), "yyyy-MM-dd") === last7[i] && s.completed_at)) streak++;
        else break;
      }

      const weights = weightsRes.data || [];
      const currentWeight = weights[0]?.weight ? Number(weights[0].weight) : null;
      let weightTrend: "up" | "down" | "stable" = "stable";
      if (weights.length >= 2) {
        const diff = Number(weights[0].weight) - Number(weights[weights.length - 1].weight);
        weightTrend = diff > 0.2 ? "up" : diff < -0.2 ? "down" : "stable";
      }

      const assignment = assignmentRes.data as any;
      setData({
        currentWeight, weightTrend, streak,
        lastCheckin: (checkinRes.data as any)?.[0]?.submitted_at || null,
        currentPhase: assignment?.program_phases?.name || null,
        programName: assignment?.programs?.name || null,
      });
      setLoading(false);
    };
    load();
  }, [clientId, user]);

  /* ─── Load extended dashboard data ─── */
  useEffect(() => {
    if (!clientId || !user) return;

    const last7dates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return format(d, "yyyy-MM-dd");
    });

    const loadExtended = async () => {
      const [actionsRes, photosRes, targetsRes, todayLogsRes, weight30Res, workouts7Res, compliance7Res] =
        await Promise.all([
          supabase.from("calendar_events").select("id, event_type, title, is_completed, linked_workout_id, event_date, description, notes, event_time, end_time, is_recurring, recurrence_pattern, color, completed_at")
            .or(`user_id.eq.${clientId},target_client_id.eq.${clientId}`).eq("event_date", selectedDateStr),
          supabase.from("progress_photos").select("id, storage_path, created_at")
            .eq("client_id", clientId).order("created_at", { ascending: false }).limit(3),
          supabase.from("nutrition_targets").select("calories, protein, carbs, fat, daily_step_goal")
            .eq("client_id", clientId).order("effective_date", { ascending: false }).limit(1).maybeSingle(),
          supabase.from("nutrition_logs").select("calories, protein, carbs, fat")
            .eq("client_id", clientId).eq("logged_at", selectedDateStr),
          supabase.from("weight_logs").select("weight, logged_at")
            .eq("client_id", clientId).gte("logged_at", format(subDays(new Date(), 30), "yyyy-MM-dd"))
            .order("logged_at", { ascending: true }),
          supabase.from("workout_sessions").select("id")
            .eq("client_id", clientId).not("completed_at", "is", null)
            .gte("created_at", `${format(subDays(new Date(), 7), "yyyy-MM-dd")}T00:00:00`),
          supabase.from("nutrition_logs").select("logged_at, calories, protein, carbs, fat")
            .eq("client_id", clientId).in("logged_at", last7dates),
        ]);

      // Cross-reference workout actions with workout_sessions to fix completion status
      const rawActions = (actionsRes.data || []) as CalendarAction[];
      const workoutActions = rawActions.filter(a => a.event_type === "workout" && a.linked_workout_id && !a.is_completed);
      if (workoutActions.length > 0) {
        const workoutIds = workoutActions.map(a => a.linked_workout_id!);
        const { data: sessionsForDay } = await supabase.from("workout_sessions")
          .select("workout_id, completed_at, status")
          .eq("client_id", clientId)
          .eq("status", "completed")
          .in("workout_id", workoutIds);
        const completedWorkoutIds = new Set((sessionsForDay || []).map(s => s.workout_id));
        const mergedActions = rawActions.map(a => {
          if (a.event_type === "workout" && a.linked_workout_id && completedWorkoutIds.has(a.linked_workout_id)) {
            return { ...a, is_completed: true };
          }
          return a;
        });
        setActions(mergedActions);
      } else {
        setActions(rawActions);
      }

      // Photos
      const photos = photosRes.data || [];
      if (photos.length > 0) {
        const urls = await Promise.all(
          photos.map(async (p) => {
            const { data: urlData } = await supabase.storage
              .from("progress-photos").createSignedUrl(p.storage_path, 3600);
            return urlData?.signedUrl || "";
          })
        );
        setPhotoUrls(urls.filter(Boolean));
      } else {
        setPhotoUrls([]);
      }

      // Nutrition targets
      const calTarget = targetsRes.data?.calories || 0;
      const protTarget = targetsRes.data?.protein || 0;
      const carbTarget = targetsRes.data?.carbs || 0;
      const fatTarget = targetsRes.data?.fat || 0;
      const dbStepGoal = (targetsRes.data as any)?.daily_step_goal;
      if (dbStepGoal && dbStepGoal > 0) setStepGoal(dbStepGoal);
      if (targetsRes.data) {
        setTargets({ calories: calTarget, protein: protTarget, carbs: carbTarget, fat: fatTarget });
      }

      // Today macros
      const logs = todayLogsRes.data || [];
      const logged = logs.reduce(
        (acc, r) => ({
          calories: acc.calories + Number(r.calories || 0),
          protein: acc.protein + Number(r.protein || 0),
          carbs: acc.carbs + Number(r.carbs || 0),
          fat: acc.fat + Number(r.fat || 0),
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 }
      );
      setLoggedMacros(logged);
      setTodayCals(Math.round(logged.calories));

      // Momentum
      const w30 = weight30Res.data || [];
      if (w30.length >= 2) {
        const diff = Number(w30[w30.length - 1].weight) - Number(w30[0].weight);
        setWeightTrend30(diff > 0.5 ? `+${diff.toFixed(1)} lbs` : diff < -0.5 ? `${diff.toFixed(1)} lbs` : "Stable");
      }
      setWorkouts7d((workouts7Res.data || []).length);

      // ─── 7-Day Compliance Strip ───
      const compLogs = compliance7Res.data || [];
      const dailyTotals: Record<string, { cal: number; p: number; c: number; f: number; hasData: boolean }> = {};
      last7dates.forEach((d) => { dailyTotals[d] = { cal: 0, p: 0, c: 0, f: 0, hasData: false }; });
      compLogs.forEach((r) => {
        if (!dailyTotals[r.logged_at]) return;
        dailyTotals[r.logged_at].cal += Number(r.calories || 0);
        dailyTotals[r.logged_at].p += Number(r.protein || 0);
        dailyTotals[r.logged_at].c += Number(r.carbs || 0);
        dailyTotals[r.logged_at].f += Number(r.fat || 0);
        if (Number(r.calories || 0) > 0) dailyTotals[r.logged_at].hasData = true;
      });

      const compDays: ComplianceDay[] = last7dates.map((date) => {
        const d = new Date(date + "T12:00:00");
        const dayLabel = d.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 3);
        const loggedCal = dailyTotals[date].cal;
        let status: ComplianceDay["status"];
        if (!calTarget) {
          status = "no_target";
        } else {
          const pct = loggedCal / calTarget;
          if (pct >= 0.9 && pct <= 1.1) status = "on_target";
          else if (pct >= 0.7 && pct <= 1.3) status = "close";
          else status = "missed";
        }
        return { date, dayLabel, logged: loggedCal, target: calTarget || null, status };
      });
      setCompliance7d(compDays);

      // ─── 7-Day Macro Averages ───
      const activeDays = Object.values(dailyTotals).filter((d) => d.hasData);
      const count = activeDays.length || 1;
      setMacroAvg({
        averages: {
          calories: Math.round(activeDays.reduce((s, d) => s + d.cal, 0) / count),
          protein: Math.round(activeDays.reduce((s, d) => s + d.p, 0) / count),
          carbs: Math.round(activeDays.reduce((s, d) => s + d.c, 0) / count),
          fat: Math.round(activeDays.reduce((s, d) => s + d.f, 0) / count),
        },
        targets: {
          calories: calTarget || null,
          protein: protTarget || null,
          carbs: carbTarget || null,
          fat: fatTarget || null,
        },
        daysTracked: activeDays.length,
      });

      // ─── Calorie Sparkline ───
      const cSpark: { value: number }[] = last7dates.map((date) => ({
        value: dailyTotals[date]?.cal || 0,
      }));
      setCalSpark(cSpark);
    };

    loadExtended();

    // Listen for FAB-scheduled events to refetch instantly
    const handler = () => {
      setTimeout(() => loadExtended(), 300);
      setTimeout(() => loadExtended(), 1500);
    };
    window.addEventListener("calendar-event-added", handler);
    return () => window.removeEventListener("calendar-event-added", handler);
  }, [clientId, user, selectedDateStr]);

  /* ─── Load steps data for client ─── */
  useEffect(() => {
    if (!clientId) return;
    const loadSteps = async () => {
      const todayStr = format(new Date(), "yyyy-MM-dd");
      const { data: metrics } = await supabase
        .from("daily_health_metrics")
        .select("steps, step_goal, synced_at")
        .eq("user_id", clientId)
        .eq("metric_date", todayStr)
        .maybeSingle();
      if (metrics) {
        setTodaySteps(metrics.steps ?? null);
        if (metrics.step_goal) setStepGoal(metrics.step_goal);
        setStepsLastSynced(metrics.synced_at ?? null);
      }
      const { data: wearConn } = await supabase
        .from("wearable_connections")
        .select("provider, last_synced_at, sync_status")
        .eq("client_id", clientId)
        .eq("sync_status", "connected")
        .order("last_synced_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (wearConn) {
        const providerLabels: Record<string, string> = {
          fitbit: "Fitbit", google_fit: "Google Fit", apple_health: "Apple Health", whoop: "Whoop"
        };
        setStepsProvider(providerLabels[wearConn.provider] || wearConn.provider);
        if (wearConn.last_synced_at) setStepsLastSynced(wearConn.last_synced_at);
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", clientId)
        .maybeSingle();
      setClientNameForSteps(profile?.full_name || "Client");
    };
    loadSteps();
  }, [clientId]);

  /* ─── Load ranked profile + health metrics (distance, sparklines) ─── */
  useEffect(() => {
    if (!clientId) return;
    const loadRankedAndHealth = async () => {
      const sevenAgo = format(subDays(new Date(), 7), "yyyy-MM-dd");
      const [rankedRes, healthRes] = await Promise.all([
        (supabase as any).from("ranked_profiles").select("total_xp, current_tier, current_division, current_streak, placement_status, placement_days_completed").eq("user_id", clientId).maybeSingle(),
        supabase.from("daily_health_metrics").select("metric_date, steps, walking_running_distance_km").eq("user_id", clientId).gte("metric_date", sevenAgo).order("metric_date", { ascending: true }),
      ]);
      if (rankedRes.data) setRankedProfile(rankedRes.data as RankedProfile);
      if (healthRes.data) {
        const todayRow = (healthRes.data as any[]).find((d: any) => d.metric_date === today);
        setDistanceToday(todayRow?.walking_running_distance_km ?? null);
        const sSpark: { value: number }[] = [];
        const dSpark: { value: number }[] = [];
        for (let i = 6; i >= 0; i--) {
          const d = format(subDays(new Date(), i), "yyyy-MM-dd");
          const row = (healthRes.data as any[]).find((r: any) => r.metric_date === d);
          sSpark.push({ value: row?.steps ?? 0 });
          dSpark.push({ value: row?.walking_running_distance_km ?? 0 });
        }
        setStepsSpark(sSpark);
        setDistanceSpark(dSpark);
      }
    };
    loadRankedAndHealth();
  }, [clientId, today]);

  const formatRelativeTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return format(new Date(dateStr), "MMM d, h:mm a");
  };

  /* ─── Food log per date ─── */
  useEffect(() => {
    if (!clientId) return;
    const dateStr = format(logDate, "yyyy-MM-dd");
    setFoodLogLoading(true);

    const loadFoodLog = async () => {
      const { data: logs } = await supabase
        .from("nutrition_logs")
        .select("id, meal_type, custom_name, food_item_id, calories, protein, carbs, fat, servings, quantity_display, quantity_unit")
        .eq("client_id", clientId).eq("logged_at", dateStr)
        .order("created_at", { ascending: true });

      const entries = logs || [];
      const foodIds = entries.filter((r) => r.food_item_id).map((r) => r.food_item_id!);
      let foodMap: Record<string, { name: string; brand: string | null; serving_size: number; serving_unit: string; serving_label: string | null }> = {};

      if (foodIds.length > 0) {
        const { data: foods } = await supabase.from("food_items").select("id, name, brand, serving_size, serving_unit, serving_label").in("id", foodIds);
        (foods || []).forEach((f) => { foodMap[f.id] = { name: f.name, brand: f.brand, serving_size: f.serving_size, serving_unit: f.serving_unit, serving_label: f.serving_label }; });
      }

      setFoodLog(
        entries.map((r) => ({
          id: r.id,
          meal_type: r.meal_type || "snack",
          food_name: r.custom_name || foodMap[r.food_item_id!]?.name || "Unknown food",
          brand: foodMap[r.food_item_id!]?.brand || null,
          calories: Number(r.calories || 0),
          protein: Number(r.protein || 0),
          carbs: Number(r.carbs || 0),
          fat: Number(r.fat || 0),
          servings: Number(r.servings || 1),
          quantity_display: r.quantity_display ? Number(r.quantity_display) : null,
          quantity_unit: r.quantity_unit || null,
          serving_info: r.food_item_id ? foodMap[r.food_item_id] : null,
        }))
      );
      setFoodLogLoading(false);
    };

    loadFoodLog();
  }, [clientId, logDate]);

  const toggleMeal = (meal: string) =>
    setOpenMeals((p) => ({ ...p, [meal]: !p[meal] }));

  const handleComplianceDayClick = (date: string) => {
    setLogDate(new Date(date + "T12:00:00"));
  };

  /* ─── Render ─── */
  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  const mealGroups = MEAL_SECTIONS.reduce<Record<string, FoodLogEntry[]>>((acc, s) => {
    acc[s.key] = foodLog.filter((f) => mapMealNameToKey(f.meal_type) === s.key);
    return acc;
  }, {});

  const logDateStr = format(logDate, "yyyy-MM-dd");
  const logDayTotals = foodLog.reduce(
    (acc, r) => ({ calories: acc.calories + r.calories, protein: acc.protein + r.protein, carbs: acc.carbs + r.carbs, fat: acc.fat + r.fat }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
  const adherencePct = targets && targets.calories > 0 ? Math.round((logDayTotals.calories / targets.calories) * 100) : null;

  const stepPct = todaySteps ? Math.min(100, Math.round((todaySteps / stepGoal) * 100)) : 0;

  return (
    <div className="space-y-6">
      {/* ── Date Navigator ── */}
      <DateNavigator selectedDate={selectedDate} onDateChange={setSelectedDate} />

      {/* ── Client Rank Card ── */}
      {rankedProfile && (() => {
        const isInPlacement = rankedProfile.placement_status === "pending" || rankedProfile.placement_status === "in_progress";
        if (isInPlacement) {
          return (
            <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-card px-3 py-3 overflow-hidden">
              <div className="flex-1 min-w-0">
                <PlacementTracker
                  daysCompleted={rankedProfile.placement_days_completed || 0}
                  status={rankedProfile.placement_status || "pending"}
                  compact
                />
              </div>
            </div>
          );
        }
        const rankCalc = calculateTierAndDivision(rankedProfile.total_xp);
        const rankLabel = getDivisionLabel(rankedProfile.current_tier, rankedProfile.current_division ?? 5);
        const rankTierColor = getTierColor(rankedProfile.current_tier);
        const isRankChampion = rankedProfile.current_tier === "champion";
        const rankProgress = isRankChampion ? 100 : rankCalc.xpNeeded > 0 ? (rankCalc.divisionXP / rankCalc.xpNeeded) * 100 : 0;
        return (
          <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-card px-3 py-3 overflow-hidden">
            <div className="h-20 w-20 shrink-0 flex items-center justify-center overflow-hidden">
              <TierBadge tier={rankedProfile.current_tier} size={120} />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-sm font-bold truncate" style={{ color: rankTierColor }}>{rankLabel}</p>
                {rankedProfile.current_streak > 0 && (
                  <span className="flex items-center gap-0.5 text-xs font-semibold shrink-0" style={{ color: "#fb923c" }}>
                    <Flame className="h-3.5 w-3.5" style={{ fill: "#fb923c", color: "#fb923c" }} />
                    {rankedProfile.current_streak}
                  </span>
                )}
              </div>
              <div className="h-2.5 w-full rounded-full bg-muted/40 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${rankProgress}%`, backgroundColor: rankTierColor }} />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-muted-foreground">{isRankChampion ? "Top rank achieved" : `${rankCalc.divisionXP} / ${rankCalc.xpNeeded} XP`}</p>
                <p className="text-[10px] text-muted-foreground">{rankedProfile.total_xp} total XP</p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Today's Actions ── */}
      {actions.length > 0 && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">{isToday(selectedDate) ? "Today's Actions" : `Actions — ${format(selectedDate, "MMM d")}`}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {actions.map((a) => (
              <button
                key={a.id}
                onClick={() => {
                  const calEvent: CalendarEvent = {
                    id: a.id, title: a.title, event_date: a.event_date || selectedDateStr,
                    event_type: a.event_type, is_completed: a.is_completed, color: a.color || null,
                    event_time: a.event_time || null, end_time: a.end_time || null,
                    description: a.description || null, notes: a.notes || null,
                    linked_workout_id: a.linked_workout_id || null, user_id: clientId,
                    is_recurring: a.is_recurring || false, recurrence_pattern: a.recurrence_pattern || null,
                    completed_at: a.completed_at || null,
                  };
                  setSelectedAction(calEvent);
                  setShowEventDetail(true);
                }}
                className="flex items-center gap-3 py-1.5 w-full text-left hover:bg-secondary/50 rounded-md px-2 -mx-2 transition-colors"
              >
                {a.is_completed ? <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" /> : <Circle className="h-5 w-5 text-muted-foreground shrink-0" />}
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {a.event_type === "workout" && <Dumbbell className="h-3.5 w-3.5 text-primary shrink-0" />}
                  {a.event_type === "nutrition" && <UtensilsCrossed className="h-3.5 w-3.5 text-primary shrink-0" />}
                  {a.event_type === "photo" && <Camera className="h-3.5 w-3.5 text-primary shrink-0" />}
                  <span className="text-sm text-foreground truncate">{a.title}</span>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Event Detail Modal */}
      <EventDetailModal
        event={selectedAction}
        open={showEventDetail}
        onClose={() => { setShowEventDetail(false); setSelectedAction(null); }}
        onComplete={async (ev) => {
          const { error } = await supabase.from("calendar_events").update({ is_completed: true, completed_at: new Date().toISOString() }).eq("id", ev.id);
          if (error) { toast.error("Failed to mark complete"); return; }
          setActions(prev => prev.map(a => a.id === ev.id ? { ...a, is_completed: true } : a));
          setShowEventDetail(false); setSelectedAction(null);
        }}
        onDelete={async (ev) => {
          const { error } = await supabase.from("calendar_events").delete().eq("id", ev.id);
          if (error) { toast.error("Failed to delete event"); return; }
          setActions(prev => prev.filter(a => a.id !== ev.id));
          setShowEventDetail(false); setSelectedAction(null);
        }}
        isCoach={true}
        clientId={clientId}
      />

      {/* ── Steps + Sleep Row ── */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setStepTrendOpen(true)}
          className="rounded-xl bg-card border border-border p-3 sm:p-4 text-left transition-colors hover:bg-secondary/30 overflow-hidden"
        >
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <Footprints className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground">Steps</span>
            </div>
            <span className="text-[10px] text-muted-foreground">Goal {(stepGoal / 1000).toFixed(0)}K</span>
          </div>
          <div className="text-lg sm:text-xl font-bold text-foreground tabular-nums">
            {todaySteps !== null && todaySteps > 0 ? todaySteps.toLocaleString() : "–"}
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${stepPct}%` }} />
            </div>
            <span className="text-[10px] font-medium text-foreground tabular-nums">{stepPct}%</span>
          </div>
        </button>

        <SleepCard onClick={() => setSleepHistoryOpen(true)} clientId={clientId} />
      </div>

      <SleepHistoryModal
        open={sleepHistoryOpen}
        onClose={() => setSleepHistoryOpen(false)}
        clientId={clientId}
        clientName={clientNameForSteps}
        readOnly
      />

      {/* ── 2x2 Grid: Weight, Photos, Calories, Distance ── */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => setWeightHistoryOpen(true)} className="rounded-xl bg-card border border-border p-3 sm:p-4 text-left transition-colors hover:bg-secondary/30 overflow-hidden">
          <div className="flex items-center gap-1.5 mb-1">
            <Scale className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground truncate">Weight</span>
          </div>
          <div className="text-lg sm:text-xl font-bold text-foreground tabular-nums">
            {data.currentWeight ? `${data.currentWeight} lbs` : "–"}
          </div>
          {data.currentWeight && (
            <div className="flex items-center gap-1 mt-0.5">
              {data.weightTrend === "down" ? <TrendingDown className="h-3 w-3 text-green-500" /> : data.weightTrend === "up" ? <TrendingUp className="h-3 w-3 text-destructive" /> : <Activity className="h-3 w-3 text-muted-foreground" />}
              <span className="text-[10px] text-muted-foreground capitalize">{data.weightTrend} (7d)</span>
            </div>
          )}
        </button>

        <button onClick={() => setPhotosModalOpen(true)} className="rounded-xl bg-card border border-border p-3 sm:p-4 text-left transition-colors hover:bg-secondary/30 overflow-hidden">
          <div className="flex items-center gap-1.5 mb-1">
            <Camera className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground truncate">Progress Photos</span>
          </div>
          {photoUrls.length > 0 ? (
            <div className="flex gap-1.5 mt-1">
              {photoUrls.slice(0, 2).map((url, i) => (
                <img key={i} src={url} alt="Progress" className="h-10 w-10 rounded-md object-cover border border-border/50" loading="lazy" />
              ))}
            </div>
          ) : (
            <div className="text-xl font-bold text-foreground">–</div>
          )}
        </button>

        <div className="rounded-xl bg-card border border-border p-3 sm:p-4 text-left overflow-hidden">
          <div className="flex items-center gap-1.5 mb-1">
            <Flame className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground truncate">Calories Today</span>
          </div>
          <div className="text-lg sm:text-xl font-bold text-foreground tabular-nums">
            {todayCals > 0 ? todayCals.toLocaleString() : "–"}
          </div>
          <MiniSparkline data={calSpark} />
        </div>

        <button onClick={() => setDistanceTrendOpen(true)} className="rounded-xl bg-card border border-border p-3 sm:p-4 text-left transition-colors hover:bg-secondary/30 overflow-hidden">
          <div className="flex items-center gap-1.5 mb-1">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground truncate">Distance</span>
          </div>
          <div className="text-lg sm:text-xl font-bold text-foreground tabular-nums">
            {distanceToday !== null && distanceToday > 0 ? `${distanceToday.toFixed(1)} km` : "–"}
          </div>
          <MiniSparkline data={distanceSpark} />
        </button>
      </div>

      {/* ── Last Check-In (compact) ── */}
      <div className="flex items-center gap-3 rounded-xl bg-card border border-border px-4 py-3">
        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <CalendarDays className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Last Check-In</p>
          <p className="text-sm font-semibold text-foreground">
            {data.lastCheckin ? format(new Date(data.lastCheckin), "MMM d, h:mm a") : "No check-ins yet"}
          </p>
        </div>
      </div>

      {/* ── Program Info ── */}
      {data.programName && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" /> Active Program
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-semibold text-foreground">{data.programName}</p>
            {data.currentPhase && <Badge variant="secondary" className="mt-1 text-[10px]">{data.currentPhase}</Badge>}
          </CardContent>
        </Card>
      )}

      {/* ── Macros Today ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">{isToday(selectedDate) ? "Macros Today" : `Macros — ${format(selectedDate, "MMM d")}`}</CardTitle>
            <span className="text-xs text-muted-foreground">{format(selectedDate, "MMM d, yyyy")}</span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex justify-around">
            <MacroRing value={loggedMacros.calories} target={targets?.calories || 0} label="Calories" color="hsl(var(--primary))" />
            <MacroRing value={loggedMacros.protein} target={targets?.protein || 0} label="Protein" color="#ef4444" unit="g" />
            <MacroRing value={loggedMacros.carbs} target={targets?.carbs || 0} label="Carbs" color="#3b82f6" unit="g" />
            <MacroRing value={loggedMacros.fat} target={targets?.fat || 0} label="Fat" color="#eab308" unit="g" />
          </div>
        </CardContent>
      </Card>

      {/* ── 7-Day Macro Averages ── */}
      {macroAvg && <MacroComparisonChart {...macroAvg} />}

      {/* ── Food Log ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <UtensilsCrossed className="h-4 w-4 text-primary" /> Food Log
            </CardTitle>
          </div>

          {/* 7-Day Compliance Strip */}
          {compliance7d.length > 0 && (
            <div className="mt-3">
              <ComplianceStrip
                compliance={compliance7d}
                onDayClick={handleComplianceDayClick}
                selectedDate={logDateStr}
              />
            </div>
          )}

          {/* Date navigator */}
          <div className="flex items-center gap-2 mt-2">
            <Button variant="ghost" size="icon" className="h-7 w-7"
              onClick={() => setLogDate((d) => subDays(d, 1))}
              disabled={logDate <= subDays(new Date(), 90)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <button
              onClick={() => setLogDate(new Date())}
              className={cn("text-sm font-medium px-3 py-1 rounded-md transition-colors",
                isToday(logDate) ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-secondary"
              )}
            >
              {isToday(logDate) ? "Today" : format(logDate, "MMM d, yyyy")}
            </button>
            <Button variant="ghost" size="icon" className="h-7 w-7"
              onClick={() => setLogDate((d) => addDays(d, 1))}
              disabled={isToday(logDate)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {foodLogLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : (
            <>
              {MEAL_SECTIONS.map(({ key: meal, label }) => {
                const items = mealGroups[meal];
                const mealCals = items.reduce((s, i) => s + i.calories, 0);
                const mealP = items.reduce((s, i) => s + i.protein, 0);
                const mealC = items.reduce((s, i) => s + i.carbs, 0);
                const mealF = items.reduce((s, i) => s + i.fat, 0);

                return (
                  <Collapsible key={meal} open={openMeals[meal]} onOpenChange={() => toggleMeal(meal)}>
                    <CollapsibleTrigger className="flex items-center justify-between w-full py-2.5 px-3 rounded-lg hover:bg-secondary/30 transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">{label}</span>
                        {items.length > 0 && (
                          <span className="text-[11px] text-muted-foreground">
                            {Math.round(mealP)}g P · {Math.round(mealC)}g C · {Math.round(mealF)}g F
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-primary">{Math.round(mealCals)} cal</span>
                        {openMeals[meal] ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pl-3 pr-1 pb-1">
                      {items.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic py-2 pl-2">Nothing logged</p>
                      ) : (
                        items.map((item) => (
                          <div key={item.id} className="py-2 pl-2 border-l-2 border-border ml-1 mb-1">
                            <p className="text-sm font-medium text-foreground">{item.food_name}</p>
                            {item.brand && <p className="text-[11px] text-muted-foreground">{item.brand}</p>}
                            <p className="text-[11px] text-muted-foreground">
                              {formatServingDisplay(item.serving_info, item.quantity_display, item.quantity_unit, item.servings)}
                            </p>
                            <p className="text-xs text-primary mt-0.5">
                              {Math.round(item.calories)} cal · {Math.round(item.protein)}g P · {Math.round(item.carbs)}g C · {Math.round(item.fat)}g F
                            </p>
                          </div>
                        ))
                      )}
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}

              {/* Daily Totals */}
              <div className="mt-4 pt-4 border-t border-border space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">Daily Total</span>
                  {adherencePct !== null && (
                    <Badge className={cn("text-[10px]",
                      adherencePct >= 90 && adherencePct <= 110 ? "bg-green-500/20 text-green-400 hover:bg-green-500/20"
                        : adherencePct >= 75 ? "bg-primary/20 text-primary hover:bg-primary/20"
                        : "bg-destructive/20 text-destructive hover:bg-destructive/20"
                    )}>
                      {adherencePct}% adherence
                    </Badge>
                  )}
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Calories</span>
                    <span className="text-foreground font-medium">{Math.round(logDayTotals.calories)} / {targets?.calories || "—"} cal</span>
                  </div>
                  {targets && targets.calories > 0 && (
                    <Progress value={Math.min((logDayTotals.calories / targets.calories) * 100, 100)} className="h-1.5" />
                  )}
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Protein</span>
                    <span className="text-foreground">{Math.round(logDayTotals.protein)}g / {targets?.protein || "—"}g</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Carbs</span>
                    <span className="text-foreground">{Math.round(logDayTotals.carbs)}g / {targets?.carbs || "—"}g</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Fat</span>
                    <span className="text-foreground">{Math.round(logDayTotals.fat)}g / {targets?.fat || "—"}g</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Progress Momentum ── */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Progress Momentum</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">Weight (30d)</p>
              <p className="text-sm font-bold text-foreground">{weightTrend30}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">Workouts (7d)</p>
              <p className="text-sm font-bold text-foreground">{workouts7d}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">Streak</p>
              <p className="text-sm font-bold text-foreground">{data.streak}d</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Step Trend Modal */}
      <StepTrendModal
        open={stepTrendOpen}
        onClose={() => setStepTrendOpen(false)}
        clientId={clientId}
        clientName={clientNameForSteps}
        externalStepGoal={stepGoal}
      />

      {/* Distance Trend Modal */}
      <DistanceTrendModal
        open={distanceTrendOpen}
        onClose={() => setDistanceTrendOpen(false)}
        clientId={clientId}
      />

      {/* Weight History Modal */}
      <WeightHistoryScreen
        open={weightHistoryOpen}
        onClose={() => setWeightHistoryOpen(false)}
        clientId={clientId}
        clientName={clientNameForSteps}
        readOnly
      />

      {/* Progress Photos Modal */}
      <ProgressPhotosModal
        open={photosModalOpen}
        onClose={() => setPhotosModalOpen(false)}
        clientId={clientId}
        clientName={clientNameForSteps}
      />
    </div>
  );
};

export default ClientWorkspaceSummary;
