import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

  if (product.countries_tags && product.countries_tags.length > 0) {
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
  if (protein === 0 && carbs === 0 && fat === 0) return false;
  return true;
}

function brandRelevanceScore(food: any, query: string): number {
  const queryLower = query.toLowerCase();
  const nameLower = (food.name ?? "").toLowerCase();
  const brandLower = (food.brand ?? "").toLowerCase();
  const queryWords = queryLower.split(/\s+/);
  const isMultiWord = queryWords.length >= 2;

  let score = 0;

  // Exact full-query match in brand → highest priority
  if (brandLower && brandLower.includes(queryLower)) score += 100;
  // Full query appears in name (brand + product name combined)
  if (nameLower.includes(queryLower)) score += 80;
  // Brand word match
  if (brandLower && queryWords.some((w: string) => brandLower.includes(w))) score += 50;
  if (brandLower && queryWords.some((w: string) => brandLower.startsWith(w))) score += 30;
  // Branded item bonus
  if (food.is_branded || brandLower) score += 30;
  // OFF branded items are often exact retail products
  if (food.source === "open_food_facts" && brandLower) score += 15;
  // Name word matches
  const nameMatches = queryWords.filter((w: string) => nameLower.includes(w)).length;
  score += nameMatches * 10;
  // USDA bonus (smaller now so brands win)
  if (food.source === "usda") score += 10;
  // Complete macros bonus
  if (food.has_complete_macros !== false) score += 10;
  // Penalize generic items when query is multi-word (likely brand search)
  if (isMultiWord && !brandLower) score -= 20;
  // Popularity
  score += Math.min(food.popularity_score ?? 0, 20);
  return score;
}

function parseUsdaServings(item: any): { description: string; size_g: number; unit: string; additional: any[] } {
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
      additional.push({
        description: m.disseminationText ?? m.measureUnitName,
        size_g: m.gramWeight ?? 100,
      });
    });
  }

  if (!additional.find((a: any) => a.description === "100g")) {
    additional.push({ description: "100g", size_g: 100 });
  }

  return { description, size_g, unit: servingUnit, additional };
}

function parseOffServings(p: any): { description: string; size_g: number; additional: any[] } {
  const rawServing = p.serving_size ?? "";
  const additional: any[] = [];

  const match = rawServing.match(/^(.+?)\s*\(?([\d.]+)\s*g\)?$/i);
  let description = rawServing || "100g";
  let size_g = 100;

  if (match) {
    description = match[1].trim();
    size_g = parseFloat(match[2]);
  } else {
    const gramsOnly = rawServing.match(/^([\d.]+)\s*g$/i);
    if (gramsOnly) {
      size_g = parseFloat(gramsOnly[1]);
      description = `${size_g}g`;
    }
  }

  additional.push({ description: "100g", size_g: 100 });
  return { description, size_g, additional };
}

function mapUsdaFood(item: any): any | null {
  const nutrients = item.foodNutrients ?? [];
  const get = (name: string) => nutrients.find((n: any) => n.nutrientName === name)?.value ?? null;

  const calories = get("Energy");
  const protein = get("Protein");
  const carbs = get("Carbohydrate, by difference");
  const fat = get("Total lipid (fat)");

  if ((protein ?? 0) + (carbs ?? 0) + (fat ?? 0) === 0) return null;

  const serving = parseUsdaServings(item);

  return {
    usda_fdc_id: String(item.fdcId),
    name: item.description?.trim() ?? "Unknown",
    brand: item.brandOwner?.trim() ?? item.brandName?.trim() ?? null,
    calories_per_100g: calories,
    protein_per_100g: protein,
    carbs_per_100g: carbs,
    fat_per_100g: fat,
    fiber_per_100g: get("Fiber, total dietary"),
    sugar_per_100g: get("Sugars, total including NLEA"),
    sodium_per_100g: get("Sodium, Na"),
    // Micronutrients from USDA
    vitamin_a_mcg_per_100g: get("Vitamin A, RAE"),
    vitamin_c_mg_per_100g: get("Vitamin C, total ascorbic acid"),
    vitamin_d_mcg_per_100g: get("Vitamin D (D2 + D3)"),
    vitamin_e_mg_per_100g: get("Vitamin E (alpha-tocopherol)"),
    vitamin_k_mcg_per_100g: get("Vitamin K (phylloquinone)"),
    vitamin_b1_mg_per_100g: get("Thiamin"),
    vitamin_b2_mg_per_100g: get("Riboflavin"),
    vitamin_b3_mg_per_100g: get("Niacin"),
    vitamin_b5_mg_per_100g: get("Pantothenic acid"),
    vitamin_b6_mg_per_100g: get("Vitamin B-6"),
    vitamin_b9_mcg_per_100g: get("Folate, total"),
    vitamin_b12_mcg_per_100g: get("Vitamin B-12"),
    calcium_mg_per_100g: get("Calcium, Ca"),
    iron_mg_per_100g: get("Iron, Fe"),
    magnesium_mg_per_100g: get("Magnesium, Mg"),
    phosphorus_mg_per_100g: get("Phosphorus, P"),
    potassium_mg_per_100g: get("Potassium, K"),
    zinc_mg_per_100g: get("Zinc, Zn"),
    copper_mg_per_100g: get("Copper, Cu"),
    manganese_mg_per_100g: get("Manganese, Mn"),
    selenium_mcg_per_100g: get("Selenium, Se"),
    cholesterol_per_100g: get("Cholesterol"),
    serving_size_g: serving.size_g,
    serving_unit: serving.unit,
    serving_description: serving.description,
    household_serving_fulltext: serving.description,
    additional_serving_sizes: serving.additional,
    image_url: null,
    barcode: item.gtinUpc ?? null,
    is_branded: !!(item.brandOwner || item.brandName),
    is_verified: true,
    is_custom: false,
    source: "usda",
    language_code: "en",
    country_code: "US",
    has_complete_macros: true,
    data_quality_score: 100,
    popularity_score: 5,
  };
}

function mapOffFood(p: any): any | null {
  const n = p.nutriments ?? {};
  if (!hasCompleteMacros(n)) return null;
  if (!isEnglishResult(p)) return null;
  if (!p.product_name?.trim()) return null;

  const serving = parseOffServings(p);

  return {
    off_id: p.code ?? null,
    name: p.product_name.trim(),
    brand: p.brands?.split(",")[0]?.trim() ?? null,
    calories_per_100g: n["energy-kcal_100g"] ?? n["energy-kcal"] ?? null,
    protein_per_100g: n["proteins_100g"] ?? null,
    carbs_per_100g: n["carbohydrates_100g"] ?? null,
    fat_per_100g: n["fat_100g"] ?? null,
    fiber_per_100g: n["fiber_100g"] ?? null,
    sugar_per_100g: n["sugars_100g"] ?? null,
    sodium_per_100g: n["sodium_100g"] ? n["sodium_100g"] * 1000 : null,
    serving_size_g: serving.size_g,
    serving_unit: "g",
    serving_description: serving.description,
    household_serving_fulltext: serving.description,
    additional_serving_sizes: serving.additional,
    image_url: p.image_front_small_url ?? null,
    barcode: p.code ?? null,
    is_branded: !!(p.brands),
    is_verified: false,
    is_custom: false,
    source: "open_food_facts",
    language_code: "en",
    country_code: "US",
    has_complete_macros: true,
    data_quality_score: p.brands ? 60 : 40,
    popularity_score: 0,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { query: q, limit: lim = 25, user_id } = await req.json();
    const query = (q ?? "").trim();
    const limit = typeof lim === "number" ? lim : 25;
    const userId = user_id ?? null;
    const usdaApiKey = Deno.env.get("USDA_API_KEY") ?? "";

    if (!query || query.length < 2) {
      return new Response(JSON.stringify({ foods: [], source: "empty" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Step 1: Local cache — complete macros only
    const { data: localResults } = await supabase
      .from("foods")
      .select("*")
      .or(`name.ilike.%${query}%,brand.ilike.%${query}%`)
      .not("calories_per_100g", "is", null)
      .order("data_quality_score", { ascending: false })
      .order("popularity_score", { ascending: false })
      .limit(limit);

    const localFoods = localResults ?? [];

    // Log search (fire and forget)
    if (userId) {
      supabase.from("food_search_log").insert({
        query,
        results_count: localFoods.length,
        user_id: userId,
      }).then(() => {});
    }

    // Detect brand search
    const queryWords = query.split(/\s+/);
    const likelyBrandSearch = queryWords.length >= 2;

    const localBrandMatches = localFoods.filter((f: any) =>
      f.brand?.toLowerCase().includes(queryWords[0].toLowerCase())
    );

    // Only short-circuit on very strong local results to avoid slow external calls
    if (!likelyBrandSearch && localFoods.length >= 8) {
      return new Response(JSON.stringify({ foods: localFoods, source: "cache" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (likelyBrandSearch && localBrandMatches.length >= 5) {
      return new Response(JSON.stringify({ foods: localFoods, source: "cache" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // For sparse local results, fall through to external APIs

    // Step 2: Search USDA and OFF SIMULTANEOUSLY
    const offCountryFilter = likelyBrandSearch
      ? "" // For brand searches, search broader
      : "&tagtype_0=countries&tag_contains_0=contains&tag_0=united+states";

    const offPageSize = likelyBrandSearch ? 50 : 30;

    const [usdaResult, offResult] = await Promise.allSettled([
      usdaApiKey ? fetch(
        `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}&pageSize=20&api_key=${usdaApiKey}`,
        { signal: AbortSignal.timeout(12000) }
      ) : Promise.reject("No USDA key"),

      fetch(
        `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=${offPageSize}&sort_by=unique_scans_n&fields=code,product_name,brands,nutriments,serving_size,image_front_small_url,lang,language,countries_tags${offCountryFilter}`,
        {
          headers: { "User-Agent": "PhysiqueCraftersOS/1.0 (contact@physiquecrafters.com)" },
          signal: AbortSignal.timeout(12000),
        }
      ),
    ]);

    let usdaFoods: any[] = [];
    let offFoods: any[] = [];

    if (usdaResult.status === "fulfilled" && usdaResult.value.ok) {
      const usdaData = await usdaResult.value.json();
      usdaFoods = (usdaData.foods ?? []).map(mapUsdaFood).filter(Boolean);
      if (usdaFoods.length > 0) {
        await supabase.from("foods").upsert(usdaFoods, {
          onConflict: "usda_fdc_id", ignoreDuplicates: false,
        });
      }
    }

    if (offResult.status === "fulfilled" && offResult.value.ok) {
      const offData = await offResult.value.json();
      offFoods = (offData.products ?? []).map(mapOffFood).filter(Boolean);
    }

    // For brand searches, also search OFF with Canada filter
    if (likelyBrandSearch) {
      try {
        const offCaRes = await fetch(
          `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=20&fields=code,product_name,brands,nutriments,serving_size,image_front_small_url,lang,language,countries_tags&tagtype_0=countries&tag_contains_0=contains&tag_0=canada`,
          {
            headers: { "User-Agent": "PhysiqueCraftersOS/1.0 (contact@physiquecrafters.com)" },
            signal: AbortSignal.timeout(7000),
          }
        );
        if (offCaRes.ok) {
          const offCaData = await offCaRes.json();
          const caFoods = (offCaData.products ?? []).map(mapOffFood).filter(Boolean);
          offFoods = [...offFoods, ...caFoods];
        }
      } catch { /* non-fatal */ }
    }

    // Cache OFF results
    if (offFoods.length > 0) {
      const offWithIds = offFoods.filter((f: any) => f.off_id);
      if (offWithIds.length > 0) {
        await supabase.from("foods").upsert(offWithIds, {
          onConflict: "off_id", ignoreDuplicates: true,
        });
      }
    }

    // Step 3: Merge, score by brand relevance, deduplicate
    const existingUsdaIds = new Set(localFoods.map((f: any) => f.usda_fdc_id).filter(Boolean));
    const existingOffIds = new Set(localFoods.map((f: any) => f.off_id).filter(Boolean));

    const newUsda = usdaFoods.filter((f) => !existingUsdaIds.has(f.usda_fdc_id));
    const newOff = offFoods.filter((f) => !existingOffIds.has(f.off_id));

    const allResults = [...localFoods, ...newUsda, ...newOff]
      .filter((f) => f.has_complete_macros !== false);

    const scored = allResults.map((f) => ({
      ...f,
      _relevance: brandRelevanceScore(f, query),
    }));

    scored.sort((a, b) => b._relevance - a._relevance);

    // Deduplicate by name+brand
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
