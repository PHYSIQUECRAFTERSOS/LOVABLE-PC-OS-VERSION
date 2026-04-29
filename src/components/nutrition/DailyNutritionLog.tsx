import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format, addDays, subDays } from "date-fns";
import { Trash2, Plus, ChevronLeft, ChevronRight, CalendarDays, Copy, ClipboardCopy, ChevronRight as ChevronRightIcon, Pencil, Check, X, Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { getFoodEmoji } from "@/utils/foodEmoji";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import MacroRing from "./MacroRing";
import SuggestedFoods from "./SuggestedFoods";
import AddFoodScreen from "./AddFoodScreen";
import QuickAddPreviousMeal from "./QuickAddPreviousMeal";
import CopyDayDialog from "./CopyDayDialog";
import SwipeToDelete from "./SwipeToDelete";
import { useQuickAddMeals } from "@/hooks/useQuickAddMeals";
import { useMealPlanTracker, mapMealNameToKey } from "@/hooks/useMealPlanTracker";
import { useToast } from "@/hooks/use-toast";
import EditFoodModal from "./EditFoodModal";
import { getLocalDateString, toLocalDateString } from "@/utils/localDate";
import { formatServingDisplay } from "@/utils/formatServingDisplay";
import { resolveDayType, resolveTargetsForDayType, type DayType } from "@/utils/resolveDayType";

interface NutritionLog {
  id: string;
  custom_name: string | null;
  meal_type: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
  servings: number;
  food_item_id: string | null;
  quantity_display?: number | null;
  quantity_unit?: string | null;
}

interface Targets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  is_refeed: boolean;
}

const DEFAULT_TARGETS: Targets = { calories: 2000, protein: 150, carbs: 200, fat: 70, is_refeed: false };

interface NutritionLogsUpdatedDetail {
  date?: string;
  addedRows?: Array<{ id: string }>;
}

const MEAL_SECTIONS = [
  { key: "breakfast", label: "Breakfast" },
  { key: "pre-workout", label: "Pre-Workout Meal" },
  { key: "post-workout", label: "Post-Workout Meal" },
  { key: "lunch", label: "Lunch" },
  { key: "dinner", label: "Dinner" },
  { key: "snack", label: "Snacks" },
] as const;

interface DailyNutritionLogProps {
  selectedDate?: Date;
  onDateChange?: (date: Date) => void;
}

const DailyNutritionLog = ({ selectedDate: controlledSelectedDate, onDateChange }: DailyNutritionLogProps) => {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const isCoach = role === "coach" || role === "admin";
  const [logs, setLogs] = useState<NutritionLog[]>([]);
  const [targets, setTargets] = useState<Targets>(DEFAULT_TARGETS);
  const [foodNames, setFoodNames] = useState<Record<string, string>>({});
  const [foodServingInfo, setFoodServingInfo] = useState<Record<string, { serving_size: number; serving_unit: string; serving_label: string | null }>>({});
  const [internalSelectedDate, setInternalSelectedDate] = useState(new Date());
  const selectedDate = controlledSelectedDate ?? internalSelectedDate;
  const setSelectedDate = onDateChange ?? setInternalSelectedDate;
  const [loggerOpen, setLoggerOpen] = useState(false);
  const [activeMealType, setActiveMealType] = useState("snack");
  const [activeMealLabel, setActiveMealLabel] = useState("Snacks");
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [copyingMeal, setCopyingMeal] = useState<string | null>(null);
  const [editingLog, setEditingLog] = useState<NutritionLog | null>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);
  const latestFetchRef = useRef(0);
  const [editMode, setEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saveMealName, setSaveMealName] = useState("");
  const [showSaveMealDialog, setShowSaveMealDialog] = useState(false);
  const [savingMeal, setSavingMeal] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [dayType, setDayType] = useState<DayType>("training_day");
  const [activePlanDayType, setActivePlanDayType] = useState<string | null>(null);

  const dateStr = toLocalDateString(selectedDate);
  const { suggestions, quickAdd, refresh: refreshSuggestions } = useQuickAddMeals(user?.id, selectedDate);

  // Meal plan tracker for "Copy From Meal Plan"
  const {
    plans: allMealPlans,
    allDays: allMealPlanDays,
    allItems: allMealPlanItems,
    getPlanByDayType,
    getItemsForMealSection,
    copyMealToTracker,
  } = useMealPlanTracker(selectedDate);

  // Pick the plan matching the active pill, with fallback
  const dayTypeKey = activePlanDayType || (dayType === "training_day" ? "training" : "rest");
  const resolvedPlanData = useMemo(() => {
    const match = getPlanByDayType(dayTypeKey);
    if (match.plan) return match;
    // Fallback: try "all_days" or first available plan
    const allDays = getPlanByDayType("all_days");
    if (allDays.plan) return allDays;
    // Last resort: first plan
    if (allMealPlans.length > 0) {
      const firstPlan = allMealPlans[0];
      return {
        plan: firstPlan,
        days: allMealPlanDays.filter(d => (d as any).meal_plan_id === firstPlan.id),
        items: allMealPlanItems.filter(i => (i as any).meal_plan_id === firstPlan.id),
      };
    }
    return { plan: null, days: [], items: [] };
  }, [dayTypeKey, getPlanByDayType, allMealPlans, allMealPlanDays, allMealPlanItems]);

  const mealPlan = resolvedPlanData.plan;
  const mealPlanDays = resolvedPlanData.days;
  const mealPlanItems = resolvedPlanData.items;
  const activeDayId = mealPlanDays?.[0]?.id || null;

  // Determine available plan pills (only show pills if 2+ plans exist)
  const availablePlanPills = useMemo(() => {
    return allMealPlans
      .filter(p => ["training", "rest"].includes(p.day_type))
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [allMealPlans]);

  const showPillNav = availablePlanPills.length >= 2;

  // Set default active pill based on resolveDayType
  useEffect(() => {
    if (availablePlanPills.length >= 2 && !activePlanDayType) {
      const defaultKey = dayType === "training_day" ? "training" : "rest";
      const hasDefault = availablePlanPills.find(p => p.day_type === defaultKey);
      setActivePlanDayType(hasDefault ? defaultKey : availablePlanPills[0]?.day_type || "training");
    }
  }, [availablePlanPills, dayType, activePlanDayType]);

  const fetchLogs = useCallback(async () => {
    if (!user) return;

    const fetchId = latestFetchRef.current + 1;
    latestFetchRef.current = fetchId;

    const { data, error } = await supabase
      .from("nutrition_logs")
      .select("*")
      .eq("client_id", user.id)
      .eq("logged_at", dateStr)
      .order("created_at", { ascending: true });

    if (fetchId !== latestFetchRef.current) return;

    if (error) {
      console.error("[fetchLogs] Query error:", error);
      toast({ title: "Couldn't load food log", description: error.message, variant: "destructive" });
      return;
    }

    const logData = (data as NutritionLog[]) || [];
    setLogs(logData);

    const foodIds = logData.filter((d) => d.food_item_id).map((d) => d.food_item_id!);
    if (foodIds.length > 0) {
      const { data: foods, error: foodsError } = await supabase
        .from("food_items")
        .select("id, name, serving_size, serving_unit, serving_label")
        .in("id", foodIds);

      if (fetchId !== latestFetchRef.current) return;

      if (foodsError) {
        console.error("[fetchLogs] Food names query error:", foodsError);
      }

      const names: Record<string, string> = {};
      const servingInfo: Record<string, { serving_size: number; serving_unit: string; serving_label: string | null }> = {};
      (foods || []).forEach((f) => {
        names[f.id] = f.name;
        servingInfo[f.id] = { serving_size: f.serving_size, serving_unit: f.serving_unit, serving_label: f.serving_label };
      });
      setFoodNames(names);
      setFoodServingInfo(servingInfo);
      return;
    }

    setFoodNames({});
    setFoodServingInfo({});
  }, [user, dateStr, toast]);

  const fetchTargets = useCallback(async () => {
    if (!user) return;

    // Resolve day type from calendar
    const resolvedDayType = await resolveDayType(user.id, selectedDate);
    setDayType(resolvedDayType);

    const { data, error } = await supabase
      .from("nutrition_targets")
      .select("*, rest_calories, rest_protein, rest_carbs, rest_fat")
      .eq("client_id", user.id)
      .lte("effective_date", dateStr)
      .order("effective_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      console.error("[fetchTargets] Query error:", error);
      return;
    }

    if (data && data.length > 0) {
      const row = data[0];
      const resolved = resolveTargetsForDayType(row as any, resolvedDayType);
      setTargets({
        ...resolved,
        is_refeed: row.is_refeed,
      });
      return;
    }

    setTargets(DEFAULT_TARGETS);
  }, [user, dateStr, selectedDate]);

  useEffect(() => {
    void fetchLogs();
    void fetchTargets();
  }, [fetchLogs, fetchTargets, refreshCounter]);

  useEffect(() => {
    const handleLogsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<NutritionLogsUpdatedDetail>).detail;
      if (detail?.date && detail.date !== dateStr) return;

      if (detail?.addedRows?.length && user) {
        const addedIds = detail.addedRows.map((row) => row.id);
        void supabase
          .from("nutrition_logs")
          .select("*")
          .eq("client_id", user.id)
          .in("id", addedIds)
          .then(({ data: freshRows, error }) => {
            if (error) {
              console.error("[handleLogsUpdated] Added rows fetch error:", error);
              return;
            }

            if (!freshRows || freshRows.length === 0) return;

            setLogs((current) => {
              const existingIds = new Set(current.map((log) => log.id));
              const appended = (freshRows as NutritionLog[]).filter((row) => !existingIds.has(row.id));
              if (appended.length === 0) return current;
              return [...current, ...appended];
            });
          });
      }

      void fetchLogs();
      refreshSuggestions();
    };

    window.addEventListener("nutrition-logs-updated", handleLogsUpdated as EventListener);
    return () => {
      window.removeEventListener("nutrition-logs-updated", handleLogsUpdated as EventListener);
    };
  }, [dateStr, fetchLogs, refreshSuggestions, user]);

  const deleteLog = useCallback(async (id: string): Promise<boolean> => {
    if (!user) {
      toast({ title: "Please sign in again", variant: "destructive" });
      return false;
    }

    const previous = logs;
    setLogs((current) => current.filter((log) => log.id !== id));

    const { data: deletedRows, error } = await supabase
      .from("nutrition_logs")
      .delete()
      .eq("id", id)
      .eq("client_id", user.id)
      .select("id");

    if (error) {
      console.error("[deleteLog] Delete error:", error);
      setLogs(previous);
      toast({ title: "Couldn't delete item", description: error.message, variant: "destructive" });
      return false;
    }

    if (!deletedRows || deletedRows.length === 0) {
      console.error("[deleteLog] Delete returned no rows", { id, userId: user.id });
      setLogs(previous);
      toast({
        title: "Couldn't delete item",
        description: "No item was removed. Please refresh and try again.",
        variant: "destructive",
      });
      await fetchLogs();
      return false;
    }

    toast({ title: "Removed" });
    window.dispatchEvent(new CustomEvent("nutrition-logs-updated", { detail: { date: dateStr } }));
    refreshSuggestions();
    await fetchLogs();
    return true;
  }, [user, logs, fetchLogs, toast, dateStr, refreshSuggestions]);

  const totals = logs.reduce(
    (acc, l) => ({
      calories: acc.calories + (Number(l.calories) || 0),
      protein: acc.protein + (Number(l.protein) || 0),
      carbs: acc.carbs + (Number(l.carbs) || 0),
      fat: acc.fat + (Number(l.fat) || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const openLoggerFor = (mealType: string, label: string) => {
    setActiveMealType(mealType);
    setActiveMealLabel(label);
    setLoggerOpen(true);
  };

  const getMealTotals = (items: NutritionLog[]) => {
    const raw = items.reduce(
      (acc, l) => ({
        calories: acc.calories + (Number(l.calories) || 0),
        protein: acc.protein + (Number(l.protein) || 0),
        carbs: acc.carbs + (Number(l.carbs) || 0),
        fat: acc.fat + (Number(l.fat) || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
    return {
      calories: Math.round(raw.calories),
      protein: Math.round(raw.protein),
      carbs: Math.round(raw.carbs),
      fat: Math.round(raw.fat),
    };
  };

  const handleCopyFromPlan = async (mealKey: string) => {
    if (!activeDayId) {
      console.warn("[handleCopyFromPlan] No activeDayId — meal plan may not have loaded yet");
      toast({ title: "Meal plan not loaded yet", description: "Please wait and try again.", variant: "destructive" });
      return;
    }
    if (!mealPlanItems) {
      toast({ title: "Meal plan items not available", variant: "destructive" });
      return;
    }
    setCopyingMeal(mealKey);

    const planItems = getItemsForMealSection(activeDayId, mealKey, mealPlanItems as any);
    if (planItems.length === 0) {
      toast({ title: `No items in your meal plan for this section` });
      setCopyingMeal(null);
      return;
    }

    const success = await copyMealToTracker(planItems, mealKey);
    if (success) {
      const label = activePlanDayType === "rest" ? "Rest Day" : "Training Day";
      toast({ title: `${label} plan loaded · ${planItems.length} items` });
      await fetchLogs();
      refreshSuggestions();
    } else {
      await fetchLogs();
    }
    setCopyingMeal(null);
  };

  // Check if a meal section has plan items
  const hasPlanItems = (mealKey: string) => {
    if (!activeDayId || !mealPlanItems) return false;
    return getItemsForMealSection(activeDayId, mealKey, mealPlanItems as any).length > 0;
  };

  const toggleSelectId = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedLogs = logs.filter(l => selectedIds.has(l.id));
  const selectedTotals = selectedLogs.reduce((acc, l) => ({
    calories: acc.calories + (Number(l.calories) || 0), protein: acc.protein + (Number(l.protein) || 0),
    carbs: acc.carbs + (Number(l.carbs) || 0), fat: acc.fat + (Number(l.fat) || 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  const handleSaveMealFromTracker = async () => {
    if (!user || selectedLogs.length === 0 || !saveMealName.trim()) return;
    setSavingMeal(true);

    // Look up serving metadata for any linked food items so we can persist
    // per-100g reference values (prevents the "1g" portion corruption bug).
    const foodIds = Array.from(new Set(selectedLogs.map(l => l.food_item_id).filter(Boolean))) as string[];
    let foodMetaMap: Record<string, { serving_size: number | null; serving_unit: string | null; calories: number | null; protein: number | null; carbs: number | null; fat: number | null }> = {};
    if (foodIds.length > 0) {
      const { data: foodMeta } = await supabase
        .from("food_items")
        .select("id, serving_size, serving_unit, calories, protein, carbs, fat")
        .in("id", foodIds);
      (foodMeta || []).forEach((f: any) => { foodMetaMap[f.id] = f; });
    }

    const mealItems = selectedLogs.map(l => {
      // Resolve true quantity + unit from the source log. Never silently
      // collapse to 1 — if quantity_display is missing, fall back to servings
      // and a "serving" unit so render-time math stays correct.
      const hasGramQty = l.quantity_unit === "g" && l.quantity_display != null && l.quantity_display > 0;
      const quantity = hasGramQty
        ? Number(l.quantity_display)
        : (l.quantity_display && l.quantity_display > 0 ? Number(l.quantity_display) : Number(l.servings) || 1);
      const serving_unit = hasGramQty ? "g" : (l.quantity_unit || "serving");

      // Per-100g reference data (so render code never has to back-calculate)
      const meta = l.food_item_id ? foodMetaMap[l.food_item_id] : null;
      const refServing = meta?.serving_size && meta.serving_size > 0 ? Number(meta.serving_size) : 100;
      const cal100 = meta?.calories != null && refServing > 0 ? (Number(meta.calories) / refServing) * 100 : 0;
      const pro100 = meta?.protein != null && refServing > 0 ? (Number(meta.protein) / refServing) * 100 : 0;
      const carb100 = meta?.carbs != null && refServing > 0 ? (Number(meta.carbs) / refServing) * 100 : 0;
      const fat100 = meta?.fat != null && refServing > 0 ? (Number(meta.fat) / refServing) * 100 : 0;

      return {
        food_item_id: l.food_item_id || null,
        food_name: l.custom_name || (l.food_item_id ? foodNames[l.food_item_id] : null) || "Food",
        quantity,
        serving_unit,
        serving_size_g: hasGramQty ? Number(l.quantity_display) : refServing,
        calories: Math.round(l.calories),
        protein: Math.round(l.protein),
        carbs: Math.round(l.carbs),
        fat: Math.round(l.fat),
        calories_per_100g: cal100,
        protein_per_100g: pro100,
        carbs_per_100g: carb100,
        fat_per_100g: fat100,
      };
    });

    const { error } = await supabase.rpc("save_meal_with_items" as any, {
      p_name: saveMealName.trim(),
      p_meal_type: selectedLogs[0].meal_type || "snack",
      p_calories: Math.round(selectedTotals.calories),
      p_protein: Math.round(selectedTotals.protein),
      p_carbs: Math.round(selectedTotals.carbs),
      p_fat: Math.round(selectedTotals.fat),
      p_servings: 1,
      p_items: mealItems,
    } as any);

    if (error) {
      console.error("[handleSaveMealFromTracker] Save failed:", error);
      toast({ title: "Couldn't save meal.", description: error.message, variant: "destructive" });
      setSavingMeal(false);
      return;
    }
    toast({ title: `"${saveMealName.trim()}" saved as meal!` });
    setSavingMeal(false);
    setShowSaveMealDialog(false);
    setSaveMealName("");
    setSelectedIds(new Set());
    setEditMode(false);
  };

  const handleBulkDelete = async () => {
    if (!user || selectedIds.size === 0) return;
    setDeletingSelected(true);

    const idsToDelete = Array.from(selectedIds);
    const previous = logs;
    setLogs(current => current.filter(log => !selectedIds.has(log.id)));

    const { error } = await supabase
      .from("nutrition_logs")
      .delete()
      .in("id", idsToDelete)
      .eq("client_id", user.id);

    if (error) {
      setLogs(previous);
      toast({ title: "Couldn't delete items", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `${idsToDelete.length} item${idsToDelete.length > 1 ? "s" : ""} deleted` });
      window.dispatchEvent(new CustomEvent("nutrition-logs-updated", { detail: { date: dateStr } }));
      refreshSuggestions();
    }

    setDeletingSelected(false);
    setDeleteConfirmOpen(false);
    setSelectedIds(new Set());
    setEditMode(false);
    await fetchLogs();
  };

  const isToday = getLocalDateString() === dateStr;

  // IntersectionObserver: track when macro rings scroll out of view
  const macroRingsRef = useRef<HTMLDivElement>(null);
  const [ringsVisible, setRingsVisible] = useState(true);

  useEffect(() => {
    const el = macroRingsRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setRingsVisible(entry.isIntersecting),
      { threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const remaining = {
    calories: Math.round(targets.calories - totals.calories),
    protein: Math.round(targets.protein - totals.protein),
    carbs: Math.round(targets.carbs - totals.carbs),
    fat: Math.round(targets.fat - totals.fat),
  };

  return (
    <div className="space-y-5">
      {/* Date Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedDate(subDays(selectedDate, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 text-sm font-medium">
                <CalendarDays className="h-3.5 w-3.5" />
                {isToday ? "Today" : format(selectedDate, "EEE, MMM d")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="center">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => d && setSelectedDate(d)}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedDate(addDays(selectedDate, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        {logs.length > 0 && !editMode && (
          <div className="flex gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => { setEditMode(true); setSelectedIds(new Set()); }}
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setCopyDialogOpen(true)}
            >
              <Copy className="h-3.5 w-3.5" />
              Copy Day
            </Button>
          </div>
        )}
        {editMode && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => { setEditMode(false); setSelectedIds(new Set()); }}
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Cancel
          </Button>
        )}
      </div>

      {/* Daily Macro Summary */}
      <div ref={macroRingsRef} className="rounded-lg border border-border bg-card p-4">
        {targets.is_refeed && (
          <div className="mb-3 rounded bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary text-center">
            🔥 Refeed Day
          </div>
        )}
        <div className="flex justify-around">
          <MacroRing label="Calories" current={totals.calories} target={targets.calories} color="hsl(var(--primary))" unit="kcal" />
          <MacroRing label="Protein" current={totals.protein} target={targets.protein} color="hsl(0 70% 55%)" />
          <MacroRing label="Carbs" current={totals.carbs} target={targets.carbs} color="hsl(200 70% 55%)" />
          <MacroRing label="Fat" current={totals.fat} target={targets.fat} color="hsl(45 80% 55%)" />
        </div>
        {/* Day Type Badge */}
        <div className="flex justify-center mt-3">
          <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
            dayType === "training_day"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary border border-border text-foreground"
          }`}>
            {dayType === "training_day" ? "Training Day" : "Rest Day"}
          </span>
        </div>
      </div>

      {/* Plan Pill Navigation (only if 2+ plans) */}
      {showPillNav && !isCoach && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {availablePlanPills.map(plan => {
            const isActive = activePlanDayType === plan.day_type;
            const pillLabel = plan.day_type === "training" ? "Training Day" : "Rest Day";
            return (
              <button
                key={plan.id}
                onClick={() => setActivePlanDayType(plan.day_type)}
                className="whitespace-nowrap transition-all shrink-0"
                style={{
                  borderRadius: "99px",
                  padding: "8px 20px",
                  fontSize: "13px",
                  fontWeight: isActive ? 700 : 400,
                  background: isActive ? "#D4A017" : "#1e1e1e",
                  color: isActive ? "#0a0a0a" : "#FFFFFF",
                  border: isActive ? "none" : "1px solid #333333",
                  cursor: "pointer",
                  minWidth: "fit-content",
                }}
              >
                {pillLabel}
              </button>
            );
          })}
        </div>
      )}

      {/* Meal Sections */}
      <div className="space-y-4">
        {MEAL_SECTIONS.map(({ key, label }) => {
          const items = logs.filter((l) => mapMealNameToKey(l.meal_type) === key);
          const mealTotals = getMealTotals(items);
          const hasplanForMeal = !isCoach && hasPlanItems(key);

          return (
            <div key={key} className="rounded-lg border border-border bg-card overflow-hidden">
              {/* Meal Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{label}</h3>
                  {items.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {mealTotals.calories} cal · {mealTotals.protein}P · {mealTotals.carbs}C · {mealTotals.fat}F
                    </p>
                  )}
                </div>
                <span className="text-sm font-bold text-foreground tabular-nums">
                  {mealTotals.calories > 0 ? `${mealTotals.calories}` : "—"}
                </span>
              </div>

              {/* Copy From Meal Plan */}
              {hasplanForMeal && (
                <button
                  onClick={() => handleCopyFromPlan(key)}
                  disabled={copyingMeal === key}
                  className="flex items-center gap-2 w-full px-4 py-2 text-xs transition-colors text-primary/80 hover:text-primary hover:bg-primary/5 border-b border-border/20"
                >
                  <ClipboardCopy className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    {copyingMeal === key ? "Copying..." : "Copy from meal plan"}
                  </span>
                </button>
              )}

              {/* Quick Add Previous Meal */}
              <QuickAddPreviousMeal
                mealType={key}
                suggestion={suggestions[key] || null}
                onQuickAdd={quickAdd}
                onLogged={() => { fetchLogs(); refreshSuggestions(); }}
              />

              {/* Food Entries */}
              {items.length > 0 && (
                <div className="divide-y divide-border/30">
                  {items.map((item) => {
                    const isSelected = selectedIds.has(item.id);
                    const foodName = item.custom_name || (item.food_item_id ? foodNames[item.food_item_id] : null) || "Food";

                    if (editMode) {
                      return (
                        <button
                          key={item.id}
                          onClick={() => toggleSelectId(item.id)}
                          className="flex items-center gap-3 px-4 py-2.5 w-full text-left hover:bg-secondary/30 transition-colors"
                        >
                          <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'bg-primary border-primary' : 'border-muted-foreground/40'}`}>
                            {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                          </div>
                          <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0 text-base">
                            {getFoodEmoji({ name: foodName })}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-foreground truncate">{foodName}</div>
                            <div className="text-xs text-muted-foreground">
                              {Math.round(item.calories)} cal · {Math.round(item.protein)}P · {Math.round(item.carbs)}C · {Math.round(item.fat)}F
                            </div>
                          </div>
                        </button>
                      );
                    }

                    return (
                      <SwipeToDelete key={item.id} onDelete={() => { void deleteLog(item.id); }}>
                        <button
                          onClick={() => setEditingLog(item)}
                          className="flex items-center gap-3 px-4 py-2.5 w-full text-left hover:bg-secondary/30 transition-colors"
                        >
                          <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0 text-base">
                            {getFoodEmoji({ name: foodName })}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-foreground truncate">{foodName}</div>
                            <div className="text-xs text-muted-foreground">
                              {(() => {
                                const si = item.food_item_id ? foodServingInfo[item.food_item_id] : null;
                                const label = formatServingDisplay(si, item.quantity_display, item.quantity_unit, item.servings);
                                return label ? `${label} · ` : '';
                              })()}
                              {Math.round(item.calories)} cal · {Math.round(item.protein)}P · {Math.round(item.carbs)}C · {Math.round(item.fat)}F
                            </div>
                          </div>
                          <ChevronRightIcon className="h-4 w-4 text-muted-foreground/50 shrink-0 ml-2" />
                        </button>
                      </SwipeToDelete>
                    );
                  })}
                </div>
              )}

              {/* Add Food Button */}
              <button
                onClick={() => openLoggerFor(key, label)}
                className="flex items-center gap-2 w-full px-4 py-2.5 text-sm font-medium text-primary hover:bg-primary/5 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Add Food
              </button>
            </div>
          );
        })}
      </div>

      {/* Bottom Remaining Summary */}
      {logs.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Remaining</h3>
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "Cal", value: remaining.calories, color: "text-primary" },
              { label: "Protein", value: remaining.protein, suffix: "g", color: "text-[hsl(0_70%_55%)]" },
              { label: "Carbs", value: remaining.carbs, suffix: "g", color: "text-[hsl(200_70%_55%)]" },
              { label: "Fat", value: remaining.fat, suffix: "g", color: "text-[hsl(45_80%_55%)]" },
            ].map(m => (
              <div key={m.label} className="text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{m.label}</p>
                <p className={`text-base font-bold tabular-nums ${m.value < 0 ? "text-destructive" : m.color}`}>
                  {m.value < 0 ? `-${Math.abs(m.value)}` : m.value}{m.suffix || ""}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Suggested Foods Based on Remaining Macros */}
      {user && logs.length > 0 && (
        <SuggestedFoods
          remaining={remaining}
          userId={user.id}
          dateStr={dateStr}
          onLogged={() => { fetchLogs(); refreshSuggestions(); }}
        />
      )}


      {!ringsVisible && !editMode && !loggerOpen && (
        <div className="fixed bottom-[4.5rem] left-0 right-0 z-[50] px-3 pb-[env(safe-area-inset-bottom,0px)] pointer-events-none">
          <div className="mx-auto max-w-lg rounded-xl border border-border/50 bg-card/95 backdrop-blur-sm px-4 py-2.5 flex items-center justify-between pointer-events-auto shadow-lg">
            {[
              { label: "Cal", value: remaining.calories, color: "text-primary" },
              { label: "P", value: remaining.protein, suffix: "g", color: "text-[hsl(0_70%_55%)]" },
              { label: "C", value: remaining.carbs, suffix: "g", color: "text-[hsl(200_70%_55%)]" },
              { label: "F", value: remaining.fat, suffix: "g", color: "text-[hsl(45_80%_55%)]" },
            ].map(m => (
              <div key={m.label} className="flex items-baseline gap-1">
                <span className={`text-sm font-bold tabular-nums ${m.value < 0 ? "text-destructive" : m.color}`}>
                  {m.value < 0 ? `-${Math.abs(m.value)}` : m.value}{m.suffix || ""}
                </span>
                <span className="text-[10px] text-muted-foreground">{m.label}</span>
              </div>
            ))}
            <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">left</span>
          </div>
        </div>
      )}

      <AddFoodScreen
        mealType={activeMealType}
        mealLabel={activeMealLabel}
        logDate={dateStr}
        open={loggerOpen}
        onClose={() => setLoggerOpen(false)}
        onLogged={() => { setRefreshCounter((c) => c + 1); refreshSuggestions(); setLoggerOpen(false); }}
      />
      {/* Copy Day Dialog */}
      <CopyDayDialog
        sourceDate={selectedDate}
        open={copyDialogOpen}
        onOpenChange={setCopyDialogOpen}
        onCopied={() => { fetchLogs(); refreshSuggestions(); }}
      />
      {/* Edit Food Modal */}
      <EditFoodModal
        open={!!editingLog}
        onOpenChange={(v) => { if (!v) setEditingLog(null); }}
        logEntry={editingLog}
        foodName={editingLog?.food_item_id ? (foodNames[editingLog.food_item_id] || "Food") : (editingLog?.custom_name || "Food")}
        onDeleteLog={deleteLog}
        onUpdated={() => { setEditingLog(null); fetchLogs(); }}
      />

      {/* Edit Mode: Action Sticky Bar */}
      {editMode && selectedIds.size > 0 && (
        <div className={cn(
          "fixed left-0 right-0 p-4 bg-background border-t border-border z-[55] transition-all",
          showSaveMealDialog
            ? "bottom-auto top-[25%] rounded-b-2xl shadow-2xl border-b border-border pb-[calc(1rem+env(safe-area-inset-bottom))]"
            : "bottom-0 pb-[calc(1rem+env(safe-area-inset-bottom))]"
        )}>
          {showSaveMealDialog ? (
            <div className="space-y-3 animate-fade-in">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">Save as Meal</span>
                <button onClick={() => setShowSaveMealDialog(false)} className="text-xs text-muted-foreground">Cancel</button>
              </div>
              <Input
                placeholder="Meal name (e.g. My Breakfast)"
                value={saveMealName}
                onChange={e => setSaveMealName(e.target.value)}
                className="h-10 text-sm bg-secondary border-0 rounded-lg"
                autoFocus
              />
              <div className="text-xs text-muted-foreground">
                {selectedIds.size} items · {Math.round(selectedTotals.calories)} cal · {Math.round(selectedTotals.protein)}P · {Math.round(selectedTotals.carbs)}C · {Math.round(selectedTotals.fat)}F
              </div>
              <Button
                onClick={handleSaveMealFromTracker}
                disabled={savingMeal || !saveMealName.trim()}
                className="w-full h-11 text-sm font-semibold rounded-xl"
              >
                <Bookmark className="h-4 w-4 mr-2" />
                {savingMeal ? "Saving..." : "Save Meal"}
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                variant="destructive"
                onClick={() => setDeleteConfirmOpen(true)}
                className="flex-1 h-11 text-sm font-semibold rounded-xl gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Delete ({selectedIds.size})
              </Button>
              <Button
                onClick={() => setShowSaveMealDialog(true)}
                className="flex-1 h-11 text-sm font-semibold rounded-xl gap-2"
              >
                <Bookmark className="h-4 w-4" />
                Save as Meal ({selectedIds.size})
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Bulk Delete Confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent className="z-[81]">
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to delete?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedIds.size} item{selectedIds.size > 1 ? "s" : ""} will be permanently removed from your food log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingSelected}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={deletingSelected}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingSelected ? "Deleting..." : "Delete Now"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default DailyNutritionLog;
