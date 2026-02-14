import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Search, Database, Loader2, Plus, Star } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface USDAFood {
  fdcId: number;
  description: string;
  brandOwner?: string;
  brandName?: string;
  dataType: string;
  servingSize: number;
  servingSizeUnit: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
  [key: string]: any;
}

interface USDAFoodSearchProps {
  onImport: (food: any) => void;
}

const USDAFoodSearch = ({ onImport }: USDAFoodSearchProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<USDAFood[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState<number | null>(null);

  const handleSearch = async () => {
    if (query.length < 2) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("usda-food-search", {
        body: { action: "search", query, pageSize: 20 },
      });
      if (error) throw error;
      setResults(data?.foods || []);
    } catch (err: any) {
      toast({ title: "Search failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async (food: USDAFood) => {
    if (!user) return;
    setImporting(food.fdcId);

    try {
      // Get detailed nutrient data
      const { data: detail, error } = await supabase.functions.invoke("usda-food-search", {
        body: { action: "detail", fdcId: food.fdcId },
      });
      if (error) throw error;

      const foodItem = {
        name: detail.description || food.description,
        brand: detail.brandOwner || food.brandOwner || null,
        serving_size: detail.servingSize || 100,
        serving_unit: detail.servingSizeUnit || "g",
        calories: detail.calories || 0,
        protein: detail.protein || 0,
        carbs: detail.carbs || 0,
        fat: detail.fat || 0,
        fiber: detail.fiber || 0,
        sugar: detail.total_sugars || 0,
        sodium: detail.sodium || 0,
        net_carbs: detail.net_carbs || 0,
        saturated_fat: detail.saturated_fat || 0,
        monounsaturated_fat: detail.monounsaturated_fat || 0,
        polyunsaturated_fat: detail.polyunsaturated_fat || 0,
        trans_fat: detail.trans_fat || 0,
        omega_3: detail.omega_3 || 0,
        omega_6: detail.omega_6 || 0,
        cholesterol: detail.cholesterol || 0,
        added_sugars: detail.added_sugars || 0,
        vitamin_a_mcg: detail.vitamin_a_mcg || 0,
        vitamin_c_mg: detail.vitamin_c_mg || 0,
        vitamin_d_mcg: detail.vitamin_d_mcg || 0,
        vitamin_e_mg: detail.vitamin_e_mg || 0,
        vitamin_k_mcg: detail.vitamin_k_mcg || 0,
        vitamin_b1_mg: detail.vitamin_b1_mg || 0,
        vitamin_b2_mg: detail.vitamin_b2_mg || 0,
        vitamin_b3_mg: detail.vitamin_b3_mg || 0,
        vitamin_b5_mg: detail.vitamin_b5_mg || 0,
        vitamin_b6_mg: detail.vitamin_b6_mg || 0,
        vitamin_b7_mcg: detail.vitamin_b7_mcg || 0,
        vitamin_b9_mcg: detail.vitamin_b9_mcg || 0,
        vitamin_b12_mcg: detail.vitamin_b12_mcg || 0,
        calcium_mg: detail.calcium_mg || 0,
        iron_mg: detail.iron_mg || 0,
        magnesium_mg: detail.magnesium_mg || 0,
        phosphorus_mg: detail.phosphorus_mg || 0,
        potassium_mg: detail.potassium_mg || 0,
        zinc_mg: detail.zinc_mg || 0,
        copper_mg: detail.copper_mg || 0,
        manganese_mg: detail.manganese_mg || 0,
        selenium_mcg: detail.selenium_mcg || 0,
        chromium_mcg: detail.chromium_mcg || 0,
        molybdenum_mcg: detail.molybdenum_mcg || 0,
        iodine_mcg: detail.iodine_mcg || 0,
        usda_fdc_id: String(food.fdcId),
        data_source: "usda",
        created_by: user.id,
        is_verified: true,
      };

      // Insert into food_items
      const { data: inserted, error: insertErr } = await supabase
        .from("food_items")
        .insert(foodItem)
        .select()
        .single();

      if (insertErr) throw insertErr;

      toast({ title: "Food imported from USDA!" });
      onImport(inserted);
      setOpen(false);
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setImporting(null);
    }
  };

  const getSourceBadge = (dataType: string) => {
    if (dataType === "Branded") return <Badge variant="outline" className="text-[10px]">Branded</Badge>;
    if (dataType === "Foundation") return <Badge className="bg-green-500/20 text-green-400 text-[10px]">Foundation</Badge>;
    return <Badge className="bg-blue-500/20 text-blue-400 text-[10px]">SR Legacy</Badge>;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Database className="h-3.5 w-3.5" />
          USDA Search
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            USDA FoodData Central
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search USDA database..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="pl-9"
              />
            </div>
            <Button onClick={handleSearch} disabled={loading || query.length < 2}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
            </Button>
          </div>

          {results.length > 0 && (
            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {results.map((food) => (
                <div
                  key={food.fdcId}
                  className="rounded-lg border border-border p-3 hover:bg-secondary/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{food.description}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {food.brandOwner && (
                          <span className="text-[10px] text-muted-foreground">{food.brandOwner}</span>
                        )}
                        {getSourceBadge(food.dataType)}
                      </div>
                      <div className="flex gap-3 mt-1.5 text-[10px] text-muted-foreground">
                        <span>{Math.round(food.calories || 0)} cal</span>
                        <span>{Math.round(food.protein || 0)}g P</span>
                        <span>{Math.round(food.carbs || 0)}g C</span>
                        <span>{Math.round(food.fat || 0)}g F</span>
                        <span className="text-muted-foreground/60">per {food.servingSize}{food.servingSizeUnit}</span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleImport(food)}
                      disabled={importing === food.fdcId}
                      className="shrink-0"
                    >
                      {importing === food.fdcId ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Plus className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {results.length === 0 && !loading && query.length >= 2 && (
            <p className="text-center text-sm text-muted-foreground py-8">
              No results found. Try a different search term.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default USDAFoodSearch;
