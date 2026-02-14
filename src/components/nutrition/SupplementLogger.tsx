import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pill, Trash2, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { MICRONUTRIENTS } from "@/lib/micronutrients";

const SupplementLogger = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [supplements, setSupplements] = useState<any[]>([]);
  const [todayLogs, setTodayLogs] = useState<any[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);

  // Add form state
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [servingUnit, setServingUnit] = useState("capsule");
  const [nutrients, setNutrients] = useState<Record<string, string>>({});

  const today = format(new Date(), "yyyy-MM-dd");

  const load = async () => {
    if (!user) return;
    setLoading(true);

    const [{ data: supps }, { data: logs }] = await Promise.all([
      supabase.from("supplements").select("*").eq("client_id", user.id).eq("is_active", true),
      supabase.from("supplement_logs").select("*, supplements(*)").eq("client_id", user.id).eq("logged_at", today),
    ]);

    setSupplements(supps || []);
    setTodayLogs(logs || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  const handleAddSupplement = async () => {
    if (!user || !name.trim()) return;
    const suppData: any = {
      client_id: user.id,
      name: name.trim(),
      brand: brand.trim() || null,
      serving_unit: servingUnit,
    };

    // Add nutrient values
    MICRONUTRIENTS.forEach((n) => {
      const val = parseFloat(nutrients[n.key] || "0");
      if (val > 0) suppData[n.key] = val;
    });

    const { error } = await supabase.from("supplements").insert(suppData);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Supplement added" });
      setShowAdd(false);
      setName(""); setBrand(""); setNutrients({});
      load();
    }
  };

  const logSupplement = async (supplementId: string) => {
    if (!user) return;
    const { error } = await supabase.from("supplement_logs").insert({
      client_id: user.id,
      supplement_id: supplementId,
      servings: 1,
      logged_at: today,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Supplement logged" });
      load();
    }
  };

  const isLoggedToday = (supplementId: string) =>
    todayLogs.some((l) => l.supplement_id === supplementId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Pill className="h-4 w-4 text-purple-400" />
          Supplements
        </h3>
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm"><Plus className="h-3.5 w-3.5 mr-1" />Add</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Add Supplement</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
                <div><Label>Brand</Label><Input value={brand} onChange={(e) => setBrand(e.target.value)} /></div>
              </div>
              <div>
                <Label>Serving Unit</Label>
                <Select value={servingUnit} onValueChange={setServingUnit}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["capsule", "tablet", "scoop", "ml", "drop", "serving"].map((u) => (
                      <SelectItem key={u} value={u} className="capitalize">{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Nutrient content per serving (fill what applies)</Label>
                <div className="grid grid-cols-2 gap-2 mt-2 max-h-60 overflow-y-auto">
                  {MICRONUTRIENTS.map((n) => (
                    <div key={n.key} className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0"
                        value={nutrients[n.key] || ""}
                        onChange={(e) => setNutrients((p) => ({ ...p, [n.key]: e.target.value }))}
                        className="h-8 text-xs"
                      />
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap w-24 truncate" title={n.label}>
                        {n.label} ({n.unit})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <Button onClick={handleAddSupplement} disabled={!name.trim()} className="w-full">
                Save Supplement
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {supplements.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">No supplements added yet</p>
      ) : (
        <div className="grid gap-2">
          {supplements.map((s) => {
            const logged = isLoggedToday(s.id);
            return (
              <div key={s.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{s.name}</p>
                  {s.brand && <p className="text-[10px] text-muted-foreground">{s.brand}</p>}
                </div>
                <Button
                  size="sm"
                  variant={logged ? "ghost" : "outline"}
                  onClick={() => !logged && logSupplement(s.id)}
                  disabled={logged}
                  className={logged ? "text-green-400" : ""}
                >
                  <Check className="h-3.5 w-3.5 mr-1" />
                  {logged ? "Taken" : "Log"}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SupplementLogger;
