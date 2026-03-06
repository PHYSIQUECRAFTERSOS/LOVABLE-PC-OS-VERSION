/**
 * Unified Food Search Service — OFF-first architecture.
 *
 * Every search calls Open Food Facts API in parallel with local DB.
 * Results are merged, ranked, and cached.
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

  // ALWAYS call OFF API + local DB in parallel — never skip OFF
  console.log(`[OFF API] Searching for: "${q}" via OpenFoodFacts`);

  const [localResults, offResults, cachedResults] = await Promise.all([
    searchLocal(q, 15),
    searchOFF(q).then(items => items.map(offToFoodResult)).catch(err => {
      console.warn("[FoodSearch] OFF API failed, using cache/local:", err);
      return [] as FoodResult[];
    }),
    getCachedResults(cacheKey),
  ]);

  // Use OFF results if available, otherwise fall back to cache
  const externalResults = offResults.length > 0 ? offResults : cachedResults;

  // Cache fresh OFF results in background
  if (offResults.length > 0) {
    cacheResults(cacheKey, offResults).catch(console.warn);
  }

  return rankAndMerge(localResults, externalResults, q).slice(0, limit);
}

/** Search local food_items only (for "my foods" tab) */
export async function searchLocalOnly(query: string, limit = 25): Promise<FoodResult[]> {
  return searchLocal(query.trim(), limit);
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

// ── Local DB search (secondary source) ────────────────────────────────────

async function searchLocal(q: string, limit: number): Promise<FoodResult[]> {
  try {
    const { data, error } = await supabase.rpc("search_foods", {
      search_query: q,
      result_limit: limit,
    });

    if (error) {
      console.warn("[FoodSearch] RPC error, trying ilike fallback:", error.message);
      const { data: fallback } = await supabase
        .from("food_items")
        .select("id, name, brand, calories, protein, carbs, fat, fiber, sugar, sodium, serving_size, serving_unit, serving_label, category, data_source, is_verified, barcode")
        .or(`name.ilike.%${q}%,brand.ilike.%${q}%`)
        .order("is_verified", { ascending: false })
        .limit(limit);
      return ((fallback || []) as any[]).map(f => ({ ...f, source: "local" as const }));
    }

    return ((data || []) as any[]).map(f => ({ ...f, source: "local" as const }));
  } catch (err) {
    console.error("[FoodSearch] Local search failed:", err);
    return [];
  }
}

// ── Merge + rank ──────────────────────────────────────────────────────────

function rankAndMerge(local: FoodResult[], external: FoodResult[], query: string): FoodResult[] {
  const q = query.toLowerCase();
  const tokens = q.split(" ").filter(Boolean);

  const seen = new Set<string>();
  const all: FoodResult[] = [];

  // Local foods first (they have priority in dedup)
  for (const f of local) {
    const key = `${f.name.toLowerCase()}|${(f.brand ?? "").toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      all.push(f);
    }
  }

  for (const f of external) {
    const key = `${f.name.toLowerCase()}|${(f.brand ?? "").toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      all.push(f);
    }
  }

  return all
    .map(f => ({
      ...f,
      relevance_score: scoreFood(f, q, tokens),
    }))
    .sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0));
}

function scoreFood(food: FoodResult, query: string, tokens: string[]): number {
  const name = food.name.toLowerCase();
  const brand = (food.brand ?? "").toLowerCase();
  const localBoost = food.source === "local" ? 5 : 0;

  if (brand === query) return 100 + localBoost;
  if (brand.includes(query)) return 90 + localBoost;
  if (tokens.length > 1 && tokens.every(t => brand.includes(t))) return 85 + localBoost;
  if (tokens[0] && brand.includes(tokens[0])) return 75 + localBoost;
  if (name === query) return 70 + localBoost;
  if (name.startsWith(query)) return 65 + localBoost;
  if (name.includes(query)) return 60 + localBoost;
  if (tokens.every(t => name.includes(t))) return 55 + localBoost;
  if (tokens.some(t => name.includes(t))) return 40 + localBoost;
  if (tokens.some(t => brand.includes(t))) return 35 + localBoost;
  return 10 + localBoost;
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
