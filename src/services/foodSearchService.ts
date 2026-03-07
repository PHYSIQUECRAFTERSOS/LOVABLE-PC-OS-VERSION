/**
 * Unified Food Search Service — Edge Function proxy architecture.
 *
 * All searches route through the server-side `search-foods` edge function
 * which queries USDA + Open Food Facts + local DB in parallel.
 * The browser NEVER calls external food APIs directly (no CORS issues).
 */

import { supabase } from "@/integrations/supabase/client";

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

  console.log(`[FoodSearch] Searching via edge function for: "${q}"`);

  try {
    // Route ALL searches through the server-side edge function proxy
    // This avoids CORS issues from direct browser calls to OFF/USDA
    const { data, error } = await supabase.functions.invoke("search-foods", {
      body: { query: q, limit },
    });

    if (error) throw error;

    const foods = (data?.foods ?? []).map((f: any): FoodResult => ({
      id: f.id ?? crypto.randomUUID(),
      name: f.name,
      brand: f.brand ?? null,
      calories: Math.round((f.calories_per_100g ?? 0) * (f.serving_size_g ?? 100) / 100),
      protein: Math.round((f.protein_per_100g ?? 0) * (f.serving_size_g ?? 100) / 100),
      carbs: Math.round((f.carbs_per_100g ?? 0) * (f.serving_size_g ?? 100) / 100),
      fat: Math.round((f.fat_per_100g ?? 0) * (f.serving_size_g ?? 100) / 100),
      fiber: Math.round((f.fiber_per_100g ?? 0) * (f.serving_size_g ?? 100) / 100),
      sugar: Math.round((f.sugar_per_100g ?? 0) * (f.serving_size_g ?? 100) / 100),
      sodium: Math.round((f.sodium_per_100g ?? 0) * (f.serving_size_g ?? 100) / 100),
      serving_size: f.serving_size_g ?? 100,
      serving_unit: f.serving_unit ?? "g",
      serving_label: f.serving_description ?? null,
      category: null,
      data_source: f.source ?? "open_food_facts",
      is_verified: f.is_verified ?? false,
      barcode: f.barcode ?? null,
      source: f.source === "open_food_facts" ? "off" : "local",
    }));

    return rankResults(foods, q).slice(0, limit);
  } catch (err) {
    console.error("[FoodSearch] Edge function search failed:", err);
    return [];
  }
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

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(fallback);
      });
  });
}


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
