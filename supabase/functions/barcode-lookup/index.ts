import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── OAuth 2.0 token cache (FatSecret) ──
let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const clientId = Deno.env.get("FATSECRET_CLIENT_ID");
  const clientSecret = Deno.env.get("FATSECRET_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("FatSecret credentials not configured");
  const credentials = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch("https://oauth.fatsecret.com/connect/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FatSecret OAuth failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;
  return cachedToken!;
}

async function fatSecretAPI(method: string, params: Record<string, string>, token: string): Promise<any> {
  const searchParams = new URLSearchParams({ method, format: "json", ...params });
  const res = await fetch("https://platform.fatsecret.com/rest/server.api", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: searchParams.toString(),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FatSecret API error: ${res.status} ${text}`);
  }
  return res.json();
}

function normalizeBarcode(barcode: string): string {
  const clean = barcode.replace(/\D/g, "");
  if (clean.length === 12) return "0" + clean;
  return clean;
}

function mapFatSecretFood(food: any): any | null {
  const servings = food.servings?.serving;
  if (!servings) return null;
  const servingList = Array.isArray(servings) ? servings : [servings];
  let metricServing = servingList.find((s: any) => s.metric_serving_unit === "g" || s.metric_serving_unit === "ml");
  if (!metricServing) metricServing = servingList[0];
  if (!metricServing) return null;

  const metricAmount = parseFloat(metricServing.metric_serving_amount) || 100;
  const factor = 100 / metricAmount;
  const calories = parseFloat(metricServing.calories) || 0;
  const protein = parseFloat(metricServing.protein) || 0;
  const carbs = parseFloat(metricServing.carbohydrate) || 0;
  const fat = parseFloat(metricServing.fat) || 0;
  if (protein + carbs + fat === 0) return null;

  const primaryServing = servingList[0];
  const primaryDesc = primaryServing?.serving_description || `${metricAmount}g`;
  const primarySizeG = parseFloat(primaryServing?.metric_serving_amount) || metricAmount;

  return {
    name: food.food_name?.trim() || "Unknown",
    brand: food.brand_name?.trim() || null,
    calories_per_100g: Math.round(calories * factor),
    protein_per_100g: Math.round(protein * factor * 10) / 10,
    carbs_per_100g: Math.round(carbs * factor * 10) / 10,
    fat_per_100g: Math.round(fat * factor * 10) / 10,
    fiber_per_100g: metricServing.fiber ? Math.round(parseFloat(metricServing.fiber) * factor * 10) / 10 : 0,
    sugar_per_100g: metricServing.sugar ? Math.round(parseFloat(metricServing.sugar) * factor * 10) / 10 : 0,
    sodium_per_100g: metricServing.sodium ? Math.round(parseFloat(metricServing.sodium) * factor / 1000 * 10) / 10 : 0,
    serving_size_g: primarySizeG,
    serving_description: primaryDesc,
    data_quality_score: food.brand_name ? 70 : 50,
  };
}

// ── Build the standard response shape ──
function buildResponse(
  barcode: string,
  name: string,
  brand: string | null,
  per100g: { calories: number; protein: number; carbs: number; fat: number; fiber: number; sugar: number; sodium: number },
  servingG: number,
  servingLabel: string,
  source: string,
) {
  return {
    found: true,
    barcode,
    name,
    brand,
    serving_size: servingLabel,
    serving_quantity: servingG,
    per_100g: per100g,
    per_serving: {
      calories: Math.round(per100g.calories * servingG / 100),
      protein: Math.round(per100g.protein * servingG / 100 * 10) / 10,
      carbs: Math.round(per100g.carbs * servingG / 100 * 10) / 10,
      fat: Math.round(per100g.fat * servingG / 100 * 10) / 10,
      fiber: Math.round(per100g.fiber * servingG / 100 * 10) / 10,
      sugar: Math.round(per100g.sugar * servingG / 100 * 10) / 10,
      sodium: Math.round(per100g.sodium * servingG / 100 * 10) / 10,
    },
    source,
  };
}

// ── Upsert into foods table, return nothing (non-fatal) ──
async function cacheInFoods(
  supabase: any,
  barcode: string,
  name: string,
  brand: string | null,
  per100g: { calories: number; protein: number; carbs: number; fat: number; fiber: number; sugar: number; sodium: number },
  servingG: number,
  servingLabel: string,
  source: string,
  qualityScore: number,
) {
  try {
    await supabase.from("foods").upsert({
      name, brand, barcode,
      calories_per_100g: per100g.calories,
      protein_per_100g: per100g.protein,
      carbs_per_100g: per100g.carbs,
      fat_per_100g: per100g.fat,
      fiber_per_100g: per100g.fiber,
      sugar_per_100g: per100g.sugar,
      sodium_per_100g: per100g.sodium / 1000, // store in grams
      serving_size_g: servingG,
      serving_unit: "g",
      serving_description: servingLabel,
      source,
      is_verified: false,
      has_complete_macros: true,
      data_quality_score: qualityScore,
    }, { onConflict: "barcode", ignoreDuplicates: false });
  } catch { /* non-fatal */ }
}

function parseServingGrams(raw: string): number | null {
  if (!raw) return null;
  const parenG = raw.match(/\((\d+(?:\.\d+)?)\s*g\)/i);
  if (parenG) return parseFloat(parenG[1]);
  const parenMl = raw.match(/\((\d+(?:\.\d+)?)\s*ml\)/i);
  if (parenMl) return parseFloat(parenMl[1]);
  const plain = raw.match(/^(\d+(?:\.\d+)?)\s*g$/i);
  if (plain) return parseFloat(plain[1]);
  const ml = raw.match(/^(\d+(?:\.\d+)?)\s*ml$/i);
  if (ml) return parseFloat(ml[1]);
  const numOnly = raw.match(/(\d+(?:\.\d+)?)\s*(?:g|ml)/i);
  if (numOnly) return parseFloat(numOnly[1]);
  return null;
}

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { barcode } = await req.json();

    if (!barcode || typeof barcode !== "string" || barcode.length < 4 || barcode.length > 20) {
      return json({ error: "Invalid barcode" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── STEP 1: Local cache ──
    const { data: cached } = await supabase
      .from("foods")
      .select("*")
      .eq("barcode", barcode)
      .not("calories_per_100g", "is", null)
      .limit(1)
      .maybeSingle();

    if (cached) {
      console.log("[barcode-lookup] Cache hit:", cached.name);
      const n = cached;
      const per100g = {
        calories: Math.round(n.calories_per_100g ?? 0),
        protein: Math.round((n.protein_per_100g ?? 0) * 10) / 10,
        carbs: Math.round((n.carbs_per_100g ?? 0) * 10) / 10,
        fat: Math.round((n.fat_per_100g ?? 0) * 10) / 10,
        fiber: Math.round((n.fiber_per_100g ?? 0) * 10) / 10,
        sugar: Math.round((n.sugar_per_100g ?? 0) * 10) / 10,
        sodium: Math.round((n.sodium_per_100g ?? 0) * 10) / 10,
      };
      return json(buildResponse(
        barcode, n.name, n.brand, per100g,
        n.serving_size_g ?? 100,
        n.serving_description || `${n.serving_size_g ?? 100}g`,
        "cache",
      ));
    }

    // ── STEP 2: FatSecret (food.find_id_for_barcode → food.get) ──
    try {
      console.log("[barcode-lookup] Trying FatSecret for:", barcode);
      const token = await getAccessToken();
      const ean = normalizeBarcode(barcode);

      let foodId: string | null = null;

      // Try EAN-13 first
      const barcodeData = await fatSecretAPI("food.find_id_for_barcode.v2", { barcode: ean }, token);
      foodId = barcodeData?.food_id?.value ?? null;

      // Retry with original if EAN normalization changed it
      if (!foodId && ean !== barcode) {
        const retry = await fatSecretAPI("food.find_id_for_barcode.v2", { barcode }, token);
        foodId = retry?.food_id?.value ?? null;
      }

      if (foodId) {
        const detail = await fatSecretAPI("food.get.v4", { food_id: foodId }, token);
        const mapped = detail?.food ? mapFatSecretFood(detail.food) : null;

        if (mapped) {
          console.log("[barcode-lookup] FatSecret hit:", mapped.name);
          const per100g = {
            calories: mapped.calories_per_100g,
            protein: mapped.protein_per_100g,
            carbs: mapped.carbs_per_100g,
            fat: mapped.fat_per_100g,
            fiber: mapped.fiber_per_100g,
            sugar: mapped.sugar_per_100g,
            sodium: mapped.sodium_per_100g,
          };

          await cacheInFoods(supabase, barcode, mapped.name, mapped.brand, per100g,
            mapped.serving_size_g, mapped.serving_description, "fatsecret", mapped.data_quality_score);

          return json(buildResponse(barcode, mapped.name, mapped.brand, per100g,
            mapped.serving_size_g, mapped.serving_description, "fatsecret"));
        }
      }
    } catch (fsErr) {
      console.warn("[barcode-lookup] FatSecret failed:", fsErr);
    }

    // ── STEP 3: Open Food Facts (world, v2) ──
    try {
      console.log("[barcode-lookup] Trying OpenFoodFacts for:", barcode);
      const offRes = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${barcode}`,
        { signal: AbortSignal.timeout(8000), headers: { Accept: "application/json" } },
      );

      if (offRes.ok) {
        const offData = await offRes.json();
        if (offData.status === "success" && offData.product?.product_name) {
          const p = offData.product;
          const n = p.nutriments ?? {};
          const name = p.product_name_en || p.product_name;
          const brand = p.brands ? p.brands.split(",")[0].trim() : null;
          const energyKcal = n["energy-kcal_100g"] ?? (n["energy_100g"] != null ? n["energy_100g"] / 4.184 : 0);
          const rawServing = p.serving_size ?? "";
          const servingG = parseServingGrams(rawServing) ?? 100;

          console.log("[barcode-lookup] OFF hit:", name);

          const per100g = {
            calories: Math.round(energyKcal),
            protein: Math.round((n.proteins_100g ?? 0) * 10) / 10,
            carbs: Math.round((n.carbohydrates_100g ?? 0) * 10) / 10,
            fat: Math.round((n.fat_100g ?? 0) * 10) / 10,
            fiber: Math.round((n.fiber_100g ?? 0) * 10) / 10,
            sugar: Math.round((n.sugars_100g ?? 0) * 10) / 10,
            sodium: Math.round((n.sodium_100g ?? 0) * 1000 * 10) / 10, // g → mg for display
          };

          await cacheInFoods(supabase, barcode, name, brand, per100g, servingG,
            rawServing || `${servingG}g`, "open_food_facts", 40);

          return json(buildResponse(barcode, name, brand, per100g, servingG,
            rawServing || `${servingG}g`, "open_food_facts"));
        }
      }
    } catch (offErr) {
      console.warn("[barcode-lookup] OpenFoodFacts failed:", offErr);
    }

    // ── STEP 4: USDA GTIN lookup (final fallback) ──
    try {
      const usdaKey = Deno.env.get("USDA_API_KEY");
      if (usdaKey) {
        const usdaRes = await fetch(
          `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(barcode)}&pageSize=1&api_key=${usdaKey}`,
          { signal: AbortSignal.timeout(5000) },
        );
        if (usdaRes.ok) {
          const usdaData = await usdaRes.json();
          const item = usdaData?.foods?.[0];
          if (item && item.gtinUpc === barcode) {
            const nutrients = item.foodNutrients ?? [];
            const get = (name: string) => nutrients.find((n: any) => n.nutrientName === name)?.value ?? 0;
            const servingG = item.servingSize || 100;
            const per100g = {
              calories: Math.round(get("Energy")),
              protein: Math.round(get("Protein") * 10) / 10,
              carbs: Math.round(get("Carbohydrate, by difference") * 10) / 10,
              fat: Math.round(get("Total lipid (fat)") * 10) / 10,
              fiber: Math.round(get("Fiber, total dietary") * 10) / 10,
              sugar: Math.round(get("Sugars, total including NLEA") * 10) / 10,
              sodium: Math.round(get("Sodium, Na") * 10) / 10,
            };
            const servingLabel = `${servingG}${item.servingSizeUnit || "g"}`;

            await cacheInFoods(supabase, barcode, item.description || "Unknown Product",
              item.brandOwner || item.brandName || null, per100g, servingG, servingLabel, "usda", 100);

            return json(buildResponse(barcode, item.description || "Unknown Product",
              item.brandOwner || item.brandName || null, per100g, servingG, servingLabel, "usda"));
          }
        }
      }
    } catch (usdaErr) {
      console.warn("[barcode-lookup] USDA fallback failed:", usdaErr);
    }

    // ── STEP 5: Not found ──
    return json({ found: false, barcode });
  } catch (e) {
    console.error("barcode-lookup error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
