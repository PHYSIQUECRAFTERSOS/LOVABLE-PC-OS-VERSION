import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Pill, Check, Minus, Plus, ExternalLink, Tag, Pencil, Trash2, Undo2, Save, X, PackagePlus,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ImportSupplementDialog from "./ImportSupplementDialog";

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
  fasted: "☀️",
  meal_1: "🍽️",
  meal_2: "🍽️",
  pre_workout: "⚡",
  post_workout: "💪",
  before_bed: "🌙",
  with_meal: "🍚",
  any_time: "⏰",
};

const TIMING_OPTIONS = TIMING_ORDER.map(k => ({ value: k, label: TIMING_LABELS[k] }));

interface ClientSupplementPlanProps {
  clientId?: string;
}

const ClientSupplementPlan = ({ clientId }: ClientSupplementPlanProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const viewerId = clientId || user?.id;
  const isCoachView = !!clientId;
  const [loading, setLoading] = useState(true);
  const [assignment, setAssignment] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [supplements, setSupplements] = useState<Map<string, any>>(new Map());
  const [overrides, setOverrides] = useState<Map<string, any>>(new Map());
  const [todayLogs, setTodayLogs] = useState<Map<string, any>>(new Map());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ dosage: "", dosageUnit: "", timing: "", note: "" });
  const [showRemoved, setShowRemoved] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const today = format(new Date(), "yyyy-MM-dd");

  const load = useCallback(async () => {
    if (!viewerId) return;
    setLoading(true);

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

    const [{ data: planItems }, { data: overrideData }, { data: logs }] = await Promise.all([
      supabase.from("supplement_plan_items").select("*").eq("plan_id", assignData.plan_id).order("timing_slot").order("sort_order"),
      supabase.from("client_supplement_overrides").select("*").eq("assignment_id", assignData.id),
      supabase.from("supplement_logs").select("*").eq("client_id", viewerId).eq("logged_at", today),
    ]);

    const itemList = (planItems as any[]) || [];
    setItems(itemList);

    const suppIds = [...new Set(itemList.map(i => i.master_supplement_id))];
    if (suppIds.length > 0) {
      const { data: supps } = await supabase.from("master_supplements").select("*").in("id", suppIds);
      setSupplements(new Map((supps || []).map((s: any) => [s.id, s])));
    }

    setOverrides(new Map((overrideData || []).map((o: any) => [o.plan_item_id, o])));

    const logMap = new Map<string, any>();
    (logs || []).forEach((l: any) => {
      if (l.supplement_id) logMap.set(l.supplement_id, l);
    });
    setTodayLogs(logMap);
    setLoading(false);
  }, [viewerId, today]);

  useEffect(() => { load(); }, [load]);

  // Client logging functions
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

  // Coach editing functions
  const startEdit = (item: any) => {
    setEditingId(item.id);
    setEditForm({
      dosage: item.effectiveDosage || "",
      dosageUnit: item.effectiveDosageUnit || "",
      timing: item.effectiveTiming || item.timing_slot,
      note: item.effectiveNote || "",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = async (item: any) => {
    if (!assignment) return;
    const override = overrides.get(item.id);
    const payload = {
      assignment_id: assignment.id,
      plan_item_id: item.id,
      dosage_override: editForm.dosage || null,
      timing_override: editForm.timing !== item.timing_slot ? editForm.timing : null,
      coach_note_override: editForm.note || null,
      is_removed: false,
    };

    let error;
    if (override) {
      ({ error } = await supabase.from("client_supplement_overrides").update(payload).eq("id", override.id));
    } else {
      ({ error } = await supabase.from("client_supplement_overrides").insert(payload));
    }

    if (error) {
      toast({ title: "Error saving", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Saved ✓" });
      setEditingId(null);
      load();
    }
  };

  const removeItem = async (itemId: string) => {
    if (!assignment) return;
    const override = overrides.get(itemId);
    let error;
    if (override) {
      ({ error } = await supabase.from("client_supplement_overrides").update({ is_removed: true }).eq("id", override.id));
    } else {
      ({ error } = await supabase.from("client_supplement_overrides").insert({
        assignment_id: assignment.id,
        plan_item_id: itemId,
        is_removed: true,
      }));
    }
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Removed" });
      load();
    }
  };

  const restoreItem = async (itemId: string) => {
    const override = overrides.get(itemId);
    if (!override) return;
    const { error } = await supabase.from("client_supplement_overrides").update({ is_removed: false }).eq("id", override.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Restored ✓" });
      load();
    }
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

  // Build enriched items
  const enrichedItems = items.map(i => {
    const override = overrides.get(i.id);
    const supp = supplements.get(i.master_supplement_id);
    const effectiveTiming = override?.timing_override || i.timing_slot;
    return {
      ...i,
      isRemoved: override?.is_removed || false,
      effectiveTiming,
      effectiveDosage: override?.dosage_override || i.dosage || supp?.default_dosage,
      effectiveDosageUnit: i.dosage_unit || supp?.default_dosage_unit || "",
      effectiveNote: override?.coach_note_override || i.coach_note,
      supp,
    };
  });

  const activeItems = enrichedItems.filter(i => !i.isRemoved);
  const removedItems = enrichedItems.filter(i => i.isRemoved);

  // Group active by timing
  const grouped = TIMING_ORDER.reduce((acc, slot) => {
    const slotItems = activeItems.filter(i => i.effectiveTiming === slot);
    if (slotItems.length > 0) acc.push({ slot, label: TIMING_LABELS[slot], icon: TIMING_ICONS[slot], items: slotItems });
    return acc;
  }, [] as { slot: string; label: string; icon: string; items: any[] }[]);

  const existingSupplementIds = items.map(i => i.master_supplement_id);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Pill className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">
            {isCoachView ? "Client Supplement Plan" : "My Supplement Plan"}
          </h3>
        </div>
        {isCoachView && (
          <Button size="sm" variant="outline" className="h-7 text-xs border-primary/30 text-primary" onClick={() => setImportOpen(true)}>
            <PackagePlus className="h-3 w-3 mr-1" /> Import from Library
          </Button>
        )}
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
            const isEditing = editingId === item.id;

            return (
              <div key={item.id} className="rounded-lg border border-border bg-card p-3">
                {isEditing ? (
                  /* Inline edit form */
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">{item.supp?.name || "Supplement"}</p>
                    <div className="grid grid-cols-3 gap-2">
                      <Input
                        placeholder="Dosage"
                        value={editForm.dosage}
                        onChange={e => setEditForm(f => ({ ...f, dosage: e.target.value }))}
                        className="h-8 text-xs"
                      />
                      <Input
                        placeholder="Unit (g, mg...)"
                        value={editForm.dosageUnit}
                        onChange={e => setEditForm(f => ({ ...f, dosageUnit: e.target.value }))}
                        className="h-8 text-xs"
                      />
                      <Select value={editForm.timing} onValueChange={v => setEditForm(f => ({ ...f, timing: v }))}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TIMING_OPTIONS.map(t => (
                            <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Textarea
                      placeholder="Coach note (optional)"
                      value={editForm.note}
                      onChange={e => setEditForm(f => ({ ...f, note: e.target.value }))}
                      className="text-xs min-h-[50px]"
                    />
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={cancelEdit}>
                        <X className="h-3 w-3 mr-1" /> Cancel
                      </Button>
                      <Button size="sm" className="h-7 text-xs" onClick={() => saveEdit(item)}>
                        <Save className="h-3 w-3 mr-1" /> Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* Display mode */
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

                      {/* Coach: show today's compliance inline */}
                      {isCoachView && servings > 0 && (
                        <Badge className="mt-1.5 text-[9px] px-1.5 py-0.5 bg-green-500/20 text-green-400 gap-1">
                          <Check className="h-2.5 w-2.5" /> Logged {servings}x today
                        </Badge>
                      )}
                    </div>

                    {/* Controls */}
                    <div className="flex items-center gap-1 ml-3 shrink-0">
                      {isCoachView ? (
                        <>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={() => startEdit(item)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeItem(item.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </>
                      ) : (
                        /* Client log controls */
                        servings > 0 ? (
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
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {grouped.length === 0 && (
        <div className="text-center py-8">
          <Pill className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">
            {isCoachView ? "No supplements assigned. Import from your library to get started." : "Your supplement plan has no items yet."}
          </p>
        </div>
      )}

      {/* Removed items section (coach only) */}
      {isCoachView && removedItems.length > 0 && (
        <div className="pt-2">
          <button
            onClick={() => setShowRemoved(!showRemoved)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <Undo2 className="h-3 w-3" />
            {showRemoved ? "Hide" : "Show"} removed items ({removedItems.length})
          </button>
          {showRemoved && (
            <div className="mt-2 space-y-1.5">
              {removedItems.map(item => (
                <div key={item.id} className="flex items-center justify-between rounded-lg border border-dashed border-border/50 bg-card/50 p-2.5 opacity-60">
                  <span className="text-xs text-muted-foreground line-through">{item.supp?.name || "Supplement"}</span>
                  <Button size="sm" variant="ghost" className="h-6 text-xs text-primary" onClick={() => restoreItem(item.id)}>
                    <Undo2 className="h-3 w-3 mr-1" /> Restore
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Import dialog */}
      {isCoachView && assignment && (
        <ImportSupplementDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          planId={assignment.plan_id}
          existingSupplementIds={existingSupplementIds}
          onImported={load}
        />
      )}
    </div>
  );
};

export default ClientSupplementPlan;
