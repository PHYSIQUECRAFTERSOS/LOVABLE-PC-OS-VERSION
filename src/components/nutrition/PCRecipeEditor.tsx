import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, X, Search, Loader2, GripVertical, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface StagedIngredient {
  food_item_id?: string;
  food_name: string;
  quantity: number;
  serving_unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  // Base values at original serving size for accurate scaling
  base_quantity: number;
  base_calories: number;
  base_protein: number;
  base_carbs: number;
  base_fat: number;
}

interface StagedInstruction {
  step_number: number;
  instruction_text: string;
}

function extractYouTubeId(url: string): string | null {
  if (!url.trim()) return null;
  const patterns = [
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/,
    /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]+)/,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]+)/,
  ];
  for (const p of patterns) {
    const match = url.match(p);
    if (match) return match[1];
  }
  return null;
}

function normalizeYouTubeUrl(url: string): string | null {
  if (!url.trim()) return null;
  const id = extractYouTubeId(url);
  return id ? `https://www.youtube.com/watch?v=${id}` : null;
}

function isValidYouTubeUrl(url: string): boolean {
  if (!url.trim()) return true;
  return extractYouTubeId(url) !== null;
}

interface PCRecipeEditorProps {
  editRecipe?: any;
  onClose: () => void;
  onSaved: () => void;
}

const PCRecipeEditor = ({ editRecipe, onClose, onSaved }: PCRecipeEditorProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState(editRecipe?.name || "");
  const [description, setDescription] = useState(editRecipe?.description || "");
  const [servings, setServings] = useState(editRecipe?.servings || 1);
  const [youtubeUrl, setYoutubeUrl] = useState(editRecipe?.youtube_url || "");
  const [youtubeError, setYoutubeError] = useState("");
  const [isPublished, setIsPublished] = useState(editRecipe?.is_published ?? true);
  const [ingredients, setIngredients] = useState<StagedIngredient[]>([]);
  const [instructions, setInstructions] = useState<StagedInstruction[]>([]);
  const [saving, setSaving] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showFoodSearch, setShowFoodSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (editRecipe) loadExisting();
  }, [editRecipe]);

  const loadExisting = async () => {
    const [{ data: ings }, { data: insts }] = await Promise.all([
      supabase.from("pc_recipe_ingredients" as any).select("*").eq("recipe_id", editRecipe.id).order("sort_order"),
      supabase.from("pc_recipe_instructions" as any).select("*").eq("recipe_id", editRecipe.id).order("step_number"),
    ]);
    setIngredients((ings as any[] || []).map((i: any) => {
      const qty = i.quantity || 1;
      return {
        food_item_id: i.food_item_id,
        food_name: i.food_name,
        quantity: qty,
        serving_unit: i.serving_unit,
        calories: i.calories,
        protein: i.protein,
        carbs: i.carbs,
        fat: i.fat,
        base_quantity: qty,
        base_calories: i.calories || 0,
        base_protein: i.protein || 0,
        base_carbs: i.carbs || 0,
        base_fat: i.fat || 0,
      };
    }));
    setInstructions((insts as any[] || []).map((i: any) => ({
      step_number: i.step_number,
      instruction_text: i.instruction_text,
    })));
  };

  const searchFoods = async (q: string) => {
    setSearchQuery(q);
    if (q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const { data, error } = await supabase.rpc("search_foods", { search_query: q, result_limit: 15 });
    if (!error && data) {
      setSearchResults(data);
    } else {
      const { data: fallback } = await supabase
        .from("food_items")
        .select("id, name, brand, serving_size, serving_unit, calories, protein, carbs, fat")
        .ilike("name", `%${q}%`)
        .limit(10);
      setSearchResults(fallback || []);
    }
    setSearching(false);
  };

  const addIngredient = (food: any) => {
    const qty = food.serving_size || 100;
    const cal = food.calories || 0;
    const pro = food.protein || 0;
    const car = food.carbs || 0;
    const f = food.fat || 0;
    setIngredients(prev => [...prev, {
      food_item_id: food.id,
      food_name: food.name,
      quantity: qty,
      serving_unit: food.serving_unit || "g",
      calories: cal,
      protein: pro,
      carbs: car,
      fat: f,
      base_quantity: qty,
      base_calories: cal,
      base_protein: pro,
      base_carbs: car,
      base_fat: f,
    }]);
    setShowFoodSearch(false);
    setSearchQuery("");
    setSearchResults([]);
  };

  const addStep = () => {
    setInstructions(prev => [...prev, {
      step_number: prev.length + 1,
      instruction_text: "",
    }]);
  };

  const totals = ingredients.reduce((acc, i) => ({
    calories: acc.calories + i.calories,
    protein: acc.protein + i.protein,
    carbs: acc.carbs + i.carbs,
    fat: acc.fat + i.fat,
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  const save = async () => {
    if (!user || !name.trim()) return;

    // Validate YouTube URL
    if (youtubeUrl.trim()) {
      if (!isValidYouTubeUrl(youtubeUrl)) {
        setYoutubeError("Please enter a valid YouTube URL (e.g. https://youtu.be/abc123)");
        return;
      }
    }
    setYoutubeError("");

    setSaving(true);
    const normalized = youtubeUrl.trim() ? normalizeYouTubeUrl(youtubeUrl) : null;

    try {
      let recipeId: string;

      if (editRecipe) {
        const { error } = await supabase.from("pc_recipes" as any).update({
          name: name.trim(),
          description: description.trim() || null,
          servings,
          youtube_url: normalized,
          is_published: isPublished,
          updated_at: new Date().toISOString(),
        }).eq("id", editRecipe.id);
        if (error) throw error;
        recipeId = editRecipe.id;

        // Delete old ingredients and instructions
        await Promise.all([
          supabase.from("pc_recipe_ingredients" as any).delete().eq("recipe_id", recipeId),
          supabase.from("pc_recipe_instructions" as any).delete().eq("recipe_id", recipeId),
        ]);
      } else {
        const { data, error } = await supabase.from("pc_recipes" as any).insert({
          created_by: user.id,
          name: name.trim(),
          description: description.trim() || null,
          servings,
          youtube_url: normalized,
          is_published: isPublished,
        }).select().single();
        if (error) throw error;
        recipeId = (data as any).id;
      }

      // Insert ingredients
      if (ingredients.length > 0) {
        await supabase.from("pc_recipe_ingredients" as any).insert(
          ingredients.map((ing, i) => ({
            recipe_id: recipeId,
            food_item_id: ing.food_item_id || null,
            food_name: ing.food_name,
            quantity: ing.quantity,
            serving_unit: ing.serving_unit,
            calories: Math.round(ing.calories),
            protein: Math.round(ing.protein),
            carbs: Math.round(ing.carbs),
            fat: Math.round(ing.fat),
            sort_order: i,
          }))
        );
      }

      // Insert instructions
      const validInstructions = instructions.filter(s => s.instruction_text.trim());
      if (validInstructions.length > 0) {
        await supabase.from("pc_recipe_instructions" as any).insert(
          validInstructions.map((inst, i) => ({
            recipe_id: recipeId,
            step_number: i + 1,
            instruction_text: inst.instruction_text.trim(),
          }))
        );
      }

      toast({ title: editRecipe ? "Recipe updated!" : "Recipe created!" });
      onSaved();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const deleteRecipe = async () => {
    if (!editRecipe) return;
    const { error } = await supabase.from("pc_recipes" as any).delete().eq("id", editRecipe.id);
    if (error) {
      toast({ title: "Couldn't delete recipe." });
    } else {
      toast({ title: "Recipe deleted" });
      onSaved();
    }
  };

  if (showFoodSearch) {
    return (
      <div className="fixed inset-0 z-[60] bg-background flex flex-col animate-fade-in">
        <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-border">
          <button onClick={() => setShowFoodSearch(false)} className="p-1.5 rounded-lg hover:bg-secondary">
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </button>
          <h1 className="text-base font-semibold text-foreground">Add Ingredient</h1>
        </div>
        <div className="px-4 pt-3 pb-2">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search foods..."
              value={searchQuery}
              onChange={e => searchFoods(e.target.value)}
              className="pl-10 h-11 rounded-xl bg-secondary border-0"
              autoFocus
            />
            {searching && <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4">
          {searchResults.map((food: any) => (
            <button
              key={food.id}
              onClick={() => addIngredient(food)}
              className="w-full text-left rounded-xl bg-card border border-border/50 px-4 py-3 mb-1.5 hover:bg-secondary transition-colors"
            >
              <div className="text-sm font-medium text-foreground truncate">{food.name}</div>
              <div className="text-xs text-muted-foreground">
                {food.calories} cal · {food.protein}P · {food.carbs}C · {food.fat}F
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[55] bg-background flex flex-col animate-fade-in">
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-border">
        <button onClick={() => {
          if (name.trim() || ingredients.length > 0) setShowDiscard(true);
          else onClose();
        }} className="p-1.5 rounded-lg hover:bg-secondary">
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <h1 className="flex-1 text-base font-semibold text-foreground">
          {editRecipe ? "Edit Recipe" : "Create Recipe"}
        </h1>
        {editRecipe && (
          <button onClick={() => setShowDelete(true)} className="p-1.5 rounded-lg hover:bg-destructive/10">
            <Trash2 className="h-4 w-4 text-destructive" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-24 space-y-4 pt-4">
        <div>
          <Label>Recipe Name *</Label>
          <Input placeholder="e.g. High Protein Oats" value={name} onChange={e => setName(e.target.value)} className="mt-1" />
        </div>

        <div>
          <Label>Description</Label>
          <Textarea placeholder="Brief description..." value={description} onChange={e => setDescription(e.target.value)} className="mt-1 h-20" />
        </div>

        <div>
          <Label>Servings *</Label>
          <Input type="number" min={1} value={servings} onChange={e => setServings(parseInt(e.target.value) || 1)} className="mt-1 w-24" />
        </div>

        {/* Macro Preview */}
        <div className="rounded-xl bg-card border border-border/50 p-3">
          <div className="grid grid-cols-4 gap-3 text-center text-xs">
            <div><div className="font-bold text-foreground">{Math.round(totals.calories)}</div>Cal</div>
            <div><div className="font-bold text-red-400">{Math.round(totals.protein)}g</div>Protein</div>
            <div><div className="font-bold text-blue-400">{Math.round(totals.carbs)}g</div>Carbs</div>
            <div><div className="font-bold text-yellow-400">{Math.round(totals.fat)}g</div>Fat</div>
          </div>
        </div>

        {/* Ingredients */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>Ingredients</Label>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowFoodSearch(true)}>
              <Plus className="h-3 w-3 mr-1" /> Add Ingredient
            </Button>
          </div>
          {ingredients.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-4">No ingredients added yet.</p>
          ) : (
            <div className="space-y-1.5">
              {ingredients.map((ing, i) => (
                <div key={i} className="flex items-center gap-2 rounded-xl bg-card border border-border/50 px-3 py-2">
                  <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{ing.food_name}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Input
                        type="number"
                        value={ing.quantity}
                        onChange={e => {
                          const newQ = parseFloat(e.target.value) || 0;
                          setIngredients(prev => prev.map((item, j) => {
                            if (j !== i) return item;
                            const scale = item.base_quantity > 0 ? newQ / item.base_quantity : 0;
                            return {
                              ...item,
                              quantity: newQ,
                              calories: Math.round(item.base_calories * scale * 100) / 100,
                              protein: Math.round(item.base_protein * scale * 100) / 100,
                              carbs: Math.round(item.base_carbs * scale * 100) / 100,
                              fat: Math.round(item.base_fat * scale * 100) / 100,
                            };
                          }));
                        }}
                        className="h-6 w-16 text-xs bg-secondary border-0 text-center"
                      />
                      <span className="text-xs text-muted-foreground">{ing.serving_unit}</span>
                      <span className="text-xs text-muted-foreground">· {Math.round(ing.calories)} cal</span>
                    </div>
                  </div>
                  <button onClick={() => setIngredients(prev => prev.filter((_, j) => j !== i))} className="p-1 hover:bg-destructive/10 rounded">
                    <X className="h-3.5 w-3.5 text-destructive" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Instructions */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>Instructions (optional)</Label>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addStep}>
              <Plus className="h-3 w-3 mr-1" /> Add Step
            </Button>
          </div>
          {instructions.length > 0 && (
            <div className="space-y-1.5">
              {instructions.map((inst, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="h-6 w-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold shrink-0 mt-1">
                    {i + 1}
                  </div>
                  <Textarea
                    value={inst.instruction_text}
                    onChange={e => setInstructions(prev => prev.map((s, j) => j === i ? { ...s, instruction_text: e.target.value } : s))}
                    placeholder={`Step ${i + 1}...`}
                    className="h-16 text-sm"
                  />
                  <button onClick={() => setInstructions(prev => prev.filter((_, j) => j !== i))} className="p-1 hover:bg-destructive/10 rounded mt-1">
                    <X className="h-3.5 w-3.5 text-destructive" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* YouTube URL */}
        <div>
          <Label>Recipe Video URL (YouTube — optional)</Label>
          <Input
            placeholder="https://youtu.be/... or youtube.com/shorts/..."
            value={youtubeUrl}
            onChange={e => { setYoutubeUrl(e.target.value); setYoutubeError(""); }}
            className="mt-1"
          />
          <p className="text-xs text-muted-foreground mt-1">Supports regular videos, Shorts, and share links.</p>
          {youtubeError && <p className="text-xs text-destructive mt-1">{youtubeError}</p>}
          {youtubeUrl.trim() && isValidYouTubeUrl(youtubeUrl) && extractYouTubeId(youtubeUrl) && (
            <div className="mt-2 rounded-xl overflow-hidden border border-border/50 aspect-video">
              <iframe
                src={`https://www.youtube.com/embed/${extractYouTubeId(youtubeUrl)}?playsinline=1&rel=0&modestbranding=1`}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                loading="lazy"
                title="Recipe video preview"
              />
            </div>
          )}
        </div>

        {/* Published Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <Label>Visible to clients</Label>
            <p className="text-xs text-muted-foreground">When off, recipe won't appear in client tab.</p>
          </div>
          <Switch checked={isPublished} onCheckedChange={setIsPublished} />
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t border-border">
        <Button
          onClick={save}
          disabled={saving || !name.trim()}
          className="w-full h-[52px] text-base font-semibold bg-primary text-primary-foreground rounded-xl"
        >
          {saving ? "Saving..." : editRecipe ? "Update Recipe" : "Save Recipe"}
        </Button>
      </div>

      <AlertDialog open={showDiscard} onOpenChange={setShowDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>Your unsaved changes will be lost.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction onClick={onClose}>Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete '{name}'?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteRecipe} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PCRecipeEditor;
