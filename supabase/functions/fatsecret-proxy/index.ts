import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── In-memory OAuth token cache ──
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
  // Expire 5 min early to be safe
  tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;
  return cachedToken!;
}

async function fatSecretAPI(method: string, params: Record<string, string>, token: string): Promise<any> {
  const searchParams = new URLSearchParams({
    method,
    format: "json",
    ...params,
  });

  const res = await fetch("https://platform.fatsecret.com/rest/server.api", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: searchParams.toString(),
    signal: AbortSignal.timeout(3000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FatSecret API error: ${res.status} ${text}`);
  }

  return res.json();
}

// ── Normalize barcode to EAN-13 ──
function normalizeBarcode(barcode: string): string {
  const clean = barcode.replace(/\D/g, "");
  if (clean.length === 12) return "0" + clean; // UPC-A → EAN-13
  return clean;
}

// ── Map FatSecret food to our per-100g schema ──
function mapFatSecretFood(food: any): any | null {
  const servings = food.servings?.serving;
  if (!servings) return null;

  // Get the metric serving (prefer "per 100g" or the metric one)
  const servingList = Array.isArray(servings) ? servings : [servings];

  // Find a gram-based serving for per-100g conversion
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

  // Build additional serving sizes from all servings
  const additional: Array<{ description: string; size_g: number }> = [];
  for (const s of servingList) {
    const desc = s.serving_description || s.measurement_description;
    const grams = parseFloat(s.metric_serving_amount) || 0;
    if (desc && grams > 0) {
      additional.push({ description: desc, size_g: grams });
    }
  }
  if (!additional.find(a => a.description === "100g")) {
    additional.push({ description: "100g", size_g: 100 });
  }

  // Primary serving
  const primaryServing = servingList[0];
  const primaryDesc = primaryServing?.serving_description || `${metricAmount}g`;
  const primarySizeG = parseFloat(primaryServing?.metric_serving_amount) || metricAmount;

  return {
    fatsecret_id: String(food.food_id),
    name: food.food_name?.trim() || "Unknown",
    brand: food.brand_name?.trim() || null,
    calories_per_100g: Math.round(calories * factor),
    protein_per_100g: Math.round(protein * factor * 10) / 10,
    carbs_per_100g: Math.round(carbs * factor * 10) / 10,
    fat_per_100g: Math.round(fat * factor * 10) / 10,
    fiber_per_100g: metricServing.fiber ? Math.round(parseFloat(metricServing.fiber) * factor * 10) / 10 : null,
    sugar_per_100g: metricServing.sugar ? Math.round(parseFloat(metricServing.sugar) * factor * 10) / 10 : null,
    sodium_per_100g: metricServing.sodium ? Math.round(parseFloat(metricServing.sodium) * factor * 10) / 10 : null,
    serving_size_g: primarySizeG,
    serving_unit: "g",
    serving_description: primaryDesc,
    household_serving_fulltext: primaryDesc,
    additional_serving_sizes: additional,
    image_url: null,
    barcode: null,
    is_branded: !!food.brand_name,
    is_verified: false,
    is_custom: false,
    source: "fatsecret",
    language_code: "en",
    country_code: "US",
    has_complete_macros: true,
    data_quality_score: food.brand_name ? 70 : 50,
    popularity_score: 0,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, query, barcode, limit = 20 } = await req.json();
    const token = await getAccessToken();

    // ── SEARCH ──
    if (action === "search") {
      if (!query || query.length < 2) {
        return new Response(JSON.stringify({ foods: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await fatSecretAPI("foods.search.v3", {
        search_expression: query,
        max_results: String(Math.min(limit, 50)),
      }, token);

      console.log("[fatsecret-proxy] Search response keys:", JSON.stringify(Object.keys(data || {})));
      const searchRoot = data?.foods_search ?? data?.foods ?? data;
      console.log("[fatsecret-proxy] Search root keys:", JSON.stringify(Object.keys(searchRoot || {})));
      
      // FatSecret v3 may return foods_search.results.food OR foods_search.foods.food
      const rawFoods = searchRoot?.results?.food ?? searchRoot?.foods?.food ?? searchRoot?.food;
      console.log("[fatsecret-proxy] Raw foods count:", Array.isArray(rawFoods) ? rawFoods.length : rawFoods ? 1 : 0);

      if (!rawFoods) {
        console.log("[fatsecret-proxy] Full response sample:", JSON.stringify(data).slice(0, 500));
        return new Response(JSON.stringify({ foods: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const foodList = Array.isArray(rawFoods) ? rawFoods : [rawFoods];

      // For each food, get full details with servings
      const detailedFoods = await Promise.allSettled(
        foodList.slice(0, limit).map(async (f: any) => {
          try {
            const detail = await fatSecretAPI("food.get.v4", {
              food_id: f.food_id,
              include_food_images: "true",
            }, token);
            return detail?.food || f;
          } catch {
            return f;
          }
        })
      );

      const foods = detailedFoods
        .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled")
        .map(r => mapFatSecretFood(r.value))
        .filter(Boolean);

      return new Response(JSON.stringify({ foods, source: "fatsecret" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── BARCODE ──
    if (action === "barcode") {
      if (!barcode) {
        return new Response(JSON.stringify({ found: false }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const ean = normalizeBarcode(barcode);

      // Step 1: Find food_id by barcode
      const barcodeData = await fatSecretAPI("food.find_id_for_barcode.v2", {
        barcode: ean,
      }, token);

      const foodId = barcodeData?.food_id?.value;
      if (!foodId) {
        // Try original barcode too
        if (ean !== barcode) {
          const retry = await fatSecretAPI("food.find_id_for_barcode.v2", {
            barcode: barcode,
          }, token);
          const retryId = retry?.food_id?.value;
          if (!retryId) {
            return new Response(JSON.stringify({ found: false, barcode }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          // Use retryId
          const detail = await fatSecretAPI("food.get.v4", {
            food_id: retryId,
            include_food_images: "true",
          }, token);
          const mapped = detail?.food ? mapFatSecretFood(detail.food) : null;
          if (!mapped) {
            return new Response(JSON.stringify({ found: false, barcode }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          mapped.barcode = barcode;
          return new Response(JSON.stringify({ found: true, food: mapped }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ found: false, barcode }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Step 2: Get full food details
      const detail = await fatSecretAPI("food.get.v4", {
        food_id: foodId,
        include_food_images: "true",
      }, token);

      const mapped = detail?.food ? mapFatSecretFood(detail.food) : null;
      if (!mapped) {
        return new Response(JSON.stringify({ found: false, barcode }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      mapped.barcode = barcode;

      return new Response(JSON.stringify({ found: true, food: mapped }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── AUTOCOMPLETE ──
    if (action === "autocomplete") {
      if (!query || query.length < 2) {
        return new Response(JSON.stringify({ suggestions: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await fatSecretAPI("foods.autocomplete.v2", {
        expression: query,
        max_results: "10",
      }, token);

      const suggestions = data?.suggestions?.suggestion ?? [];
      return new Response(JSON.stringify({ suggestions: Array.isArray(suggestions) ? suggestions : [suggestions] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action. Use: search, barcode, autocomplete" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("fatsecret-proxy error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
