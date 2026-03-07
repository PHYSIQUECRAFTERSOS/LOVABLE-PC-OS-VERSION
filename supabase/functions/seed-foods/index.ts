import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SEED_QUERIES = [
  "chicken breast", "ground beef", "salmon", "tuna", "eggs",
  "oats", "white rice", "sweet potato", "broccoli", "spinach",
  "greek yogurt", "cottage cheese", "whey protein", "whole milk",
  "banana", "apple", "orange", "blueberries", "strawberries",
  "avocado", "almonds", "peanut butter", "olive oil",
  "whole wheat bread", "english muffin", "pasta", "quinoa",
  "black beans", "lentils", "tofu", "turkey breast",
  "cheddar cheese", "mozzarella", "cream cheese",
  "tilapia", "shrimp", "cod", "protein bar", "beef steak",
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let total = 0;

  for (const seedQuery of SEED_QUERIES) {
    try {
      const offUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(seedQuery)}&search_simple=1&action=process&json=1&page_size=10&sort_by=unique_scans_n&fields=code,product_name,brands,nutriments,serving_size,image_front_small_url`;

      const res = await fetch(offUrl, {
        headers: { "User-Agent": "PhysiqueCraftersOS/1.0 (contact@physiquecrafters.com)" },
      });

      if (!res.ok) continue;

      const data = await res.json();
      const foods = (data.products ?? [])
        .filter((p: any) => p.product_name && p.nutriments?.["energy-kcal_100g"] && p.code)
        .map((p: any) => ({
          off_id: p.code,
          name: p.product_name?.trim(),
          brand: p.brands?.split(",")[0]?.trim() ?? null,
          calories_per_100g: p.nutriments["energy-kcal_100g"],
          protein_per_100g: p.nutriments["proteins_100g"] ?? null,
          carbs_per_100g: p.nutriments["carbohydrates_100g"] ?? null,
          fat_per_100g: p.nutriments["fat_100g"] ?? null,
          fiber_per_100g: p.nutriments["fiber_100g"] ?? null,
          sugar_per_100g: p.nutriments["sugars_100g"] ?? null,
          sodium_per_100g: p.nutriments["sodium_100g"] ? p.nutriments["sodium_100g"] * 1000 : null,
          serving_size_g: parseFloat(p.serving_size) || 100,
          serving_unit: "g",
          image_url: p.image_front_small_url ?? null,
          barcode: p.code ?? null,
          is_branded: !!(p.brands),
          is_verified: true,
          is_custom: false,
          source: "open_food_facts",
          popularity_score: 10,
        }));

      if (foods.length > 0) {
        await supabase.from("foods").upsert(foods, {
          onConflict: "off_id",
          ignoreDuplicates: true,
        });
        total += foods.length;
      }

      // Rate limit
      await new Promise((r) => setTimeout(r, 300));
    } catch (e) {
      console.error(`Seed failed for ${seedQuery}:`, e);
    }
  }

  return new Response(JSON.stringify({ seeded: total }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
