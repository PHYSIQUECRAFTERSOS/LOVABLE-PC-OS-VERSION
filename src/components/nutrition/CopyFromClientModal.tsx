import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Search, ArrowLeft, ArrowRight, Copy, Loader2 } from "lucide-react";
import { Search, ArrowLeft, ArrowRight, Copy, Loader2 } from "lucide-react";
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

interface CopyFromClientModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (days: DayType[]) => void;
}

type Step = "client" | "plan" | "select";

interface ClientOption {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  plan_count: number;
}

interface PlanOption {
  id: string;
  name: string;
  created_at: string;
  is_template: boolean;
  client_id: string | null;
}

const uid = () => crypto.randomUUID();

const CopyFromClientModal = ({ open, onOpenChange, onImport }: CopyFromClientModalProps) => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("client");
  const [clientSearch, setClientSearch] = useState("");
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);

  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);

  const [selectedPlan, setSelectedPlan] = useState<PlanOption | null>(null);
  const [planDays, setPlanDays] = useState<{ id: string; day_type: string; day_order: number }[]>([]);
  const [planMeals, setPlanMeals] = useState<Map<string, string[]>>(new Map());
  const [loadingPlan, setLoadingPlan] = useState(false);

  // Selection state
  const [copyMode, setCopyMode] = useState<"entire" | "days" | "meals">("entire");
  const [selectedDayIds, setSelectedDayIds] = useState<Set<string>>(new Set());
  const [selectedMealNames, setSelectedMealNames] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep("client");
      setClientSearch("");
      setSelectedClient(null);
      setSelectedPlan(null);
      setCopyMode("entire");
      setSelectedDayIds(new Set());
      setSelectedMealNames(new Set());
      loadClients();
    }
  }, [open]);

  const loadClients = async () => {
    if (!user) return;
    setLoadingClients(true);

    // Get coach's clients
    const { data: cc } = await supabase
      .from("coach_clients")
      .select("client_id")
      .eq("coach_id", user.id)
      .eq("status", "active");

    if (!cc || cc.length === 0) {
      setClients([]);
      setLoadingClients(false);
      return;
    }

    const clientIds = cc.map((c) => c.client_id);

    // Get profiles
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name, avatar_url")
      .in("user_id", clientIds);

    // Get plan counts per client
    const { data: planCounts } = await supabase
      .from("meal_plans")
      .select("client_id")
      .in("client_id", clientIds);

    const countMap: Record<string, number> = {};
    (planCounts || []).forEach((p) => {
      if (p.client_id) countMap[p.client_id] = (countMap[p.client_id] || 0) + 1;
    });

    // Also include templates (coach's own plans)
    const { data: templates } = await supabase
      .from("meal_plans")
      .select("id")
      .eq("coach_id", user.id)
      .eq("is_template", true);

    const result: ClientOption[] = (profiles || []).map((p) => ({
      user_id: p.user_id,
      full_name: p.full_name,
      avatar_url: p.avatar_url,
      plan_count: countMap[p.user_id] || 0,
    }));

    // Add "Templates" as a virtual client if there are templates
    if (templates && templates.length > 0) {
      result.unshift({
        user_id: "__templates__",
        full_name: "📋 My Templates",
        avatar_url: null,
        plan_count: templates.length,
      });
    }

    setClients(result);
    setLoadingClients(false);
  };

  const loadPlans = async (client: ClientOption) => {
    if (!user) return;
    setLoadingPlans(true);
    setSelectedClient(client);
    setStep("plan");

    let query = supabase
      .from("meal_plans")
      .select("id, name, created_at, is_template, client_id")
      .order("created_at", { ascending: false });

    if (client.user_id === "__templates__") {
      query = query.eq("coach_id", user.id).eq("is_template", true);
    } else {
      query = query.eq("client_id", client.user_id);
    }

    const { data } = await query;
    setPlans((data as PlanOption[]) || []);
    setLoadingPlans(false);
  };

  const loadPlanDetails = async (plan: PlanOption) => {
    setSelectedPlan(plan);
    setLoadingPlan(true);
    setStep("select");

    // Load days
    const { data: days } = await supabase
      .from("meal_plan_days")
      .select("id, day_type, day_order")
      .eq("meal_plan_id", plan.id)
      .order("day_order");

    setPlanDays(days || []);

    // Load items to get unique meal names per day
    const { data: items } = await supabase
      .from("meal_plan_items")
      .select("day_id, meal_name")
      .eq("meal_plan_id", plan.id);

    const mealMap = new Map<string, string[]>();
    const allMealNames = new Set<string>();
    (items || []).forEach((item) => {
      if (item.day_id) {
        const existing = mealMap.get(item.day_id) || [];
        if (!existing.includes(item.meal_name)) {
          existing.push(item.meal_name);
          mealMap.set(item.day_id, existing);
        }
      }
      allMealNames.add(item.meal_name);
    });
    setPlanMeals(mealMap);

    // Default: select all
    setSelectedDayIds(new Set((days || []).map((d) => d.id)));
    setSelectedMealNames(allMealNames);
    setLoadingPlan(false);
  };

  const handleImport = async () => {
    if (!selectedPlan) return;
    setImporting(true);

    try {
      // Determine which days to import
      const dayIds = copyMode === "entire"
        ? planDays.map((d) => d.id)
        : [...selectedDayIds];

      if (dayIds.length === 0) {
        toast({ title: "No days selected", variant: "destructive" });
        setImporting(false);
        return;
      }

      // Load all items for selected days
      const { data: items } = await supabase
        .from("meal_plan_items")
        .select("*, food_items:food_item_id(name, brand, serving_size, calories, protein, carbs, fat, fiber, sugar)")
        .eq("meal_plan_id", selectedPlan.id)
        .in("day_id", dayIds)
        .order("meal_order")
        .order("item_order");

      // Build DayType[] structure
      const importedDays: DayType[] = planDays
        .filter((d) => dayIds.includes(d.id))
        .map((day) => {
          const dayItems = (items || []).filter((i) => i.day_id === day.id);

          // Filter by meal names if in meals mode
          const filteredItems = copyMode === "meals"
            ? dayItems.filter((i) => selectedMealNames.has(i.meal_name))
            : dayItems;

          // Group by meal_name + meal_order
          const mealGroups: Record<string, typeof filteredItems> = {};
          filteredItems.forEach((item) => {
            const key = `${item.meal_order}::${item.meal_name}`;
            if (!mealGroups[key]) mealGroups[key] = [];
            mealGroups[key].push(item);
          });

          const meals: Meal[] = Object.entries(mealGroups)
            .sort((a, b) => {
              const orderA = parseInt(a[0].split("::")[0]);
              const orderB = parseInt(b[0].split("::")[0]);
              return orderA - orderB;
            })
            .map(([key, groupItems]) => {
              const mealName = key.split("::").slice(1).join("::");
              return {
                id: uid(),
                name: mealName,
                foods: groupItems.map((item) => {
                  const fi = item.food_items as any;
                  const ss = fi?.serving_size || 100;
                  return {
                    id: uid(),
                    food_item_id: item.food_item_id || "",
                    food_name: item.custom_name || fi?.name || "Unknown",
                    brand: fi?.brand || null,
                    gram_amount: item.gram_amount || ss,
                    cal_per_100: fi ? (fi.calories / ss) * 100 : (item.calories / (item.gram_amount || 100)) * 100,
                    protein_per_100: fi ? (fi.protein / ss) * 100 : (item.protein / (item.gram_amount || 100)) * 100,
                    carbs_per_100: fi ? (fi.carbs / ss) * 100 : (item.carbs / (item.gram_amount || 100)) * 100,
                    fat_per_100: fi ? (fi.fat / ss) * 100 : (item.fat / (item.gram_amount || 100)) * 100,
                    fiber_per_100: fi ? ((fi.fiber || 0) / ss) * 100 : 0,
                    sugar_per_100: fi ? ((fi.sugar || 0) / ss) * 100 : 0,
                  };
                }),
              };
            });

          return {
            id: uid(),
            type: day.day_type,
            meals: meals.length > 0 ? meals : [{ id: uid(), name: "Meal 1", foods: [] }],
          };
        });

      if (importedDays.length === 0) {
        toast({ title: "Nothing to import", variant: "destructive" });
        setImporting(false);
        return;
      }

      onImport(importedDays);
      toast({ title: `Imported ${importedDays.length} day(s) with meals` });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const filteredClients = clients.filter((c) =>
    !clientSearch || (c.full_name || "").toLowerCase().includes(clientSearch.toLowerCase())
  );

  const allMealNames = [...new Set([...planMeals.values()].flat())];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5" />
            {step === "client" && "Copy Meals From Another Client"}
            {step === "plan" && (
              <span className="flex items-center gap-2">
                <button onClick={() => setStep("client")} className="text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="h-4 w-4" />
                </button>
                {selectedClient?.full_name}
              </span>
            )}
            {step === "select" && (
              <span className="flex items-center gap-2">
                <button onClick={() => setStep("plan")} className="text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="h-4 w-4" />
                </button>
                Select What to Copy
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Step 1: Client Selection */}
        {step === "client" && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search clients..."
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                className="pl-9"
                autoFocus
              />
            </div>

            {loadingClients ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
              </div>
            ) : filteredClients.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">No clients found</p>
            ) : (
              <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
                {filteredClients.map((client) => (
                  <button
                    key={client.user_id}
                    onClick={() => loadPlans(client)}
                    className="w-full flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 hover:bg-secondary/50 transition-colors text-left"
                  >
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
                      {(client.full_name || "?")[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{client.full_name || "Unnamed"}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {client.plan_count} meal plan{client.plan_count !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Plan Selection */}
        {step === "plan" && (
          <div className="space-y-3">
            {loadingPlans ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
              </div>
            ) : plans.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">No meal plans found for this client</p>
            ) : (
              <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
                {plans.map((plan) => (
                  <button
                    key={plan.id}
                    onClick={() => loadPlanDetails(plan)}
                    className="w-full flex items-center justify-between rounded-lg border border-border px-3 py-2.5 hover:bg-secondary/50 transition-colors text-left"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{plan.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(plan.created_at).toLocaleDateString()}
                        {plan.is_template && " · Template"}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Select What to Copy */}
        {step === "select" && (
          <div className="space-y-4">
            {loadingPlan ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
              </div>
            ) : (
              <>
                {/* Copy mode */}
                <div className="flex gap-2">
                  {(["entire", "days", "meals"] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setCopyMode(mode)}
                      className={cn(
                        "flex-1 py-2 text-xs font-medium rounded-lg border transition-colors",
                        copyMode === mode
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border text-muted-foreground hover:text-foreground hover:bg-secondary"
                      )}
                    >
                      {mode === "entire" ? "Entire Plan" : mode === "days" ? "Select Days" : "Select Meals"}
                    </button>
                  ))}
                </div>

                {/* Day selection */}
                {copyMode === "days" && (
                  <div className="space-y-1.5 rounded-lg border border-border p-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Days</p>
                    {planDays.map((day) => (
                      <label key={day.id} className="flex items-center gap-2 py-1 cursor-pointer">
                        <Checkbox
                          checked={selectedDayIds.has(day.id)}
                          onCheckedChange={(checked) => {
                            setSelectedDayIds((prev) => {
                              const next = new Set(prev);
                              checked ? next.add(day.id) : next.delete(day.id);
                              return next;
                            });
                          }}
                        />
                        <span className="text-sm text-foreground">{day.day_type}</span>
                      </label>
                    ))}
                  </div>
                )}

                {/* Meal selection */}
                {copyMode === "meals" && (
                  <>
                    {/* First select days */}
                    <div className="space-y-1.5 rounded-lg border border-border p-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">From Days</p>
                      {planDays.map((day) => (
                        <label key={day.id} className="flex items-center gap-2 py-1 cursor-pointer">
                          <Checkbox
                            checked={selectedDayIds.has(day.id)}
                            onCheckedChange={(checked) => {
                              setSelectedDayIds((prev) => {
                                const next = new Set(prev);
                                checked ? next.add(day.id) : next.delete(day.id);
                                return next;
                              });
                            }}
                          />
                          <span className="text-sm text-foreground">{day.day_type}</span>
                        </label>
                      ))}
                    </div>

                    {/* Then select meals */}
                    <div className="space-y-1.5 rounded-lg border border-border p-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Meals</p>
                      {allMealNames.map((meal) => (
                        <label key={meal} className="flex items-center gap-2 py-1 cursor-pointer">
                          <Checkbox
                            checked={selectedMealNames.has(meal)}
                            onCheckedChange={(checked) => {
                              setSelectedMealNames((prev) => {
                                const next = new Set(prev);
                                checked ? next.add(meal) : next.delete(meal);
                                return next;
                              });
                            }}
                          />
                          <span className="text-sm text-foreground">{meal}</span>
                        </label>
                      ))}
                    </div>
                  </>
                )}

                {/* Summary */}
                <div className="rounded-lg bg-primary/5 border border-primary/20 px-3 py-2">
                  <p className="text-xs text-foreground">
                    {copyMode === "entire" && `Will copy entire plan (${planDays.length} days)`}
                    {copyMode === "days" && `Will copy ${selectedDayIds.size} day(s)`}
                    {copyMode === "meals" && `Will copy ${selectedMealNames.size} meal(s) from ${selectedDayIds.size} day(s)`}
                  </p>
                </div>

                <Button onClick={handleImport} disabled={importing} className="w-full">
                  {importing ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Importing...</>
                  ) : (
                    <><Copy className="h-4 w-4 mr-2" /> Import Meals</>
                  )}
                </Button>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CopyFromClientModal;
