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

    // Query Open Food Facts API with timeout
    const offUrl = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=product_name,brands,nutriments,serving_size,serving_quantity,product_quantity`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    let response: Response;
    try {
      response = await fetch(offUrl, {
        headers: { "User-Agent": "PhysiqueCrafters/1.0 - contact@physiquecrafters.com" },
        signal: controller.signal,
      });
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      console.error("Fetch error:", fetchErr);
      // Return not-found instead of 502 so UI can handle gracefully
      return new Response(
        JSON.stringify({ found: false, barcode, error: "Food database temporarily unavailable" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error("OFF API status:", response.status);
      return new Response(
        JSON.stringify({ found: false, barcode, error: "Food database returned an error" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();

    if (data.status !== 1 || !data.product) {
      return new Response(
        JSON.stringify({ found: false, barcode }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const p = data.product;
    const n = p.nutriments || {};

    // Extract per-100g values (Open Food Facts standard)
    const product = {
      found: true,
      barcode,
      name: p.product_name || "Unknown Product",
      brand: p.brands || null,
      serving_size: p.serving_size || "100g",
      serving_quantity: p.serving_quantity || 100,
      per_100g: {
        calories: Math.round(n["energy-kcal_100g"] || n["energy_100g"] / 4.184 || 0),
        protein: Math.round((n.proteins_100g || 0) * 10) / 10,
        carbs: Math.round((n.carbohydrates_100g || 0) * 10) / 10,
        fat: Math.round((n.fat_100g || 0) * 10) / 10,
        fiber: Math.round((n.fiber_100g || 0) * 10) / 10,
        sugar: Math.round((n.sugars_100g || 0) * 10) / 10,
        sodium: Math.round((n.sodium_100g || 0) * 1000) / 10, // convert to mg
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
    };

    return new Response(JSON.stringify(product), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("barcode-lookup error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
