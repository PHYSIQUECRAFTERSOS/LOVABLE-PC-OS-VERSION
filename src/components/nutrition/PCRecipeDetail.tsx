import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Minus, Plus } from "lucide-react";

interface PCRecipeDetailProps {
  recipe: any;
  mealType: string;
  mealLabel: string;
  logDate: string;
  onBack: () => void;
  onLogged: () => void;
}

const PCRecipeDetail = ({ recipe, mealType, mealLabel, logDate, onBack, onLogged }: PCRecipeDetailProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [ingredients, setIngredients] = useState<any[]>([]);
  const [instructions, setInstructions] = useState<any[]>([]);
  const [servingsSelected, setServingsSelected] = useState(1);
  const [loading, setLoading] = useState(true);
  const [logging, setLogging] = useState(false);

  useEffect(() => {
    fetchDetails();
  }, [recipe.id]);

  const fetchDetails = async () => {
    setLoading(true);
    const [{ data: ings }, { data: insts }] = await Promise.all([
      supabase.from("pc_recipe_ingredients" as any).select("*").eq("recipe_id", recipe.id).order("sort_order"),
      supabase.from("pc_recipe_instructions" as any).select("*").eq("recipe_id", recipe.id).order("step_number"),
    ]);
    setIngredients((ings as any[]) || []);
    setInstructions((insts as any[]) || []);
    setLoading(false);
  };

  const S = servingsSelected;

  const totals = ingredients.reduce((acc, ing) => ({
    calories: acc.calories + (ing.calories || 0) * S,
    protein: acc.protein + (ing.protein || 0) * S,
    carbs: acc.carbs + (ing.carbs || 0) * S,
    fat: acc.fat + (ing.fat || 0) * S,
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  const addToLog = async () => {
    if (!user || ingredients.length === 0) return;
    setLogging(true);

    const entries = ingredients.map(ing => ({
      client_id: user.id,
      food_item_id: ing.food_item_id || null,
      custom_name: ing.food_item_id ? null : `🍳 ${ing.food_name}`,
      meal_type: mealType,
      servings: Math.round(ing.quantity * S * 100) / 100,
      calories: Math.round((ing.calories || 0) * S),
      protein: Math.round((ing.protein || 0) * S),
      carbs: Math.round((ing.carbs || 0) * S),
      fat: Math.round((ing.fat || 0) * S),
      logged_at: logDate,
      tz_corrected: true,
    }));

    const { error } = await supabase.from("nutrition_logs").insert(entries);
    if (error) {
      console.error("[PCRecipeDetail] Log error:", error);
      toast({ title: "Couldn't log recipe." });
    } else {
      toast({ title: `${recipe.name} added to ${mealLabel}` });
      onLogged();
    }
    setLogging(false);
  };

  return (
    <div className="fixed inset-0 z-[70] bg-background flex flex-col animate-fade-in">
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-border">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-secondary">
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <h1 className="flex-1 text-base font-semibold text-foreground truncate">{recipe.name}</h1>
      </div>

      {/* Servings Adjuster */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => setServingsSelected(Math.max(1, S - 1))}
            className="h-9 w-9 rounded-full border border-border flex items-center justify-center hover:bg-secondary transition-colors"
          >
            <Minus className="h-4 w-4" />
          </button>
          <div className="text-center">
            <div className="text-2xl font-bold text-foreground">{S}</div>
            <div className="text-xs text-muted-foreground">Servings</div>
          </div>
          <button
            onClick={() => setServingsSelected(Math.min(20, S + 1))}
            className="h-9 w-9 rounded-full border border-border flex items-center justify-center hover:bg-secondary transition-colors"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Macro Summary */}
      <div className="px-4 py-3 border-b border-border">
        <div className="grid grid-cols-4 gap-3 text-center">
          <div>
            <div className="text-lg font-bold text-foreground">{Math.round(totals.calories)}</div>
            <div className="text-[10px] text-muted-foreground uppercase">Calories</div>
          </div>
          <div>
            <div className="text-lg font-bold text-red-400">{Math.round(totals.protein)}g</div>
            <div className="text-[10px] text-muted-foreground uppercase">Protein</div>
          </div>
          <div>
            <div className="text-lg font-bold text-blue-400">{Math.round(totals.carbs)}g</div>
            <div className="text-[10px] text-muted-foreground uppercase">Carbs</div>
          </div>
          <div>
            <div className="text-lg font-bold text-yellow-400">{Math.round(totals.fat)}g</div>
            <div className="text-[10px] text-muted-foreground uppercase">Fat</div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-32">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Ingredients */}
            <div className="py-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Ingredients</h2>
              <div className="space-y-1.5">
                {ingredients.map((ing: any) => (
                  <div key={ing.id} className="rounded-xl bg-card border border-border/50 px-4 py-3">
                    <div className="text-sm font-medium text-foreground">{ing.food_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {Math.round(ing.quantity * S * 10) / 10} {ing.serving_unit} · {Math.round((ing.calories || 0) * S)} cal
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {Math.round((ing.protein || 0) * S)}P · {Math.round((ing.carbs || 0) * S)}C · {Math.round((ing.fat || 0) * S)}F
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Instructions */}
            {instructions.length > 0 && (
              <div className="py-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Instructions</h2>
                <div className="space-y-2">
                  {instructions.map((inst: any) => (
                    <div key={inst.id} className="flex gap-3">
                      <div className="h-6 w-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                        {inst.step_number}
                      </div>
                      <p className="text-sm text-foreground">{inst.instruction_text}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* YouTube Video Preview */}
            {recipe.youtube_url && recipe.youtube_url.trim() !== "" && (() => {
              const ytMatch = recipe.youtube_url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]+)/);
              const videoId = ytMatch ? ytMatch[1] : null;
              if (!videoId) return null;
              return (
                <div className="py-3">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Watch Recipe</h2>
                  <div className="rounded-xl overflow-hidden border border-border/50 aspect-video">
                    <iframe
                      src={`https://www.youtube.com/embed/${videoId}?playsinline=1&rel=0&modestbranding=1`}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      loading="lazy"
                      title="Recipe video"
                    />
                  </div>
                </div>
              );
            })()}

            {recipe.description && (
              <div className="py-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Description</h2>
                <p className="text-sm text-muted-foreground">{recipe.description}</p>
              </div>
            )}
          </>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-background border-t border-border z-[60]">
        <Button
          onClick={addToLog}
          disabled={logging || ingredients.length === 0}
          className="w-full h-[52px] text-base font-semibold bg-primary text-primary-foreground rounded-xl"
        >
          {logging ? "Adding..." : `Add to ${mealLabel}`}
        </Button>
      </div>
    </div>
  );
};

export default PCRecipeDetail;
