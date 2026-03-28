import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Pencil,
  Trash2,
  UtensilsCrossed,
  Unlink,
  Link,
} from "lucide-react";
import MealPlanBuilder from "@/components/nutrition/MealPlanBuilder";
import CoachGroceryList from "./CoachGroceryList";

interface PlanCard {
  id: string;
  name: string;
  day_type: string;
  day_type_label: string;
  sort_order: number;
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  source_template_id: string | null;
}

const DAY_TYPE_OPTIONS = [
  { value: "training", label: "Training Day" },
  { value: "rest", label: "Rest Day" },
  { value: "refeed", label: "Refeed Day" },
  { value: "custom", label: "Custom" },
];

const MealPlanTab = ({ clientId }: { clientId: string }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [planCards, setPlanCards] = useState<PlanCard[]>([]);
  const [editingPlanDayType, setEditingPlanDayType] = useState<string | null>(null);
  const [addPlanOpen, setAddPlanOpen] = useState(false);
  const [newDayType, setNewDayType] = useState("rest");
  const [newDayTypeLabel, setNewDayTypeLabel] = useState("Rest Day");
  const [builderKey, setBuilderKey] = useState(0);
  const [detachConfirmId, setDetachConfirmId] = useState<string | null>(null);

  useEffect(() => {
    loadAll();
  }, [clientId]);

  const loadAll = async () => {
    setLoading(true);
    const plansRes = await (supabase as any)
      .from("meal_plans")
      .select("id, name, day_type, day_type_label, sort_order, source_template_id")
      .eq("client_id", clientId)
      .eq("is_template", false)
      .order("sort_order");

    // Load macro totals for each plan
    const plans = plansRes.data || [];
    const cards: PlanCard[] = [];

    for (const plan of plans) {
      const { data: items } = await supabase
        .from("meal_plan_items")
        .select("calories, protein, carbs, fat, day_id")
        .eq("meal_plan_id", plan.id);

      // Get unique day IDs to calculate per-day average
      const allItems = items || [];
      const totals = allItems.reduce(
        (acc, i) => ({
          calories: acc.calories + (i.calories || 0),
          protein: acc.protein + (i.protein || 0),
          carbs: acc.carbs + (i.carbs || 0),
          fat: acc.fat + (i.fat || 0),
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 }
      );

      const dayIds = new Set(allItems.map(i => i.day_id).filter(Boolean));
      const dayCount = Math.max(dayIds.size, 1);

      cards.push({
        id: plan.id,
        name: plan.name,
        day_type: (plan as any).day_type || "training",
        day_type_label: (plan as any).day_type_label || "Training Day",
        sort_order: (plan as any).sort_order || 0,
        totalCalories: Math.round(totals.calories / dayCount),
        totalProtein: Math.round(totals.protein / dayCount),
        totalCarbs: Math.round(totals.carbs / dayCount),
        totalFat: Math.round(totals.fat / dayCount),
        source_template_id: (plan as any).source_template_id || null,
      });
    }

    setPlanCards(cards);
    setLoading(false);
  };

  const handleAddPlanType = async () => {
    // Check if day_type already exists
    const existing = planCards.find((p) => p.day_type === newDayType);
    if (existing) {
      toast({
        title: `A ${existing.day_type_label} plan already exists`,
        description: "Edit the existing plan or delete it first.",
        variant: "destructive",
      });
      return;
    }
    setAddPlanOpen(false);
    setEditingPlanDayType(newDayType);
  };

  const handleDeletePlan = async (planId: string) => {
    const { error } = await supabase.from("meal_plans").delete().eq("id", planId);
    if (error) {
      toast({ title: "Error deleting plan", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Plan removed" });
      loadAll();
      if (editingPlanDayType) setEditingPlanDayType(null);
    }
  };

  const handleDetachPlan = async (planId: string) => {
    const { error } = await (supabase as any)
      .from("meal_plans")
      .update({ source_template_id: null })
      .eq("id", planId);
    if (error) {
      toast({ title: "Error detaching plan", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Plan detached from master template" });
      setDetachConfirmId(null);
      loadAll();
    }
  };


  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 rounded-lg" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  // If editing a specific day type plan
  if (editingPlanDayType) {
    const existingCard = planCards.find((p) => p.day_type === editingPlanDayType);
    const label =
      existingCard?.day_type_label ||
      DAY_TYPE_OPTIONS.find((o) => o.value === editingPlanDayType)?.label ||
      newDayTypeLabel;

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setEditingPlanDayType(null);
              loadAll();
            }}
          >
            ← Back to Plans
          </Button>
          <Badge variant="secondary">{label}</Badge>
        </div>
        <MealPlanBuilder
          key={`${editingPlanDayType}-${builderKey}`}
          clientId={clientId}
          dayType={editingPlanDayType}
          dayTypeLabel={label}
          onSaved={() => {
            setEditingPlanDayType(null);
            setBuilderKey((k) => k + 1);
            loadAll();
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Plan Cards */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Assigned Meal Plans</h3>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAddPlanOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Add Plan Type
          </Button>
        </div>

        {planCards.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <UtensilsCrossed className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground mb-3">No meal plans assigned yet.</p>
              <Button size="sm" onClick={() => setAddPlanOpen(true)} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Create First Plan
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {planCards.map((card) => (
              <Card key={card.id} className="border-border hover:border-primary/30 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                        <Badge variant="secondary" className="text-[10px]">
                          {card.day_type_label}
                        </Badge>
                        {card.source_template_id ? (
                          <Badge variant="outline" className="text-[10px] gap-1 border-primary/40 text-primary">
                            <Link className="h-2.5 w-2.5" /> Linked
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-sm font-semibold text-foreground truncate">{card.name}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {card.source_template_id && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-primary"
                          title="Detach from master template"
                          onClick={() => setDetachConfirmId(card.id)}
                        >
                          <Unlink className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => setEditingPlanDayType(card.day_type)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        onClick={() => handleDeletePlan(card.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{card.totalCalories} cal</span>
                    <span className="text-red-400">{card.totalProtein}P</span>
                    <span className="text-blue-400">{card.totalCarbs}C</span>
                    <span className="text-yellow-400">{card.totalFat}F</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Generate Grocery List for Client */}
      <Card className="border-border/50">
        <CardContent className="py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Client Grocery List</span>
          </div>
          <Button
            size="sm"
            onClick={handleGenerateGroceryList}
            disabled={generatingGrocery || planCards.length === 0}
            className="gap-1.5"
          >
            {generatingGrocery ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ShoppingCart className="h-3.5 w-3.5" />
            )}
            Generate Grocery List
          </Button>
        </CardContent>
      </Card>

      {/* Add Plan Type Dialog */}
      <Dialog open={addPlanOpen} onOpenChange={setAddPlanOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Plan Type</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Day Type</Label>
              <Select
                value={newDayType}
                onValueChange={(val) => {
                  setNewDayType(val);
                  const opt = DAY_TYPE_OPTIONS.find((o) => o.value === val);
                  setNewDayTypeLabel(opt?.label || "");
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAY_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {newDayType === "custom" && (
              <div>
                <Label>Custom Label</Label>
                <Input
                  value={newDayTypeLabel}
                  onChange={(e) => setNewDayTypeLabel(e.target.value)}
                  placeholder="e.g. High Carb Day"
                />
              </div>
            )}
            <Button onClick={handleAddPlanType} className="w-full">
              Create Plan
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Detach Confirmation */}
      <AlertDialog open={!!detachConfirmId} onOpenChange={(open) => !open && setDetachConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Detach from Master Template?</AlertDialogTitle>
            <AlertDialogDescription>
              This will unlink this client's meal plan from the master template. Future edits to either plan will not affect the other.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => detachConfirmId && handleDetachPlan(detachConfirmId)}>
              Detach
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default MealPlanTab;
