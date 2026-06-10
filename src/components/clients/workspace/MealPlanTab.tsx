import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Pencil,
  Trash2,
  UtensilsCrossed,
  Unlink,
  Link,
  Archive,
  RotateCcw,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import MealPlanBuilder from "@/components/nutrition/MealPlanBuilder";
import CoachGroceryList from "./CoachGroceryList";
import ExportPdfButton from "@/components/common/ExportPdfButton";
import { useNavigate } from "react-router-dom";
import {
  restoreMealPlanGroup,
  deleteArchivedMealPlanGroup,
} from "@/lib/clientPlanArchive";

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

const PILL_SLOTS = [
  { day_type: "training", label: "Training Day", emptyLabel: "+ Assign Training Day Plan" },
  { day_type: "rest", label: "Rest Day", emptyLabel: "+ Assign Rest Day Plan" },
];

const MealPlanTab = ({ clientId }: { clientId: string }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [planCards, setPlanCards] = useState<PlanCard[]>([]);
  const [activeDayType, setActiveDayType] = useState<string | null>(null);
  const [editingPlanDayType, setEditingPlanDayType] = useState<string | null>(null);
  const [builderKey, setBuilderKey] = useState(0);
  const [detachConfirmId, setDetachConfirmId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [archived, setArchived] = useState<Array<{ group_id: string; archived_at: string; plans: Array<{ id: string; name: string; day_type: string; day_type_label: string }> }>>([]);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [restoreConfirmGroup, setRestoreConfirmGroup] = useState<string | null>(null);
  const [deleteGroupConfirm, setDeleteGroupConfirm] = useState<string | null>(null);

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
      .is("archived_at", null)
      .order("sort_order");

    const plans = plansRes.data || [];
    const cards: PlanCard[] = [];

    for (const plan of plans) {
      const { data: items } = await supabase
        .from("meal_plan_items")
        .select("calories, protein, carbs, fat, day_id")
        .eq("meal_plan_id", plan.id);

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
    // Set default active pill to training if exists, otherwise first available
    if (!activeDayType || !cards.find(c => c.day_type === activeDayType)) {
      const training = cards.find(c => c.day_type === "training");
      setActiveDayType(training ? "training" : cards[0]?.day_type || "training");
    }

    // Load archived snapshots
    const { data: archivedRows } = await (supabase as any)
      .from("meal_plans")
      .select("id, name, day_type, day_type_label, archive_group_id, archived_at")
      .eq("client_id", clientId)
      .eq("is_template", false)
      .not("archived_at", "is", null)
      .order("archived_at", { ascending: false });

    const groups = new Map<string, { group_id: string; archived_at: string; plans: any[] }>();
    for (const row of (archivedRows || [])) {
      const gid = row.archive_group_id || row.id;
      if (!groups.has(gid)) {
        groups.set(gid, { group_id: gid, archived_at: row.archived_at, plans: [] });
      }
      groups.get(gid)!.plans.push({ id: row.id, name: row.name, day_type: row.day_type, day_type_label: row.day_type_label });
    }
    setArchived(Array.from(groups.values()));

    setLoading(false);
  };

  const handleRestoreGroup = async (groupId: string) => {
    try {
      await restoreMealPlanGroup(clientId, groupId);
      toast({ title: "Meal plan restored. Previous plan archived." });
      loadAll();
    } catch (err: any) {
      toast({ title: "Restore failed", description: err.message, variant: "destructive" });
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    try {
      await deleteArchivedMealPlanGroup(clientId, groupId);
      toast({ title: "Archived plan deleted" });
      loadAll();
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    }
  };

  const handleEmptySlotClick = (dayType: string) => {
    // Navigate to Master Libraries with pre-filled copy modal
    navigate("/libraries", {
      state: {
        openCopyModal: true,
        preselectedClientId: clientId,
        preselectedDayType: dayType === "training" ? "training_day" : "rest_day",
        activeTab: "meals",
      },
    });
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

  // If editing a specific day type plan — show the builder
  if (editingPlanDayType) {
    const existingCard = planCards.find((p) => p.day_type === editingPlanDayType);
    const label = existingCard?.day_type_label || (editingPlanDayType === "rest" ? "Rest Day" : "Training Day");

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

  const activeCard = planCards.find(c => c.day_type === activeDayType);

  return (
    <div className="space-y-4">
      {/* Header actions */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Meal Plan</h3>
        <ExportPdfButton kind="meal-plan" clientId={clientId} variant="labeled" />
      </div>
      {/* Pill Navigation Row */}
      <div className="flex items-center gap-2">
        {PILL_SLOTS.map((slot) => {
          const card = planCards.find(c => c.day_type === slot.day_type);
          const isActive = activeDayType === slot.day_type;

          if (card) {
            return (
              <button
                key={slot.day_type}
                onClick={() => setActiveDayType(slot.day_type)}
                className="transition-all"
                style={{
                  borderRadius: "99px",
                  padding: "6px 16px",
                  fontSize: "13px",
                  fontWeight: isActive ? 600 : 400,
                  background: isActive ? "hsl(var(--primary))" : "hsl(var(--secondary))",
                  color: isActive ? "hsl(var(--background))" : "hsl(var(--foreground))",
                  border: isActive ? "none" : "1px solid #444444",
                  cursor: "pointer",
                }}
              >
                {slot.label}
              </button>
            );
          }

          // Empty slot — dashed pill
          return (
            <button
              key={slot.day_type}
              onClick={() => handleEmptySlotClick(slot.day_type)}
              className="transition-all"
              style={{
                borderRadius: "99px",
                padding: "6px 16px",
                fontSize: "13px",
                fontWeight: 400,
                background: "transparent",
                color: "hsl(var(--muted-foreground))",
                border: "1px dashed #555555",
                cursor: "pointer",
              }}
            >
              {slot.emptyLabel}
            </button>
          );
        })}
      </div>

      {/* Active Plan Content */}
      {activeCard ? (
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                  <Badge
                    variant="secondary"
                    className="text-[10px]"
                    style={
                      activeCard.day_type === "training"
                        ? { background: "hsl(var(--primary))", color: "hsl(var(--background))" }
                        : { background: "hsl(var(--secondary))", color: "hsl(var(--foreground))", border: "1px solid #555555" }
                    }
                  >
                    {activeCard.day_type_label}
                  </Badge>
                  {activeCard.source_template_id && (
                    <Badge variant="outline" className="text-[10px] gap-1 border-primary/40 text-primary">
                      <Link className="h-2.5 w-2.5" /> Linked
                    </Badge>
                  )}
                </div>
                <p className="text-sm font-semibold text-foreground truncate">{activeCard.name}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                {activeCard.source_template_id && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-primary"
                    title="Detach from master template"
                    onClick={() => setDetachConfirmId(activeCard.id)}
                  >
                    <Unlink className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => setEditingPlanDayType(activeCard.day_type)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive"
                  onClick={() => setDeleteConfirmId(activeCard.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{activeCard.totalCalories} cal</span>
              <span className="text-destructive">{activeCard.totalProtein}P</span>
              <span className="text-info">{activeCard.totalCarbs}C</span>
              <span className="text-warn">{activeCard.totalFat}F</span>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-8 text-center">
            <UtensilsCrossed className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground mb-3">No meal plans assigned yet.</p>
            <Button size="sm" onClick={() => handleEmptySlotClick("training")} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Assign Training Day Plan
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Previous Plans */}
      {archived.length > 0 && (
        <div className="rounded-xl border border-border bg-card/40">
          <button
            type="button"
            onClick={() => setArchivedOpen(o => !o)}
            className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-foreground hover:bg-card/70 transition-colors rounded-xl"
          >
            <span className="flex items-center gap-2">
              <Archive className="h-3.5 w-3.5 text-muted-foreground" />
              Previous Plans
              <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{archived.length}</Badge>
            </span>
            {archivedOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
          {archivedOpen && (
            <div className="px-3 pb-3 space-y-2">
              {archived.map(grp => (
                <div key={grp.group_id} className="rounded-lg border border-border bg-background/40 p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1 mb-1">
                        {grp.plans.map(p => (
                          <Badge
                            key={p.id}
                            variant="secondary"
                            className="text-[10px]"
                            style={p.day_type === "training"
                              ? { background: "hsl(var(--primary) / 0.15)", color: "hsl(var(--primary))", border: "1px solid hsl(var(--primary) / 0.4)" }
                              : { background: "hsl(var(--secondary))", color: "hsl(var(--foreground))", border: "1px solid #444" }}
                          >
                            {p.day_type_label || (p.day_type === "training" ? "Training Day" : "Rest Day")}
                          </Badge>
                        ))}
                      </div>
                      <p className="text-xs font-medium text-foreground truncate">
                        {[...new Set(grp.plans.map(p => p.name))].join(" / ")}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Archived {new Date(grp.archived_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-primary hover:text-primary hover:bg-primary/10"
                        onClick={() => setRestoreConfirmGroup(grp.group_id)}
                      >
                        <RotateCcw className="h-3 w-3 mr-1" /> Restore
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteGroupConfirm(grp.group_id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Full Grocery List */}
      <CoachGroceryList clientId={clientId} />

      {/* Restore confirmation */}
      <AlertDialog open={!!restoreConfirmGroup} onOpenChange={(open) => !open && setRestoreConfirmGroup(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this meal plan?</AlertDialogTitle>
            <AlertDialogDescription>
              The currently active meal plan(s) will be archived, and this snapshot will become active. You can swap back anytime.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (restoreConfirmGroup) {
                  handleRestoreGroup(restoreConfirmGroup);
                  setRestoreConfirmGroup(null);
                }
              }}
            >
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete archived group confirmation */}
      <AlertDialog open={!!deleteGroupConfirm} onOpenChange={(open) => !open && setDeleteGroupConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete archived plan?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the archived meal plan snapshot. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteGroupConfirm) {
                  handleDeleteGroup(deleteGroupConfirm);
                  setDeleteGroupConfirm(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Meal Plan?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this meal plan and all its items. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteConfirmId) {
                  handleDeletePlan(deleteConfirmId);
                  setDeleteConfirmId(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
