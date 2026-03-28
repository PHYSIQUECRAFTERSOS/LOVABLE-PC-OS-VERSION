import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Plus, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const TIMING_OPTIONS = [
  { value: "fasted", label: "Fasted (Morning)" },
  { value: "meal_1", label: "With Meal 1" },
  { value: "meal_2", label: "With Meal 2" },
  { value: "pre_workout", label: "Pre-Workout" },
  { value: "post_workout", label: "Post-Workout" },
  { value: "before_bed", label: "Before Bed" },
  { value: "with_meal", label: "With Highest Carb Meal" },
  { value: "any_time", label: "Any Time" },
];

interface ImportSupplementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planId: string;
  existingSupplementIds: string[];
  onImported: () => void;
}

interface SelectedSupplement {
  id: string;
  timing: string;
  dosage: string;
  dosageUnit: string;
}

const ImportSupplementDialog = ({ open, onOpenChange, planId, existingSupplementIds, onImported }: ImportSupplementDialogProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [masterSupps, setMasterSupps] = useState<any[]>([]);
  const [selected, setSelected] = useState<Map<string, SelectedSupplement>>(new Map());

  useEffect(() => {
    if (!open || !user?.id) return;
    const fetchSupps = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("master_supplements")
        .select("*")
        .eq("coach_id", user.id)
        .eq("is_active", true)
        .order("name");
      setMasterSupps(data || []);
      setLoading(false);
    };
    fetchSupps();
    setSelected(new Map());
    setSearch("");
  }, [open, user?.id]);

  const filtered = masterSupps.filter(s => {
    if (existingSupplementIds.includes(s.id)) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return s.name?.toLowerCase().includes(q) || s.brand?.toLowerCase().includes(q);
  });

  const toggleSelect = (supp: any) => {
    const next = new Map(selected);
    if (next.has(supp.id)) {
      next.delete(supp.id);
    } else {
      next.set(supp.id, {
        id: supp.id,
        timing: "any_time",
        dosage: supp.default_dosage || "",
        dosageUnit: supp.default_dosage_unit || "",
      });
    }
    setSelected(next);
  };

  const updateSelected = (id: string, field: keyof SelectedSupplement, value: string) => {
    const next = new Map(selected);
    const item = next.get(id);
    if (item) {
      next.set(id, { ...item, [field]: value });
      setSelected(next);
    }
  };

  const handleImport = async () => {
    if (selected.size === 0) return;
    setSaving(true);

    const maxSort = await supabase
      .from("supplement_plan_items")
      .select("sort_order")
      .eq("plan_id", planId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    
    let nextSort = (maxSort.data?.sort_order ?? 0) + 1;

    const rows = Array.from(selected.values()).map(s => ({
      plan_id: planId,
      master_supplement_id: s.id,
      timing_slot: s.timing,
      dosage: s.dosage || null,
      dosage_unit: s.dosageUnit || null,
      sort_order: nextSort++,
    }));

    const { error } = await supabase.from("supplement_plan_items").insert(rows);
    setSaving(false);

    if (error) {
      toast({ title: "Error importing", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `${rows.length} supplement${rows.length > 1 ? "s" : ""} added ✓` });
      onImported();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">Import from Master Library</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search supplements..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-1 min-h-0 -mx-1 px-1">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)
          ) : filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">
              {search ? "No matching supplements" : "All supplements already added"}
            </p>
          ) : (
            filtered.map(supp => {
              const isSelected = selected.has(supp.id);
              const sel = selected.get(supp.id);
              return (
                <div key={supp.id} className={`rounded-lg border p-2.5 transition-colors ${isSelected ? "border-primary bg-primary/5" : "border-border"}`}>
                  <div className="flex items-center gap-2 cursor-pointer" onClick={() => toggleSelect(supp)}>
                    <Checkbox checked={isSelected} className="shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{supp.name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {supp.brand && <span>{supp.brand}</span>}
                        {supp.default_dosage && <span>• {supp.default_dosage} {supp.default_dosage_unit}</span>}
                      </div>
                    </div>
                  </div>
                  {isSelected && sel && (
                    <div className="mt-2 pt-2 border-t border-border/50 grid grid-cols-3 gap-2">
                      <Select value={sel.timing} onValueChange={v => updateSelected(supp.id, "timing", v)}>
                        <SelectTrigger className="h-7 text-xs col-span-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TIMING_OPTIONS.map(t => (
                            <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        placeholder="Dosage"
                        value={sel.dosage}
                        onChange={e => updateSelected(supp.id, "dosage", e.target.value)}
                        className="h-7 text-xs col-span-1"
                      />
                      <Input
                        placeholder="Unit"
                        value={sel.dosageUnit}
                        onChange={e => updateSelected(supp.id, "dosageUnit", e.target.value)}
                        className="h-7 text-xs col-span-1"
                      />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border">
          <Button variant="outline" size="sm" className="text-xs" onClick={() => window.open("/libraries", "_self")}>
            <ExternalLink className="h-3 w-3 mr-1" /> Open Libraries
          </Button>
          <Button size="sm" className="text-xs" disabled={selected.size === 0 || saving} onClick={handleImport}>
            <Plus className="h-3 w-3 mr-1" /> Add {selected.size > 0 ? `(${selected.size})` : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ImportSupplementDialog;
