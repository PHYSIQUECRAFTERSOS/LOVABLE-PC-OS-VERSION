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

/**
 * 3-tier food search pipeline used by ALL search components.
 * Tier 1: Local food_items via search_foods RPC (<200ms)
 * Tier 2: Open Food Facts API direct call (5s timeout)
 * Results from OFF are persisted to food_items for future local hits.
 */
export async function searchFoods(query: string, limit = 25): Promise<FoodResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  // Launch both tiers in parallel
  const [localResults, offResults] = await Promise.all([
    searchLocal(q, limit),
    searchOFF(q),
  ]);

  // If local has 5+ strong results, prefer them but still merge OFF
  const merged = mergeAndDedup(localResults, offResults, q);
  return merged.slice(0, limit);
}

/** Search local only (for "my foods" tab etc.) */
export async function searchLocalOnly(query: string, limit = 25): Promise<FoodResult[]> {
  return searchLocal(query.trim(), limit);
}

// ── Tier 1: Local DB via RPC ──────────────────────────────────
async function searchLocal(q: string, limit: number): Promise<FoodResult[]> {
  try {
    const { data, error } = await supabase.rpc("search_foods", {
      search_query: q,
      result_limit: limit,
    });

    if (error) {
      console.error("[FoodSearch] RPC error, falling back to ilike:", error.message);
      // Fallback to basic ilike
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
    console.error("[FoodSearch] Tier 1 failed:", err);
    return [];
  }
}

// ── Tier 2: Open Food Facts direct API call ───────────────────
async function searchOFF(q: string): Promise<FoodResult[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(
      `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=20&sort_by=unique_scans_n`,
      {
        signal: controller.signal,
        headers: { "User-Agent": "PhysiqueCraftersOS/1.0" },
      }
    );
    clearTimeout(timeout);

    if (!response.ok) return [];

    const data = await response.json();
    const products = (data.products || []) as any[];

    const results: FoodResult[] = products
      .filter((p: any) => p.product_name && p.product_name.trim() !== "")
      .map((p: any, i: number) => {
        const n = p.nutriments ?? {};
        return {
          id: `off-${i}-${p.code || p.product_name}`,
          name: p.product_name_en || p.product_name,
          brand: p.brands || null,
          calories: Math.round(n["energy-kcal_100g"] || n["energy-kcal"] || 0),
          protein: Math.round((n.proteins_100g || 0) * 10) / 10,
          carbs: Math.round((n.carbohydrates_100g || 0) * 10) / 10,
          fat: Math.round((n.fat_100g || 0) * 10) / 10,
          fiber: Math.round((n.fiber_100g || 0) * 10) / 10,
          sugar: Math.round((n.sugars_100g || 0) * 10) / 10,
          sodium: Math.round((n.sodium_100g || 0) * 1000),
          serving_size: parseServingGrams(p.serving_size) ?? 100,
          serving_unit: "g",
          serving_label: p.serving_size || null,
          category: p.categories_tags?.[0]?.replace("en:", "") ?? null,
          data_source: "open_food_facts",
          is_verified: false,
          barcode: p.code || null,
          source: "off" as const,
        };
      })
      .filter((f: FoodResult) => f.calories > 0 || f.protein > 0 || f.carbs > 0 || f.fat > 0);

    // Persist to food_items in background (non-blocking)
    if (results.length > 0) {
      persistToFoodItems(results).catch(() => {});
    }

    return results;
  } catch (err: any) {
    if (err.name === "AbortError") {
      console.warn("[FoodSearch] OFF timed out after 5s");
    } else {
      console.error("[FoodSearch] OFF failed:", err);
    }
    return [];
  }
}

// ── Merge local + OFF, deduplicate, re-rank ───────────────────
function mergeAndDedup(local: FoodResult[], off: FoodResult[], query: string): FoodResult[] {
  const q = query.toLowerCase();
  const tokens = q.split(" ").filter(Boolean);

  // Build a set of local names for dedup
  const localKeys = new Set(
    local.map(f => `${f.name.toLowerCase()}|${(f.brand ?? "").toLowerCase()}`)
  );

  // Only add OFF results that aren't already in local
  const uniqueOff = off.filter(f => {
    const key = `${f.name.toLowerCase()}|${(f.brand ?? "").toLowerCase()}`;
    return !localKeys.has(key);
  });

  const all = [...local, ...uniqueOff];

  // Re-score everything client-side
  return all
    .map(f => ({
      ...f,
      relevance_score: f.source === "local" && f.relevance_score
        ? f.relevance_score
        : scoreFood(f, q, tokens),
    }))
    .sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0));
}

function scoreFood(food: FoodResult, query: string, tokens: string[]): number {
  const name = food.name.toLowerCase();
  const brand = (food.brand ?? "").toLowerCase();

  if (brand === query) return 100;
  if (brand.includes(query)) return 90;
  if (tokens.length > 1 && brand.includes(tokens[0])) return 75;
  if (name.includes(query)) return 70;
  if (tokens.every(t => name.includes(t))) return 60;
  if (tokens.some(t => name.includes(t))) return 45;
  if (tokens.some(t => brand.includes(t))) return 40;
  return 10;
}

// ── Persist OFF results to food_items for future local hits ───
async function persistToFoodItems(foods: FoodResult[]): Promise<void> {
  const rows = foods
    .filter(f => f.name && f.name !== "Unknown")
    .map(f => ({
      name: f.name,
      brand: f.brand,
      calories: f.calories,
      protein: f.protein,
      carbs: f.carbs,
      fat: f.fat,
      fiber: f.fiber,
      sugar: f.sugar,
      sodium: f.sodium,
      serving_size: f.serving_size,
      serving_unit: f.serving_unit,
      serving_label: f.serving_label,
      category: f.category ?? null,
      data_source: "open_food_facts",
      barcode: f.barcode ?? null,
      is_verified: false,
    }));

  if (rows.length === 0) return;

  // Insert one by one to skip duplicates without failing
  for (const row of rows) {
    await supabase
      .from("food_items")
      .upsert(row, { onConflict: "id", ignoreDuplicates: true })
      .then(({ error }) => {
        // Ignore duplicate/conflict errors silently
        if (error && !error.message.includes("duplicate")) {
          console.warn("[FoodSearch] Persist warning:", error.message);
        }
      });
  }
}

function parseServingGrams(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const paren = raw.match(/\((\d+(?:\.\d+)?)\s*g\)/i);
  if (paren) return parseFloat(paren[1]);
  const plain = raw.match(/^(\d+(?:\.\d+)?)\s*g$/i);
  if (plain) return parseFloat(plain[1]);
  const ml = raw.match(/^(\d+(?:\.\d+)?)\s*ml$/i);
  if (ml) return parseFloat(ml[1]);
  return null;
}
