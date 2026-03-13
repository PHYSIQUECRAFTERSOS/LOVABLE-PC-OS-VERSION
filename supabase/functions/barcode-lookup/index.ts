import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

    // ── STEP 1: Open Food Facts (v0 — stable, works for most barcodes) ──
    const offUrl = `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    let offData: any = null;
    try {
      const response = await fetch(offUrl, {
        headers: {
          "User-Agent": "PhysiqueCrafters/1.0 - contact@physiquecrafters.com",
          "Accept": "application/json",
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        offData = await response.json();
      } else {
        console.error("OFF API status:", response.status);
      }
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      console.error("OFF fetch error:", fetchErr);
    }

    if (offData?.status === 1 && offData.product?.product_name) {
      const p = offData.product;
      const n = p.nutriments || {};

      const product = {
        found: true,
        barcode,
        name: p.product_name_en || p.product_name || "Unknown Product",
        brand: p.brands ? p.brands.split(",")[0].trim() : null,
        serving_size: p.serving_size || "100g",
        serving_quantity: p.serving_quantity || 100,
        per_100g: {
          calories: Math.round(n["energy-kcal_100g"] || (n["energy_100g"] ? n["energy_100g"] / 4.184 : 0) || 0),
          protein: Math.round((n.proteins_100g || 0) * 10) / 10,
          carbs: Math.round((n.carbohydrates_100g || 0) * 10) / 10,
          fat: Math.round((n.fat_100g || 0) * 10) / 10,
          fiber: Math.round((n.fiber_100g || 0) * 10) / 10,
          sugar: Math.round((n.sugars_100g || 0) * 10) / 10,
          sodium: Math.round((n.sodium_100g || 0) * 1000) / 10,
        },
        per_serving: {
          calories: Math.round(n["energy-kcal_serving"] || 0),
          protein: Math.round((n.proteins_serving || 0) * 10) / 10,
          carbs: Math.round((n.carbohydrates_serving || 0) * 10) / 10,
          fat: Math.round((n.fat_serving || 0) * 10) / 10,
          fiber: Math.round((n.fiber_serving || 0) * 10) / 10,
          sugar: Math.round((n.sugars_serving || 0) * 10) / 10,
          sodium: Math.round((n.sodium_serving || 0) * 1000) / 10,
        },
        // Include micronutrients if available from OFF
        micros_per_100g: {
          vitamin_a_mcg: n["vitamin-a_100g"] ?? null,
          vitamin_c_mg: n["vitamin-c_100g"] ?? null,
          vitamin_d_mcg: n["vitamin-d_100g"] ?? null,
          vitamin_e_mg: n["vitamin-e_100g"] ?? null,
          vitamin_k_mcg: n["vitamin-k_100g"] ?? null,
          vitamin_b1_mg: n["vitamin-b1_100g"] ?? null,
          vitamin_b2_mg: n["vitamin-b2_100g"] ?? null,
          vitamin_b3_mg: n["vitamin-pp_100g"] ?? null,
          vitamin_b5_mg: n["pantothenic-acid_100g"] ?? null,
          vitamin_b6_mg: n["vitamin-b6_100g"] ?? null,
          vitamin_b9_mcg: n["vitamin-b9_100g"] ?? null,
          vitamin_b12_mcg: n["vitamin-b12_100g"] ?? null,
          calcium_mg: n["calcium_100g"] ? n["calcium_100g"] * 1000 : null,
          iron_mg: n["iron_100g"] ? n["iron_100g"] * 1000 : null,
          magnesium_mg: n["magnesium_100g"] ? n["magnesium_100g"] * 1000 : null,
          phosphorus_mg: n["phosphorus_100g"] ? n["phosphorus_100g"] * 1000 : null,
          potassium_mg: n["potassium_100g"] ? n["potassium_100g"] * 1000 : null,
          zinc_mg: n["zinc_100g"] ? n["zinc_100g"] * 1000 : null,
          selenium_mcg: n["selenium_100g"] ? n["selenium_100g"] * 1000000 : null,
          copper_mg: n["copper_100g"] ? n["copper_100g"] * 1000 : null,
          manganese_mg: n["manganese_100g"] ? n["manganese_100g"] * 1000 : null,
          iodine_mcg: n["iodine_100g"] ? n["iodine_100g"] * 1000000 : null,
          omega_3: n["omega-3-fat_100g"] ?? null,
          omega_6: n["omega-6-fat_100g"] ?? null,
        },
      };

      return new Response(JSON.stringify(product), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── STEP 2: UPC Item DB fallback ──
    try {
      const upcController = new AbortController();
      const upcTimeout = setTimeout(() => upcController.abort(), 6000);
      const upcRes = await fetch(
        `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`,
        { signal: upcController.signal }
      );
      clearTimeout(upcTimeout);

      if (upcRes.ok) {
        const upcData = await upcRes.json();
        if (upcData.code === "OK" && upcData.items?.length > 0) {
          const item = upcData.items[0];
          return new Response(JSON.stringify({
            found: true,
            barcode,
            name: item.title || "Unknown Product",
            brand: item.brand || null,
            serving_size: "1 serving",
            serving_quantity: 100,
            per_100g: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0 },
            per_serving: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0 },
            source: "upc_item_db",
            no_nutrition_data: true,
          }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    } catch (upcErr) {
      console.warn("UPC Item DB fallback failed:", upcErr);
    }

    // ── STEP 3: Not found ──
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
