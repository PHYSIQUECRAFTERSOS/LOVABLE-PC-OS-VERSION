import { useState, useEffect, useCallback, useRef } from "react";
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
import AddFoodScreen from "./AddFoodScreen";
import QuickAddPreviousMeal from "./QuickAddPreviousMeal";
import CopyDayDialog from "./CopyDayDialog";
import SwipeToDelete from "./SwipeToDelete";
import { useQuickAddMeals } from "@/hooks/useQuickAddMeals";
import { useMealPlanTracker, mapMealNameToKey } from "@/hooks/useMealPlanTracker";
import { useToast } from "@/hooks/use-toast";
import EditFoodModal from "./EditFoodModal";
import { getLocalDateString, toLocalDateString } from "@/utils/localDate";

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

  const dateStr = toLocalDateString(selectedDate);
  const { suggestions, quickAdd, refresh: refreshSuggestions } = useQuickAddMeals(user?.id, selectedDate);

  // Meal plan tracker for "Copy From Meal Plan"
  const {
    plan: mealPlan,
    days: mealPlanDays,
    items: mealPlanItems,
    getItemsForMealSection,
    copyMealToTracker,
  } = useMealPlanTracker(selectedDate);

  // Pick the first day from plan (could be enhanced to match day type)
  const activeDayId = mealPlanDays?.[0]?.id || null;

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
        .select("id, name")
        .in("id", foodIds);

      if (fetchId !== latestFetchRef.current) return;

      if (foodsError) {
        console.error("[fetchLogs] Food names query error:", foodsError);
      }

      const names: Record<string, string> = {};
      (foods || []).forEach((f) => {
        names[f.id] = f.name;
      });
      setFoodNames(names);
      return;
    }

    setFoodNames({});
  }, [user, dateStr, toast]);

  const fetchTargets = useCallback(async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from("nutrition_targets")
      .select("*")
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
      setTargets({
        calories: data[0].calories,
        protein: data[0].protein,
        carbs: data[0].carbs,
        fat: data[0].fat,
        is_refeed: data[0].is_refeed,
      });
      return;
    }

    setTargets(DEFAULT_TARGETS);
  }, [user, dateStr]);

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
      calories: acc.calories + l.calories,
      protein: acc.protein + l.protein,
      carbs: acc.carbs + l.carbs,
      fat: acc.fat + l.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const openLoggerFor = (mealType: string, label: string) => {
    setActiveMealType(mealType);
    setActiveMealLabel(label);
    setLoggerOpen(true);
  };

  const getMealTotals = (items: NutritionLog[]) =>
    items.reduce(
      (acc, l) => ({
        calories: Math.round(acc.calories + l.calories),
        protein: Math.round(acc.protein + l.protein),
        carbs: Math.round(acc.carbs + l.carbs),
        fat: Math.round(acc.fat + l.fat),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );

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

    const planItems = getItemsForMealSection(activeDayId, mealKey);
    if (planItems.length === 0) {
      toast({ title: `No items in your meal plan for this section` });
      setCopyingMeal(null);
      return;
    }

    const success = await copyMealToTracker(planItems, mealKey);
    if (success) {
      toast({ title: `${planItems.length} items copied from meal plan` });
      await fetchLogs();
      refreshSuggestions();
    } else {
      // copyMealToTracker already shows its own error toast
      // Force refresh to sync UI with DB state
      await fetchLogs();
    }
    setCopyingMeal(null);
  };

  // Check if a meal section has plan items
  const hasPlanItems = (mealKey: string) => {
    if (!activeDayId || !mealPlanItems) return false;
    return getItemsForMealSection(activeDayId, mealKey).length > 0;
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
    calories: acc.calories + l.calories, protein: acc.protein + l.protein,
    carbs: acc.carbs + l.carbs, fat: acc.fat + l.fat,
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  const handleSaveMealFromTracker = async () => {
    if (!user || selectedLogs.length === 0 || !saveMealName.trim()) return;
    setSavingMeal(true);

    const { data: meal, error } = await supabase
      .from("saved_meals")
      .insert({
        client_id: user.id,
        name: saveMealName.trim(),
        meal_type: selectedLogs[0].meal_type,
        calories: Math.round(selectedTotals.calories),
        protein: Math.round(selectedTotals.protein),
        carbs: Math.round(selectedTotals.carbs),
        fat: Math.round(selectedTotals.fat),
        servings: 1,
      } as any)
      .select()
      .single();

    if (error || !meal) {
      toast({ title: "Couldn't save meal." });
      setSavingMeal(false);
      return;
    }

    const mealItems = selectedLogs.map(l => ({
      saved_meal_id: meal.id,
      food_item_id: l.food_item_id || null,
      food_name: l.custom_name || (l.food_item_id ? foodNames[l.food_item_id] : null) || "Food",
      quantity: l.quantity_display || l.servings || 1,
      serving_unit: l.quantity_unit || "serving",
      serving_size_g: l.quantity_unit === "g" ? (l.quantity_display || null) : null,
      calories: Math.round(l.calories),
      protein: Math.round(l.protein),
      carbs: Math.round(l.carbs),
      fat: Math.round(l.fat),
    }));

    await supabase.from("saved_meal_items" as any).insert(mealItems);
    toast({ title: `"${saveMealName.trim()}" saved as meal!` });
    setSavingMeal(false);
    setShowSaveMealDialog(false);
    setSaveMealName("");
    setSelectedIds(new Set());
    setEditMode(false);
  };

  const isToday = getLocalDateString() === dateStr;

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
      <div className="rounded-lg border border-border bg-card p-4">
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
      </div>

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
                              {item.quantity_display != null && item.quantity_display > 0
                                ? `${Math.round(item.quantity_display * 10) / 10}${item.quantity_unit && item.quantity_unit !== 'g' ? ` ${item.quantity_unit}` : 'g'} · `
                                : ''
                              }
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

      {/* Food Logger Modal */}
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

      {/* Edit Mode: Save Meal Sticky Bar */}
      {editMode && selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-background border-t border-border z-[55]">
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
            <Button
              onClick={() => setShowSaveMealDialog(true)}
              className="w-full h-11 text-sm font-semibold rounded-xl"
            >
              <Bookmark className="h-4 w-4 mr-2" />
              Save as Meal ({selectedIds.size})
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default DailyNutritionLog;
