import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Search, Star, ArrowRight, ChevronDown, ChevronUp, Loader2, FileText } from "lucide-react";
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

interface AssignTemplateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (days: DayType[]) => void;
}

interface TemplateOption {
  id: string;
  name: string;
  category: string | null;
  is_favorite: boolean;
  target_calories: number | null;
  target_protein: number | null;
  created_at: string;
}

const uid = () => crypto.randomUUID();

const AssignTemplateModal = ({ open, onOpenChange, onImport }: AssignTemplateModalProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [importing, setImporting] = useState(false);

  // Preview
  const [previewTemplate, setPreviewTemplate] = useState<TemplateOption | null>(null);
  const [previewDays, setPreviewDays] = useState<{ id: string; day_type: string; day_order: number }[]>([]);
  const [previewItems, setPreviewItems] = useState<any[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    if (open) {
      setSearch("");
      setPreviewTemplate(null);
      loadTemplates();
    }
  }, [open]);

  const loadTemplates = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("meal_plans")
      .select("id, name, category, is_favorite, target_calories, target_protein, created_at")
      .eq("coach_id", user.id)
      .eq("is_template", true)
      .order("is_favorite", { ascending: false })
      .order("created_at", { ascending: false });
    setTemplates((data as TemplateOption[]) || []);
    setLoading(false);
  };

  const loadPreview = async (template: TemplateOption) => {
    setPreviewTemplate(template);
    setLoadingPreview(true);

    const { data: days } = await supabase
      .from("meal_plan_days")
      .select("id, day_type, day_order")
      .eq("meal_plan_id", template.id)
      .order("day_order");

    setPreviewDays(days || []);

    const { data: items } = await supabase
      .from("meal_plan_items")
      .select("day_id, meal_name, custom_name, calories, protein, carbs, fat, meal_order")
      .eq("meal_plan_id", template.id)
      .order("meal_order");

    setPreviewItems(items || []);
    setLoadingPreview(false);
  };

  const handleAssign = async () => {
    if (!previewTemplate) return;
    setImporting(true);

    try {
      const dayIds = previewDays.map(d => d.id);
      if (dayIds.length === 0) {
        toast({ title: "Empty template", variant: "destructive" });
        setImporting(false);
        return;
      }

      const { data: items } = await supabase
        .from("meal_plan_items")
        .select("*, food_items:food_item_id(name, brand, serving_size, calories, protein, carbs, fat, fiber, sugar)")
        .eq("meal_plan_id", previewTemplate.id)
        .in("day_id", dayIds)
        .order("meal_order")
        .order("item_order");

      const importedDays: DayType[] = previewDays.map(day => {
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
            const mealName = key.split("::").slice(1).join("::");
            return {
              id: uid(),
              name: mealName,
              foods: groupItems.map((item: any) => {
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

      onImport(importedDays);
      toast({ title: `Loaded "${previewTemplate.name}" template` });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const filtered = templates.filter(t =>
    !search || t.name.toLowerCase().includes(search.toLowerCase())
  );

  const getDayTotals = (dayId: string) => {
    const items = previewItems.filter((i: any) => i.day_id === dayId);
    return items.reduce((acc: any, i: any) => ({
      calories: acc.calories + (i.calories || 0),
      protein: acc.protein + (i.protein || 0),
    }), { calories: 0, protein: 0 });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {previewTemplate ? (
              <span className="flex items-center gap-2">
                <button onClick={() => setPreviewTemplate(null)} className="text-muted-foreground hover:text-foreground text-sm">
                  ← Back
                </button>
                {previewTemplate.name}
              </span>
            ) : (
              "Select Template"
            )}
          </DialogTitle>
        </DialogHeader>

        {!previewTemplate ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search templates..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" autoFocus />
            </div>

            {loading ? (
              <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
            ) : filtered.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">
                {templates.length === 0 ? "No templates created yet. Create one in Master Libraries → Meals." : "No matching templates."}
              </p>
            ) : (
              <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
                {filtered.map(template => (
                  <button
                    key={template.id}
                    onClick={() => loadPreview(template)}
                    className="w-full flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 hover:bg-secondary/50 transition-colors text-left"
                  >
                    {template.is_favorite && <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{template.name}</p>
                      <div className="flex gap-1 mt-0.5">
                        {template.category && <Badge variant="outline" className="text-[9px] px-1 py-0">{template.category}</Badge>}
                        {template.target_calories && <Badge variant="secondary" className="text-[9px] px-1 py-0">{template.target_calories} cal</Badge>}
                        {template.target_protein && <Badge variant="secondary" className="text-[9px] px-1 py-0">{template.target_protein}P</Badge>}
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {loadingPreview ? (
              <div className="space-y-2">{[1,2].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
            ) : previewDays.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">This template is empty.</p>
            ) : (
              <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                {previewDays.map(day => {
                  const totals = getDayTotals(day.id);
                  return (
                    <div key={day.id} className="rounded-lg border border-border px-3 py-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-foreground">{day.day_type}</span>
                        <span className="text-[10px] text-muted-foreground">{totals.calories}cal · {totals.protein}P</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <Button onClick={handleAssign} disabled={importing || previewDays.length === 0} className="w-full">
              {importing && <Loader2 className="animate-spin mr-2 h-4 w-4" />}
              Load Template into Builder
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AssignTemplateModal;
