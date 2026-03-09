import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, ChefHat } from "lucide-react";
import PCRecipeEditor from "./PCRecipeEditor";

const PCRecipeLibrary = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [recipes, setRecipes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showEditor, setShowEditor] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<any>(null);
  const [ingredientCounts, setIngredientCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchRecipes();
  }, [user]);

  const fetchRecipes = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("pc_recipes" as any)
      .select("*")
      .order("created_at", { ascending: false });
    const list = (data as any[]) || [];
    setRecipes(list);

    // Get ingredient counts
    if (list.length > 0) {
      const ids = list.map((r: any) => r.id);
      const { data: ings } = await supabase
        .from("pc_recipe_ingredients" as any)
        .select("recipe_id")
        .in("recipe_id", ids);
      const counts: Record<string, number> = {};
      (ings as any[] || []).forEach((i: any) => {
        counts[i.recipe_id] = (counts[i.recipe_id] || 0) + 1;
      });
      setIngredientCounts(counts);
    }
    setLoading(false);
  };

  const togglePublished = async (recipe: any) => {
    const newVal = !recipe.is_published;
    // Optimistic update
    setRecipes(prev => prev.map(r => r.id === recipe.id ? { ...r, is_published: newVal } : r));
    const { error } = await supabase.from("pc_recipes" as any).update({ is_published: newVal }).eq("id", recipe.id);
    if (error) {
      setRecipes(prev => prev.map(r => r.id === recipe.id ? { ...r, is_published: !newVal } : r));
      toast({ title: "Update failed." });
    }
  };

  const filtered = recipes.filter(r =>
    !search || r.name.toLowerCase().includes(search.toLowerCase())
  );

  // Calculate total calories from ingredients
  const getRecipeCalories = (recipe: any) => {
    // We'll show what we have - the totals are from ingredients
    return recipe.servings || 1;
  };

  if (showEditor) {
    return (
      <PCRecipeEditor
        editRecipe={editingRecipe}
        onClose={() => { setShowEditor(false); setEditingRecipe(null); }}
        onSaved={() => { setShowEditor(false); setEditingRecipe(null); fetchRecipes(); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">PC Recipes</h2>
        <Button size="sm" onClick={() => { setEditingRecipe(null); setShowEditor(true); }}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Create Recipe
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search recipes..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ChefHat className="h-12 w-12 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No PC Recipes yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Create your first recipe for clients.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((recipe: any) => (
            <div
              key={recipe.id}
              className="flex items-center justify-between rounded-xl bg-card border border-border/50 px-4 py-3 hover:bg-secondary/50 transition-colors cursor-pointer"
              onClick={() => { setEditingRecipe(recipe); setShowEditor(true); }}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground truncate">{recipe.name}</div>
                <div className="text-xs text-muted-foreground">
                  {ingredientCounts[recipe.id] || 0} ingredients · {recipe.servings} serving{recipe.servings !== 1 ? "s" : ""}
                </div>
              </div>
              <div className="flex items-center gap-3 ml-3" onClick={e => e.stopPropagation()}>
                <Badge variant={recipe.is_published ? "default" : "outline"} className="text-[10px]">
                  {recipe.is_published ? "Published" : "Draft"}
                </Badge>
                <Switch
                  checked={recipe.is_published}
                  onCheckedChange={() => togglePublished(recipe)}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PCRecipeLibrary;
