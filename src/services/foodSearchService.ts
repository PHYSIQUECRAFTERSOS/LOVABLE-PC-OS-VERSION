/**
 * Unified Food Search Service — OFF-only architecture.
 *
 * Every search calls Open Food Facts API as the sole source.
 * Results are cached in Supabase for repeat queries.
 * Local food_items table is NEVER used for search results.
 *
 * Used by BOTH coach template builder AND client food logging.
 */

import { supabase } from "@/integrations/supabase/client";
import { searchOFF, type OFFFood } from "./openFoodFacts";

export interface FoodResult {
  id: string;
  name: string;
  brand: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
  serving_size: number;
  serving_unit: string;
  serving_label?: string | null;
  category?: string | null;
  data_source?: string;
  is_verified?: boolean;
  barcode?: string | null;
  relevance_score?: number;
  source?: "local" | "off";
}

export async function searchFoods(query: string, limit = 50): Promise<FoodResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const cacheKey = q.toLowerCase();
  console.log(`[FoodSearch] Searching for: "${q}"`);

  const offPromise = withTimeout(
    searchOFF(q)
      .then((items) => {
        console.log(`[FoodSearch] OFF API returned ${items.length} items`);
        return items.map(offToFoodResult);
      })
      .catch((err) => {
        console.warn("[FoodSearch] OFF API failed:", err);
        return [] as FoodResult[];
      }),
    4500,
    [] as FoodResult[]
  );

  const cachedResults = await withTimeout(getCachedResults(cacheKey), 350, [] as FoodResult[]);
  if (cachedResults.length > 0) {
    void offPromise.then((fresh) => {
      if (fresh.length > 0) {
        cacheResults(cacheKey, fresh).catch(console.warn);
      }
    });

    console.log(`[FoodSearch] Returning ${cachedResults.length} cached results instantly`);
    return rankResults(cachedResults, q).slice(0, limit);
  }

  const offResults = await offPromise;
  if (offResults.length > 0) {
    void cacheResults(cacheKey, offResults).catch(console.warn);
  }

  return rankResults(offResults, q).slice(0, limit);
}

/** Search local food_items only (for "my foods" tab) */
export async function searchLocalOnly(query: string, limit = 25): Promise<FoodResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  try {
    const { data } = await supabase
      .from("food_items")
      .select("id, name, brand, calories, protein, carbs, fat, fiber, sugar, sodium, serving_size, serving_unit, serving_label, category, data_source, is_verified, barcode")
      .or(`name.ilike.%${q}%,brand.ilike.%${q}%`)
      .order("is_verified", { ascending: false })
      .limit(limit);
    return ((data || []) as any[]).map(f => ({ ...f, source: "local" as const }));
  } catch {
    return [];
  }
}

// ── Cache layer ───────────────────────────────────────────────────────────

async function getCachedResults(queryKey: string): Promise<FoodResult[]> {
  try {
    const { data } = await supabase
      .from("food_search_cache")
      .select("results")
      .eq("query_key", queryKey)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    return (data?.results as unknown as FoodResult[]) ?? [];
  } catch {
    return [];
  }
}

async function cacheResults(queryKey: string, results: FoodResult[]): Promise<void> {
  await supabase
    .from("food_search_cache")
    .upsert({
      query_key: queryKey,
      results: results as any,
      result_count: results.length,
      cached_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }, { onConflict: "query_key" })
    .then(({ error }) => {
      if (error) console.warn("[FoodSearch] Cache write warning:", error.message);
    });
}

// ── Rank results ──────────────────────────────────────────────────────────

function rankResults(results: FoodResult[], query: string): FoodResult[] {
  const q = query.toLowerCase();
  const tokens = q.split(" ").filter(Boolean);

  return results
    .map(f => ({
      ...f,
      relevance_score: scoreFood(f, q, tokens),
    }))
    .sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0));
}

function scoreFood(food: FoodResult, query: string, tokens: string[]): number {
  const name = food.name.toLowerCase();
  const brand = (food.brand ?? "").toLowerCase();

  if (brand === query) return 100;
  if (brand.includes(query)) return 90;
  if (tokens.length > 1 && tokens.every(t => brand.includes(t))) return 85;
  if (tokens[0] && brand.includes(tokens[0])) return 75;
  if (name === query) return 70;
  if (name.startsWith(query)) return 65;
  if (name.includes(query)) return 60;
  if (tokens.every(t => name.includes(t))) return 55;
  if (tokens.some(t => name.includes(t))) return 40;
  if (tokens.some(t => brand.includes(t))) return 35;
  return 10;
}

// ── OFF → FoodResult mapper ──────────────────────────────────────────────

function offToFoodResult(off: OFFFood): FoodResult {
  return {
    id: off.id,
    name: off.name,
    brand: off.brand,
    calories: off.calories ?? 0,
    protein: off.protein ?? 0,
    carbs: off.carbs ?? 0,
    fat: off.fat ?? 0,
    fiber: off.fiber ?? 0,
    sugar: off.sugar ?? 0,
    sodium: off.sodium ?? 0,
    serving_size: off.serving_size,
    serving_unit: off.serving_unit,
    serving_label: off.serving_label,
    category: off.category,
    data_source: "open_food_facts",
    is_verified: false,
    barcode: off.barcode,
    source: "off",
  };
}
