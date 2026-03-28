import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ShoppingCart, RefreshCw, RotateCcw, Loader2, Trash2, Pencil, Check, X } from "lucide-react";
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

const CoachGroceryList = ({ clientId }: { clientId: string }) => {
  const queryClient = useQueryClient();
  const [generating, setGenerating] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

  const { data: groceryList, isLoading } = useQuery({
    queryKey: ["grocery-list", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grocery_lists")
        .select("*")
        .eq("client_id", clientId)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as { id: string; items: GroceryItem[]; generated_at: string; updated_at: string } | null;
    },
    enabled: !!clientId,
  });

  const items: GroceryItem[] = (groceryList?.items as any) || [];

  const updateItems = async (updated: GroceryItem[]) => {
    if (!groceryList) return;
    queryClient.setQueryData(["grocery-list", clientId], { ...groceryList, items: updated });
    const { error } = await supabase
      .from("grocery_lists")
      .update({ items: updated as any, updated_at: new Date().toISOString() })
      .eq("id", groceryList.id);
    if (error) {
      queryClient.invalidateQueries({ queryKey: ["grocery-list", clientId] });
      toast.error("Failed to save");
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-grocery-list", {
        body: { client_id: clientId },
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["grocery-list", clientId] });
      toast.success("Grocery list generated!");
    } catch (e: any) {
      toast.error(e.message || "Failed to generate grocery list");
    } finally {
      setGenerating(false);
    }
  };

  const handleToggle = (index: number) => {
    const updated = [...items];
    updated[index] = { ...updated[index], checked: !updated[index].checked };
    updateItems(updated);
  };

  const handleDelete = (index: number) => {
    const updated = items.filter((_, i) => i !== index);
    updateItems(updated);
    toast.success("Item removed");
  };

  const handleStartEdit = (index: number) => {
    setEditingIndex(index);
    setEditValue(items[index].name);
  };

  const handleSaveEdit = () => {
    if (editingIndex === null || !editValue.trim()) return;
    const updated = [...items];
    updated[editingIndex] = { ...updated[editingIndex], name: editValue.trim() };
    updateItems(updated);
    setEditingIndex(null);
    setEditValue("");
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditValue("");
  };

  const handleResetAll = async () => {
    const updated = items.map((i) => ({ ...i, checked: false }));
    updateItems(updated);
    toast.success("List reset");
  };

  const checkedCount = items.filter((i) => i.checked).length;

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
        <CardContent className="py-8 text-center text-sm text-muted-foreground">Loading grocery list...</CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShoppingCart className="h-5 w-5 text-primary" />
            Client Grocery List
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
              Tap "Generate" to create a grocery list from this client's meal plan.
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
                    <div
                      key={item.originalIndex}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                        item.checked
                          ? "bg-muted/20 line-through text-muted-foreground"
                          : "bg-muted/40 hover:bg-muted/60"
                      }`}
                    >
                      <Checkbox
                        checked={item.checked}
                        onCheckedChange={() => handleToggle(item.originalIndex)}
                      />
                      {editingIndex === item.originalIndex ? (
                        <div className="flex-1 flex items-center gap-1">
                          <Input
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveEdit();
                              if (e.key === "Escape") handleCancelEdit();
                            }}
                            className="h-7 text-sm"
                            autoFocus
                          />
                          <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={handleSaveEdit}>
                            <Check className="h-3 w-3 text-green-400" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={handleCancelEdit}>
                            <X className="h-3 w-3 text-muted-foreground" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <span className="text-sm flex-1">{item.name}</span>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 hover:opacity-100"
                            style={{ opacity: undefined }}
                            onClick={() => handleStartEdit(item.originalIndex)}
                          >
                            <Pencil className="h-3 w-3 text-muted-foreground" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 shrink-0 text-destructive"
                            onClick={() => handleDelete(item.originalIndex)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                    </div>
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

export default CoachGroceryList;
