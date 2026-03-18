import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { barcode } = await req.json();

    if (!barcode || typeof barcode !== "string" || barcode.length < 4 || barcode.length > 20) {
      return new Response(
        JSON.stringify({ error: "Invalid barcode" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── STEP 1: Check local cache ──
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
      return new Response(JSON.stringify({
        found: true,
        barcode,
        name: n.name,
        brand: n.brand,
        serving_size: n.serving_description || `${n.serving_size_g ?? 100}g`,
        serving_quantity: n.serving_size_g ?? 100,
        per_100g: {
          calories: Math.round(n.calories_per_100g ?? 0),
          protein: Math.round((n.protein_per_100g ?? 0) * 10) / 10,
          carbs: Math.round((n.carbs_per_100g ?? 0) * 10) / 10,
          fat: Math.round((n.fat_per_100g ?? 0) * 10) / 10,
          fiber: Math.round((n.fiber_per_100g ?? 0) * 10) / 10,
          sugar: Math.round((n.sugar_per_100g ?? 0) * 10) / 10,
          sodium: Math.round((n.sodium_per_100g ?? 0) * 10) / 10,
        },
        per_serving: {
          calories: Math.round((n.calories_per_100g ?? 0) * (n.serving_size_g ?? 100) / 100),
          protein: Math.round((n.protein_per_100g ?? 0) * (n.serving_size_g ?? 100) / 100 * 10) / 10,
          carbs: Math.round((n.carbs_per_100g ?? 0) * (n.serving_size_g ?? 100) / 100 * 10) / 10,
          fat: Math.round((n.fat_per_100g ?? 0) * (n.serving_size_g ?? 100) / 100 * 10) / 10,
          fiber: Math.round((n.fiber_per_100g ?? 0) * (n.serving_size_g ?? 100) / 100 * 10) / 10,
          sugar: Math.round((n.sugar_per_100g ?? 0) * (n.serving_size_g ?? 100) / 100 * 10) / 10,
          sodium: Math.round((n.sodium_per_100g ?? 0) * (n.serving_size_g ?? 100) / 100 * 10) / 10,
        },
        source: "cache",
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── STEP 2: OpenFoodFacts barcode lookup ──
    try {
      console.log("[barcode-lookup] Trying OpenFoodFacts for:", barcode);
      const offRes = await fetch(
        `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`,
        { signal: AbortSignal.timeout(8000), headers: { "Accept": "application/json" } }
      );

      if (offRes.ok) {
        const offData = await offRes.json();
        if (offData.status === 1 && offData.product?.product_name) {
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
            sodium: Math.round((n.sodium_100g ?? 0) * 1000 * 10) / 10,
          };

          // Cache in foods table (non-fatal)
          try {
            await supabase.from("foods").upsert({
              name, brand, barcode,
              calories_per_100g: per100g.calories,
              protein_per_100g: per100g.protein,
              carbs_per_100g: per100g.carbs,
              fat_per_100g: per100g.fat,
              fiber_per_100g: per100g.fiber,
              sugar_per_100g: per100g.sugar,
              sodium_per_100g: per100g.sodium / 1000,
              serving_size_g: servingG,
              serving_unit: "g",
              serving_description: rawServing || `${servingG}g`,
              source: "open_food_facts",
              is_verified: false,
              has_complete_macros: true,
              data_quality_score: 40,
            }, { onConflict: "barcode", ignoreDuplicates: true });
          } catch { /* non-fatal */ }

          return new Response(JSON.stringify({
            found: true,
            barcode,
            name,
            brand,
            serving_size: rawServing || `${servingG}g`,
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
            source: "open_food_facts",
          }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    } catch (offErr) {
      console.warn("[barcode-lookup] OpenFoodFacts failed:", offErr);
    }

    // ── STEP 3: USDA GTIN lookup (fallback) ──
    try {
      const usdaKey = Deno.env.get("USDA_API_KEY");
      if (usdaKey) {
        const usdaRes = await fetch(
          `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(barcode)}&pageSize=1&api_key=${usdaKey}`,
          { signal: AbortSignal.timeout(5000) }
        );
        if (usdaRes.ok) {
          const usdaData = await usdaRes.json();
          const item = usdaData?.foods?.[0];
          if (item && item.gtinUpc === barcode) {
            const nutrients = item.foodNutrients ?? [];
            const get = (name: string) => nutrients.find((n: any) => n.nutrientName === name)?.value ?? 0;
            return new Response(JSON.stringify({
              found: true,
              barcode,
              name: item.description || "Unknown Product",
              brand: item.brandOwner || item.brandName || null,
              serving_size: `${item.servingSize || 100}${item.servingSizeUnit || "g"}`,
              serving_quantity: item.servingSize || 100,
              per_100g: {
                calories: Math.round(get("Energy")),
                protein: Math.round(get("Protein") * 10) / 10,
                carbs: Math.round(get("Carbohydrate, by difference") * 10) / 10,
                fat: Math.round(get("Total lipid (fat)") * 10) / 10,
                fiber: Math.round(get("Fiber, total dietary") * 10) / 10,
                sugar: Math.round(get("Sugars, total including NLEA") * 10) / 10,
                sodium: Math.round(get("Sodium, Na") * 10) / 10,
              },
              per_serving: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0 },
              source: "usda",
            }), {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
      }
    } catch (usdaErr) {
      console.warn("[barcode-lookup] USDA fallback failed:", usdaErr);
    }

    // ── STEP 4: Not found ──
    return new Response(
      JSON.stringify({ found: false, barcode }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("barcode-lookup error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

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