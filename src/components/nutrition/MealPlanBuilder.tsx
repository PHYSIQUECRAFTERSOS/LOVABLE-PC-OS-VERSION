import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Trash2,
  ClipboardList,
  Copy,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Save,
  Users,
  Scale,
  Loader2,
  MoreVertical,
  BookmarkPlus,
  ArrowUp,
  ArrowDown,
  Send,
  StickyNote,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import FoodSearchPanel, { FoodResult } from "./FoodSearchPanel";
import CopyFromClientModal from "./CopyFromClientModal";
import AssignTemplateModal from "./AssignTemplateModal";
import AdjustMacrosModal from "./AdjustMacrosModal";
import CopyDayToClientDialog, { inferSlotFromDayType } from "./CopyDayToClientDialog";
import FoodIcon from "@/lib/foodIcons";
import MealPlanMacroSidebar from "./MealPlanMacroSidebar";
import { useIsMobile } from "@/hooks/use-mobile";


interface FoodItem {
  id: string;
  name: string;
  brand: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  serving_size: number;
  serving_unit: string;
}

interface MealFood {
  id: string;
  food_item_id: string;
  food_name: string;
  brand: string | null;
  gram_amount: number;
  cal_per_100: number;
  protein_per_100: number;
  carbs_per_100: number;
  fat_per_100: number;
  fiber_per_100: number;
  sugar_per_100: number;
  serving_unit: string;
  serving_size_g: number;
  note?: string;
}

interface Meal {
  id: string;
  name: string;
  foods: MealFood[];
  note?: string;
}

interface DayType {
  id: string;
  type: string;
  meals: Meal[];
}

interface Client {
  user_id: string;
  full_name: string | null;
}

const calcMacros = (food: MealFood) => {
  const m = food.gram_amount / 100;
  return {
    calories: food.cal_per_100 * m,
    protein: food.protein_per_100 * m,
    carbs: food.carbs_per_100 * m,
    fat: food.fat_per_100 * m,
    fiber: food.fiber_per_100 * m,
    sugar: food.sugar_per_100 * m,
  };
};

const uid = () => crypto.randomUUID();

interface MealPlanBuilderProps {
  forceTemplate?: boolean;
  editingTemplateId?: string;
  onSaved?: () => void;
  clientId?: string;
  dayType?: string;
  dayTypeLabel?: string;
}

const MealPlanBuilder = ({ forceTemplate, editingTemplateId, onSaved, clientId, dayType, dayTypeLabel }: MealPlanBuilderProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [planName, setPlanName] = useState(clientId && dayTypeLabel ? dayTypeLabel : "");
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState("");
  const DEFAULT_MEALS = (): Meal[] => [
    { id: uid(), name: "Breakfast", foods: [] },
    { id: uid(), name: "Pre-Workout", foods: [] },
    { id: uid(), name: "Post-Workout", foods: [] },
    { id: uid(), name: "Lunch", foods: [] },
    { id: uid(), name: "Dinner", foods: [] },
    { id: uid(), name: "Snacks", foods: [] },
  ];
  const [days, setDays] = useState<DayType[]>([
    { id: uid(), type: dayTypeLabel || "Training Day", meals: DEFAULT_MEALS() },
  ]);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [existingPlanId, setExistingPlanId] = useState<string | null>(null);

  const [searchingMealId, setSearchingMealId] = useState<string | null>(null);
  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [adjustMacrosOpen, setAdjustMacrosOpen] = useState(false);
  const [copyDayDialogOpen, setCopyDayDialogOpen] = useState(false);
  const [copyDayTarget, setCopyDayTarget] = useState<DayType | null>(null);

  const [macroTargets, setMacroTargets] = useState({ calories: 2000, protein: 150, carbs: 200, fat: 60 });

  // Save meal to library state
  const [saveMealDialogOpen, setSaveMealDialogOpen] = useState(false);
  const [saveMealName, setSaveMealName] = useState("");
  const [savingMealTarget, setSavingMealTarget] = useState<{ dayId: string; mealId: string } | null>(null);
  const [savingMealLoading, setSavingMealLoading] = useState(false);

  const handleImportDays = (importedDays: DayType[]) => {
    setDays((prev) => [...prev, ...importedDays]);
    if (importedDays.length > 0) setExpandedDay(importedDays[0].id);
  };

  const userId = user?.id;
  useEffect(() => {
    if (!userId || clientId || forceTemplate) return;
    supabase
      .from("coach_clients")
      .select("client_id")
      .eq("coach_id", userId)
      .eq("status", "active")
      .then(async ({ data }) => {
        if (data && data.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("user_id, full_name")
            .in("user_id", data.map((d) => d.client_id));
          setClients((profiles as Client[]) || []);
        }
      });
  }, [userId, clientId, forceTemplate]);

  useEffect(() => {
    if (!clientId || !userId) return;
    loadExistingPlan(clientId);
  }, [clientId, userId, dayType]);

  // Load template for editing
  useEffect(() => {
    if (!editingTemplateId || !userId) return;
    const loadTemplate = async () => {
      setLoadingExisting(true);
      try {
        const { data: plan } = await supabase
          .from("meal_plans")
          .select("id, name, target_calories, target_protein, target_carbs, target_fat")
          .eq("id", editingTemplateId)
          .single();

        if (!plan) { setLoadingExisting(false); return; }
        if (plan.target_calories || plan.target_protein || plan.target_carbs || plan.target_fat) {
          setMacroTargets({
            calories: plan.target_calories || 2000,
            protein: plan.target_protein || 150,
            carbs: plan.target_carbs || 200,
            fat: plan.target_fat || 60,
          });
        }
        setExistingPlanId(plan.id);
        setPlanName(plan.name);

        const { data: dbDays } = await supabase
          .from("meal_plan_days")
          .select("*")
          .eq("meal_plan_id", plan.id)
          .order("day_order");

        if (!dbDays || dbDays.length === 0) { setLoadingExisting(false); return; }

        const { data: items } = await supabase
          .from("meal_plan_items")
          .select("*, food_items:food_item_id(name, brand, serving_size, serving_unit, calories, protein, carbs, fat, fiber, sugar)")
          .eq("meal_plan_id", plan.id)
          .order("meal_order")
          .order("item_order");

        const dayIds = dbDays.map((d: any) => d.id);
        const { data: mealNotes } = await supabase
          .from("meal_plan_meal_notes")
          .select("day_id, meal_order, note")
          .in("day_id", dayIds);
        const noteByKey = new Map<string, string>();
        (mealNotes || []).forEach((n: any) => {
          noteByKey.set(`${n.day_id}::${n.meal_order}`, n.note || "");
        });

        const loadedDays: DayType[] = dbDays.map((day) => {
          const dayItems = (items || []).filter((i: any) => i.day_id === day.id);
          const mealGroups: Record<string, any[]> = {};
          dayItems.forEach((item: any) => {
            const key = `${item.meal_order}::${item.meal_name}`;
            if (!mealGroups[key]) mealGroups[key] = [];
            mealGroups[key].push(item);
          });

          const meals: Meal[] = Object.entries(mealGroups)
            .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
            .map(([key, groupItems]) => {
              const mealOrder = parseInt(key);
              const mealName = key.split("::").slice(1).join("::");
              return {
                id: uid(),
                name: mealName,
                note: noteByKey.get(`${day.id}::${mealOrder}`) || "",
                foods: groupItems.map((item: any) => {
                  const fi = item.food_items as any;
                  const ss = Math.max(fi?.serving_size || item.serving_size || 100, 1);
                  const unit = fi?.serving_unit || item.serving_unit || "g";
                  const ga = item.gram_amount || ss;
                  return {
                    id: uid(),
                    food_item_id: item.food_item_id || "",
                    food_name: item.custom_name || fi?.name || "Unknown",
                    brand: fi?.brand || null,
                    gram_amount: ga,
                    cal_per_100: fi ? ((fi.calories || 0) / ss) * 100 : (item.calories / Math.max(ga, 1)) * 100,
                    protein_per_100: fi ? ((fi.protein || 0) / ss) * 100 : (item.protein / Math.max(ga, 1)) * 100,
                    carbs_per_100: fi ? ((fi.carbs || 0) / ss) * 100 : (item.carbs / Math.max(ga, 1)) * 100,
                    fat_per_100: fi ? ((fi.fat || 0) / ss) * 100 : (item.fat / Math.max(ga, 1)) * 100,
                    fiber_per_100: fi ? ((fi.fiber || 0) / ss) * 100 : 0,
                    sugar_per_100: fi ? ((fi.sugar || 0) / ss) * 100 : 0,
                    serving_unit: unit,
                    serving_size_g: ss,
                    note: item.note || "",
                  };
                }),
              };
            });

          return { id: day.id, type: day.day_type, meals: meals.length > 0 ? meals : DEFAULT_MEALS() };
        });

        setDays(loadedDays);
        if (loadedDays.length > 0) setExpandedDay(loadedDays[0].id);
      } catch (err) {
        console.error("Failed to load template for editing", err);
      } finally {
        setLoadingExisting(false);
      }
    };
    loadTemplate();
  }, [editingTemplateId, userId]);

  const loadExistingPlan = async (cId: string) => {
    setLoadingExisting(true);
    try {
      let query = supabase
        .from("meal_plans")
        .select("id, name, flexibility_mode, coach_id, updated_at, day_type, day_type_label, target_calories, target_protein, target_carbs, target_fat")
        .eq("client_id", cId)
        .eq("is_template", false)
        .order("created_at", { ascending: false })
        .limit(1);

      if (dayType) {
        query = query.eq("day_type", dayType);
      }

      const { data: plans } = await query;

      if (!plans || plans.length === 0) {
        setLoadingExisting(false);
        return;
      }

      const plan = plans[0];
      setExistingPlanId(plan.id);
      setPlanName(plan.name);
      if (plan.target_calories || plan.target_protein || plan.target_carbs || plan.target_fat) {
        setMacroTargets({
          calories: plan.target_calories || 2000,
          protein: plan.target_protein || 150,
          carbs: plan.target_carbs || 200,
          fat: plan.target_fat || 60,
        });
      }

      const { data: dbDays } = await supabase
        .from("meal_plan_days")
        .select("*")
        .eq("meal_plan_id", plan.id)
        .order("day_order");

      if (!dbDays || dbDays.length === 0) {
        setLoadingExisting(false);
        return;
      }

      const { data: items } = await supabase
        .from("meal_plan_items")
        .select("*, food_items:food_item_id(name, brand, serving_size, serving_unit, calories, protein, carbs, fat, fiber, sugar)")
        .eq("meal_plan_id", plan.id)
        .order("meal_order")
        .order("item_order");

      const dayIds = dbDays.map((d: any) => d.id);
      const { data: mealNotes } = await supabase
        .from("meal_plan_meal_notes")
        .select("day_id, meal_order, note")
        .in("day_id", dayIds);
      const noteByKey = new Map<string, string>();
      (mealNotes || []).forEach((n: any) => {
        noteByKey.set(`${n.day_id}::${n.meal_order}`, n.note || "");
      });

      const loadedDays: DayType[] = dbDays.map((day) => {
        const dayItems = (items || []).filter((i: any) => i.day_id === day.id);
        const mealGroups: Record<string, any[]> = {};
        dayItems.forEach((item: any) => {
          const key = `${item.meal_order}::${item.meal_name}`;
          if (!mealGroups[key]) mealGroups[key] = [];
          mealGroups[key].push(item);
        });

        const meals: Meal[] = Object.entries(mealGroups)
          .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
          .map(([key, groupItems]) => {
            const mealOrder = parseInt(key);
            const mealName = key.split("::").slice(1).join("::");
            return {
              id: uid(),
              name: mealName,
              note: noteByKey.get(`${day.id}::${mealOrder}`) || "",
              foods: groupItems.map((item: any) => {
                const fi = item.food_items as any;
                const ss = Math.max(fi?.serving_size || item.serving_size || 100, 1);
                const unit = fi?.serving_unit || item.serving_unit || "g";
                const ga = item.gram_amount || ss;
                return {
                  id: uid(),
                  food_item_id: item.food_item_id || "",
                  food_name: item.custom_name || fi?.name || "Unknown",
                  brand: fi?.brand || null,
                  gram_amount: ga,
                  cal_per_100: fi ? (fi.calories / ss) * 100 : (item.calories / Math.max(ga, 1)) * 100,
                  protein_per_100: fi ? (fi.protein / ss) * 100 : (item.protein / Math.max(ga, 1)) * 100,
                  carbs_per_100: fi ? (fi.carbs / ss) * 100 : (item.carbs / Math.max(ga, 1)) * 100,
                  fat_per_100: fi ? (fi.fat / ss) * 100 : (item.fat / Math.max(ga, 1)) * 100,
                  fiber_per_100: fi ? ((fi.fiber || 0) / ss) * 100 : 0,
                  sugar_per_100: fi ? ((fi.sugar || 0) / ss) * 100 : 0,
                  serving_unit: unit,
                  serving_size_g: ss,
                  note: item.note || "",
                };
              }),
            };
          });

        return {
          id: day.id,
          type: day.day_type,
          meals: meals.length > 0 ? meals : DEFAULT_MEALS(),
        };
      });

      setDays(loadedDays);
      if (loadedDays.length > 0) setExpandedDay(loadedDays[0].id);
    } catch (err: any) {
      console.error("[MealPlanBuilder] Error loading existing plan:", err);
    } finally {
      setLoadingExisting(false);
    }
  };

  useEffect(() => {
    if (days.length > 0 && !expandedDay) setExpandedDay(days[0].id);
  }, []);

  // ... all the add/remove/rename/duplicate/grams handlers
  const addFoodToMeal = (dayId: string, mealId: string, food: FoodItem | FoodResult) => {
    const rawSS = (food as any).serving_size ?? (food as any).serving_size_g ?? 100;
    const ss = Math.max(typeof rawSS === 'string' ? parseFloat(rawSS) || 100 : rawSS || 100, 1);
    const unit = (food as any).serving_unit || "g";

    // Use per-100g values directly if available (from foods table via search)
    // Otherwise compute from per-serving values with safe denominator
    const fr = food as any;
    const hasPer100 = fr.calories_per_100 != null && fr.calories_per_100 > 0;
    const cal_per_100 = hasPer100 ? fr.calories_per_100 : ((food.calories || 0) / ss) * 100;
    const protein_per_100 = (hasPer100 && fr.protein_per_100 != null) ? fr.protein_per_100 : ((food.protein || 0) / ss) * 100;
    const carbs_per_100 = (hasPer100 && fr.carbs_per_100 != null) ? fr.carbs_per_100 : ((food.carbs || 0) / ss) * 100;
    const fat_per_100 = (hasPer100 && fr.fat_per_100 != null) ? fr.fat_per_100 : ((food.fat || 0) / ss) * 100;
    const fiber_per_100 = (hasPer100 && fr.fiber_per_100 != null) ? fr.fiber_per_100 : ((food.fiber || 0) / ss) * 100;
    const sugar_per_100 = (hasPer100 && fr.sugar_per_100 != null) ? fr.sugar_per_100 : ((food.sugar || 0) / ss) * 100;

    // Sanity check: if computed calories seem unreasonable, log for debugging
    const displayCal = Math.round(cal_per_100 * ss / 100);
    if (displayCal > (food.calories || 0) * 1.5 && (food.calories || 0) > 0) {
      console.warn("[MealPlan] Macro sanity check failed — recalculating. Expected ~", food.calories, "got", displayCal, "ss=", ss, "cal_per_100=", cal_per_100);
    }

    setDays((prev) =>
      prev.map((d) =>
        d.id === dayId
          ? {
              ...d,
              meals: d.meals.map((m) =>
                m.id === mealId
                  ? {
                      ...m,
                      foods: [
                        ...m.foods,
                        {
                          id: uid(),
                          food_item_id: food.id,
                          food_name: food.name,
                          brand: food.brand,
                          gram_amount: ss,
                          cal_per_100,
                          protein_per_100,
                          carbs_per_100,
                          fat_per_100,
                          fiber_per_100,
                          sugar_per_100,
                          serving_unit: unit,
                          serving_size_g: ss,
                        },
                      ],
                    }
                  : m
              ),
            }
          : d
      )
    );
    setSearchingMealId(null);
  };

  const updateGrams = (dayId: string, mealId: string, foodId: string, grams: number) => {
    setDays((prev) =>
      prev.map((d) =>
        d.id === dayId
          ? { ...d, meals: d.meals.map((m) => m.id === mealId ? { ...m, foods: m.foods.map((f) => (f.id === foodId ? { ...f, gram_amount: grams } : f)) } : m) }
          : d
      )
    );
  };

  const removeFood = (dayId: string, mealId: string, foodId: string) => {
    setDays((prev) =>
      prev.map((d) =>
        d.id === dayId
          ? { ...d, meals: d.meals.map((m) => m.id === mealId ? { ...m, foods: m.foods.filter((f) => f.id !== foodId) } : m) }
          : d
      )
    );
  };

  const addMeal = (dayId: string) => {
    setDays((prev) =>
      prev.map((d) => d.id === dayId ? { ...d, meals: [...d.meals, { id: uid(), name: `Meal ${d.meals.length + 1}`, foods: [] }] } : d)
    );
  };

  const removeMeal = (dayId: string, mealId: string) => {
    setDays((prev) => prev.map((d) => (d.id === dayId ? { ...d, meals: d.meals.filter((m) => m.id !== mealId) } : d)));
  };

  const renameMeal = (dayId: string, mealId: string, name: string) => {
    setDays((prev) => prev.map((d) => d.id === dayId ? { ...d, meals: d.meals.map((m) => (m.id === mealId ? { ...m, name } : m)) } : d));
  };

  const updateMealNote = (dayId: string, mealId: string, note: string) => {
    setDays((prev) => prev.map((d) => d.id === dayId ? { ...d, meals: d.meals.map((m) => (m.id === mealId ? { ...m, note } : m)) } : d));
  };

  const updateFoodNote = (dayId: string, mealId: string, foodId: string, note: string) => {
    setDays((prev) =>
      prev.map((d) =>
        d.id === dayId
          ? { ...d, meals: d.meals.map((m) => m.id === mealId ? { ...m, foods: m.foods.map((f) => (f.id === foodId ? { ...f, note } : f)) } : m) }
          : d
      )
    );
  };

  const duplicateMeal = (dayId: string, mealId: string) => {
    setDays((prev) =>
      prev.map((d) => {
        if (d.id !== dayId) return d;
        const meal = d.meals.find((m) => m.id === mealId);
        if (!meal) return d;
        const clone: Meal = { ...meal, id: uid(), name: `${meal.name} (copy)`, foods: meal.foods.map((f) => ({ ...f, id: uid() })) };
        return { ...d, meals: [...d.meals, clone] };
      })
    );
  };

  const moveMeal = (dayId: string, mealId: string, direction: "up" | "down") => {
    setDays((prev) =>
      prev.map((d) => {
        if (d.id !== dayId) return d;
        const idx = d.meals.findIndex((m) => m.id === mealId);
        if (idx < 0) return d;
        const newIdx = direction === "up" ? idx - 1 : idx + 1;
        if (newIdx < 0 || newIdx >= d.meals.length) return d;
        const newMeals = [...d.meals];
        [newMeals[idx], newMeals[newIdx]] = [newMeals[newIdx], newMeals[idx]];
        return { ...d, meals: newMeals };
      })
    );
  };

  const openSaveMealDialog = (dayId: string, mealId: string) => {
    const day = days.find((d) => d.id === dayId);
    const meal = day?.meals.find((m) => m.id === mealId);
    if (!meal) return;
    setSaveMealName(meal.name);
    setSavingMealTarget({ dayId, mealId });
    setSaveMealDialogOpen(true);
  };

  const handleSaveMealToLibrary = async () => {
    if (!user || !savingMealTarget || !saveMealName.trim()) return;
    const day = days.find((d) => d.id === savingMealTarget.dayId);
    const meal = day?.meals.find((m) => m.id === savingMealTarget.mealId);
    if (!meal || meal.foods.length === 0) {
      toast({ title: "No foods to save", variant: "destructive" });
      return;
    }

    setSavingMealLoading(true);
    try {
      const totalMacros = getMealTotals(meal);
      const { data: savedMeal, error: smErr } = await supabase
        .from("saved_meals")
        .insert({
          client_id: user.id,
          name: saveMealName.trim(),
          meal_type: "custom",
          calories: Math.round(totalMacros.calories),
          protein: Math.round(totalMacros.protein),
          carbs: Math.round(totalMacros.carbs),
          fat: Math.round(totalMacros.fat),
          fiber: Math.round(totalMacros.fiber),
          sugar: Math.round(totalMacros.sugar),
          servings: 1,
        })
        .select("id")
        .single();
      if (smErr || !savedMeal) throw smErr;

      const items = meal.foods.map((food) => ({
        saved_meal_id: savedMeal.id,
        food_item_id: food.food_item_id || null,
        food_name: food.food_name,
        quantity: food.gram_amount,
        serving_unit: food.serving_unit || "g",
        calories: Math.round((food.cal_per_100 * food.gram_amount) / 100),
        protein: Math.round((food.protein_per_100 * food.gram_amount) / 100),
        carbs: Math.round((food.carbs_per_100 * food.gram_amount) / 100),
        fat: Math.round((food.fat_per_100 * food.gram_amount) / 100),
        serving_size_g: food.serving_size_g || food.gram_amount,
        calories_per_100g: food.cal_per_100,
        protein_per_100g: food.protein_per_100,
        carbs_per_100g: food.carbs_per_100,
        fat_per_100g: food.fat_per_100,
      }));

      const { error: itemErr } = await supabase.from("saved_meal_items").insert(items);
      if (itemErr) throw itemErr;

      toast({ title: "Meal saved to library!" });
      setSaveMealDialogOpen(false);
      setSavingMealTarget(null);
    } catch (err: any) {
      toast({ title: "Error saving meal", description: err?.message, variant: "destructive" });
    } finally {
      setSavingMealLoading(false);
    }
  };

  const addSavedMealFoods = (dayId: string, mealId: string, foods: FoodResult[]) => {
    setDays((prev) =>
      prev.map((d) =>
        d.id === dayId
          ? {
              ...d,
              meals: d.meals.map((m) =>
                m.id === mealId
                  ? {
                      ...m,
                      foods: [
                        ...m.foods,
                        ...foods.map((food) => {
                          const rawSS = (food as any).serving_size ?? 100;
                          const ss = Math.max(typeof rawSS === 'string' ? parseFloat(rawSS) || 100 : rawSS || 100, 1);
                          const fr = food as any;
                          const hasPer100 = fr.calories_per_100 != null && fr.calories_per_100 > 0;
                          return {
                            id: uid(),
                            food_item_id: food.id,
                            food_name: food.name,
                            brand: food.brand,
                            gram_amount: (fr as any).gram_amount || ss,
                            cal_per_100: hasPer100 ? fr.calories_per_100 : ((food.calories || 0) / ss) * 100,
                            protein_per_100: hasPer100 ? fr.protein_per_100 : ((food.protein || 0) / ss) * 100,
                            carbs_per_100: hasPer100 ? fr.carbs_per_100 : ((food.carbs || 0) / ss) * 100,
                            fat_per_100: hasPer100 ? fr.fat_per_100 : ((food.fat || 0) / ss) * 100,
                            fiber_per_100: 0,
                            sugar_per_100: 0,
                            serving_unit: food.serving_unit || "g",
                            serving_size_g: ss,
                          };
                        }),
                      ],
                    }
                  : m
              ),
            }
          : d
      )
    );
    setSearchingMealId(null);
  };

  const addDay = () => {
    setDays((prev) => [...prev, { id: uid(), type: "Rest Day", meals: DEFAULT_MEALS() }]);
  };

  const removeDay = (dayId: string) => {
    setDays((prev) => prev.filter((d) => d.id !== dayId));
  };

  const duplicateDay = (dayId: string) => {
    const day = days.find((d) => d.id === dayId);
    if (!day) return;
    const clone: DayType = {
      ...day,
      id: uid(),
      type: `${day.type} (copy)`,
      meals: day.meals.map((m) => ({ ...m, id: uid(), foods: m.foods.map((f) => ({ ...f, id: uid() })) })),
    };
    setDays((prev) => [...prev, clone]);
  };

  const renameDayType = (dayId: string, type: string) => {
    setDays((prev) => prev.map((d) => (d.id === dayId ? { ...d, type } : d)));
  };

  const getMealTotals = (meal: Meal) =>
    meal.foods.reduce(
      (acc, f) => {
        const m = calcMacros(f);
        return {
          calories: acc.calories + m.calories,
          protein: acc.protein + m.protein,
          carbs: acc.carbs + m.carbs,
          fat: acc.fat + m.fat,
          fiber: acc.fiber + m.fiber,
          sugar: acc.sugar + m.sugar,
        };
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 }
    );

  const getDayTotals = (day: DayType) =>
    day.meals.reduce(
      (acc, meal) => {
        const t = getMealTotals(meal);
        return {
          calories: acc.calories + t.calories,
          protein: acc.protein + t.protein,
          carbs: acc.carbs + t.carbs,
          fat: acc.fat + t.fat,
          fiber: acc.fiber + t.fiber,
          sugar: acc.sugar + t.sugar,
        };
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 }
    );

  // Compute totals for the currently expanded day (or first day)
  const activeDayTotals = useMemo(() => {
    const activeDay = days.find((d) => d.id === expandedDay) || days[0];
    return activeDay ? getDayTotals(activeDay) : { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 };
  }, [days, expandedDay]);

  const handleSave = async () => {
    if (!user || !planName) return;
    setSaving(true);

    try {
      const effectiveClient = clientId || (forceTemplate ? null : (selectedClient === "none" ? null : selectedClient || null));
      const effectiveDayType = dayType || "training";
      const effectiveDayTypeLabel = dayTypeLabel || "Training Day";

      let planId = existingPlanId;

      if (planId) {
        const { error } = await supabase
          .from("meal_plans")
          .update({
            name: planName,
            updated_at: new Date().toISOString(),
            target_calories: macroTargets.calories,
            target_protein: macroTargets.protein,
            target_carbs: macroTargets.carbs,
            target_fat: macroTargets.fat,
          })
          .eq("id", planId);
        if (error) throw error;
        await supabase.from("meal_plan_days").delete().eq("meal_plan_id", planId);
      } else {
        // Check for conflict on unique index
        if (effectiveClient && !forceTemplate) {
          const { data: existing } = await supabase
            .from("meal_plans")
            .select("id")
            .eq("client_id", effectiveClient)
            .eq("day_type", effectiveDayType)
            .eq("is_template", false)
            .limit(1);
          
          if (existing && existing.length > 0) {
            // Update existing plan instead of creating duplicate
            planId = existing[0].id;
            setExistingPlanId(planId);
            await supabase.from("meal_plans").update({ name: planName, updated_at: new Date().toISOString(), target_calories: macroTargets.calories, target_protein: macroTargets.protein, target_carbs: macroTargets.carbs, target_fat: macroTargets.fat }).eq("id", planId);
            await supabase.from("meal_plan_days").delete().eq("meal_plan_id", planId);
          }
        }

        if (!planId) {
          const { data: plan, error } = await supabase
            .from("meal_plans")
            .insert({
              coach_id: user.id,
              client_id: effectiveClient,
              name: planName,
              is_template: forceTemplate || !effectiveClient,
              flexibility_mode: false,
              day_type: effectiveDayType,
              day_type_label: effectiveDayTypeLabel,
              sort_order: effectiveDayType === "training" ? 0 : effectiveDayType === "rest" ? 1 : 2,
              target_calories: macroTargets.calories,
              target_protein: macroTargets.protein,
              target_carbs: macroTargets.carbs,
              target_fat: macroTargets.fat,
            })
            .select("id")
            .single();
          if (error || !plan) throw error;
          planId = plan.id;
          setExistingPlanId(planId);
        }
      }

      for (let di = 0; di < days.length; di++) {
        const day = days[di];
        const { data: dayRow, error: dayErr } = await supabase
          .from("meal_plan_days")
          .insert({ meal_plan_id: planId, day_type: day.type, day_order: di })
          .select("id")
          .single();
        if (dayErr || !dayRow) throw dayErr;

        const items = day.meals.flatMap((meal, mi) =>
          meal.foods.map((food, fi) => ({
            meal_plan_id: planId!,
            day_id: dayRow.id,
            food_item_id: null, // Always null to avoid FK violations — food identity stored in custom_name
            custom_name: food.food_name,
            meal_name: meal.name,
            meal_type: "custom",
            gram_amount: food.gram_amount,
            servings: 1,
            calories: Math.round((food.cal_per_100 * food.gram_amount) / 100),
            protein: Math.round((food.protein_per_100 * food.gram_amount) / 100),
            carbs: Math.round((food.carbs_per_100 * food.gram_amount) / 100),
            fat: Math.round((food.fat_per_100 * food.gram_amount) / 100),
            serving_unit: food.serving_unit || "g",
            serving_size: food.serving_size_g || food.gram_amount || 100,
            item_order: fi,
            meal_order: mi,
            note: food.note?.trim() ? food.note.trim() : null,
          }))
        );

        if (items.length > 0) {
          const { error: itemErr } = await supabase.from("meal_plan_items").insert(items);
          if (itemErr) throw itemErr;
        }

        const mealNoteRows = day.meals
          .map((meal, mi) => ({ meal, mi }))
          .filter(({ meal }) => (meal.note || "").trim().length > 0)
          .map(({ meal, mi }) => ({
            day_id: dayRow.id,
            meal_order: mi,
            meal_name: meal.name,
            note: meal.note!.trim(),
          }));
        if (mealNoteRows.length > 0) {
          const { error: noteErr } = await supabase
            .from("meal_plan_meal_notes")
            .insert(mealNoteRows);
          if (noteErr) console.warn("[MealPlanBuilder] meal note insert error:", noteErr);
        }
      }

      const label = dayTypeLabel || "Meal plan";
      toast({ title: clientId ? `${label} saved!` : (forceTemplate ? "Template saved!" : "Meal plan saved!") });
      if (onSaved) { onSaved(); return; }
      if (!clientId) {
        setSelectedClient("");
        setExistingPlanId(null);
        setDays([{ id: uid(), type: "Training Day", meals: DEFAULT_MEALS() }]);
      }
    } catch (err: any) {
      console.error("[MealPlanBuilder] Save error:", err?.message);
      toast({ title: "Error saving", description: err?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleAssignTemplateToClient = async (importedDays: DayType[]) => {
    if (!clientId || !user) {
      handleImportDays(importedDays);
      return;
    }
    setSaving(true);
    try {
      if (existingPlanId) {
        await supabase.from("meal_plan_days").delete().eq("meal_plan_id", existingPlanId);
        await supabase.from("meal_plans").delete().eq("id", existingPlanId);
      }
      const effectiveDayType = dayType || "training";
      const effectiveDayTypeLabel = dayTypeLabel || "Training Day";
      const name = planName || "Assigned Plan";
      const { data: plan, error } = await supabase
        .from("meal_plans")
        .insert({
          coach_id: user.id,
          client_id: clientId,
          name,
          is_template: false,
          flexibility_mode: false,
          day_type: effectiveDayType,
          day_type_label: effectiveDayTypeLabel,
          sort_order: effectiveDayType === "training" ? 0 : effectiveDayType === "rest" ? 1 : 2,
        })
        .select("id")
        .single();
      if (error || !plan) throw error;

      for (let di = 0; di < importedDays.length; di++) {
        const day = importedDays[di];
        const { data: dayRow, error: dayErr } = await supabase
          .from("meal_plan_days")
          .insert({ meal_plan_id: plan.id, day_type: day.type, day_order: di })
          .select("id")
          .single();
        if (dayErr || !dayRow) throw dayErr;
        const items = day.meals.flatMap((meal, mi) =>
          meal.foods.map((food, fi) => ({
            meal_plan_id: plan.id,
            day_id: dayRow.id,
            food_item_id: null,
            custom_name: food.food_name,
            meal_name: meal.name,
            meal_type: "custom",
            gram_amount: food.gram_amount,
            servings: 1,
            calories: Math.round((food.cal_per_100 * food.gram_amount) / 100),
            protein: Math.round((food.protein_per_100 * food.gram_amount) / 100),
            carbs: Math.round((food.carbs_per_100 * food.gram_amount) / 100),
            fat: Math.round((food.fat_per_100 * food.gram_amount) / 100),
            item_order: fi,
            meal_order: mi,
          }))
        );
        if (items.length > 0) {
          const { error: itemErr } = await supabase.from("meal_plan_items").insert(items);
          if (itemErr) throw itemErr;
        }
      }
      toast({ title: "Plan assigned!" });
      await loadExistingPlan(clientId);
    } catch (err: any) {
      console.error("[MealPlanBuilder] Assign error:", err?.message);
      toast({ title: "Error assigning plan", description: err?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loadingExisting) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="py-12 text-center">
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Loading meal plan...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={cn("gap-6", isMobile ? "space-y-0" : "flex items-start")}>
      {/* Mobile: sticky top bar */}
      {isMobile && (
        <MealPlanMacroSidebar
          targets={macroTargets}
          current={activeDayTotals}
          onTargetsChange={setMacroTargets}
          clientId={clientId}
        />
      )}

      {/* Desktop: sticky sidebar */}
      {!isMobile && (
        <aside className="w-72 shrink-0 sticky top-4 self-start">
          <MealPlanMacroSidebar
            targets={macroTargets}
            current={activeDayTotals}
            onTargetsChange={setMacroTargets}
            clientId={clientId}
          />
        </aside>
      )}

      <div className="flex-1 min-w-0 space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <ClipboardList className="h-5 w-5" /> {forceTemplate ? "Template Builder" : "Meal Plan Builder"}
            </CardTitle>
            <div className="flex gap-2">
              {!forceTemplate && (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setTemplateModalOpen(true)}>
                  <ClipboardList className="h-3.5 w-3.5" /> Assign Template
                </Button>
              )}
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setCopyModalOpen(true)}>
                <Users className="h-3.5 w-3.5" /> Copy From Client
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setAdjustMacrosOpen(true)}>
                <Scale className="h-3.5 w-3.5" /> Adjust Macros
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className={cn("grid gap-3", (forceTemplate || clientId) ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2")}>
            <div>
              <Label>{forceTemplate ? "Template Name" : "Plan Name"}</Label>
              <Input value={planName} onChange={(e) => setPlanName(e.target.value)} placeholder={forceTemplate ? "e.g. Cutting Phase 2000 Calories" : "e.g. Cutting Phase Week 1"} />
            </div>
            {!forceTemplate && !clientId && (
              <div>
                <Label>Assign to Client (optional)</Label>
                <Select value={selectedClient} onValueChange={setSelectedClient}>
                  <SelectTrigger><SelectValue placeholder="Template (no client)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Template (no client)</SelectItem>
                    {clients.map((c) => (
                      <SelectItem key={c.user_id} value={c.user_id}>{c.full_name || "Unnamed"}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {days.map((day) => {
        const dayTotals = getDayTotals(day);
        const isExpanded = expandedDay === day.id;

        return (
          <Card key={day.id} className="overflow-hidden">
            <button
              onClick={() => setExpandedDay(isExpanded ? null : day.id)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <GripVertical className="h-4 w-4 text-muted-foreground/50" />
                <Input
                  value={day.type}
                  onChange={(e) => { e.stopPropagation(); renameDayType(day.id, e.target.value); }}
                  onClick={(e) => e.stopPropagation()}
                  className="h-7 w-40 text-sm font-semibold bg-transparent border-0 p-0 focus-visible:ring-1"
                />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  {Math.round(dayTotals.calories)} cal · {Math.round(dayTotals.protein)}P · {Math.round(dayTotals.carbs)}C · {Math.round(dayTotals.fat)}F
                </span>
                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </button>

            {isExpanded && (
              <CardContent className="pt-0 space-y-3">
                <div className="flex gap-2 flex-wrap">
                  <Button variant="ghost" size="sm" onClick={() => duplicateDay(day.id)}>
                    <Copy className="h-3 w-3 mr-1" /> Duplicate Day
                  </Button>
                  {!clientId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-primary hover:text-primary"
                      onClick={() => {
                        setCopyDayTarget(day);
                        setCopyDayDialogOpen(true);
                      }}
                    >
                      <Send className="h-3 w-3 mr-1" /> Copy to Client
                    </Button>
                  )}
                  {days.length > 1 && (
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => removeDay(day.id)}>
                      <Trash2 className="h-3 w-3 mr-1" /> Remove
                    </Button>
                  )}
                </div>

                {day.meals.map((meal) => {
                  const mealTotals = getMealTotals(meal);
                  const isSearching = searchingMealId === `${day.id}::${meal.id}`;

                  return (
                    <div key={meal.id} className="rounded-lg border border-border bg-card/50 overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2 bg-secondary/30">
                        <div className="flex items-center gap-1">
                          {/* Move Up/Down arrows */}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => moveMeal(day.id, meal.id, "up")}
                            disabled={day.meals.indexOf(meal) === 0}
                          >
                            <ArrowUp className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => moveMeal(day.id, meal.id, "down")}
                            disabled={day.meals.indexOf(meal) === day.meals.length - 1}
                          >
                            <ArrowDown className="h-3 w-3" />
                          </Button>
                          <Input
                            value={meal.name}
                            onChange={(e) => renameMeal(day.id, meal.id, e.target.value)}
                            className="h-6 w-36 text-xs font-semibold bg-transparent border-0 p-0 focus-visible:ring-1"
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-muted-foreground mr-2">
                            {Math.round(mealTotals.calories)}cal · {Math.round(mealTotals.protein)}P · {Math.round(mealTotals.carbs)}C · {Math.round(mealTotals.fat)}F
                          </span>
                          {/* 3-dot menu */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-6 w-6">
                                <MoreVertical className="h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openSaveMealDialog(day.id, meal.id)}>
                                <BookmarkPlus className="h-3.5 w-3.5 mr-2" /> Save Meal to Library
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => duplicateMeal(day.id, meal.id)}>
                                <Copy className="h-3.5 w-3.5 mr-2" /> Duplicate Meal
                              </DropdownMenuItem>
                              {day.meals.length > 1 && (
                                <DropdownMenuItem className="text-destructive" onClick={() => removeMeal(day.id, meal.id)}>
                                  <Trash2 className="h-3.5 w-3.5 mr-2" /> Remove Meal
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>

                      <div className="divide-y divide-border/50">
                        {meal.foods.map((food) => {
                          const macros = calcMacros(food);
                          const useNatural = food.serving_unit && food.serving_unit !== "g" && food.serving_size_g > 0;
                          const displayQty = useNatural
                            ? +(food.gram_amount / food.serving_size_g).toFixed(2)
                            : food.gram_amount;
                          const displayUnit = useNatural ? food.serving_unit : "g";
                          return (
                            <div key={food.id} className="flex items-center gap-2 px-3 py-2">
                              <FoodIcon name={food.food_name} size={28} />
                              <div className="flex-1 min-w-0">
                                <span className="text-xs font-medium text-foreground truncate block">{food.food_name}</span>
                                {food.brand && <span className="text-[10px] text-muted-foreground">{food.brand}</span>}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Input
                                  type="number"
                                  min="0.1"
                                  step={useNatural ? "0.5" : "1"}
                                  value={displayQty}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value) || 0;
                                    const grams = useNatural ? val * food.serving_size_g : val;
                                    updateGrams(day.id, meal.id, food.id, grams);
                                  }}
                                  className="h-6 w-16 text-[11px] text-center bg-secondary border-0 rounded"
                                />
                                <span className="text-[10px] text-muted-foreground w-10 truncate">{displayUnit}</span>
                              </div>
                              <div className="hidden sm:flex items-center gap-2 text-[10px] text-muted-foreground">
                                <span>{Math.round(macros.calories)}cal</span>
                                <span className="text-red-400">{Math.round(macros.protein)}P</span>
                                <span className="text-blue-400">{Math.round(macros.carbs)}C</span>
                                <span className="text-yellow-400">{Math.round(macros.fat)}F</span>
                              </div>
                              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => removeFood(day.id, meal.id, food.id)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>

                      <div className="px-3 py-2 border-t border-border/30">
                        {isSearching ? (
                          <FoodSearchPanel
                            onSelect={(food) => addFoodToMeal(day.id, meal.id, food as any)}
                            onClose={() => setSearchingMealId(null)}
                            onSelectSavedMeal={(foods) => addSavedMealFoods(day.id, meal.id, foods)}
                          />
                        ) : (
                          <Button variant="ghost" size="sm" className="h-7 text-xs w-full" onClick={() => setSearchingMealId(`${day.id}::${meal.id}`)}>
                            <Plus className="h-3 w-3 mr-1" /> Add Food
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}

                <Button variant="outline" size="sm" className="w-full" onClick={() => addMeal(day.id)}>
                  <Plus className="h-3 w-3 mr-1" /> Add Meal
                </Button>

                <div className="rounded-lg bg-primary/5 border border-primary/20 px-4 py-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-foreground">Day Total</span>
                    <div className="flex gap-3">
                      <span className="font-bold text-foreground">{Math.round(dayTotals.calories)} cal</span>
                      <span className="text-red-400 font-medium">{Math.round(dayTotals.protein)}P</span>
                      <span className="text-blue-400 font-medium">{Math.round(dayTotals.carbs)}C</span>
                      <span className="text-yellow-400 font-medium">{Math.round(dayTotals.fat)}F</span>
                      <span className="text-muted-foreground">{Math.round(dayTotals.fiber)}Fi</span>
                      <span className="text-muted-foreground">{Math.round(dayTotals.sugar)}S</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}

      <Button variant="outline" className="w-full" onClick={addDay}>
        <Plus className="h-4 w-4 mr-2" /> Add Day Type
      </Button>

      <Button onClick={handleSave} disabled={saving || !planName} className="w-full">
        <Save className="h-4 w-4 mr-2" />
        {saving ? "Saving..." : existingPlanId ? "Update Meal Plan" : (forceTemplate ? "Save Template" : "Save Meal Plan")}
      </Button>

      <CopyFromClientModal open={copyModalOpen} onOpenChange={setCopyModalOpen} onImport={clientId ? (days) => handleAssignTemplateToClient(days) : handleImportDays} />
      <AssignTemplateModal open={templateModalOpen} onOpenChange={setTemplateModalOpen} onImport={clientId ? (days) => handleAssignTemplateToClient(days) : handleImportDays} />
      <AdjustMacrosModal open={adjustMacrosOpen} onOpenChange={setAdjustMacrosOpen} days={days} onApply={(newDays) => setDays(newDays)} />

      <CopyDayToClientDialog
        open={copyDayDialogOpen}
        onOpenChange={setCopyDayDialogOpen}
        day={copyDayTarget}
        inferredSlot={copyDayTarget ? inferSlotFromDayType(copyDayTarget.type) : "all_days"}
        sourcePlanName={planName}
      />

      {/* Save Meal to Library Dialog */}
      <Dialog open={saveMealDialogOpen} onOpenChange={setSaveMealDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Save Meal to Library</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Meal Name</Label>
            <Input
              value={saveMealName}
              onChange={(e) => setSaveMealName(e.target.value)}
              placeholder="e.g. High Protein Breakfast"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveMealDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveMealToLibrary} disabled={savingMealLoading || !saveMealName.trim()}>
              {savingMealLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <BookmarkPlus className="h-4 w-4 mr-1" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
};

export default MealPlanBuilder;
