import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Brand aliases ──────────────────────────────────────────────────────
const BRAND_ALIASES: Record<string, string[]> = {
  costco: ["kirkland", "kirkland signature"],
  kirkland: ["costco"],
  "kirkland signature": ["costco"],
  trader: ["trader joe's", "trader joes"],
  "trader joe's": ["trader"],
  "trader joes": ["trader"],
  walmart: ["great value"],
  "great value": ["walmart"],
  target: ["good & gather", "market pantry"],
  "good & gather": ["target"],
  "market pantry": ["target"],
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

// ── Token classification ───────────────────────────────────────────────
const BRAND_KEYWORDS = new Set(Object.keys(BRAND_ALIASES));
// Also include multi-word brand names
const MULTI_WORD_BRANDS = Object.keys(BRAND_ALIASES).filter(k => k.includes(" "));

function classifyTokens(tokens: string[]): { brandTokens: string[]; foodTokens: string[] } {
  const brandTokens: string[] = [];
  const foodTokens: string[] = [];
  const joined = tokens.join(" ");

  // Check for multi-word brand matches first
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

  // Classify remaining tokens
  for (let i = 0; i < tokens.length; i++) {
    if (consumedIndices.has(i)) continue;
    if (BRAND_KEYWORDS.has(tokens[i])) {
      brandTokens.push(tokens[i]);
    } else {
      foodTokens.push(tokens[i]);
    }
  }

  return { brandTokens, foodTokens };
}

// ── Filters ────────────────────────────────────────────────────────────
const ALLOWED_COUNTRIES = new Set([
  "united states", "us", "usa", "canada", "ca",
  "united kingdom", "uk", "gb", "australia", "au",
  "new zealand", "nz", "ireland", "ie"
]);
const ALLOWED_LANGUAGES = new Set(["en", "en-US", "en-GB", "en-CA", "en-AU"]);
const NON_ENGLISH_PATTERN = /[àâçéèêëîïôùûüÿœæÀÂÇÉÈÊËÎÏÔÙÛÜŸŒÆ]/;

function isEnglishResult(product: any): boolean {
  const lang = product.lang ?? product.language ?? "";
  if (lang && !ALLOWED_LANGUAGES.has(lang)) return false;
  if (product.countries_tags?.length > 0) {
    const hasEnglishCountry = product.countries_tags.some((tag: string) => {
      const clean = tag.replace("en:", "").toLowerCase();
      return ALLOWED_COUNTRIES.has(clean);
    });
    if (!hasEnglishCountry) return false;
  }
  const name = product.product_name ?? "";
  if (NON_ENGLISH_PATTERN.test(name)) return false;
  return true;
}

function hasCompleteMacros(nutriments: any): boolean {
  if (!nutriments) return false;
  const protein = nutriments["proteins_100g"] ?? 0;
  const carbs = nutriments["carbohydrates_100g"] ?? 0;
  const fat = nutriments["fat_100g"] ?? 0;
  return (protein + carbs + fat) > 0;
}

// ── Scoring ────────────────────────────────────────────────────────────
function brandRelevanceScore(food: any, query: string, tokens: string[], aliases: string[]): number {
  const nameLower = (food.name ?? "").toLowerCase();
  const brandLower = (food.brand ?? "").toLowerCase();
  const isMultiWord = tokens.length >= 2;
  let score = 0;

  const { brandTokens, foodTokens } = classifyTokens(tokens);

  // Exact brand match on full query
  if (brandLower && brandLower === query) score += 120;
  else if (brandLower && brandLower.includes(query)) score += 100;

  // Brand alias match
  if (brandLower && aliases.length > 0) {
    for (const alias of aliases) {
      if (brandLower.includes(alias)) { score += 95; break; }
    }
  }

  // Full query in name
  if (nameLower.includes(query)) score += 80;

  // All tokens matched across brand+name
  const allTokensCovered = tokens.every(t => nameLower.includes(t) || brandLower.includes(t));
  if (allTokensCovered) score += 70;

  // Brand word match
  if (brandLower && tokens.some(t => brandLower.includes(t))) score += 50;
  if (brandLower && tokens.some(t => brandLower.startsWith(t))) score += 30;

  // Branded item bonus
  if (food.is_branded || brandLower) score += 30;
  if (food.source === "open_food_facts" && brandLower) score += 15;

  // Name word matches
  const nameMatches = tokens.filter(t => nameLower.includes(t)).length;
  score += nameMatches * 10;

  // USDA bonus
  if (food.source === "usda") score += 10;
  if (food.has_complete_macros !== false) score += 10;

  // Penalize generic items when multi-word brand search
  if (isMultiWord && !brandLower) score -= 25;

  score += Math.min(food.popularity_score ?? 0, 20);

  // ── Food token coverage scoring (critical for brand+food queries) ──
  if (foodTokens.length > 0) {
    const foodTokensInName = foodTokens.filter(t => nameLower.includes(t)).length;

    if (foodTokensInName === 0) {
      // Brand matches but ZERO food tokens in name → heavy penalty
      score -= 80;
    } else if (foodTokensInName < foodTokens.length) {
      // Partial food match
      score -= 40;
    } else {
      // All food tokens found in name → bonus
      score += 60;
    }

    // Exact contiguous food phrase bonus
    const foodPhrase = foodTokens.join(" ");
    if (foodPhrase.length > 0 && nameLower.includes(foodPhrase)) {
      score += 40;
    }
  }

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

// ── OFF parsing ────────────────────────────────────────────────────────
function parseOffServings(p: any) {
  const rawServing = p.serving_size ?? "";
  const additional: any[] = [];
  const match = rawServing.match(/^(.+?)\s*\(?([\d.]+)\s*g\)?$/i);
  let description = rawServing || "100g"; let size_g = 100;
  if (match) { description = match[1].trim(); size_g = parseFloat(match[2]); }
  else { const g = rawServing.match(/^([\d.]+)\s*g$/i); if (g) { size_g = parseFloat(g[1]); description = `${size_g}g`; } }
  additional.push({ description: "100g", size_g: 100 });
  return { description, size_g, additional };
}

function mapOffFood(p: any): any | null {
  const n = p.nutriments ?? {};
  if (!hasCompleteMacros(n)) return null;
  if (!isEnglishResult(p)) return null;
  if (!p.product_name?.trim()) return null;
  const serving = parseOffServings(p);
  return {
    off_id: p.code ?? null, name: p.product_name.trim(),
    brand: p.brands?.split(",")[0]?.trim() ?? null,
    calories_per_100g: n["energy-kcal_100g"] ?? n["energy-kcal"] ?? null,
    protein_per_100g: n["proteins_100g"] ?? null, carbs_per_100g: n["carbohydrates_100g"] ?? null,
    fat_per_100g: n["fat_100g"] ?? null, fiber_per_100g: n["fiber_100g"] ?? null,
    sugar_per_100g: n["sugars_100g"] ?? null,
    sodium_per_100g: n["sodium_100g"] ? n["sodium_100g"] * 1000 : null,
    serving_size_g: serving.size_g, serving_unit: "g", serving_description: serving.description,
    household_serving_fulltext: serving.description, additional_serving_sizes: serving.additional,
    image_url: p.image_front_small_url ?? null, barcode: p.code ?? null,
    is_branded: !!(p.brands), is_verified: false, is_custom: false, source: "open_food_facts",
    language_code: "en", country_code: "US", has_complete_macros: true,
    data_quality_score: p.brands ? 60 : 40, popularity_score: 0,
  };
}

// ── Safe JSON parse helper ─────────────────────────────────────────────
async function safeJson(response: Response): Promise<any> {
  try { return await response.json(); }
  catch { return null; }
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
      return new Response(JSON.stringify({ foods: [], source: "empty" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const tokens = query.split(/\s+/).filter(Boolean);
    const aliases = expandBrandAliases(tokens);
    const likelyBrandSearch = tokens.length >= 2;

    // ── Step 1: Tokenized local cache search ─────────────────────────
    // Build OR conditions for each token across name and brand
    const orConditions = tokens.map(t => `name.ilike.%${t}%,brand.ilike.%${t}%`).join(",");
    // Also add alias conditions
    const aliasConditions = aliases.map(a => `brand.ilike.%${a}%`).join(",");
    const allConditions = aliasConditions ? `${orConditions},${aliasConditions}` : orConditions;

    const { data: localResults } = await supabase
      .from("foods")
      .select("*")
      .or(allConditions)
      .not("calories_per_100g", "is", null)
      .order("data_quality_score", { ascending: false })
      .order("popularity_score", { ascending: false })
      .limit(50);

    const localFoods = localResults ?? [];
    console.log(`[search-foods] Local cache: ${localFoods.length} results for "${query}"`);

    // Log search (fire and forget)
    if (userId) {
      supabase.from("food_search_log").insert({ query, results_count: localFoods.length, user_id: userId }).then(() => {});
    }

    // Score local results for brand relevance
    const localBrandMatches = localFoods.filter((f: any) => {
      const b = (f.brand ?? "").toLowerCase();
      return tokens.some(t => b.includes(t)) || aliases.some(a => b.includes(a));
    });

    // Only short-circuit when we have very strong local results
    if (!likelyBrandSearch && localFoods.length >= 8) {
      const scored = localFoods.map((f: any) => ({ ...f, _relevance: brandRelevanceScore(f, query, tokens, aliases) }));
      scored.sort((a: any, b: any) => b._relevance - a._relevance);
      return new Response(JSON.stringify({ foods: scored.slice(0, limit), source: "cache" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (likelyBrandSearch && localBrandMatches.length >= 5) {
      const scored = localFoods.map((f: any) => ({ ...f, _relevance: brandRelevanceScore(f, query, tokens, aliases) }));
      scored.sort((a: any, b: any) => b._relevance - a._relevance);
      return new Response(JSON.stringify({ foods: scored.slice(0, limit), source: "cache" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Step 2: External APIs (isolated try/catch per source) ────────
    const offCountryFilter = likelyBrandSearch ? "" : "&tagtype_0=countries&tag_contains_0=contains&tag_0=united+states";
    const offPageSize = likelyBrandSearch ? 50 : 30;

    // Build search terms with aliases for external APIs
    const externalQueries = [query];
    if (aliases.length > 0 && likelyBrandSearch) {
      // Add alias-expanded query: replace brand token with alias
      for (const alias of aliases.slice(0, 1)) {
        const foodTokens = tokens.slice(1).join(" ");
        if (foodTokens) externalQueries.push(`${alias} ${foodTokens}`);
      }
    }

    let usdaFoods: any[] = [];
    let offFoods: any[] = [];
    const sourceStatus: Record<string, string> = {};

    // USDA
    try {
      if (usdaApiKey) {
        const usdaRes = await fetch(
          `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}&pageSize=20&api_key=${usdaApiKey}`,
          { signal: AbortSignal.timeout(8000) }
        );
        if (usdaRes.ok) {
          const usdaData = await safeJson(usdaRes);
          if (usdaData) {
            usdaFoods = (usdaData.foods ?? []).map(mapUsdaFood).filter(Boolean);
            sourceStatus.usda = `ok:${usdaFoods.length}`;
          } else { sourceStatus.usda = "json_fail"; }
        } else { sourceStatus.usda = `http_${usdaRes.status}`; }
      } else { sourceStatus.usda = "no_key"; }
    } catch (e: any) {
      sourceStatus.usda = e.name === "TimeoutError" ? "timeout" : "error";
      console.warn("[search-foods] USDA failed:", e.name || e.message);
    }

    // OFF — primary
    try {
      const offRes = await fetch(
        `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=${offPageSize}&sort_by=unique_scans_n&fields=code,product_name,brands,nutriments,serving_size,image_front_small_url,lang,language,countries_tags${offCountryFilter}`,
        { headers: { "User-Agent": "PhysiqueCraftersOS/1.0 (contact@physiquecrafters.com)" }, signal: AbortSignal.timeout(8000) }
      );
      if (offRes.ok) {
        const offData = await safeJson(offRes);
        if (offData) {
          offFoods = (offData.products ?? []).map(mapOffFood).filter(Boolean);
          sourceStatus.off = `ok:${offFoods.length}`;
        } else { sourceStatus.off = "json_fail"; }
      } else { sourceStatus.off = `http_${offRes.status}`; }
    } catch (e: any) {
      sourceStatus.off = e.name === "TimeoutError" ? "timeout" : "error";
      console.warn("[search-foods] OFF failed:", e.name || e.message);
    }

    // OFF — alias expanded (only for brand searches)
    if (likelyBrandSearch && externalQueries.length > 1) {
      for (const aliasQuery of externalQueries.slice(1)) {
        try {
          const offAliasRes = await fetch(
            `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(aliasQuery)}&search_simple=1&action=process&json=1&page_size=20&sort_by=unique_scans_n&fields=code,product_name,brands,nutriments,serving_size,image_front_small_url,lang,language,countries_tags`,
            { headers: { "User-Agent": "PhysiqueCraftersOS/1.0 (contact@physiquecrafters.com)" }, signal: AbortSignal.timeout(6000) }
          );
          if (offAliasRes.ok) {
            const aliasData = await safeJson(offAliasRes);
            if (aliasData) {
              const aliasFoods = (aliasData.products ?? []).map(mapOffFood).filter(Boolean);
              offFoods = [...offFoods, ...aliasFoods];
            }
          }
        } catch { /* non-fatal */ }
      }
    }

    // OFF — Canada filter for brand searches
    if (likelyBrandSearch) {
      try {
        const offCaRes = await fetch(
          `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=20&fields=code,product_name,brands,nutriments,serving_size,image_front_small_url,lang,language,countries_tags&tagtype_0=countries&tag_contains_0=contains&tag_0=canada`,
          { headers: { "User-Agent": "PhysiqueCraftersOS/1.0 (contact@physiquecrafters.com)" }, signal: AbortSignal.timeout(6000) }
        );
        if (offCaRes.ok) {
          const offCaData = await safeJson(offCaRes);
          if (offCaData) {
            const caFoods = (offCaData.products ?? []).map(mapOffFood).filter(Boolean);
            offFoods = [...offFoods, ...caFoods];
          }
        }
      } catch { /* non-fatal */ }
    }

    console.log(`[search-foods] Sources: ${JSON.stringify(sourceStatus)} | USDA:${usdaFoods.length} OFF:${offFoods.length}`);

    // ── Step 3: Cache results ────────────────────────────────────────
    try {
      if (usdaFoods.length > 0) {
        await supabase.from("foods").upsert(usdaFoods, { onConflict: "usda_fdc_id", ignoreDuplicates: false });
      }
    } catch { /* non-fatal cache write */ }

    try {
      const offWithIds = offFoods.filter((f: any) => f.off_id);
      if (offWithIds.length > 0) {
        await supabase.from("foods").upsert(offWithIds, { onConflict: "off_id", ignoreDuplicates: true });
      }
    } catch { /* non-fatal cache write */ }

    // ── Step 4: Merge, score, deduplicate ────────────────────────────
    const existingUsdaIds = new Set(localFoods.map((f: any) => f.usda_fdc_id).filter(Boolean));
    const existingOffIds = new Set(localFoods.map((f: any) => f.off_id).filter(Boolean));
    const newUsda = usdaFoods.filter((f) => !existingUsdaIds.has(f.usda_fdc_id));
    const newOff = offFoods.filter((f) => !existingOffIds.has(f.off_id));
    const allResults = [...localFoods, ...newUsda, ...newOff].filter((f) => f.has_complete_macros !== false);

    const scored = allResults.map((f) => ({ ...f, _relevance: brandRelevanceScore(f, query, tokens, aliases) }));
    scored.sort((a, b) => b._relevance - a._relevance);

    const seen = new Set<string>();
    const deduped = scored.filter((f) => {
      const key = `${f.name?.toLowerCase()}::${f.brand?.toLowerCase() ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const merged = deduped.slice(0, limit);

    return new Response(JSON.stringify({ foods: merged, source: "hybrid" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("search-foods error:", err);
    return new Response(JSON.stringify({ error: "Search failed", foods: [] }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
