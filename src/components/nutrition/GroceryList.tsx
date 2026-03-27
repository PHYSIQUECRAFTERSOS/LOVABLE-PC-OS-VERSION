import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, RefreshCw, RotateCcw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface GroceryItem {
  category: string;
  name: string;
  checked: boolean;
}

const CATEGORY_ORDER = ["Protein", "Carbs", "Fats", "Vegetables", "Fruits"];
const CATEGORY_COLORS: Record<string, string> = {
  Protein: "bg-red-500/20 text-red-400",
  Carbs: "bg-amber-500/20 text-amber-400",
  Fats: "bg-yellow-500/20 text-yellow-400",
  Vegetables: "bg-green-500/20 text-green-400",
  Fruits: "bg-purple-500/20 text-purple-400",
};

const GroceryList = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [generating, setGenerating] = useState(false);

  const { data: groceryList, isLoading } = useQuery({
    queryKey: ["grocery-list", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grocery_lists")
        .select("*")
        .eq("client_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; items: GroceryItem[]; generated_at: string; updated_at: string } | null;
    },
    enabled: !!user,
  });

  const items: GroceryItem[] = (groceryList?.items as any) || [];

  const handleGenerate = async () => {
    if (!user) return;
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-grocery-list", {
        body: { client_id: user.id },
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["grocery-list"] });
      toast.success("Grocery list generated!");
    } catch (e: any) {
      toast.error(e.message || "Failed to generate grocery list");
    } finally {
      setGenerating(false);
    }
  };

  const handleToggle = async (index: number) => {
    if (!groceryList) return;
    const updated = [...items];
    updated[index] = { ...updated[index], checked: !updated[index].checked };
    // Optimistic update
    queryClient.setQueryData(["grocery-list", user?.id], { ...groceryList, items: updated });
    const { error } = await supabase
      .from("grocery_lists")
      .update({ items: updated as any, updated_at: new Date().toISOString() })
      .eq("id", groceryList.id);
    if (error) {
      queryClient.invalidateQueries({ queryKey: ["grocery-list"] });
      toast.error("Failed to save");
    }
  };

  const handleResetAll = async () => {
    if (!groceryList) return;
    const updated = items.map((i) => ({ ...i, checked: false }));
    queryClient.setQueryData(["grocery-list", user?.id], { ...groceryList, items: updated });
    const { error } = await supabase
      .from("grocery_lists")
      .update({ items: updated as any, updated_at: new Date().toISOString() })
      .eq("id", groceryList.id);
    if (error) {
      queryClient.invalidateQueries({ queryKey: ["grocery-list"] });
      toast.error("Failed to reset");
    } else {
      toast.success("List reset");
    }
  };

  const checkedCount = items.filter((i) => i.checked).length;

  // Group items by category
  const grouped = CATEGORY_ORDER.reduce((acc, cat) => {
    const catItems = items
      .map((item, idx) => ({ ...item, originalIndex: idx }))
      .filter((item) => item.category === cat);
    if (catItems.length > 0) acc[cat] = catItems;
    return acc;
  }, {} as Record<string, (GroceryItem & { originalIndex: number })[]>);

  if (isLoading) {
    return (
      <Card className="border-border/50">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">Loading...</CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShoppingCart className="h-5 w-5 text-primary" />
            Grocery List
          </CardTitle>
          <div className="flex items-center gap-2">
            {items.length > 0 && (
              <Button size="sm" variant="ghost" onClick={handleResetAll} className="h-8 text-xs">
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                Reset
              </Button>
            )}
            <Button size="sm" onClick={handleGenerate} disabled={generating} className="h-8 text-xs">
              {generating ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
              )}
              {items.length > 0 ? "Regenerate" : "Generate"}
            </Button>
          </div>
        </div>
        {groceryList?.generated_at && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Generated {format(new Date(groceryList.generated_at), "MMM d, h:mm a")}</span>
            {items.length > 0 && (
              <Badge variant="outline" className="text-xs">
                {checkedCount}/{items.length} checked
              </Badge>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="text-center py-6">
            <ShoppingCart className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">
              Tap "Generate" to create a grocery list from your meal plan.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(grouped).map(([category, catItems]) => (
              <div key={category}>
                <div className="flex items-center gap-2 mb-2">
                  <Badge className={`text-xs ${CATEGORY_COLORS[category] || ""}`}>
                    {category}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {catItems.filter((i) => i.checked).length}/{catItems.length}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {catItems.map((item) => (
                    <label
                      key={item.originalIndex}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                        item.checked
                          ? "bg-muted/20 line-through text-muted-foreground"
                          : "bg-muted/40 hover:bg-muted/60"
                      }`}
                    >
                      <Checkbox
                        checked={item.checked}
                        onCheckedChange={() => handleToggle(item.originalIndex)}
                      />
                      <span className="text-sm">{item.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default GroceryList;
