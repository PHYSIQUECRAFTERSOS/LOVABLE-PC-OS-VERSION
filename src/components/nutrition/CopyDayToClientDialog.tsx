import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Loader2, Search, User, Users } from "lucide-react";
import SearchableClientSelect from "@/components/ui/searchable-client-select";
import { cn } from "@/lib/utils";

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
}

interface Meal {
  id: string;
  name: string;
  foods: MealFood[];
}

interface DayType {
  id: string;
  type: string;
  meals: Meal[];
}

interface ClientOption {
  user_id: string;
  full_name: string | null;
}

interface CopyDayToClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  day: DayType | null;
  /** Inferred slot for the day: 'training' | 'rest' | 'all_days'. If 'all_days', user must pick. */
  inferredSlot: "training" | "rest" | "all_days";
  /** Optional name to use for the new plan (falls back to day.type) */
  sourcePlanName?: string;
}

type Mode = "single" | "multi";
type Slot = "training" | "rest";

interface ConflictRow {
  client_id: string;
  client_name: string;
  existing_plan_id: string;
  existing_plan_name: string;
}

const slotLabel = (s: Slot) => (s === "training" ? "Training Day" : "Rest Day");

const inferSlotFromDayType = (raw: string): "training" | "rest" | "all_days" => {
  const l = (raw || "").toLowerCase();
  if (/\b(rest|non[\s-]?training|non[\s-]?workout|off|recovery|low[\s-]?carb)\b/.test(l)) return "rest";
  if (/\b(workout|training|lift|gym|high[\s-]?carb)\b/.test(l)) return "training";
  return "all_days";
};

const CopyDayToClientDialog = ({
  open,
  onOpenChange,
  day,
  inferredSlot,
  sourcePlanName,
}: CopyDayToClientDialogProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>("single");
  const [chosenSlot, setChosenSlot] = useState<Slot>(
    inferredSlot === "rest" ? "rest" : "training"
  );
  const [singleClient, setSingleClient] = useState<string>("");
  const [multiClients, setMultiClients] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [conflicts, setConflicts] = useState<ConflictRow[]>([]);
  const [showConflict, setShowConflict] = useState(false);
  const [pendingTargets, setPendingTargets] = useState<string[]>([]);

  // Reset state when dialog re-opens
  useEffect(() => {
    if (!open) return;
    setMode("single");
    setChosenSlot(inferredSlot === "rest" ? "rest" : "training");
    setSingleClient("");
    setMultiClients(new Set());
    setSearch("");
    setSubmitting(false);
    setConflicts([]);
    setShowConflict(false);
    setPendingTargets([]);
  }, [open, inferredSlot]);

  // Load active clients for this coach
  useEffect(() => {
    if (!open || !user?.id) return;
    let cancelled = false;
    setLoadingClients(true);
    (async () => {
      const { data: links } = await supabase
        .from("coach_clients")
        .select("client_id")
        .eq("coach_id", user.id)
        .eq("status", "active");
      const ids = (links || []).map((l: any) => l.client_id).filter(Boolean);
      if (ids.length === 0) {
        if (!cancelled) {
          setClients([]);
          setLoadingClients(false);
        }
        return;
      }
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", ids);
      if (!cancelled) {
        const sorted = ((profiles as ClientOption[]) || []).sort((a, b) =>
          (a.full_name || "").localeCompare(b.full_name || "")
        );
        setClients(sorted);
        setLoadingClients(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, user?.id]);

  const filteredClients = useMemo(() => {
    if (!search.trim()) return clients;
    const q = search.toLowerCase();
    return clients.filter((c) => (c.full_name || "").toLowerCase().includes(q));
  }, [clients, search]);

  const targetClientIds: string[] = useMemo(() => {
    if (mode === "single") return singleClient ? [singleClient] : [];
    return Array.from(multiClients);
  }, [mode, singleClient, multiClients]);

  const canSubmit = !submitting && day && targetClientIds.length > 0 && (chosenSlot === "training" || chosenSlot === "rest");

  // Find conflicting plans for selected clients in the chosen slot
  const checkConflictsAndCopy = async () => {
    if (!day || !user?.id || targetClientIds.length === 0) return;
    setSubmitting(true);

    try {
      const { data: existing, error: existErr } = await supabase
        .from("meal_plans")
        .select("id, name, client_id")
        .in("client_id", targetClientIds)
        .eq("is_template", false)
        .eq("day_type", chosenSlot);

      if (existErr) throw existErr;

      const conflictRows: ConflictRow[] = (existing || []).map((row: any) => ({
        client_id: row.client_id,
        client_name: clients.find((c) => c.user_id === row.client_id)?.full_name || "(unknown)",
        existing_plan_id: row.id,
        existing_plan_name: row.name || "Existing plan",
      }));

      if (conflictRows.length > 0) {
        setConflicts(conflictRows);
        setPendingTargets(targetClientIds);
        setShowConflict(true);
        setSubmitting(false);
        return;
      }

      await runCopy(targetClientIds, []);
    } catch (err: any) {
      console.error("[CopyDayToClient] conflict check failed:", err);
      toast({ title: "Copy failed", description: err.message, variant: "destructive" });
      setSubmitting(false);
    }
  };

  // Performs the copy. existingPlanIdsToDelete: per-client existing plans to remove first.
  const runCopy = async (targets: string[], existingPlanIdsToDelete: string[]) => {
    if (!day || !user?.id) return;
    setSubmitting(true);

    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    try {
      // Delete existing plans first (cascades remove days + items)
      if (existingPlanIdsToDelete.length > 0) {
        const { error: delErr } = await supabase
          .from("meal_plans")
          .delete()
          .in("id", existingPlanIdsToDelete);
        if (delErr) {
          throw new Error("Failed to remove existing plan(s): " + delErr.message);
        }
      }

      const planLabel = slotLabel(chosenSlot);
      const baseName = sourcePlanName?.trim() || day.type || planLabel;
      const planName = baseName.toLowerCase().includes(planLabel.toLowerCase())
        ? baseName
        : `${baseName} — ${planLabel}`;

      for (const targetId of targets) {
        try {
          // 1. Create new client meal plan
          const { data: newPlan, error: planErr } = await supabase
            .from("meal_plans")
            .insert({
              coach_id: user.id,
              client_id: targetId,
              name: planName,
              is_template: false,
              flexibility_mode: false,
              day_type: chosenSlot,
              day_type_label: planLabel,
            } as any)
            .select("id")
            .single();
          if (planErr || !newPlan) throw planErr || new Error("Failed to create plan");

          // 2. Insert one day row tagged with the chosen slot
          const { data: newDay, error: dayErr } = await supabase
            .from("meal_plan_days")
            .insert({
              meal_plan_id: (newPlan as any).id,
              day_type: chosenSlot,
              day_order: 1,
            })
            .select("id")
            .single();
          if (dayErr || !newDay) throw dayErr || new Error("Failed to create day");

          // 3. Insert all meal_plan_items (foods × meals) verbatim
          const items = day.meals.flatMap((meal, mi) =>
            meal.foods.map((food, fi) => ({
              meal_plan_id: (newPlan as any).id,
              day_id: (newDay as any).id,
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
              serving_unit: food.serving_unit || "g",
              serving_size: food.serving_size_g || food.gram_amount || 100,
              item_order: fi,
              meal_order: mi,
            }))
          );

          if (items.length > 0) {
            const { error: itemErr } = await supabase.from("meal_plan_items").insert(items);
            if (itemErr) throw itemErr;
          }

          successCount++;
        } catch (err: any) {
          failCount++;
          errors.push(
            `${clients.find((c) => c.user_id === targetId)?.full_name || targetId}: ${err.message}`
          );
        }
      }

      // Notify any open coach views to refresh
      try {
        window.dispatchEvent(new CustomEvent("meal-plan-updated"));
      } catch {
        /* no-op */
      }

      if (successCount > 0 && failCount === 0) {
        toast({
          title: `Copied to ${successCount} client${successCount === 1 ? "" : "s"}`,
          description: `${slotLabel(chosenSlot)} plan updated.`,
        });
        onOpenChange(false);
      } else if (successCount > 0 && failCount > 0) {
        toast({
          title: `Copied to ${successCount}, failed for ${failCount}`,
          description: errors.slice(0, 3).join(" · "),
          variant: "destructive",
        });
      } else {
        toast({
          title: "Copy failed",
          description: errors[0] || "No clients updated.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      console.error("[CopyDayToClient] runCopy error:", err);
      toast({ title: "Copy failed", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
      setShowConflict(false);
      setConflicts([]);
      setPendingTargets([]);
    }
  };

  const onConfirmReplace = async () => {
    const idsToDelete = conflicts.map((c) => c.existing_plan_id);
    await runCopy(pendingTargets, idsToDelete);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Copy Day to Client</DialogTitle>
            <DialogDescription>
              Sends "{day?.type || "this day"}" to one or more clients as their {slotLabel(chosenSlot)} plan.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Mode toggle */}
            <div className="flex gap-1 p-1 bg-muted rounded-md">
              <button
                onClick={() => setMode("single")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-colors",
                  mode === "single"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <User className="h-3.5 w-3.5" />
                Single client
              </button>
              <button
                onClick={() => setMode("multi")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded text-sm font-medium transition-colors",
                  mode === "multi"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Users className="h-3.5 w-3.5" />
                Multiple clients
              </button>
            </div>

            {/* Slot picker — only forced when day's inferred slot is ambiguous */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Target slot</Label>
              <Select value={chosenSlot} onValueChange={(v) => setChosenSlot(v as Slot)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="training">Training Day plan</SelectItem>
                  <SelectItem value="rest">Rest Day plan</SelectItem>
                </SelectContent>
              </Select>
              {inferredSlot === "all_days" && (
                <p className="text-[11px] text-muted-foreground">
                  Couldn't auto-detect this day's type — pick which slot to overwrite.
                </p>
              )}
            </div>

            {/* Client picker */}
            {mode === "single" ? (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Client</Label>
                {loadingClients ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading clients…
                  </div>
                ) : (
                  <SearchableClientSelect
                    clients={clients.map((c) => ({
                      id: c.user_id,
                      name: c.full_name || "(no name)",
                    }))}
                    value={singleClient}
                    onValueChange={setSingleClient}
                    placeholder="Choose a client…"
                  />
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Clients ({multiClients.size} selected)
                </Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search clients…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 h-8 text-sm"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto rounded-md border border-border divide-y divide-border/50">
                  {loadingClients ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground p-3">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                    </div>
                  ) : filteredClients.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      No clients found.
                    </p>
                  ) : (
                    filteredClients.map((c) => {
                      const checked = multiClients.has(c.user_id);
                      return (
                        <label
                          key={c.user_id}
                          className="flex items-center gap-2 px-3 py-2 hover:bg-muted/40 cursor-pointer"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => {
                              setMultiClients((prev) => {
                                const next = new Set(prev);
                                if (v) next.add(c.user_id);
                                else next.delete(c.user_id);
                                return next;
                              });
                            }}
                          />
                          <span className="text-sm">{c.full_name || "(no name)"}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={checkConflictsAndCopy} disabled={!canSubmit}>
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
              Copy to {targetClientIds.length || ""} client{targetClientIds.length === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showConflict} onOpenChange={setShowConflict}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace existing {slotLabel(chosenSlot)} plan?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  {conflicts.length === 1
                    ? "This client already has a"
                    : `${conflicts.length} clients already have a`}{" "}
                  {slotLabel(chosenSlot)} plan. Replacing will permanently delete the existing plan and replace it with the new one.
                </p>
                <ul className="text-xs space-y-0.5 max-h-32 overflow-y-auto pl-3">
                  {conflicts.map((c) => (
                    <li key={c.client_id}>
                      • <span className="font-medium">{c.client_name}</span>
                      <span className="text-muted-foreground"> — {c.existing_plan_name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setSubmitting(false);
                setShowConflict(false);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmReplace}>
              Replace and copy
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export { inferSlotFromDayType };
export default CopyDayToClientDialog;
