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

function mapUsdaFood(item: any): any | null {
  const nutrients = item.foodNutrients ?? [];
  const get = (name: string) => nutrients.find((n: any) => n.nutrientName === name)?.value ?? null;

  const calories = get("Energy");
  const protein = get("Protein");
  const carbs = get("Carbohydrate, by difference");
  const fat = get("Total lipid (fat)");

  if ((protein ?? 0) + (carbs ?? 0) + (fat ?? 0) === 0) return null;

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
    serving_size_g: item.servingSize ?? 100,
    serving_unit: item.servingSizeUnit ?? "g",
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
    serving_size_g: parseFloat(p.serving_size) || 100,
    serving_unit: "g",
    image_url: p.image_front_small_url ?? null,
    barcode: p.code ?? null,
    is_branded: !!(p.brands),
    is_verified: false,
    is_custom: false,
    source: "open_food_facts",
    language_code: "en",
    country_code: "US",
    has_complete_macros: true,
    data_quality_score: 40,
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
      .eq("has_complete_macros", true)
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

    // If strong USDA cache exists, return immediately
    const usdaLocal = localFoods.filter((f: any) => f.source === "usda");
    if (usdaLocal.length >= 5) {
      return new Response(JSON.stringify({ foods: localFoods, source: "cache" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 2: USDA FoodData Central (primary)
    let usdaFoods: any[] = [];
    if (usdaApiKey) {
      try {
        const usdaUrl = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}&pageSize=15&api_key=${usdaApiKey}`;
        const usdaRes = await fetch(usdaUrl, { signal: AbortSignal.timeout(5000) });
        if (usdaRes.ok) {
          const usdaData = await usdaRes.json();
          usdaFoods = (usdaData.foods ?? []).map(mapUsdaFood).filter(Boolean);
          if (usdaFoods.length > 0) {
            await supabase.from("foods").upsert(usdaFoods, {
              onConflict: "usda_fdc_id",
              ignoreDuplicates: true,
            });
          }
        }
      } catch (e) {
        console.error("USDA fetch error:", e);
      }
    }

    // Step 3: Open Food Facts (secondary, English + US only)
    let offFoods: any[] = [];
    try {
      const offUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=30&sort_by=unique_scans_n&fields=code,product_name,brands,nutriments,serving_size,image_front_small_url,lang,language,countries_tags&tagtype_0=countries&tag_contains_0=contains&tag_0=united+states`;

      const offRes = await fetch(offUrl, {
        headers: { "User-Agent": "PhysiqueCraftersOS/1.0 (contact@physiquecrafters.com)" },
        signal: AbortSignal.timeout(5000),
      });

      if (offRes.ok) {
        const offData = await offRes.json();
        offFoods = (offData.products ?? []).map(mapOffFood).filter(Boolean);
        if (offFoods.length > 0) {
          await supabase.from("foods").upsert(offFoods, {
            onConflict: "off_id",
            ignoreDuplicates: true,
          });
        }
      }
    } catch (e) {
      console.error("OFF fetch error:", e);
    }

    // Step 4: Merge, deduplicate, sort by quality
    const existingUsdaIds = new Set(localFoods.map((f: any) => f.usda_fdc_id).filter(Boolean));
    const existingOffIds = new Set(localFoods.map((f: any) => f.off_id).filter(Boolean));

    const newUsda = usdaFoods.filter((f) => !existingUsdaIds.has(f.usda_fdc_id));
    const newOff = offFoods.filter((f) => !existingOffIds.has(f.off_id));

    const merged = [...localFoods, ...newUsda, ...newOff]
      .filter((f) => f.has_complete_macros !== false)
      .sort((a, b) => {
        if ((b.data_quality_score ?? 0) !== (a.data_quality_score ?? 0)) {
          return (b.data_quality_score ?? 0) - (a.data_quality_score ?? 0);
        }
        return (b.popularity_score ?? 0) - (a.popularity_score ?? 0);
      })
      .slice(0, limit);

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
