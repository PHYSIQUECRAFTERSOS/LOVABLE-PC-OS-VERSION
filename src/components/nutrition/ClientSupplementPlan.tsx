import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Pill, Check, Minus, Plus, ExternalLink, Tag, Clock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const TIMING_ORDER = ["fasted", "meal_1", "meal_2", "pre_workout", "post_workout", "with_meal", "before_bed", "any_time"];
const TIMING_LABELS: Record<string, string> = {
  fasted: "Fasted (Morning Ritual)",
  meal_1: "With Meal 1",
  meal_2: "With Meal 2",
  pre_workout: "Pre-Workout",
  post_workout: "Post-Workout",
  before_bed: "Before Bed",
  with_meal: "With Highest Carb Meal",
  any_time: "Any Time",
};

const TIMING_ICONS: Record<string, string> = {
  fasted: "🌅",
  meal_1: "🍽️",
  meal_2: "🍽️",
  pre_workout: "⚡",
  post_workout: "💪",
  before_bed: "🌙",
  with_meal: "🍚",
  any_time: "⏰",
};

interface ClientSupplementPlanProps {
  clientId?: string; // If provided, coach is viewing client's plan
}

const ClientSupplementPlan = ({ clientId }: ClientSupplementPlanProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const viewerId = clientId || user?.id;
  const [loading, setLoading] = useState(true);
  const [assignment, setAssignment] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [supplements, setSupplements] = useState<Map<string, any>>(new Map());
  const [overrides, setOverrides] = useState<Map<string, any>>(new Map());
  const [todayLogs, setTodayLogs] = useState<Map<string, any>>(new Map());
  const today = format(new Date(), "yyyy-MM-dd");

  const load = useCallback(async () => {
    if (!viewerId) return;
    setLoading(true);

    // Get active assignment
    const { data: assignData } = await supabase
      .from("client_supplement_assignments")
      .select("*")
      .eq("client_id", viewerId)
      .eq("is_active", true)
      .order("assigned_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!assignData) {
      setAssignment(null);
      setItems([]);
      setLoading(false);
      return;
    }

    setAssignment(assignData);

    // Load plan items, master supps, overrides, and today's logs
    const [{ data: planItems }, { data: overrideData }, { data: logs }] = await Promise.all([
      supabase.from("supplement_plan_items").select("*").eq("plan_id", assignData.plan_id).order("timing_slot").order("sort_order"),
      supabase.from("client_supplement_overrides").select("*").eq("assignment_id", assignData.id),
      supabase.from("supplement_logs").select("*").eq("client_id", viewerId).eq("logged_at", today),
    ]);

    const itemList = (planItems as any[]) || [];
    setItems(itemList);

    // Load master supplement data
    const suppIds = [...new Set(itemList.map(i => i.master_supplement_id))];
    if (suppIds.length > 0) {
      const { data: supps } = await supabase.from("master_supplements").select("*").in("id", suppIds);
      setSupplements(new Map((supps || []).map((s: any) => [s.id, s])));
    }

    // Index overrides by plan_item_id
    setOverrides(new Map((overrideData || []).map((o: any) => [o.plan_item_id, o])));

    // Index logs by supplement_id (plan_item_id stored in metadata)
    const logMap = new Map<string, any>();
    (logs || []).forEach((l: any) => {
      // We store plan_item_id in the supplement_id field for plan-based logging
      if (l.supplement_id) logMap.set(l.supplement_id, l);
    });
    setTodayLogs(logMap);

    setLoading(false);
  }, [viewerId, today]);

  useEffect(() => { load(); }, [load]);

  const logItem = async (planItemId: string) => {
    if (!viewerId) return;
    const { error } = await supabase.from("supplement_logs").insert({
      client_id: viewerId,
      supplement_id: planItemId,
      servings: 1,
      logged_at: today,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Logged ✓" });
      load();
    }
  };

  const updateLog = async (logId: string, newServings: number) => {
    if (newServings <= 0) {
      await supabase.from("supplement_logs").delete().eq("id", logId);
    } else {
      await supabase.from("supplement_logs").update({ servings: newServings }).eq("id", logId);
    }
    load();
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48 rounded-lg" />
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
      </div>
    );
  }

  if (!assignment) return null;

  // Group by timing, applying overrides
  const grouped = TIMING_ORDER.reduce((acc, slot) => {
    const slotItems = items
      .filter(i => {
        const override = overrides.get(i.id);
        if (override?.is_removed) return false;
        const effectiveTiming = override?.timing_override || i.timing_slot;
        return effectiveTiming === slot;
      })
      .map(i => {
        const override = overrides.get(i.id);
        const supp = supplements.get(i.master_supplement_id);
        return {
          ...i,
          effectiveDosage: override?.dosage_override || i.dosage || supp?.default_dosage,
          effectiveDosageUnit: i.dosage_unit || supp?.default_dosage_unit || "",
          effectiveNote: override?.coach_note_override || i.coach_note,
          supp,
        };
      });
    if (slotItems.length > 0) acc.push({ slot, label: TIMING_LABELS[slot], icon: TIMING_ICONS[slot], items: slotItems });
    return acc;
  }, [] as { slot: string; label: string; icon: string; items: any[] }[]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Pill className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">My Supplement Plan</h3>
      </div>

      {/* Timing Groups */}
      {grouped.map(group => (
        <div key={group.slot} className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <span className="text-base">{group.icon}</span>
            <h4 className="text-xs font-semibold text-primary uppercase tracking-wider">{group.label}</h4>
          </div>

          {group.items.map(item => {
            const log = todayLogs.get(item.id);
            const servings = log?.servings || 0;
            const linkUrl = item.link_url_override || item.supp?.link_url;
            const discountCode = item.discount_code_override || item.supp?.discount_code;
            const discountLabel = item.supp?.discount_label;

            return (
              <div key={item.id} className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{item.supp?.name || "Supplement"}</span>
                      {item.supp?.brand && <span className="text-xs text-muted-foreground">({item.supp.brand})</span>}
                    </div>
                    {item.effectiveDosage && (
                      <p className="text-xs text-primary mt-0.5">{item.effectiveDosage} {item.effectiveDosageUnit}</p>
                    )}
                    {item.effectiveNote && (
                      <p className="text-xs text-muted-foreground mt-0.5 italic">{item.effectiveNote}</p>
                    )}

                    {/* Discount + Link */}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {discountCode && (
                        <Badge className="text-[9px] px-1.5 py-0.5 bg-primary/20 text-primary gap-1">
                          <Tag className="h-2.5 w-2.5" />
                          {discountLabel ? `${discountCode} ${discountLabel}` : discountCode}
                        </Badge>
                      )}
                      {linkUrl && (
                        <a href={linkUrl} target="_blank" rel="noopener noreferrer">
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0.5 gap-1 hover:bg-muted cursor-pointer">
                            <ExternalLink className="h-2.5 w-2.5" /> Buy Here
                          </Badge>
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Log controls */}
                  <div className="flex items-center gap-1 ml-3 shrink-0">
                    {servings > 0 ? (
                      <>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => updateLog(log.id, servings - 1)}>
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="text-sm font-bold text-primary tabular-nums min-w-[1.5rem] text-center">{servings}</span>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => updateLog(log.id, servings + 1)}>
                          <Plus className="h-3 w-3" />
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => logItem(item.id)} className="h-7 px-3 text-xs border-primary/30 text-primary hover:bg-primary/10">
                        <Check className="h-3 w-3 mr-1" /> Log
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {grouped.length === 0 && (
        <div className="text-center py-8">
          <Pill className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">Your supplement plan has no items yet.</p>
        </div>
      )}
    </div>
  );
};

export default ClientSupplementPlan;
