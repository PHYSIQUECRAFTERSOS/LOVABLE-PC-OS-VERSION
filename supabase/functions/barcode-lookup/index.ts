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

    // ── STEP 2: FatSecret barcode lookup ──
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

      const fsRes = await fetch(`${supabaseUrl}/functions/v1/fatsecret-proxy`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${anonKey}`,
        },
        body: JSON.stringify({ action: "barcode", barcode }),
        signal: AbortSignal.timeout(10000),
      });

      if (fsRes.ok) {
        const fsData = await fsRes.json();
        if (fsData.found && fsData.food) {
          const f = fsData.food;
          console.log("[barcode-lookup] FatSecret hit:", f.name);

          // Cache in foods table
          try {
            await supabase.from("foods").upsert({
              ...f,
              barcode,
            }, { onConflict: "fatsecret_id", ignoreDuplicates: true });
          } catch { /* non-fatal */ }

          return new Response(JSON.stringify({
            found: true,
            barcode,
            name: f.name,
            brand: f.brand,
            serving_size: f.serving_description || `${f.serving_size_g ?? 100}g`,
            serving_quantity: f.serving_size_g ?? 100,
            per_100g: {
              calories: f.calories_per_100g ?? 0,
              protein: f.protein_per_100g ?? 0,
              carbs: f.carbs_per_100g ?? 0,
              fat: f.fat_per_100g ?? 0,
              fiber: f.fiber_per_100g ?? 0,
              sugar: f.sugar_per_100g ?? 0,
              sodium: f.sodium_per_100g ?? 0,
            },
            per_serving: {
              calories: Math.round((f.calories_per_100g ?? 0) * (f.serving_size_g ?? 100) / 100),
              protein: Math.round((f.protein_per_100g ?? 0) * (f.serving_size_g ?? 100) / 100 * 10) / 10,
              carbs: Math.round((f.carbs_per_100g ?? 0) * (f.serving_size_g ?? 100) / 100 * 10) / 10,
              fat: Math.round((f.fat_per_100g ?? 0) * (f.serving_size_g ?? 100) / 100 * 10) / 10,
              fiber: Math.round((f.fiber_per_100g ?? 0) * (f.serving_size_g ?? 100) / 100 * 10) / 10,
              sugar: Math.round((f.sugar_per_100g ?? 0) * (f.serving_size_g ?? 100) / 100 * 10) / 10,
              sodium: Math.round((f.sodium_per_100g ?? 0) * (f.serving_size_g ?? 100) / 100 * 10) / 10,
            },
            source: "fatsecret",
          }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    } catch (fsErr) {
      console.warn("[barcode-lookup] FatSecret fallback failed:", fsErr);
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
