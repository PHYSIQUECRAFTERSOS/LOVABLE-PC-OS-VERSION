import { useState, useEffect, useCallback, useRef } from "react";
import SearchableClientSelect from "@/components/ui/searchable-client-select";
import AIImportButton from "@/components/import/AIImportButton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Plus, Search, Pill, Trash2, MoreHorizontal, Users, Link2,
  FolderOpen, GripVertical, ExternalLink, Tag, Loader2, Edit,
  Copy, Share2, Lock, ChevronRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import MobileTwoPane from "@/components/libraries/MobileTwoPane";

const TIMING_SLOTS = [
  { value: "fasted", label: "Fasted (Morning Ritual)" },
  { value: "meal_1", label: "With Meal 1" },
  { value: "meal_2", label: "With Meal 2" },
  { value: "pre_workout", label: "Pre-Workout" },
  { value: "post_workout", label: "Post-Workout" },
  { value: "before_bed", label: "Before Bed" },
  { value: "with_meal", label: "With Highest Carb Meal" },
  { value: "any_time", label: "Any Time" },
] as const;

const TIMING_LABEL_MAP: Record<string, string> = Object.fromEntries(TIMING_SLOTS.map(t => [t.value, t.label]));

interface MasterSupplement {
  id: string;
  name: string;
  brand: string | null;
  default_dosage: string | null;
  default_dosage_unit: string | null;
  serving_unit: string | null;
  serving_size: number | null;
  link_url: string | null;
  discount_code: string | null;
  discount_label: string | null;
  notes: string | null;
  is_active: boolean;
  coach_id: string;
  is_master: boolean;
}

interface SupplementPlan {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  coach_id: string;
  is_master: boolean;
}

interface PlanItem {
  id: string;
  plan_id: string;
  master_supplement_id: string;
  dosage: string | null;
  dosage_unit: string | null;
  timing_slot: string;
  sort_order: number;
  coach_note: string | null;
  link_url_override: string | null;
  discount_code_override: string | null;
}

const SupplementLibrary = () => {
  const { user, role } = useAuth();
  const isAdmin = role === "admin";
  const { toast } = useToast();
  const [view, setView] = useState<"catalog" | "plans">("plans");
  const [supplements, setSupplements] = useState<MasterSupplement[]>([]);
  const [plans, setPlans] = useState<SupplementPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [creatorNames, setCreatorNames] = useState<Record<string, string>>({});
  const [sharedExpanded, setSharedExpanded] = useState(true);
  const [personalExpanded, setPersonalExpanded] = useState(true);

  // Supplement form
  const [showSuppForm, setShowSuppForm] = useState(false);
  const [editingSuppId, setEditingSuppId] = useState<string | null>(null);
  const [suppName, setSuppName] = useState("");
  const [suppBrand, setSuppBrand] = useState("");
  const [suppDosage, setSuppDosage] = useState("");
  const [suppDosageUnit, setSuppDosageUnit] = useState("per day");
  const [suppServingUnit, setSuppServingUnit] = useState("capsule");
  const [suppServingSize, setSuppServingSize] = useState("");
  const [suppLink, setSuppLink] = useState("");
  const [suppDiscountCode, setSuppDiscountCode] = useState("");
  const [suppDiscountLabel, setSuppDiscountLabel] = useState("");
  const [suppNotes, setSuppNotes] = useState("");

  // Plan form
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [planName, setPlanName] = useState("");
  const [planDescription, setPlanDescription] = useState("");

  // Plan detail
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [planItems, setPlanItems] = useState<PlanItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  // Add item to plan
  const [showAddItem, setShowAddItem] = useState(false);
  const [itemSuppId, setItemSuppId] = useState("");
  const [itemDosage, setItemDosage] = useState("");
  const [itemDosageUnit, setItemDosageUnit] = useState("");
  const [itemTiming, setItemTiming] = useState("fasted");
  const [itemNote, setItemNote] = useState("");

  // Assign dialog
  const [showAssign, setShowAssign] = useState(false);
  const [assignPlanId, setAssignPlanId] = useState<string | null>(null);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [assigning, setAssigning] = useState(false);

  // Inline edit state
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editDosage, setEditDosage] = useState("");
  const [editDosageUnit, setEditDosageUnit] = useState("");
  const [editTiming, setEditTiming] = useState("");
  const [editNote, setEditNote] = useState("");
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const canEdit = useCallback((item: { coach_id: string }) => {
    return item.coach_id === user?.id || isAdmin;
  }, [user?.id, isAdmin]);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    // Fetch own + shared (RLS handles cross-coach visibility for is_master=true)
    const [{ data: ownSupps }, { data: sharedSupps }, { data: ownPlans }, { data: sharedPlans }] = await Promise.all([
      supabase.from("master_supplements").select("*").eq("coach_id", user.id).eq("is_active", true).order("name"),
      supabase.from("master_supplements").select("*").eq("is_master", true).eq("is_active", true).neq("coach_id", user.id).order("name"),
      supabase.from("supplement_plans").select("*").eq("coach_id", user.id).order("created_at", { ascending: false }),
      supabase.from("supplement_plans").select("*").eq("is_master", true).neq("coach_id", user.id).order("created_at", { ascending: false }),
    ]);

    const allSupps = [...(ownSupps || []), ...(sharedSupps || [])] as MasterSupplement[];
    const allPlans = [...(ownPlans || []), ...(sharedPlans || [])] as SupplementPlan[];
    setSupplements(allSupps);
    setPlans(allPlans);

    // Fetch creator names for shared items
    const otherCoachIds = new Set([
      ...(sharedSupps || []).map((s: any) => s.coach_id),
      ...(sharedPlans || []).map((p: any) => p.coach_id),
    ].filter(id => id !== user.id));

    if (otherCoachIds.size > 0) {
      const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", Array.from(otherCoachIds));
      const names: Record<string, string> = {};
      (profiles || []).forEach((p: any) => { names[p.user_id] = p.full_name || "Coach"; });
      setCreatorNames(names);
    }

    setLoading(false);
  }, [user]);

  const loadClients = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("coach_clients").select("client_id").eq("coach_id", user.id).eq("status", "active");
    if (!data || data.length === 0) { setClients([]); return; }
    const ids = data.map((d: any) => d.client_id);
    const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", ids);
    setClients(ids.map(id => ({ id, name: (profiles || []).find((p: any) => p.user_id === id)?.full_name || id.slice(0, 8) })));
  }, [user]);

  useEffect(() => { loadData(); loadClients(); }, [loadData, loadClients]);

  const loadPlanItems = useCallback(async (planId: string) => {
    setLoadingItems(true);
    const { data } = await supabase
      .from("supplement_plan_items")
      .select("*")
      .eq("plan_id", planId)
      .order("timing_slot")
      .order("sort_order");
    setPlanItems((data as any[] || []) as PlanItem[]);
    setLoadingItems(false);
  }, []);

  useEffect(() => {
    if (selectedPlanId) loadPlanItems(selectedPlanId);
  }, [selectedPlanId, loadPlanItems]);

  // CRUD supplements
  const resetSuppForm = () => {
    setSuppName(""); setSuppBrand(""); setSuppDosage(""); setSuppDosageUnit("per day");
    setSuppServingUnit("capsule"); setSuppServingSize(""); setSuppLink(""); setSuppDiscountCode("");
    setSuppDiscountLabel(""); setSuppNotes(""); setEditingSuppId(null); setShowSuppForm(false);
  };

  const saveSupplement = async () => {
    if (!user || !suppName.trim()) return;
    const payload = {
      coach_id: user.id, name: suppName.trim(), brand: suppBrand.trim() || null,
      default_dosage: suppDosage.trim() || null, default_dosage_unit: suppDosageUnit || null,
      serving_unit: suppServingUnit, serving_size: suppServingSize ? parseFloat(suppServingSize) : null,
      link_url: suppLink.trim() || null, discount_code: suppDiscountCode.trim() || null,
      discount_label: suppDiscountLabel.trim() || null, notes: suppNotes.trim() || null,
    };
    if (editingSuppId) {
      const { error } = await supabase.from("master_supplements").update(payload).eq("id", editingSuppId);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Supplement updated" });
    } else {
      const { error } = await supabase.from("master_supplements").insert(payload);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Supplement added" });
    }
    resetSuppForm();
    loadData();
  };

  const deleteSupplement = async (id: string) => {
    await supabase.from("master_supplements").update({ is_active: false }).eq("id", id);
    toast({ title: "Supplement removed" });
    loadData();
  };

  const editSupplement = (s: MasterSupplement) => {
    setEditingSuppId(s.id); setSuppName(s.name); setSuppBrand(s.brand || "");
    setSuppDosage(s.default_dosage || ""); setSuppDosageUnit(s.default_dosage_unit || "per day");
    setSuppServingUnit(s.serving_unit || "capsule"); setSuppServingSize(s.serving_size?.toString() || "");
    setSuppLink(s.link_url || ""); setSuppDiscountCode(s.discount_code || "");
    setSuppDiscountLabel(s.discount_label || ""); setSuppNotes(s.notes || "");
    setShowSuppForm(true);
  };

  const toggleSuppShared = async (s: MasterSupplement) => {
    const { error } = await supabase.from("master_supplements").update({ is_master: !s.is_master } as any).eq("id", s.id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: s.is_master ? "Made private" : "Shared with team" });
    loadData();
  };

  // CRUD plans
  const createPlan = async () => {
    if (!user || !planName.trim()) return;
    const { error } = await supabase.from("supplement_plans").insert({
      coach_id: user.id, name: planName.trim(), description: planDescription.trim() || null,
    });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Plan created" });
    setPlanName(""); setPlanDescription(""); setShowPlanForm(false);
    loadData();
  };

  const deletePlan = async (id: string) => {
    await supabase.from("supplement_plans").delete().eq("id", id);
    toast({ title: "Plan deleted" });
    if (selectedPlanId === id) setSelectedPlanId(null);
    loadData();
  };

  const duplicatePlan = async (plan: SupplementPlan) => {
    if (!user) return;
    // Clone the plan
    const { data: newPlan, error: planErr } = await supabase.from("supplement_plans").insert({
      coach_id: user.id,
      name: `${plan.name} (Copy)`,
      description: plan.description,
    }).select().single();
    if (planErr || !newPlan) { toast({ title: "Error duplicating", description: planErr?.message, variant: "destructive" }); return; }

    // Clone items
    const { data: items } = await supabase.from("supplement_plan_items").select("*").eq("plan_id", plan.id).order("sort_order");
    if (items && items.length > 0) {
      const clonedItems = items.map((item: any) => ({
        plan_id: newPlan.id,
        master_supplement_id: item.master_supplement_id,
        dosage: item.dosage,
        dosage_unit: item.dosage_unit,
        timing_slot: item.timing_slot,
        sort_order: item.sort_order,
        coach_note: item.coach_note,
        link_url_override: item.link_url_override,
        discount_code_override: item.discount_code_override,
      }));
      await supabase.from("supplement_plan_items").insert(clonedItems);
    }

    toast({ title: "Plan duplicated" });
    loadData();
  };

  const togglePlanShared = async (plan: SupplementPlan) => {
    const { error } = await supabase.from("supplement_plans").update({ is_master: !plan.is_master } as any).eq("id", plan.id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: plan.is_master ? "Made private" : "Shared with team" });
    loadData();
  };

  // Plan items
  const addItemToPlan = async () => {
    if (!selectedPlanId || !itemSuppId) return;
    const supp = supplements.find(s => s.id === itemSuppId);
    const { error } = await supabase.from("supplement_plan_items").insert({
      plan_id: selectedPlanId, master_supplement_id: itemSuppId,
      dosage: itemDosage.trim() || supp?.default_dosage || null,
      dosage_unit: itemDosageUnit.trim() || supp?.default_dosage_unit || null,
      timing_slot: itemTiming, sort_order: planItems.length,
      coach_note: itemNote.trim() || null,
    });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Item added" });
    setShowAddItem(false); setItemSuppId(""); setItemDosage(""); setItemDosageUnit(""); setItemNote("");
    loadPlanItems(selectedPlanId);
  };

  const removeItem = async (itemId: string) => {
    await supabase.from("supplement_plan_items").delete().eq("id", itemId);
    if (selectedPlanId) loadPlanItems(selectedPlanId);
  };

  // Inline edit helpers
  const startEditItem = (item: PlanItem) => {
    setEditingItemId(item.id);
    setEditDosage(item.dosage || "");
    setEditDosageUnit(item.dosage_unit || "");
    setEditTiming(item.timing_slot);
    setEditNote(item.coach_note || "");
  };

  const saveEditItem = async () => {
    if (!editingItemId || !selectedPlanId) return;
    const { error } = await supabase.from("supplement_plan_items").update({
      dosage: editDosage.trim() || null,
      dosage_unit: editDosageUnit.trim() || null,
      timing_slot: editTiming,
      coach_note: editNote.trim() || null,
    }).eq("id", editingItemId);
    if (error) { toast({ title: "Error saving", description: error.message, variant: "destructive" }); return; }
    setEditingItemId(null);
    loadPlanItems(selectedPlanId);
  };

  const cancelEdit = () => setEditingItemId(null);

  // Assign plan
  const assignPlan = async () => {
    if (!assignPlanId || !selectedClientId || !user) return;
    setAssigning(true);
    await supabase.from("client_supplement_assignments").update({ is_active: false }).eq("client_id", selectedClientId).eq("is_active", true);
    const { error } = await supabase.from("client_supplement_assignments").insert({
      client_id: selectedClientId, plan_id: assignPlanId, assigned_by: user.id,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Plan assigned to client" });
    }
    setAssigning(false); setShowAssign(false); setSelectedClientId("");
  };

  const suppMap = new Map(supplements.map(s => [s.id, s]));

  const filteredSupps = supplements.filter(s =>
    !searchQuery || s.name.toLowerCase().includes(searchQuery.toLowerCase()) || (s.brand || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedPlan = plans.find(p => p.id === selectedPlanId);
  const canEditSelectedPlan = selectedPlan ? canEdit(selectedPlan) : false;

  // Separate plans into shared/personal
  const sharedPlans = plans.filter(p => p.is_master);
  const personalPlans = plans.filter(p => !p.is_master && p.coach_id === user?.id);

  // Separate catalog into shared/personal
  const sharedSupps = filteredSupps.filter(s => s.is_master);
  const personalSupps = filteredSupps.filter(s => !s.is_master && s.coach_id === user?.id);

  // Group items by timing slot
  const groupedItems = TIMING_SLOTS.reduce((acc, slot) => {
    const items = planItems.filter(i => i.timing_slot === slot.value);
    if (items.length > 0) acc.push({ slot: slot.value, label: slot.label, items });
    return acc;
  }, [] as { slot: string; label: string; items: PlanItem[] }[]);

  const renderPlanSidebarItem = (plan: SupplementPlan) => {
    const isOwner = canEdit(plan);
    const creatorLabel = plan.coach_id !== user?.id ? creatorNames[plan.coach_id] : null;
    return (
      <button
        key={plan.id}
        onClick={() => setSelectedPlanId(plan.id)}
        className={cn(
          "w-full text-left p-3 rounded-lg border transition-colors group",
          selectedPlanId === plan.id
            ? "border-primary bg-primary/5 ring-1 ring-primary/30"
            : "border-transparent hover:bg-muted/50"
        )}
      >
        <div className="flex items-start gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div
                role="button"
                className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted transition-all shrink-0 mt-0.5"
                onClick={e => e.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" />
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => { setAssignPlanId(plan.id); setShowAssign(true); }}>
                <Users className="h-3.5 w-3.5 mr-2" /> Assign to Client
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => duplicatePlan(plan)}>
                <Copy className="h-3.5 w-3.5 mr-2" /> Duplicate
              </DropdownMenuItem>
              {isOwner && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => togglePlanShared(plan)}>
                    {plan.is_master
                      ? <><Lock className="h-3.5 w-3.5 mr-2" /> Make Private</>
                      : <><Share2 className="h-3.5 w-3.5 mr-2" /> Share with Team</>
                    }
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive" onClick={() => deletePlan(plan.id)}>
                    <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{plan.name}</p>
            {plan.description && <p className="text-[10px] text-muted-foreground truncate mt-0.5">{plan.description}</p>}
            {creatorLabel && <p className="text-[10px] text-muted-foreground/70 mt-0.5">by {creatorLabel}</p>}
          </div>
        </div>
      </button>
    );
  };

  const renderCatalogCard = (s: MasterSupplement) => {
    const isOwner = canEdit(s);
    const creatorLabel = s.coach_id !== user?.id ? creatorNames[s.coach_id] : null;
    return (
      <Card key={s.id} className="overflow-hidden">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{s.name}</p>
              {s.brand && <p className="text-xs text-muted-foreground">{s.brand}</p>}
              {creatorLabel && <p className="text-[10px] text-muted-foreground/70">by {creatorLabel}</p>}
              {s.default_dosage && (
                <p className="text-xs text-primary mt-1">{s.default_dosage} {s.default_dosage_unit}</p>
              )}
              <div className="flex flex-wrap gap-1 mt-2">
                {s.discount_code && (
                  <Badge className="text-[9px] px-1.5 py-0 bg-primary/20 text-primary gap-0.5">
                    <Tag className="h-2 w-2" /> {s.discount_code}
                  </Badge>
                )}
                {s.link_url && (
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 gap-0.5">
                    <ExternalLink className="h-2 w-2" /> Link
                  </Badge>
                )}
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {isOwner && (
                  <DropdownMenuItem onClick={() => editSupplement(s)}>
                    <Edit className="h-3.5 w-3.5 mr-2" /> Edit
                  </DropdownMenuItem>
                )}
                {isOwner && (
                  <DropdownMenuItem onClick={() => toggleSuppShared(s)}>
                    {s.is_master
                      ? <><Lock className="h-3.5 w-3.5 mr-2" /> Make Private</>
                      : <><Share2 className="h-3.5 w-3.5 mr-2" /> Share with Team</>
                    }
                  </DropdownMenuItem>
                )}
                {isOwner && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive" onClick={() => deleteSupplement(s.id)}>
                      <Trash2 className="h-3.5 w-3.5 mr-2" /> Remove
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="md:h-[calc(100vh-12rem)]">
      {/* View toggle */}
      <div className="flex items-center gap-2 mb-4">
        <div className="flex gap-1 p-0.5 rounded-md bg-secondary">
          {(["plans", "catalog"] as const).map(v => (
            <button key={v} onClick={() => setView(v)} className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-sm transition-all capitalize",
              view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}>
              {v === "plans" ? "Supplement Plans" : "Supplement Catalog"}
            </button>
          ))}
        </div>
      </div>

      {view === "catalog" ? (
        /* ---- CATALOG VIEW ---- */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Search supplements..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-8 h-8 text-xs" />
            </div>
            <Button size="sm" onClick={() => setShowSuppForm(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Supplement
            </Button>
          </div>

          {loading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
          ) : filteredSupps.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <Pill className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No supplements in catalog yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Shared Catalog */}
              {sharedSupps.length > 0 && (
                <Collapsible open={sharedExpanded} onOpenChange={setSharedExpanded}>
                  <CollapsibleTrigger className="flex items-center gap-2 w-full text-left py-1 group">
                    <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", sharedExpanded && "rotate-90")} />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Shared</span>
                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4">{sharedSupps.length}</Badge>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-2">
                      {sharedSupps.map(renderCatalogCard)}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
              {/* Personal Catalog */}
              <Collapsible open={personalExpanded} onOpenChange={setPersonalExpanded}>
                <CollapsibleTrigger className="flex items-center gap-2 w-full text-left py-1 group">
                  <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", personalExpanded && "rotate-90")} />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Personal</span>
                  <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4">{personalSupps.length}</Badge>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  {personalSupps.length === 0 ? (
                    <div className="flex flex-col items-center py-8 text-center">
                      <p className="text-xs text-muted-foreground">No personal supplements yet.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-2">
                      {personalSupps.map(renderCatalogCard)}
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}
        </div>
      ) : (
        /* ---- PLANS VIEW ---- */
        (() => {
          const planListNode = (
            <>
            <div className="p-4 border-b space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-sm text-foreground">Plans</h2>
                <div className="flex gap-1.5">
                  <AIImportButton
                    entryPoint="library"
                    importType="supplement"
                    variant="outline"
                    size="sm"
                    onImportComplete={() => loadData()}
                  />
                  <Button size="sm" onClick={() => setShowPlanForm(true)}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> New
                  </Button>
                </div>
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)
                ) : plans.length === 0 ? (
                  <div className="flex flex-col items-center py-12 text-center px-4">
                    <FolderOpen className="h-10 w-10 text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground">No plans yet.</p>
                  </div>
                ) : (
                  <>
                    {/* Shared Plans */}
                    {sharedPlans.length > 0 && (
                      <Collapsible open={sharedExpanded} onOpenChange={setSharedExpanded}>
                        <CollapsibleTrigger className="flex items-center gap-2 w-full text-left py-1.5 px-1">
                          <ChevronRight className={cn("h-3 w-3 text-muted-foreground transition-transform", sharedExpanded && "rotate-90")} />
                          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Shared</span>
                          <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4">{sharedPlans.length}</Badge>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-1">
                          {sharedPlans.map(renderPlanSidebarItem)}
                        </CollapsibleContent>
                      </Collapsible>
                    )}
                    {/* Personal Plans */}
                    <Collapsible open={personalExpanded} onOpenChange={setPersonalExpanded}>
                      <CollapsibleTrigger className="flex items-center gap-2 w-full text-left py-1.5 px-1">
                        <ChevronRight className={cn("h-3 w-3 text-muted-foreground transition-transform", personalExpanded && "rotate-90")} />
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Personal</span>
                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4">{personalPlans.length}</Badge>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="space-y-1">
                        {personalPlans.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-4">No personal plans yet.</p>
                        ) : (
                          personalPlans.map(renderPlanSidebarItem)
                        )}
                      </CollapsibleContent>
                    </Collapsible>
                  </>
                )}
              </div>
            </ScrollArea>
            </>
          );

          // ── DETAIL PANE ──
          const detailNode = selectedPlan ? (
            <div className="p-4 sm:p-6 space-y-6">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="min-w-0 flex-1">
                  <h2 className="text-base sm:text-lg font-bold text-foreground truncate">{selectedPlan.name}</h2>
                  {selectedPlan.description && <p className="text-sm text-muted-foreground">{selectedPlan.description}</p>}
                  {selectedPlan.coach_id !== user?.id && creatorNames[selectedPlan.coach_id] && (
                    <p className="text-xs text-muted-foreground/70 mt-0.5">by {creatorNames[selectedPlan.coach_id]}</p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => { setAssignPlanId(selectedPlan.id); setShowAssign(true); }}>
                    <Users className="h-3.5 w-3.5 mr-1" /> Assign
                  </Button>
                  {canEditSelectedPlan && (
                    <Button size="sm" onClick={() => { setItemTiming("fasted"); setShowAddItem(true); }}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add Item
                    </Button>
                  )}
                </div>
              </div>

              {loadingItems ? (
                <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}</div>
              ) : groupedItems.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-center">
                  <Pill className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">No supplements in this plan yet.</p>
                  {canEditSelectedPlan && <p className="text-xs text-muted-foreground/70 mt-1">Click "Add Item" to get started.</p>}
                </div>
              ) : (
                <div className="space-y-6">
                  {groupedItems.map(group => (
                    <div key={group.slot}>
                      <h3 className="text-xs font-semibold text-primary uppercase tracking-wider mb-3">{group.label}</h3>
                      <div className="space-y-2">
                        {group.items.map(item => {
                          const supp = suppMap.get(item.master_supplement_id);
                          const isEditing = editingItemId === item.id;

                          if (isEditing && canEditSelectedPlan) {
                            return (
                              <div key={item.id} className="p-3 rounded-lg border border-primary/30 bg-card space-y-3">
                                <p className="text-sm font-medium text-foreground">{supp?.name || "Unknown"} {supp?.brand ? `(${supp.brand})` : ""}</p>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                  <div>
                                    <Label className="text-[10px]">Dosage</Label>
                                    <Input value={editDosage} onChange={e => setEditDosage(e.target.value)} className="h-8 text-xs" />
                                  </div>
                                  <div>
                                    <Label className="text-[10px]">Unit</Label>
                                    <Input value={editDosageUnit} onChange={e => setEditDosageUnit(e.target.value)} className="h-8 text-xs" />
                                  </div>
                                  <div className="col-span-2 sm:col-span-1">
                                    <Label className="text-[10px]">Timing</Label>
                                    <Select value={editTiming} onValueChange={setEditTiming}>
                                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        {TIMING_SLOTS.map(t => <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>)}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>
                                <div>
                                  <Label className="text-[10px]">Coach Note</Label>
                                  <Input value={editNote} onChange={e => setEditNote(e.target.value)} className="h-8 text-xs" placeholder="e.g. Mix with ACV" />
                                </div>
                                <div className="flex gap-2 justify-end">
                                  <Button size="sm" variant="ghost" className="text-xs h-8" onClick={cancelEdit}>Cancel</Button>
                                  <Button size="sm" className="text-xs h-8" onClick={saveEditItem}>Save</Button>
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div
                              key={item.id}
                              className={cn("flex items-center gap-3 p-3 rounded-lg border border-border bg-card group", canEditSelectedPlan && "cursor-pointer hover:border-primary/20")}
                              onClick={() => canEditSelectedPlan && startEditItem(item)}
                            >
                              <GripVertical className="h-4 w-4 text-muted-foreground/30 shrink-0 hidden sm:block" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-foreground">{supp?.name || "Unknown"}</span>
                                  {supp?.brand && <span className="text-xs text-muted-foreground">({supp.brand})</span>}
                                </div>
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                  {item.dosage && <span className="text-xs text-primary">{item.dosage} {item.dosage_unit}</span>}
                                  {item.coach_note && <span className="text-xs text-muted-foreground">· {item.coach_note}</span>}
                                </div>
                                <div className="flex gap-1 mt-1">
                                  {(item.discount_code_override || supp?.discount_code) && (
                                    <Badge className="text-[9px] px-1.5 py-0 bg-primary/20 text-primary gap-0.5">
                                      <Tag className="h-2 w-2" /> {item.discount_code_override || supp?.discount_code}
                                    </Badge>
                                  )}
                                  {(item.link_url_override || supp?.link_url) && (
                                    <a
                                      href={item.link_url_override || supp?.link_url || "#"}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex"
                                      onClick={e => e.stopPropagation()}
                                    >
                                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 gap-0.5 hover:bg-muted">
                                        <ExternalLink className="h-2 w-2" /> Link
                                      </Badge>
                                    </a>
                                  )}
                                </div>
                              </div>
                              {canEditSelectedPlan && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-9 w-9 opacity-60 hover:opacity-100 text-destructive shrink-0"
                                  onClick={e => { e.stopPropagation(); removeItem(item.id); }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null;

          const emptyNode = plans.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <Pill className="h-16 w-16 text-muted-foreground/20 mb-4" />
              <h3 className="text-lg font-semibold text-foreground">No plans yet</h3>
              <p className="text-sm text-muted-foreground/70 mt-1 mb-4">Create your first supplement plan.</p>
              <Button onClick={() => setShowPlanForm(true)}>
                <Plus className="h-4 w-4 mr-1.5" /> Create Plan
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Pill className="h-16 w-16 text-muted-foreground/20 mb-4" />
              <h3 className="text-lg font-semibold text-muted-foreground">Select a Plan</h3>
              <p className="text-sm text-muted-foreground/70 mt-1">Choose a plan from the sidebar or create a new one.</p>
            </div>
          );

          return (
            <MobileTwoPane
              list={planListNode}
              detail={detailNode}
              selected={!!selectedPlan}
              onClose={() => setSelectedPlanId(null)}
              detailTitle={selectedPlan?.name}
              emptyState={emptyNode}
              listWidthClass="w-72"
            />
          );
        })()
      )}

      {/* Supplement Form Dialog */}
      <Dialog open={showSuppForm} onOpenChange={v => { if (!v) resetSuppForm(); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pill className="h-5 w-5 text-primary" />
              {editingSuppId ? "Edit Supplement" : "Add Supplement"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Name *</Label><Input value={suppName} onChange={e => setSuppName(e.target.value)} /></div>
              <div><Label>Brand</Label><Input value={suppBrand} onChange={e => setSuppBrand(e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Default Dosage</Label><Input value={suppDosage} onChange={e => setSuppDosage(e.target.value)} placeholder="e.g. 5g, 3 capsules" /></div>
              <div>
                <Label>Dosage Unit</Label>
                <Select value={suppDosageUnit} onValueChange={setSuppDosageUnit}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="per day">per day</SelectItem>
                    <SelectItem value="per serving">per serving</SelectItem>
                    <SelectItem value="per dose">per dose</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Serving Unit</Label>
                <Select value={suppServingUnit} onValueChange={setSuppServingUnit}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["capsule", "tablet", "scoop", "ml", "drop", "softgel", "lozenge", "serving"].map(u => (
                      <SelectItem key={u} value={u} className="capitalize">{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Serving Size</Label><Input type="number" value={suppServingSize} onChange={e => setSuppServingSize(e.target.value)} placeholder="e.g. 3" /></div>
            </div>
            <div><Label>Product Link</Label><Input value={suppLink} onChange={e => setSuppLink(e.target.value)} placeholder="https://..." /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Discount Code</Label><Input value={suppDiscountCode} onChange={e => setSuppDiscountCode(e.target.value)} placeholder="WUFITNESS" /></div>
              <div><Label>Discount Label</Label><Input value={suppDiscountLabel} onChange={e => setSuppDiscountLabel(e.target.value)} placeholder="20% OFF" /></div>
            </div>
            <div><Label>Notes</Label><Textarea value={suppNotes} onChange={e => setSuppNotes(e.target.value)} placeholder="Coach notes..." className="h-20" /></div>
            <Button onClick={saveSupplement} disabled={!suppName.trim()} className="w-full">
              {editingSuppId ? "Update Supplement" : "Save Supplement"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Plan Form Dialog */}
      <Dialog open={showPlanForm} onOpenChange={setShowPlanForm}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Create Supplement Plan</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Plan Name *</Label><Input value={planName} onChange={e => setPlanName(e.target.value)} placeholder="e.g. Standard Stack" /></div>
            <div><Label>Description</Label><Textarea value={planDescription} onChange={e => setPlanDescription(e.target.value)} className="h-16" /></div>
            <Button onClick={createPlan} disabled={!planName.trim()} className="w-full">Create Plan</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Item Dialog */}
      <Dialog open={showAddItem} onOpenChange={setShowAddItem}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Supplement to Plan</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Supplement *</Label>
              <Select value={itemSuppId} onValueChange={v => {
                setItemSuppId(v);
                const s = supplements.find(s => s.id === v);
                if (s) {
                  setItemDosage(s.default_dosage || "");
                  setItemDosageUnit(s.default_dosage_unit || "");
                }
              }}>
                <SelectTrigger><SelectValue placeholder="Choose supplement..." /></SelectTrigger>
                <SelectContent>
                  {supplements.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name} {s.brand ? `(${s.brand})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {supplements.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">Add supplements to catalog first.</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Dosage</Label><Input value={itemDosage} onChange={e => setItemDosage(e.target.value)} placeholder="e.g. 5g" /></div>
              <div><Label>Unit</Label><Input value={itemDosageUnit} onChange={e => setItemDosageUnit(e.target.value)} placeholder="per day" /></div>
            </div>
            <div>
              <Label>Timing *</Label>
              <Select value={itemTiming} onValueChange={setItemTiming}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIMING_SLOTS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Coach Note</Label><Input value={itemNote} onChange={e => setItemNote(e.target.value)} placeholder="e.g. Mix with ACV + lemon juice" /></div>
            <Button onClick={addItemToPlan} disabled={!itemSuppId} className="w-full">Add to Plan</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign Dialog */}
      <Dialog open={showAssign} onOpenChange={setShowAssign}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Assign Plan to Client</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Select Client</Label>
              <SearchableClientSelect
                clients={clients}
                value={selectedClientId}
                onValueChange={setSelectedClientId}
              />
            </div>
            <Button onClick={assignPlan} disabled={assigning || !selectedClientId} className="w-full">
              {assigning && <Loader2 className="animate-spin mr-2 h-4 w-4" />}
              Assign Plan
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SupplementLibrary;
