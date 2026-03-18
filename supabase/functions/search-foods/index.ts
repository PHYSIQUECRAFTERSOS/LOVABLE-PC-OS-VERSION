import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Brand aliases ──────────────────────────────────────────────────────
const BRAND_ALIASES: Record<string, string[]> = {
  costco: ["kirkland", "kirkland signature"],
  kirkland: ["costco"], "kirkland signature": ["costco"],
  trader: ["trader joe's", "trader joes"],
  "trader joe's": ["trader"], "trader joes": ["trader"],
  walmart: ["great value"], "great value": ["walmart"],
  target: ["good & gather", "market pantry"],
  "good & gather": ["target"], "market pantry": ["target"],
  quest: [], "optimum nutrition": [], fairlife: [], fage: [], chobani: [],
  "premier protein": [], rxbar: [], clif: [], kind: [], "nature valley": [],
  "dave's killer bread": [], grenade: [], "muscle milk": [], "built bar": [],
  lenny: ["lenny & larry's", "lenny and larry's"], "lenny & larry's": ["lenny"],
  barebells: [], "think!": [], oikos: [], "siggi's": [], siggi: ["siggi's"],
};

function expandBrandAliases(tokens: string[]): string[] {
  const extra: string[] = [];
  const joined = tokens.join(" ");
  for (const [key, aliases] of Object.entries(BRAND_ALIASES)) {
    if (joined.includes(key)) {
      for (const alias of aliases) extra.push(alias);
    }
  }
  return extra;
}

const BRAND_KEYWORDS = new Set(Object.keys(BRAND_ALIASES));
const MULTI_WORD_BRANDS = Object.keys(BRAND_ALIASES).filter(k => k.includes(" "));

function classifyTokens(tokens: string[]): { brandTokens: string[]; foodTokens: string[] } {
  const brandTokens: string[] = [];
  const foodTokens: string[] = [];
  const joined = tokens.join(" ");
  const consumedIndices = new Set<number>();
  for (const mb of MULTI_WORD_BRANDS) {
    if (joined.includes(mb)) {
      const mbTokens = mb.split(/\s+/);
      for (let i = 0; i <= tokens.length - mbTokens.length; i++) {
        if (mbTokens.every((t, j) => tokens[i + j] === t)) {
          for (let j = 0; j < mbTokens.length; j++) consumedIndices.add(i + j);
          brandTokens.push(mb);
        }
      }
    }
  }
  for (let i = 0; i < tokens.length; i++) {
    if (consumedIndices.has(i)) continue;
    if (BRAND_KEYWORDS.has(tokens[i])) brandTokens.push(tokens[i]);
    else foodTokens.push(tokens[i]);
  }
  return { brandTokens, foodTokens };
}

// ── Scoring ────────────────────────────────────────────────────────────
function brandRelevanceScore(food: any, query: string, tokens: string[], aliases: string[], synonymTerms: string[] = []): number {
  const nameLower = (food.name ?? "").toLowerCase();
  const brandLower = (food.brand ?? "").toLowerCase();
  let score = 0;
  const { brandTokens, foodTokens } = classifyTokens(tokens);
  const hasBrandIntent = brandTokens.length > 0;
  const hasFoodIntent = foodTokens.length > 0;
  const brandMatchesDirect = hasBrandIntent && brandTokens.some(bt => brandLower.includes(bt));
  const brandMatchesAlias = !brandMatchesDirect && aliases.length > 0 && aliases.some(a => brandLower.includes(a));
  const brandMatched = brandMatchesDirect || brandMatchesAlias;
  const foodTokensInName = hasFoodIntent ? foodTokens.filter(t => nameLower.includes(t)).length : 0;
  const allFoodTokensInName = hasFoodIntent && foodTokensInName === foodTokens.length;
  const foodPhrase = foodTokens.join(" ");

  if (hasBrandIntent && hasFoodIntent) {
    if (brandMatchesDirect && allFoodTokensInName) { score += 200; if (foodPhrase && nameLower.includes(foodPhrase)) score += 40; }
    else if (brandMatchesAlias && allFoodTokensInName) { score += 180; if (foodPhrase && nameLower.includes(foodPhrase)) score += 30; }
    else if (brandMatched && foodTokensInName > 0 && !allFoodTokensInName) score += 100 + foodTokensInName * 20;
    else if (!brandMatched && allFoodTokensInName) { score += 80; if (foodPhrase && nameLower.includes(foodPhrase)) score += 20; }
    else if (brandMatched && foodTokensInName === 0) score += 10;
    else if (!brandMatched && foodTokensInName > 0) score += 40 + foodTokensInName * 10;
    else score += 5;
  } else if (hasBrandIntent && !hasFoodIntent) {
    if (brandLower === query) score += 120;
    else if (brandMatchesDirect) score += 100;
    else if (brandMatchesAlias) score += 90;
    if (nameLower.includes(query)) score += 30;
  } else {
    if (nameLower === query) score += 120;
    else if (nameLower.includes(query)) score += 100;
    else if (allFoodTokensInName) score += 80;
    else if (foodTokensInName > 0) score += 40 + foodTokensInName * 10;
    if (brandLower && brandLower.includes(query)) score += 50;
    const brandTokenHits = tokens.filter(t => brandLower.includes(t)).length;
    if (brandTokenHits > 0) score += brandTokenHits * 10;
  }

  if (synonymTerms.length > 0) {
    if (synonymTerms.some(syn => nameLower.includes(syn) || brandLower.includes(syn))) score += 15;
  }

  if (food.source === "usda") score += 15;
  if (food.source === "fatsecret") score += 12;
  if (food.is_branded || brandLower) score += 10;
  if (food.has_complete_macros !== false) score += 5;
  score += Math.min(food.popularity_score ?? 0, 20);
  if (hasBrandIntent && !brandLower) score -= 30;

  return score;
}

// ── USDA parsing ───────────────────────────────────────────────────────
function parseUsdaServings(item: any) {
  const measures = item.foodMeasures ?? [];
  const servingSize = item.servingSize ?? 100;
  const servingUnit = (item.servingSizeUnit ?? "g").toLowerCase();
  let description = `${servingSize}${servingUnit}`;
  let size_g = servingSize;
  const additional: any[] = [];
  if (measures.length > 0) {
    const primary = measures[0];
    description = primary.disseminationText ?? primary.measureUnitName ?? description;
    size_g = primary.gramWeight ?? servingSize;
    measures.slice(1).forEach((m: any) => {
      additional.push({ description: m.disseminationText ?? m.measureUnitName, size_g: m.gramWeight ?? 100 });
    });
  }
  if (!additional.find((a: any) => a.description === "100g")) additional.push({ description: "100g", size_g: 100 });
  return { description, size_g, unit: servingUnit, additional };
}

function mapUsdaFood(item: any): any | null {
  const nutrients = item.foodNutrients ?? [];
  const get = (name: string) => nutrients.find((n: any) => n.nutrientName === name)?.value ?? null;
  const protein = get("Protein"); const carbs = get("Carbohydrate, by difference"); const fat = get("Total lipid (fat)");
  if ((protein ?? 0) + (carbs ?? 0) + (fat ?? 0) === 0) return null;
  const serving = parseUsdaServings(item);
  return {
    usda_fdc_id: String(item.fdcId), name: item.description?.trim() ?? "Unknown",
    brand: item.brandOwner?.trim() ?? item.brandName?.trim() ?? null,
    calories_per_100g: get("Energy"), protein_per_100g: protein, carbs_per_100g: carbs, fat_per_100g: fat,
    fiber_per_100g: get("Fiber, total dietary"), sugar_per_100g: get("Sugars, total including NLEA"),
    sodium_per_100g: get("Sodium, Na"),
    vitamin_a_mcg_per_100g: get("Vitamin A, RAE"), vitamin_c_mg_per_100g: get("Vitamin C, total ascorbic acid"),
    vitamin_d_mcg_per_100g: get("Vitamin D (D2 + D3)"), vitamin_e_mg_per_100g: get("Vitamin E (alpha-tocopherol)"),
    vitamin_k_mcg_per_100g: get("Vitamin K (phylloquinone)"), vitamin_b1_mg_per_100g: get("Thiamin"),
    vitamin_b2_mg_per_100g: get("Riboflavin"), vitamin_b3_mg_per_100g: get("Niacin"),
    vitamin_b5_mg_per_100g: get("Pantothenic acid"), vitamin_b6_mg_per_100g: get("Vitamin B-6"),
    vitamin_b9_mcg_per_100g: get("Folate, total"), vitamin_b12_mcg_per_100g: get("Vitamin B-12"),
    calcium_mg_per_100g: get("Calcium, Ca"), iron_mg_per_100g: get("Iron, Fe"),
    magnesium_mg_per_100g: get("Magnesium, Mg"), phosphorus_mg_per_100g: get("Phosphorus, P"),
    potassium_mg_per_100g: get("Potassium, K"), zinc_mg_per_100g: get("Zinc, Zn"),
    copper_mg_per_100g: get("Copper, Cu"), manganese_mg_per_100g: get("Manganese, Mn"),
    selenium_mcg_per_100g: get("Selenium, Se"), cholesterol_per_100g: get("Cholesterol"),
    serving_size_g: serving.size_g, serving_unit: serving.unit, serving_description: serving.description,
    household_serving_fulltext: serving.description, additional_serving_sizes: serving.additional,
    image_url: null, barcode: item.gtinUpc ?? null, is_branded: !!(item.brandOwner || item.brandName),
    is_verified: true, is_custom: false, source: "usda", language_code: "en", country_code: "US",
    has_complete_macros: true, data_quality_score: 100, popularity_score: 5,
  };
}

// ── Safe JSON parse helper ─────────────────────────────────────────────
async function safeJson(response: Response): Promise<any> {
  try { return await response.json(); }
  catch { return null; }
}

// ── User food history for boosting ─────────────────────────────────────
interface HistoryEntry { food_id: string; log_count: number; is_favorite: boolean; last_logged_at: string; }

async function getUserFoodHistory(supabase: any, userId: string): Promise<Map<string, HistoryEntry>> {
  try {
    const { data, error } = await supabase
      .from("user_food_history").select("food_id, log_count, is_favorite, last_logged_at")
      .eq("user_id", userId).order("last_logged_at", { ascending: false }).limit(500);
    if (error || !data) return new Map();
    const map = new Map<string, HistoryEntry>();
    data.forEach((row: HistoryEntry) => map.set(row.food_id, row));
    return map;
  } catch { return new Map(); }
}

function applyHistoryBoost(results: any[], historyMap: Map<string, HistoryEntry>): any[] {
  if (historyMap.size === 0) return results;
  return results.map(food => {
    const history = historyMap.get(food.id);
    if (!history) return food;
    const daysSinceLogged = Math.floor((Date.now() - new Date(history.last_logged_at).getTime()) / 86400000);
    const recencyFactor = Math.max(0, 1 - daysSinceLogged / 60);
    const historyBoost = (history.is_favorite ? 15.0 : 0) + Math.min(history.log_count, 20) * 0.5 + recencyFactor * 5.0;
    return { ...food, _relevance: (food._relevance ?? 0) + historyBoost, is_recent: true, is_favorite: history.is_favorite, log_count: history.log_count };
  }).sort((a, b) => (b._relevance ?? 0) - (a._relevance ?? 0));
}

// ── Synonym expansion ──────────────────────────────────────────────────
async function expandWithSynonyms(supabase: any, originalQuery: string): Promise<string[]> {
  try {
    const { data, error } = await supabase.rpc("get_synonyms_for_query", { input_query: originalQuery });
    if (error || !data) return [];
    const origTokens = new Set(originalQuery.toLowerCase().split(/\s+/));
    return (data as string[]).filter(t => !origTokens.has(t));
  } catch { return []; }
}

// ── OpenFoodFacts search ───────────────────────────────────────────────
async function searchOpenFoodFacts(query: string, limit: number): Promise<any[]> {
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=${Math.min(limit, 40)}&sort_by=unique_scans_n&fields=code,product_name,product_name_en,brands,nutriments,serving_size,categories_tags,image_front_small_url,image_url`;

  const resp = await fetch(url, {
    signal: AbortSignal.timeout(5000),
    headers: { "Accept": "application/json" },
  });
  if (!resp.ok) throw new Error(`OFF API error: ${resp.status}`);

  const data = await safeJson(resp);
  if (!data?.products) return [];

  return data.products
    .filter((p: any) => (p.product_name_en || p.product_name))
    .map((p: any) => {
      const n = p.nutriments ?? {};
      const energyKcal = n["energy-kcal_100g"] ?? (n["energy_100g"] != null ? n["energy_100g"] / 4.184 : null);
      const protein = n.proteins_100g ?? null;
      const carbs = n.carbohydrates_100g ?? null;
      const fat = n.fat_100g ?? null;
      if ((protein ?? 0) + (carbs ?? 0) + (fat ?? 0) === 0) return null;

      const rawServing = p.serving_size ?? "";
      const servingG = parseServingGrams(rawServing) ?? 100;
      const rawBrand = p.brands ? p.brands.split(",")[0].trim() : null;

      return {
        off_id: p.code || null,
        name: p.product_name_en || p.product_name,
        brand: rawBrand,
        calories_per_100g: energyKcal != null ? Math.round(energyKcal) : null,
        protein_per_100g: protein != null ? Math.round(protein * 10) / 10 : null,
        carbs_per_100g: carbs != null ? Math.round(carbs * 10) / 10 : null,
        fat_per_100g: fat != null ? Math.round(fat * 10) / 10 : null,
        fiber_per_100g: n.fiber_100g != null ? Math.round(n.fiber_100g * 10) / 10 : null,
        sugar_per_100g: n.sugars_100g != null ? Math.round(n.sugars_100g * 10) / 10 : null,
        sodium_per_100g: n.sodium_100g != null ? Math.round(n.sodium_100g * 1000) : null,
        serving_size_g: servingG,
        serving_unit: "g",
        serving_description: rawServing || `${servingG}g`,
        barcode: p.code || null,
        image_url: p.image_front_small_url || p.image_url || null,
        is_branded: !!rawBrand,
        is_verified: false,
        is_custom: false,
        source: "open_food_facts",
        has_complete_macros: true,
        data_quality_score: 40,
        popularity_score: 3,
      };
    })
    .filter(Boolean);
}

function parseServingGrams(raw: string): number | null {
  if (!raw) return null;
  const paren = raw.match(/\((\d+(?:\.\d+)?)\s*g\)/i);
  if (paren) return parseFloat(paren[1]);
  const plain = raw.match(/^(\d+(?:\.\d+)?)\s*g$/i);
  if (plain) return parseFloat(plain[1]);
  const ml = raw.match(/^(\d+(?:\.\d+)?)\s*ml$/i);
  if (ml) return parseFloat(ml[1]);
  return null;
}

// ── Main handler ───────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { query: q, limit: lim = 25, user_id } = await req.json();
    const query = (q ?? "").trim().toLowerCase();
    const limit = typeof lim === "number" ? lim : 25;
    const userId = user_id ?? null;
    const usdaApiKey = Deno.env.get("USDA_API_KEY") ?? "";

    if (!query || query.length < 2) {
      return new Response(JSON.stringify({ foods: [], bestMatches: [], moreResults: [], source: "empty" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const tokens = query.split(/\s+/).filter(Boolean);
    const aliases = expandBrandAliases(tokens);
    const { brandTokens, foodTokens } = classifyTokens(tokens);
    const hasBrandIntent = brandTokens.length > 0;
    const hasFoodIntent = foodTokens.length > 0;
    const isCompoundQuery = hasBrandIntent && hasFoodIntent;

    const synonymPromise = expandWithSynonyms(supabase, query);
    const historyPromise = userId ? getUserFoodHistory(supabase, userId) : Promise.resolve(new Map<string, HistoryEntry>());

    // ── Step 1: Local cache search ───────────────────────────────────
    const orConditions = tokens.map(t => `name.ilike.%${t}%,brand.ilike.%${t}%`).join(",");
    const aliasConditions = aliases.map(a => `brand.ilike.%${a}%`).join(",");
    const allConditions = aliasConditions ? `${orConditions},${aliasConditions}` : orConditions;

    const { data: localResults } = await supabase
      .from("foods").select("*").or(allConditions)
      .not("calories_per_100g", "is", null)
      .order("data_quality_score", { ascending: false })
      .order("popularity_score", { ascending: false })
      .limit(50);

    let localFoods = (localResults ?? []).filter((f: any) =>
      (f.protein_per_100g ?? 0) + (f.carbs_per_100g ?? 0) + (f.fat_per_100g ?? 0) > 0
    );

    const synonymTerms = await synonymPromise;
    const historyMap = await historyPromise;

    if (synonymTerms.length > 0) {
      const synConditions = synonymTerms.map(s => `name.ilike.%${s}%,brand.ilike.%${s}%`).join(",");
      try {
        const { data: synResults } = await supabase.from("foods").select("*").or(synConditions).not("calories_per_100g", "is", null).limit(20);
        if (synResults) {
          const existingIds = new Set(localFoods.map((f: any) => f.id));
          localFoods = [...localFoods, ...synResults.filter((f: any) => !existingIds.has(f.id))];
        }
      } catch { /* non-fatal */ }
    }

    console.log(`[search-foods] Local cache: ${localFoods.length} results for "${query}"`);

    if (isCompoundQuery && localFoods.length > 0) {
      const filtered = localFoods.filter((f: any) => {
        const n = (f.name ?? "").toLowerCase();
        const b = (f.brand ?? "").toLowerCase();
        return foodTokens.every(ft => n.includes(ft) || b.includes(ft));
      });
      if (filtered.length > 0) localFoods = filtered;
    }

    // Short-circuit only for simple queries with abundant local results
    if (!isCompoundQuery && !hasBrandIntent && localFoods.length >= 8) {
      const scored = localFoods.map((f: any) => ({ ...f, _relevance: brandRelevanceScore(f, query, tokens, aliases, synonymTerms) }));
      scored.sort((a: any, b: any) => b._relevance - a._relevance);
      const boosted = applyHistoryBoost(scored, historyMap);
      const foods = boosted.slice(0, limit);
      logSearchAnalytics(supabase, userId, query, foods.length, "cache", brandTokens[0] ?? null, Math.min(5, foods.length));
      return new Response(JSON.stringify({ foods, bestMatches: foods.slice(0, 5), moreResults: foods.slice(5), source: "cache", wasWidened: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Step 2: External APIs in PARALLEL (OpenFoodFacts + USDA) ────
    const usdaPageSize = hasBrandIntent ? 30 : 20;
    const sourceStatus: Record<string, string> = {};

    const [offResult, usdaResult] = await Promise.allSettled([
      // OpenFoodFacts (free, worldwide database)
      searchOpenFoodFacts(query, 25).then(foods => {
        sourceStatus.off = `ok:${foods.length}`;
        return foods;
      }).catch((e: any) => {
        sourceStatus.off = e.name === "TimeoutError" ? "timeout" : "error";
        console.warn("[search-foods] OpenFoodFacts failed:", e.message || e);
        return [] as any[];
      }),
      // USDA (fallback)
      (async () => {
        if (!usdaApiKey) { sourceStatus.usda = "no_key"; return [] as any[]; }
        const res = await fetch(
          `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}&pageSize=${usdaPageSize}&api_key=${usdaApiKey}`,
          { signal: AbortSignal.timeout(5000) }
        );
        if (!res.ok) { sourceStatus.usda = `http_${res.status}`; return [] as any[]; }
        const data = await safeJson(res);
        if (!data) { sourceStatus.usda = "json_fail"; return [] as any[]; }
        const foods = (data.foods ?? []).map(mapUsdaFood).filter(Boolean);
        sourceStatus.usda = `ok:${foods.length}`;
        return foods;
      })().catch((e: any) => {
        sourceStatus.usda = e.name === "TimeoutError" ? "timeout" : "error";
        console.warn("[search-foods] USDA failed:", e.message || e);
        return [] as any[];
      }),
    ]);

    const offFoods: any[] = offResult.status === "fulfilled" ? offResult.value : [];
    const usdaFoods: any[] = usdaResult.status === "fulfilled" ? usdaResult.value : [];

    console.log(`[search-foods] Sources: ${JSON.stringify(sourceStatus)} | OFF:${offFoods.length} USDA:${usdaFoods.length}`);

    // ── Step 3: Cache results ────────────────────────────────────────
    try {
      if (usdaFoods.length > 0) {
        await supabase.from("foods").upsert(usdaFoods, { onConflict: "usda_fdc_id", ignoreDuplicates: false });
      }
    } catch { /* non-fatal */ }

    // ── Step 4: Merge, score, deduplicate ────────────────────────────
    const existingUsdaIds = new Set(localFoods.map((f: any) => f.usda_fdc_id).filter(Boolean));
    const existingNames = new Set(localFoods.map((f: any) => `${(f.name ?? "").toLowerCase()}::${(f.brand ?? "").toLowerCase()}`));
    const newUsda = usdaFoods.filter((f) => !existingUsdaIds.has(f.usda_fdc_id));
    const newOff = offFoods.filter((f) => !existingNames.has(`${(f.name ?? "").toLowerCase()}::${(f.brand ?? "").toLowerCase()}`));
    const allResultsRaw = [...localFoods, ...newOff, ...newUsda].filter((f) =>
      f.has_complete_macros !== false && ((f.protein_per_100g ?? 0) + (f.carbs_per_100g ?? 0) + (f.fat_per_100g ?? 0)) > 0
    );

    const scored = allResultsRaw.map((f) => ({ ...f, _relevance: brandRelevanceScore(f, query, tokens, aliases, synonymTerms) }));
    scored.sort((a, b) => b._relevance - a._relevance);

    const seen = new Set<string>();
    const deduped = scored.filter((f) => {
      const key = `${f.name?.toLowerCase()}::${f.brand?.toLowerCase() ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    let merged = deduped.slice(0, limit);
    merged = applyHistoryBoost(merged, historyMap);

    // ── Zero-result widening ─────────────────────────────────────────
    let wasWidened = false;
    let usedQuery = query;
    let searchStrategy = "hybrid";

    if (merged.length === 0) {
      if (hasFoodIntent && foodTokens.length > 0) {
        const nameOnly = foodTokens.join(" ");
        const { data: wideResults } = await supabase.from("foods").select("*")
          .or(foodTokens.map(t => `name.ilike.%${t}%`).join(","))
          .not("calories_per_100g", "is", null).order("data_quality_score", { ascending: false }).limit(limit);
        if (wideResults && wideResults.length > 0) {
          merged = wideResults.map((f: any) => ({ ...f, _relevance: brandRelevanceScore(f, nameOnly, foodTokens, [], synonymTerms) }));
          merged.sort((a, b) => (b._relevance ?? 0) - (a._relevance ?? 0));
          merged = applyHistoryBoost(merged, historyMap);
          wasWidened = true; usedQuery = nameOnly; searchStrategy = "name_only";
        }
      }

      if (merged.length === 0 && foodTokens.length > 1) {
        const sortedTokens = [...foodTokens].sort((a, b) => b.length - a.length);
        for (const token of sortedTokens) {
          if (token.length < 3) continue;
          const { data: tokenResults } = await supabase.from("foods").select("*")
            .ilike("name", `%${token}%`).not("calories_per_100g", "is", null)
            .order("data_quality_score", { ascending: false }).limit(limit);
          if (tokenResults && tokenResults.length > 0) {
            merged = tokenResults.map((f: any) => ({ ...f, _relevance: brandRelevanceScore(f, token, [token], [], synonymTerms) }));
            merged.sort((a, b) => (b._relevance ?? 0) - (a._relevance ?? 0));
            merged = applyHistoryBoost(merged, historyMap);
            wasWidened = true; usedQuery = token; searchStrategy = "single_token"; break;
          }
        }
      }

      if (merged.length === 0 && hasBrandIntent) {
        const brandOnly = brandTokens[0];
        const { data: brandResults } = await supabase.from("foods").select("*")
          .ilike("brand", `%${brandOnly}%`).not("calories_per_100g", "is", null)
          .order("data_quality_score", { ascending: false }).limit(limit);
        if (brandResults && brandResults.length > 0) {
          merged = brandResults.map((f: any) => ({ ...f, _relevance: brandRelevanceScore(f, brandOnly, [brandOnly], aliases, synonymTerms) }));
          merged.sort((a, b) => (b._relevance ?? 0) - (a._relevance ?? 0));
          merged = applyHistoryBoost(merged, historyMap);
          wasWidened = true; usedQuery = brandOnly; searchStrategy = "brand_only";
        }
      }
    }

    // ── Step 5: Group ────────────────────────────────────────────────
    const BEST_MATCH_THRESHOLD = isCompoundQuery ? 150 : 80;
    const bestMatches = merged.filter((f) => (f._relevance ?? 0) >= BEST_MATCH_THRESHOLD);
    const moreResults = merged.filter((f) => (f._relevance ?? 0) < BEST_MATCH_THRESHOLD);

    logSearchAnalytics(supabase, userId, query, merged.length, searchStrategy, brandTokens[0] ?? null, bestMatches.length);

    return new Response(JSON.stringify({ foods: merged, bestMatches, moreResults, source: "hybrid", wasWidened, usedQuery, strategy: searchStrategy }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("search-foods error:", err);
    return new Response(JSON.stringify({ error: "Search failed", foods: [], bestMatches: [], moreResults: [] }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function logSearchAnalytics(supabase: any, userId: string | null, query: string, resultCount: number, strategy: string, detectedBrand: string | null, bestMatchCount: number) {
  supabase.from("food_search_log").insert({
    user_id: userId, query, normalized_query: query.toLowerCase().trim(),
    results_count: resultCount, best_match_count: bestMatchCount,
    search_strategy: strategy, detected_brand: detectedBrand,
  }).then(() => {}).catch(() => {});
}
