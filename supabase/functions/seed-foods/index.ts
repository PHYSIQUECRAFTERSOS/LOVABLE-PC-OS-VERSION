import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SEED_QUERIES = [
  "chicken breast", "ground beef 93 lean", "salmon fillet", "canned tuna",
  "large eggs", "egg whites", "oats", "white rice cooked", "brown rice",
  "sweet potato", "broccoli", "spinach raw", "greek yogurt plain",
  "cottage cheese", "whey protein powder", "whole milk", "2% milk",
  "banana", "apple", "orange", "blueberries", "strawberries",
  "avocado", "almonds", "peanut butter", "olive oil",
  "whole wheat bread", "english muffin", "pasta cooked", "quinoa",
  "black beans", "lentils", "tofu", "turkey breast", "tilapia",
  "shrimp", "cod fillet", "cheddar cheese", "mozzarella",
  "cream cheese", "butter", "beef sirloin", "pork tenderloin",
  "edamame", "hummus", "protein bar",
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const usdaApiKey = Deno.env.get("USDA_API_KEY") ?? "";
  if (!usdaApiKey) {
    return new Response(JSON.stringify({ error: "USDA_API_KEY not set. Add it in Lovable Cloud secrets." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let total = 0;

  for (const seedQuery of SEED_QUERIES) {
    try {
      const usdaUrl = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(seedQuery)}&pageSize=10&api_key=${usdaApiKey}`;
      const res = await fetch(usdaUrl, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) continue;

      const data = await res.json();
      const foods = (data.foods ?? []).map((item: any) => {
        const nutrients = item.foodNutrients ?? [];
        const get = (name: string) => nutrients.find((n: any) => n.nutrientName === name)?.value ?? null;

        const protein = get("Protein");
        const carbs = get("Carbohydrate, by difference");
        const fat = get("Total lipid (fat)");
        if ((protein ?? 0) + (carbs ?? 0) + (fat ?? 0) === 0) return null;

        return {
          usda_fdc_id: String(item.fdcId),
          name: item.description?.trim(),
          brand: item.brandOwner?.trim() ?? item.brandName?.trim() ?? null,
          calories_per_100g: get("Energy"),
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
          popularity_score: 10,
        };
      }).filter(Boolean);

      if (foods.length > 0) {
        await supabase.from("foods").upsert(foods, {
          onConflict: "usda_fdc_id",
          ignoreDuplicates: true,
        });
        total += foods.length;
      }

      await new Promise((r) => setTimeout(r, 250));
    } catch (e) {
      console.error(`Seed failed for ${seedQuery}:`, e);
    }
  }

  return new Response(JSON.stringify({ seeded: total }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
