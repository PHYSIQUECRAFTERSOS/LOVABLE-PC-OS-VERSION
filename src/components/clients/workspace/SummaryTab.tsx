import { useState, useEffect } from "react";
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
  Zap,
  Target,
  Camera,
  Scale,
  Flame,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Circle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { format, subDays, addDays, isToday } from "date-fns";
import { cn } from "@/lib/utils";

/* ─── types ─── */
interface SummaryData {
  workoutCompliance: number;
  currentWeight: number | null;
  weightTrend: "up" | "down" | "stable";
  streak: number;
  lastCheckin: string | null;
  currentPhase: string | null;
  programName: string | null;
}

interface CalendarAction {
  id: string;
  event_type: string;
  title: string;
  is_completed: boolean;
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
}

/* ─── Macro Ring SVG ─── */
const MacroRing = ({
  value,
  target,
  label,
  color,
  unit = "",
}: {
  value: number;
  target: number;
  label: string;
  color: string;
  unit?: string;
}) => {
  const pct = target > 0 ? Math.min(value / target, 1) : 0;
  const r = 28;
  const circ = 2 * Math.PI * r;
  const offset = circ - pct * circ;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={72} height={72} className="-rotate-90">
        <circle cx={36} cy={36} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={5} />
        <circle
          cx={36}
          cy={36}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={5}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <span className="text-sm font-bold text-foreground -mt-[52px]">
        {Math.round(value)}
        {unit}
      </span>
      <p className="text-[10px] text-muted-foreground mt-6">{label}</p>
      {target > 0 && (
        <p className="text-[10px] text-muted-foreground">
          / {target}
          {unit}
        </p>
      )}
    </div>
  );
};

/* ─── Main Component ─── */
const ClientWorkspaceSummary = ({ clientId }: { clientId: string }) => {
  const { user } = useAuth();
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);

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
  const [openMeals, setOpenMeals] = useState<Record<string, boolean>>({ breakfast: true, lunch: true, dinner: true, snack: true });

  // Momentum
  const [weightTrend30, setWeightTrend30] = useState<string>("—");
  const [workouts7d, setWorkouts7d] = useState(0);

  const today = format(new Date(), "yyyy-MM-dd");

  /* ─── Load summary cards (existing) ─── */
  useEffect(() => {
    if (!clientId || !user) return;
    const load = async () => {
      setLoading(true);
      const last7 = Array.from({ length: 7 }, (_, i) =>
        format(subDays(new Date(), i), "yyyy-MM-dd")
      ).reverse();

      const [sessionsRes, weightsRes, checkinRes, assignmentRes] = await Promise.all([
        supabase
          .from("workout_sessions")
          .select("created_at, completed_at")
          .eq("client_id", clientId)
          .gte("created_at", `${last7[0]}T00:00:00`),
        supabase
          .from("weight_logs")
          .select("weight, logged_at")
          .eq("client_id", clientId)
          .order("logged_at", { ascending: false })
          .limit(7),
        supabase
          .from("checkin_submissions")
          .select("submitted_at")
          .eq("client_id", clientId)
          .eq("status", "submitted")
          .order("submitted_at", { ascending: false })
          .limit(1),
        supabase
          .from("client_program_assignments")
          .select("current_week_number, program_id, current_phase_id, programs(name), program_phases(name)")
          .eq("client_id", clientId)
          .eq("status", "active")
          .limit(1)
          .maybeSingle(),
      ]);

      const sessions = sessionsRes.data || [];
      const completed = sessions.filter((s) => s.completed_at).length;
      const workoutCompliance = Math.round((completed / Math.max(sessions.length, 1)) * 100);

      let streak = 0;
      for (let i = 6; i >= 0; i--) {
        const dayComplete = sessions.some(
          (s) => format(new Date(s.created_at), "yyyy-MM-dd") === last7[i] && s.completed_at
        );
        if (dayComplete) streak++;
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
        workoutCompliance,
        currentWeight,
        weightTrend,
        streak,
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

    const loadExtended = async () => {
      const [actionsRes, photosRes, targetsRes, todayLogsRes, weight30Res, workouts7Res] =
        await Promise.all([
          // Today's actions
          supabase
            .from("calendar_events")
            .select("id, event_type, title, is_completed")
            .or(`user_id.eq.${clientId},target_client_id.eq.${clientId}`)
            .eq("event_date", today),
          // Progress photos
          supabase
            .from("progress_photos")
            .select("id, storage_path, created_at")
            .eq("client_id", clientId)
            .order("created_at", { ascending: false })
            .limit(3),
          // Nutrition targets
          supabase
            .from("nutrition_targets")
            .select("calories, protein, carbs, fat")
            .eq("client_id", clientId)
            .order("effective_date", { ascending: false })
            .limit(1)
            .maybeSingle(),
          // Today's nutrition logs
          supabase
            .from("nutrition_logs")
            .select("calories, protein, carbs, fat")
            .eq("client_id", clientId)
            .eq("logged_at", today),
          // Weight 30d for momentum
          supabase
            .from("weight_logs")
            .select("weight, logged_at")
            .eq("client_id", clientId)
            .gte("logged_at", format(subDays(new Date(), 30), "yyyy-MM-dd"))
            .order("logged_at", { ascending: true }),
          // Workout sessions 7d
          supabase
            .from("workout_sessions")
            .select("id")
            .eq("client_id", clientId)
            .not("completed_at", "is", null)
            .gte("created_at", `${format(subDays(new Date(), 7), "yyyy-MM-dd")}T00:00:00`),
        ]);

      // Actions
      setActions((actionsRes.data || []) as CalendarAction[]);

      // Photos - get signed URLs
      const photos = photosRes.data || [];
      if (photos.length > 0) {
        const urls = await Promise.all(
          photos.map(async (p) => {
            const { data: urlData } = await supabase.storage
              .from("progress-photos")
              .createSignedUrl(p.storage_path, 3600);
            return urlData?.signedUrl || "";
          })
        );
        setPhotoUrls(urls.filter(Boolean));
      } else {
        setPhotoUrls([]);
      }

      // Nutrition targets
      if (targetsRes.data) {
        setTargets({
          calories: targetsRes.data.calories || 0,
          protein: targetsRes.data.protein || 0,
          carbs: targetsRes.data.carbs || 0,
          fat: targetsRes.data.fat || 0,
        });
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

      // Momentum - weight trend 30d
      const w30 = weight30Res.data || [];
      if (w30.length >= 2) {
        const diff = Number(w30[w30.length - 1].weight) - Number(w30[0].weight);
        setWeightTrend30(diff > 0.5 ? `+${diff.toFixed(1)} lbs` : diff < -0.5 ? `${diff.toFixed(1)} lbs` : "Stable");
      }

      // Workouts 7d
      setWorkouts7d((workouts7Res.data || []).length);
    };

    loadExtended();
  }, [clientId, user, today]);

  /* ─── Food log per date ─── */
  useEffect(() => {
    if (!clientId) return;
    const dateStr = format(logDate, "yyyy-MM-dd");
    setFoodLogLoading(true);

    const loadFoodLog = async () => {
      const { data: logs } = await supabase
        .from("nutrition_logs")
        .select("id, meal_type, custom_name, food_item_id, calories, protein, carbs, fat, servings, quantity_display, quantity_unit")
        .eq("client_id", clientId)
        .eq("logged_at", dateStr)
        .order("created_at", { ascending: true });

      const entries = logs || [];
      const foodIds = entries.filter((r) => r.food_item_id).map((r) => r.food_item_id!);
      let foodMap: Record<string, { name: string; brand: string | null }> = {};

      if (foodIds.length > 0) {
        const { data: foods } = await supabase
          .from("food_items")
          .select("id, name, brand")
          .in("id", foodIds);
        (foods || []).forEach((f) => {
          foodMap[f.id] = { name: f.name, brand: f.brand };
        });
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
        }))
      );
      setFoodLogLoading(false);
    };

    loadFoodLog();
  }, [clientId, logDate]);

  const toggleMeal = (meal: string) =>
    setOpenMeals((p) => ({ ...p, [meal]: !p[meal] }));

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

  const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;
  const mealGroups = MEALS.reduce<Record<string, FoodLogEntry[]>>((acc, m) => {
    acc[m] = foodLog.filter((f) => f.meal_type === m);
    return acc;
  }, {});

  const logDateStr = format(logDate, "yyyy-MM-dd");
  const logDayTotals = foodLog.reduce(
    (acc, r) => ({
      calories: acc.calories + r.calories,
      protein: acc.protein + r.protein,
      carbs: acc.carbs + r.carbs,
      fat: acc.fat + r.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
  const adherencePct = targets && targets.calories > 0 ? Math.round((logDayTotals.calories / targets.calories) * 100) : null;

  return (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Workout Compliance</p>
                <p className="text-2xl font-bold text-foreground mt-1">{data.workoutCompliance}%</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Dumbbell className="h-5 w-5 text-primary" />
              </div>
            </div>
            <Progress value={data.workoutCompliance} className="mt-3 h-1.5" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Current Weight</p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {data.currentWeight ? `${data.currentWeight} lbs` : "—"}
                </p>
              </div>
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                {data.weightTrend === "down" ? (
                  <TrendingDown className="h-5 w-5 text-green-500" />
                ) : data.weightTrend === "up" ? (
                  <TrendingUp className="h-5 w-5 text-destructive" />
                ) : (
                  <Activity className="h-5 w-5 text-primary" />
                )}
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              Trend: <span className="capitalize">{data.weightTrend}</span> (7d)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Current Streak</p>
                <p className="text-2xl font-bold text-foreground mt-1">{data.streak}d</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Zap className="h-5 w-5 text-primary" />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">Consecutive training days</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Last Check-In</p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  {data.lastCheckin ? format(new Date(data.lastCheckin), "MMM d") : "—"}
                </p>
              </div>
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <CalendarDays className="h-5 w-5 text-primary" />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              {data.lastCheckin ? format(new Date(data.lastCheckin), "h:mm a") : "No check-ins yet"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Program Info ── */}
      {data.programName && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              Active Program
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-foreground">{data.programName}</p>
                {data.currentPhase && (
                  <Badge variant="secondary" className="mt-1 text-[10px]">
                    {data.currentPhase}
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Today's Actions ── */}
      {actions.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Today's Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {actions.map((a) => (
              <div key={a.id} className="flex items-center gap-3 py-1.5">
                {a.is_completed ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
                )}
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {a.event_type === "workout" && <Dumbbell className="h-3.5 w-3.5 text-primary shrink-0" />}
                  {a.event_type === "nutrition" && <UtensilsCrossed className="h-3.5 w-3.5 text-primary shrink-0" />}
                  {a.event_type === "photo" && <Camera className="h-3.5 w-3.5 text-primary shrink-0" />}
                  <span className="text-sm text-foreground truncate">{a.title}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Client Stats Row: Photos, Weight, Calories ── */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Progress Photos */}
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Camera className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">Progress Photos</span>
            </div>
            {photoUrls.length > 0 ? (
              <div className="flex gap-1.5">
                {photoUrls.map((url, i) => (
                  <img
                    key={i}
                    src={url}
                    alt="Progress"
                    className="h-14 w-14 rounded-md object-cover border border-border/50"
                    loading="lazy"
                  />
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Camera className="h-8 w-8 opacity-30" />
                <span className="text-xs">No photos yet</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Body Weight */}
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Scale className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">Body Weight</span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {data.currentWeight ? `${data.currentWeight} lbs` : "—"}
            </p>
          </CardContent>
        </Card>

        {/* Calories Today */}
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Flame className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">Calories Today</span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {todayCals > 0 ? todayCals.toLocaleString() : "—"}
            </p>
            {targets && targets.calories > 0 && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Target: {targets.calories.toLocaleString()} cal
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Macros Today ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Macros Today</CardTitle>
            <span className="text-xs text-muted-foreground">{format(new Date(), "MMM d, yyyy")}</span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex justify-around">
            <MacroRing
              value={loggedMacros.calories}
              target={targets?.calories || 0}
              label="Calories"
              color="hsl(var(--primary))"
            />
            <MacroRing
              value={loggedMacros.protein}
              target={targets?.protein || 0}
              label="Protein"
              color="#ef4444"
              unit="g"
            />
            <MacroRing
              value={loggedMacros.carbs}
              target={targets?.carbs || 0}
              label="Carbs"
              color="#3b82f6"
              unit="g"
            />
            <MacroRing
              value={loggedMacros.fat}
              target={targets?.fat || 0}
              label="Fat"
              color="#eab308"
              unit="g"
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Food Log (coach-only) ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <UtensilsCrossed className="h-4 w-4 text-primary" />
              Food Log
            </CardTitle>
          </div>
          {/* Date navigator */}
          <div className="flex items-center gap-2 mt-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setLogDate((d) => subDays(d, 1))}
              disabled={logDate <= subDays(new Date(), 90)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <button
              onClick={() => setLogDate(new Date())}
              className={cn(
                "text-sm font-medium px-3 py-1 rounded-md transition-colors",
                isToday(logDate) ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-secondary"
              )}
            >
              {isToday(logDate) ? "Today" : format(logDate, "MMM d, yyyy")}
            </button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setLogDate((d) => addDays(d, 1))}
              disabled={isToday(logDate)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {foodLogLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 rounded-lg" />
              ))}
            </div>
          ) : (
            <>
              {MEALS.map((meal) => {
                const items = mealGroups[meal];
                const mealCals = items.reduce((s, i) => s + i.calories, 0);
                const mealP = items.reduce((s, i) => s + i.protein, 0);
                const mealC = items.reduce((s, i) => s + i.carbs, 0);
                const mealF = items.reduce((s, i) => s + i.fat, 0);

                return (
                  <Collapsible key={meal} open={openMeals[meal]} onOpenChange={() => toggleMeal(meal)}>
                    <CollapsibleTrigger className="flex items-center justify-between w-full py-2.5 px-3 rounded-lg hover:bg-secondary/30 transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground capitalize">{meal}</span>
                        {items.length > 0 && (
                          <span className="text-[11px] text-muted-foreground">
                            {Math.round(mealP)}g P · {Math.round(mealC)}g C · {Math.round(mealF)}g F
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-primary">{Math.round(mealCals)} cal</span>
                        {openMeals[meal] ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pl-3 pr-1 pb-1">
                      {items.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic py-2 pl-2">Nothing logged</p>
                      ) : (
                        items.map((item) => (
                          <div key={item.id} className="py-2 pl-2 border-l-2 border-border ml-1 mb-1">
                            <p className="text-sm font-medium text-foreground">{item.food_name}</p>
                            {item.brand && (
                              <p className="text-[11px] text-muted-foreground">{item.brand}</p>
                            )}
                            <p className="text-[11px] text-muted-foreground">
                              {item.quantity_display
                                ? `${item.quantity_display} × ${item.quantity_unit || "serving"}`
                                : `${item.servings} serving(s)`}
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
                    <Badge
                      className={cn(
                        "text-[10px]",
                        adherencePct >= 90 && adherencePct <= 110
                          ? "bg-green-500/20 text-green-400 hover:bg-green-500/20"
                          : adherencePct >= 75
                            ? "bg-primary/20 text-primary hover:bg-primary/20"
                            : "bg-destructive/20 text-destructive hover:bg-destructive/20"
                      )}
                    >
                      {adherencePct}% adherence
                    </Badge>
                  )}
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Calories</span>
                    <span className="text-foreground font-medium">
                      {Math.round(logDayTotals.calories)} / {targets?.calories || "—"} cal
                    </span>
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
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Progress Momentum</CardTitle>
        </CardHeader>
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
    </div>
  );
};

export default ClientWorkspaceSummary;
