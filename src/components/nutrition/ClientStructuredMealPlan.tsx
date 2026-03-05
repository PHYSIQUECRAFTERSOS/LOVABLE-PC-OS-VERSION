import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  ClipboardCopy,
  PlusCircle,
  Zap,
  Utensils,
  Dumbbell,
  Moon,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import FoodIcon from "@/lib/foodIcons";
import {
  useMealPlanTracker,
  MEAL_SECTIONS,
  mapMealNameToKey,
  type MealPlanFood,
  type MealPlanData,
} from "@/hooks/useMealPlanTracker";
import { format } from "date-fns";

interface ClientStructuredMealPlanProps {
  selectedDate?: Date;
  onLogged?: () => void;
  /** Pre-select a specific day_type */
  defaultDayType?: string;
}

const ClientStructuredMealPlan = ({
  selectedDate,
  onLogged,
  defaultDayType,
}: ClientStructuredMealPlanProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeDayType, setActiveDayType] = useState<string | null>(defaultDayType || null);
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(MEAL_SECTIONS.map((s) => s.key))
  );
  const [completedSections, setCompletedSections] = useState<Set<string>>(new Set());
  const [autoTrack, setAutoTrack] = useState(false);
  const [copyingSection, setCopyingSection] = useState<string | null>(null);
  const [todayIsTraining, setTodayIsTraining] = useState<boolean | null>(null);

  const {
    plans,
    allDays,
    allItems,
    getPlanByDayType,
    copyMealToTracker,
    copyEntireDayToTracker,
  } = useMealPlanTracker(selectedDate);

  // Auto-suggest day type based on calendar
  useEffect(() => {
    if (!user || plans.length === 0) return;
    if (defaultDayType) { setActiveDayType(defaultDayType); return; }

    const checkToday = async () => {
      const today = format(selectedDate || new Date(), "yyyy-MM-dd");
      const { data: events } = await supabase
        .from("calendar_events")
        .select("event_type")
        .eq("user_id", user.id)
        .eq("event_date", today)
        .eq("event_type", "workout")
        .limit(1);

      const hasWorkout = (events || []).length > 0;
      setTodayIsTraining(hasWorkout);

      // Pick the best plan
      if (hasWorkout && plans.find((p) => p.day_type === "training")) {
        setActiveDayType("training");
      } else if (!hasWorkout && plans.find((p) => p.day_type === "rest")) {
        setActiveDayType("rest");
      } else {
        setActiveDayType(plans[0].day_type);
      }
    };
    checkToday();
  }, [user, plans, selectedDate, defaultDayType]);

  // Get active plan data
  const activeData = useMemo(() => {
    if (!activeDayType) return { plan: null, days: [], items: [] };
    return getPlanByDayType(activeDayType);
  }, [activeDayType, getPlanByDayType]);

  const { plan: activePlan, days: activeDays, items: activeItems } = activeData;

  // Auto-select first day when plan changes
  useEffect(() => {
    if (activeDays.length > 0) {
      setSelectedDayId(activeDays[0].id);
      setCompletedSections(new Set());
    } else {
      setSelectedDayId(null);
    }
  }, [activeDays]);

  // Auto-track
  useEffect(() => {
    if (autoTrack && selectedDayId && activeItems.length > 0) {
      handleAutoTrack();
    }
  }, [autoTrack, selectedDayId]);

  const handleAutoTrack = async () => {
    if (!selectedDayId) return;
    const success = await copyEntireDayToTracker(selectedDayId, activeItems);
    if (success) {
      setCompletedSections(new Set(MEAL_SECTIONS.map((s) => s.key)));
      onLogged?.();
    }
  };

  const handleCopySection = async (mealKey: string) => {
    if (!selectedDayId) return;
    setCopyingSection(mealKey);
    const sectionItems = activeItems.filter(
      (i) => i.day_id === selectedDayId && mapMealNameToKey(i.meal_name) === mealKey
    );
    const success = await copyMealToTracker(sectionItems, mealKey);
    if (success) {
      toast({ title: `${sectionItems.length} items added to tracker` });
      setCompletedSections((prev) => new Set([...prev, mealKey]));
      onLogged?.();
    }
    setCopyingSection(null);
  };

  const handleAddSingleItem = async (item: MealPlanFood) => {
    if (!user) return;
    const mealKey = mapMealNameToKey(item.meal_name);
    const dateStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");
    const { error } = await supabase.from("nutrition_logs").insert({
      client_id: user.id,
      food_item_id: item.food_item_id,
      custom_name: item.custom_name,
      meal_type: mealKey,
      servings: 1,
      calories: item.calories,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
      logged_at: dateStr,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `${item.custom_name} logged` });
      onLogged?.();
    }
  };

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Empty state
  if (plans.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <ClipboardList className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">
            Your coach hasn't assigned a meal plan yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Get section items for selected day
  const sectionsByDay: Record<string, MealPlanFood[]> = {};
  if (selectedDayId) {
    activeItems
      .filter((i) => i.day_id === selectedDayId)
      .forEach((item) => {
        const key = mapMealNameToKey(item.meal_name);
        if (!sectionsByDay[key]) sectionsByDay[key] = [];
        sectionsByDay[key].push(item);
      });
  }

  const dayTotals = selectedDayId
    ? activeItems
        .filter((i) => i.day_id === selectedDayId)
        .reduce(
          (acc, i) => ({
            calories: acc.calories + i.calories,
            protein: acc.protein + i.protein,
            carbs: acc.carbs + i.carbs,
            fat: acc.fat + i.fat,
          }),
          { calories: 0, protein: 0, carbs: 0, fat: 0 }
        )
    : { calories: 0, protein: 0, carbs: 0, fat: 0 };

  return (
    <div className="space-y-4">
      {/* Day Type Switcher — only show when multiple plans exist */}
      {plans.length > 1 && (
        <div className="space-y-2">
          <div className="flex gap-1.5 p-1 bg-secondary/50 rounded-lg">
            {plans.map((p) => {
              const isActive = activeDayType === p.day_type;
              const Icon = p.day_type === "training" ? Dumbbell : Moon;
              return (
                <button
                  key={p.day_type}
                  onClick={() => {
                    setActiveDayType(p.day_type);
                    setCompletedSections(new Set());
                  }}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-semibold transition-all",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {p.day_type_label}
                </button>
              );
            })}
          </div>
          {todayIsTraining !== null && (
            <p className="text-[10px] text-muted-foreground text-center">
              Today is a {todayIsTraining ? "Training" : "Rest"} Day
            </p>
          )}
        </div>
      )}

      {/* Header */}
      {activePlan && (
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-foreground">{activePlan.name}</h3>
            {activePlan.flexibility_mode && (
              <Badge variant="secondary" className="text-xs mt-1">Flex Mode</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="auto-track" className="text-xs text-muted-foreground cursor-pointer">
              Auto Track
            </Label>
            <Switch
              id="auto-track"
              checked={autoTrack}
              onCheckedChange={setAutoTrack}
              className="data-[state=checked]:bg-primary"
            />
          </div>
        </div>
      )}

      {/* Day Selector within plan */}
      {activeDays.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
          {activeDays.map((day) => (
            <button
              key={day.id}
              onClick={() => {
                setSelectedDayId(day.id);
                setCompletedSections(new Set());
              }}
              className={cn(
                "whitespace-nowrap px-3.5 py-1.5 text-xs font-medium rounded-full transition-all shrink-0",
                selectedDayId === day.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              )}
            >
              {day.day_type}
            </button>
          ))}
        </div>
      )}

      {/* Macro Summary */}
      <div className="rounded-lg border border-border bg-card px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Daily Total
          </span>
          <div className="flex items-center gap-3">
            <MacroPill label="Cal" value={dayTotals.calories} color="text-foreground" />
            <MacroPill label="P" value={dayTotals.protein} color="text-red-400" />
            <MacroPill label="C" value={dayTotals.carbs} color="text-blue-400" />
            <MacroPill label="F" value={dayTotals.fat} color="text-yellow-400" />
          </div>
        </div>
      </div>

      {/* Meal Sections */}
      {MEAL_SECTIONS.map(({ key, label }) => {
        const sectionItems = sectionsByDay[key] || [];
        const isExpanded = expandedSections.has(key);
        const isCompleted = completedSections.has(key);
        const isCopying = copyingSection === key;

        const sectionTotals = sectionItems.reduce(
          (acc, i) => ({
            calories: acc.calories + i.calories,
            protein: acc.protein + i.protein,
            carbs: acc.carbs + i.carbs,
            fat: acc.fat + i.fat,
          }),
          { calories: 0, protein: 0, carbs: 0, fat: 0 }
        );

        if (sectionItems.length === 0) return null;

        return (
          <div
            key={key}
            className={cn(
              "rounded-lg border overflow-hidden transition-all",
              isCompleted ? "border-primary/30 opacity-70" : "border-border bg-card"
            )}
          >
            <button
              onClick={() => toggleSection(key)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/30 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                {isCompleted && (
                  <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                    <Check className="h-3 w-3 text-primary-foreground" />
                  </div>
                )}
                <Utensils className={cn("h-4 w-4", isCompleted ? "text-primary" : "text-muted-foreground")} />
                <span className="text-sm font-semibold text-foreground">{label}</span>
                <span className="text-xs text-muted-foreground">
                  ({sectionItems.length} item{sectionItems.length !== 1 ? "s" : ""})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground tabular-nums">{sectionTotals.calories} cal</span>
                {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </div>
            </button>

            {isExpanded && (
              <div>
                <div className="px-4 py-2 border-t border-border/30 bg-secondary/20">
                  <div className="flex items-center gap-3 text-xs">
                    <MacroPill label="Cal" value={sectionTotals.calories} color="text-foreground" />
                    <MacroPill label="P" value={sectionTotals.protein} color="text-red-400" />
                    <MacroPill label="C" value={sectionTotals.carbs} color="text-blue-400" />
                    <MacroPill label="F" value={sectionTotals.fat} color="text-yellow-400" />
                  </div>
                </div>

                <div className="divide-y divide-border/20">
                  {sectionItems.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/10 transition-colors">
                      <FoodIcon name={item.custom_name || ""} size={30} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">{item.custom_name}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground">{item.gram_amount}g</span>
                          <span className="text-[10px] text-muted-foreground/70">•</span>
                          <span className="text-xs text-muted-foreground">{item.calories} cal</span>
                          <span className="text-[10px] text-muted-foreground/70">•</span>
                          <span className="text-[10px] text-red-400/80">{item.protein}P</span>
                          <span className="text-[10px] text-blue-400/80">{item.carbs}C</span>
                          <span className="text-[10px] text-yellow-400/80">{item.fat}F</span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleAddSingleItem(item)}
                        className="h-7 w-7 flex items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors shrink-0"
                        title="Add to tracker"
                      >
                        <PlusCircle className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 px-4 py-3 border-t border-border/30 bg-secondary/10">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-1.5 text-xs"
                    onClick={() => handleCopySection(key)}
                    disabled={isCopying || isCompleted}
                  >
                    <ClipboardCopy className="h-3.5 w-3.5" />
                    {isCompleted ? "Copied" : "Copy From Meal Plan"}
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 gap-1.5 text-xs"
                    onClick={() => handleCopySection(key)}
                    disabled={isCopying || isCompleted}
                  >
                    <Zap className="h-3.5 w-3.5" />
                    {isCopying ? "Adding..." : "Add To Food Tracker"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {Object.keys(sectionsByDay).length === 0 && selectedDayId && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-muted-foreground">No foods assigned for this day type.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

const MacroPill = ({ label, value, color }: { label: string; value: number; color: string }) => (
  <span className={cn("tabular-nums", color)}>
    <span className="font-semibold">{Math.round(value)}</span>
    <span className="text-muted-foreground ml-0.5">{label}</span>
  </span>
);

export default ClientStructuredMealPlan;
