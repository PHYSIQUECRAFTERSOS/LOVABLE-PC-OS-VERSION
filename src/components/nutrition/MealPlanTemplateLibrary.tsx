import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus, Search, Star, Trash2, Copy, MoreHorizontal, FolderOpen,
  UtensilsCrossed, ChevronDown, ChevronUp, Loader2, Pencil, UserPlus,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import MealPlanBuilder from "./MealPlanBuilder";

const CATEGORIES = ["Fat Loss", "Maintenance", "Lean Bulk", "High Protein", "Low Carb", "Contest Prep", "Refeed"];

interface Template {
  id: string;
  name: string;
  category: string | null;
  is_favorite: boolean;
  target_calories: number | null;
  target_protein: number | null;
  target_carbs: number | null;
  target_fat: number | null;
  created_at: string;
}

interface DayPreview {
  id: string;
  day_type: string;
  day_order: number;
}

interface ItemPreview {
  meal_name: string;
  custom_name: string | null;
  gram_amount: number | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  meal_order: number;
  item_order: number;
  day_id: string;
}

const MealPlanTemplateLibrary = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | undefined>();

  // Preview state
  const [previewDays, setPreviewDays] = useState<DayPreview[]>([]);
  const [previewItems, setPreviewItems] = useState<ItemPreview[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  // Copy to Client state
  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [copyTemplate, setCopyTemplate] = useState<Template | null>(null);
  const [clients, setClients] = useState<any[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [copyPlanType, setCopyPlanType] = useState("training_day");
  const [copying, setCopying] = useState(false);
  const [loadingClients, setLoadingClients] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const openCopyToClient = async (template: Template) => {
    setCopyTemplate(template);
    setSelectedClientId(null);
    setClientSearch("");
    setCopyPlanType("training_day");
    setCopyModalOpen(true);
    setLoadingClients(true);
    if (user) {
      const { data } = await supabase
        .from("coach_clients")
        .select("client_id, profiles!coach_clients_client_id_fkey(user_id, full_name, avatar_url)")
        .eq("coach_id", user.id)
        .eq("status", "active");
      setClients((data || []).map((c: any) => ({
        id: c.client_id,
        full_name: c.profiles?.full_name || "Client",
        avatar_url: c.profiles?.avatar_url,
      })));
    }
    setLoadingClients(false);
  };

  const handleCopyToClient = async () => {
    if (!copyTemplate || !selectedClientId || !user) return;
    setCopying(true);
    try {
      // Get full template data
      const { data: days } = await supabase
        .from("meal_plan_days")
        .select("*")
        .eq("meal_plan_id", copyTemplate.id)
        .order("day_order");

      const { data: items } = await supabase
        .from("meal_plan_items")
        .select("*")
        .eq("meal_plan_id", copyTemplate.id)
        .order("meal_order")
        .order("item_order");

      // Create client meal plan
      const { data: newPlan, error } = await supabase
        .from("meal_plans")
        .insert({
          coach_id: user.id,
          client_id: selectedClientId,
          name: copyTemplate.name,
          is_template: false,
          category: copyTemplate.category,
          target_calories: copyTemplate.target_calories,
          target_protein: copyTemplate.target_protein,
          target_carbs: copyTemplate.target_carbs,
          target_fat: copyTemplate.target_fat,
          flexibility_mode: false,
        } as any)
        .select("id")
        .single();

      if (error) throw error;

      // Copy days and items
      for (const day of (days || [])) {
        const { data: newDay } = await supabase
          .from("meal_plan_days")
          .insert({ meal_plan_id: newPlan.id, day_type: day.day_type, day_order: day.day_order })
          .select("id")
          .single();

        if (newDay) {
          const dayItems = (items || []).filter((i: any) => i.day_id === day.id);
          if (dayItems.length > 0) {
            await supabase.from("meal_plan_items").insert(
              dayItems.map((item: any) => ({
                meal_plan_id: newPlan.id,
                day_id: newDay.id,
                food_item_id: item.food_item_id,
                custom_name: item.custom_name,
                meal_name: item.meal_name,
                meal_type: item.meal_type,
                gram_amount: item.gram_amount,
                servings: item.servings,
                calories: item.calories,
                protein: item.protein,
                carbs: item.carbs,
                fat: item.fat,
                item_order: item.item_order,
                meal_order: item.meal_order,
              }))
            );
          }
        }
      }

      const clientName = clients.find(c => c.id === selectedClientId)?.full_name || "client";
      toast({ title: `Meal plan copied to ${clientName} successfully` });
      setCopyModalOpen(false);
    } catch (err: any) {
      toast({ title: "Failed to copy meal plan", description: err.message, variant: "destructive" });
    } finally {
      setCopying(false);
    }
  };

  const filteredClients = clients.filter(c =>
    !clientSearch || c.full_name?.toLowerCase().includes(clientSearch.toLowerCase())
  );

  const loadTemplates = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("meal_plans")
      .select("id, name, category, is_favorite, target_calories, target_protein, target_carbs, target_fat, created_at")
      .eq("coach_id", user.id)
      .eq("is_template", true)
      .order("is_favorite", { ascending: false })
      .order("created_at", { ascending: false });
    setTemplates((data as Template[]) || []);
    setLoading(false);
  };

  useEffect(() => { loadTemplates(); }, [user]);

  const loadPreview = async (template: Template) => {
    setSelectedTemplate(template);
    setLoadingPreview(true);
    setExpandedDay(null);

    const { data: days } = await supabase
      .from("meal_plan_days")
      .select("id, day_type, day_order")
      .eq("meal_plan_id", template.id)
      .order("day_order");

    setPreviewDays(days || []);
    if (days && days.length > 0) setExpandedDay(days[0].id);

    const { data: items } = await supabase
      .from("meal_plan_items")
      .select("meal_name, custom_name, gram_amount, calories, protein, carbs, fat, meal_order, item_order, day_id")
      .eq("meal_plan_id", template.id)
      .order("meal_order")
      .order("item_order");

    setPreviewItems((items as ItemPreview[]) || []);
    setLoadingPreview(false);
  };

  const toggleFavorite = async (id: string, current: boolean) => {
    await supabase.from("meal_plans").update({ is_favorite: !current } as any).eq("id", id);
    setTemplates(prev => prev.map(t => t.id === id ? { ...t, is_favorite: !current } : t));
  };

  const duplicateTemplate = async (template: Template) => {
    if (!user) return;
    try {
      const { data: newPlan, error } = await supabase
        .from("meal_plans")
        .insert({
          coach_id: user.id,
          name: `${template.name} (Copy)`,
          is_template: true,
          category: template.category,
          target_calories: template.target_calories,
          target_protein: template.target_protein,
          target_carbs: template.target_carbs,
          target_fat: template.target_fat,
          flexibility_mode: false,
        } as any)
        .select("id")
        .single();
      if (error) throw error;

      const { data: days } = await supabase
        .from("meal_plan_days")
        .select("*")
        .eq("meal_plan_id", template.id);

      for (const day of (days || [])) {
        const { data: newDay } = await supabase
          .from("meal_plan_days")
          .insert({ meal_plan_id: newPlan.id, day_type: day.day_type, day_order: day.day_order })
          .select("id")
          .single();

        if (newDay) {
          const { data: items } = await supabase
            .from("meal_plan_items")
            .select("food_item_id, custom_name, meal_name, meal_type, gram_amount, servings, calories, protein, carbs, fat, item_order, meal_order")
            .eq("meal_plan_id", template.id)
            .eq("day_id", day.id);

          if (items && items.length > 0) {
            await supabase.from("meal_plan_items").insert(
              items.map((item: any) => ({ ...item, meal_plan_id: newPlan.id, day_id: newDay.id }))
            );
          }
        }
      }

      toast({ title: "Template duplicated" });
      loadTemplates();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const deleteTemplate = async (id: string) => {
    await supabase.from("meal_plan_items").delete().eq("meal_plan_id", id);
    await supabase.from("meal_plan_days").delete().eq("meal_plan_id", id);
    await supabase.from("meal_plans").delete().eq("id", id);
    if (selectedTemplate?.id === id) setSelectedTemplate(null);
    toast({ title: "Template deleted" });
    loadTemplates();
  };

  const updateCategory = async (id: string, category: string) => {
    const val = category === "none" ? null : category;
    await supabase.from("meal_plans").update({ category: val } as any).eq("id", id);
    setTemplates(prev => prev.map(t => t.id === id ? { ...t, category: val } : t));
  };

  const filtered = templates.filter(t => {
    if (searchQuery && !t.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
    return true;
  });

  if (showBuilder) {
    return (
      <div className="animate-fade-in space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground">
            {editingTemplateId ? "Edit Template" : "Create Meal Plan Template"}
          </h3>
          <Button variant="outline" size="sm" onClick={() => { setShowBuilder(false); setEditingTemplateId(undefined); loadTemplates(); }}>
            Back to Templates
          </Button>
        </div>
        <MealPlanBuilder forceTemplate editingTemplateId={editingTemplateId} onSaved={() => { setShowBuilder(false); setEditingTemplateId(undefined); loadTemplates(); }} />
      </div>
    );
  }

  // Build preview grouped by day -> meal
  const getDayItems = (dayId: string) => {
    const items = previewItems.filter(i => i.day_id === dayId);
    const meals: Record<string, ItemPreview[]> = {};
    items.forEach(item => {
      const key = `${item.meal_order}::${item.meal_name}`;
      if (!meals[key]) meals[key] = [];
      meals[key].push(item);
    });
    return Object.entries(meals).sort((a, b) => {
      const oa = parseInt(a[0].split("::")[0]);
      const ob = parseInt(b[0].split("::")[0]);
      return oa - ob;
    });
  };

  const getDayTotals = (dayId: string) => {
    const items = previewItems.filter(i => i.day_id === dayId);
    return items.reduce((acc, i) => ({
      calories: acc.calories + (i.calories || 0),
      protein: acc.protein + (i.protein || 0),
      carbs: acc.carbs + (i.carbs || 0),
      fat: acc.fat + (i.fat || 0),
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
  };

  return (
    <div className="h-[calc(100vh-12rem)]">
      <div className="flex h-full">
        {/* LEFT SIDEBAR */}
        <div className="w-80 border-r flex flex-col flex-shrink-0">
          <div className="p-4 border-b space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm text-foreground">Meal Plan Templates</h2>
              <Button size="sm" onClick={() => { setEditingTemplateId(undefined); setShowBuilder(true); }}>
                <Plus className="h-3.5 w-3.5 mr-1" /> New
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Search templates..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-8 h-8 text-xs" />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                  <FolderOpen className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">No templates yet.</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">Create your first reusable meal plan.</p>
                </div>
              ) : (
                filtered.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => loadPreview(template)}
                    className={cn(
                      "w-full text-left p-3 rounded-lg border transition-colors group",
                      selectedTemplate?.id === template.id
                        ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                        : "border-transparent hover:bg-muted/50"
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          {template.is_favorite && <Star className="h-3 w-3 fill-yellow-400 text-yellow-400 shrink-0" />}
                          <p className="text-sm font-medium truncate">{template.name}</p>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {template.category && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0">{template.category}</Badge>
                          )}
                          {template.target_calories && (
                            <Badge variant="secondary" className="text-[9px] px-1 py-0">{template.target_calories} cal</Badge>
                          )}
                          {template.target_protein && (
                            <Badge variant="secondary" className="text-[9px] px-1 py-0">{template.target_protein}P</Badge>
                          )}
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <div
                            role="button"
                            className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted transition-all"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </div>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => { setEditingTemplateId(template.id); setShowBuilder(true); }}>
                            <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => toggleFavorite(template.id, template.is_favorite)}>
                            <Star className={cn("h-3.5 w-3.5 mr-2", template.is_favorite && "fill-yellow-400 text-yellow-400")} />
                            {template.is_favorite ? "Unfavorite" : "Favorite"}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => duplicateTemplate(template)}>
                            <Copy className="h-3.5 w-3.5 mr-2" /> Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openCopyToClient(template)}>
                            <UserPlus className="h-3.5 w-3.5 mr-2" /> Assign to Client
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {CATEGORIES.map(cat => (
                            <DropdownMenuItem key={cat} onClick={() => updateCategory(template.id, cat)} className="text-xs">
                              {template.category === cat ? "✓ " : ""}{cat}
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuItem onClick={() => updateCategory(template.id, "none")} className="text-xs">
                            {!template.category ? "✓ " : ""}No Category
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive" onClick={() => setDeleteConfirmId(template.id)}>
                            <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        {/* RIGHT PANEL - PREVIEW */}
        <div className="flex-1 overflow-auto">
          {selectedTemplate ? (
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-foreground">{selectedTemplate.name}</h2>
                  <div className="flex gap-2 mt-1">
                    {selectedTemplate.category && <Badge variant="outline">{selectedTemplate.category}</Badge>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingTemplateId(selectedTemplate.id); setShowBuilder(true); }} title="Edit">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => duplicateTemplate(selectedTemplate)} title="Duplicate">
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openCopyToClient(selectedTemplate)} title="Assign to Client">
                    <UserPlus className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteConfirmId(selectedTemplate.id)} title="Delete">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Macro Targets */}
              {(selectedTemplate.target_calories || selectedTemplate.target_protein) && (
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: "Calories", value: selectedTemplate.target_calories, color: "text-foreground" },
                    { label: "Protein", value: selectedTemplate.target_protein, suffix: "g", color: "text-red-400" },
                    { label: "Carbs", value: selectedTemplate.target_carbs, suffix: "g", color: "text-blue-400" },
                    { label: "Fat", value: selectedTemplate.target_fat, suffix: "g", color: "text-yellow-400" },
                  ].map(m => (
                    <Card key={m.label}>
                      <CardContent className="p-3 text-center">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{m.label}</p>
                        <p className={cn("text-lg font-bold", m.color)}>{m.value || "—"}{m.value && m.suffix}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Day Preview */}
              {loadingPreview ? (
                <div className="space-y-3">{[1,2].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}</div>
              ) : previewDays.length === 0 ? (
                <div className="text-center py-12">
                  <UtensilsCrossed className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Empty template — no days added yet.</p>
                </div>
              ) : (
                previewDays.map(day => {
                  const isExp = expandedDay === day.id;
                  const totals = getDayTotals(day.id);
                  const meals = getDayItems(day.id);

                  return (
                    <Card key={day.id}>
                      <button
                        onClick={() => setExpandedDay(isExp ? null : day.id)}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-secondary/50 transition-colors"
                      >
                        <span className="font-semibold text-sm text-foreground">{day.day_type}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground">
                            {totals.calories}cal · {totals.protein}P · {totals.carbs}C · {totals.fat}F
                          </span>
                          {isExp ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </div>
                      </button>
                      {isExp && (
                        <CardContent className="pt-0 space-y-2">
                          {meals.map(([key, items]) => {
                            const mealName = key.split("::").slice(1).join("::");
                            const mealCals = items.reduce((s, i) => s + (i.calories || 0), 0);
                            const mealP = items.reduce((s, i) => s + (i.protein || 0), 0);
                            return (
                              <div key={key} className="rounded-lg border border-border/50 overflow-hidden">
                                <div className="flex items-center justify-between px-3 py-1.5 bg-secondary/30">
                                  <span className="text-xs font-semibold text-foreground">{mealName}</span>
                                  <span className="text-[10px] text-muted-foreground">{mealCals}cal · {mealP}P</span>
                                </div>
                                <div className="divide-y divide-border/30">
                                  {items.map((item, idx) => (
                                    <div key={idx} className="flex items-center justify-between px-3 py-1.5">
                                      <span className="text-xs text-foreground">{item.custom_name || "Food"}</span>
                                      <span className="text-[10px] text-muted-foreground">
                                        {item.gram_amount}g · {item.calories}cal · {item.protein}P · {item.carbs}C · {item.fat}F
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </CardContent>
                      )}
                    </Card>
                  );
                })
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <UtensilsCrossed className="h-16 w-16 text-muted-foreground/20 mb-4" />
              <h3 className="text-lg font-semibold text-muted-foreground">Select a Template</h3>
              <p className="text-sm text-muted-foreground/70 mt-1">Choose a template from the sidebar or create a new one.</p>
            </div>
          )}
        </div>
      </div>

      {/* Copy to Client Modal */}
      <Dialog open={copyModalOpen} onOpenChange={setCopyModalOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Copy Meal Plan to Client</DialogTitle>
            <p className="text-sm text-muted-foreground">Select a client to assign this meal plan to</p>
          </DialogHeader>

          <div className="space-y-4">
            <Input
              placeholder="Search clients..."
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
            />

            <ScrollArea className="h-[250px]">
              {loadingClients ? (
                <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
              ) : filteredClients.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No clients found</p>
              ) : (
                <div className="space-y-1">
                  {filteredClients.map(client => (
                    <button
                      key={client.id}
                      onClick={() => setSelectedClientId(client.id)}
                      className={cn(
                        "w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors",
                        selectedClientId === client.id
                          ? "border-2 border-primary bg-primary/5"
                          : "border border-border hover:bg-secondary/30"
                      )}
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={client.avatar_url || undefined} />
                        <AvatarFallback className="text-xs bg-primary/10 text-primary">
                          {(client.full_name || "C").charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium text-foreground">{client.full_name}</span>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>

            <Select value={copyPlanType} onValueChange={setCopyPlanType}>
              <SelectTrigger>
                <SelectValue placeholder="Plan Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="training_day">Training Day Plan</SelectItem>
                <SelectItem value="rest_day">Rest Day Plan</SelectItem>
                <SelectItem value="both">Both</SelectItem>
              </SelectContent>
            </Select>

            <Button
              className="w-full"
              onClick={handleCopyToClient}
              disabled={!selectedClientId || copying}
            >
              {copying ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Copying...</> : "Copy Plan"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this meal plan template and all its days/items. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteConfirmId) { deleteTemplate(deleteConfirmId); setDeleteConfirmId(null); } }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default MealPlanTemplateLibrary;
