import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, pageSize = 20 } = await req.json();
    if (!query || query.length < 2) {
      return new Response(JSON.stringify({ foods: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const cacheKey = query.toLowerCase().trim();

    // Check cache first
    const { data: cached } = await supabase
      .from("food_cache")
      .select("results")
      .eq("query_key", cacheKey)
      .eq("source", "open_food_facts")
      .gt("expires_at", new Date().toISOString())
      .limit(1)
      .maybeSingle();

    if (cached?.results) {
      return new Response(JSON.stringify({ foods: cached.results, fromCache: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch from Open Food Facts
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=${pageSize}&sort_by=unique_scans_n`;
    
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "PhysiqueCraftersOS/1.0 (app.physiquecrafters.com)" },
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      throw new Error(`OFF API error: ${resp.status}`);
    }

    const data = await resp.json();
    const products = data.products || [];

    const foods = products
      .filter((p: any) => p.product_name && p.nutriments)
      .map((p: any) => ({
        name: p.product_name_en || p.product_name,
        brand: p.brands ? p.brands.split(',')[0].trim() : null,
        calories: Math.round(p.nutriments["energy-kcal_100g"] || p.nutriments["energy-kcal"] || 0),
        protein: Math.round((p.nutriments.proteins_100g || 0) * 10) / 10,
        carbs: Math.round((p.nutriments.carbohydrates_100g || 0) * 10) / 10,
        fat: Math.round((p.nutriments.fat_100g || 0) * 10) / 10,
        fiber: Math.round((p.nutriments.fiber_100g || 0) * 10) / 10,
        sugar: Math.round((p.nutriments.sugars_100g || 0) * 10) / 10,
        sodium: Math.round((p.nutriments.sodium_100g || 0) * 1000),
        serving_size: parseFloat(p.serving_size) || 100,
        serving_unit: "g",
        category: (p.categories_tags && p.categories_tags[0]) || null,
        barcode: p.code || null,
        source: "open_food_facts",
      }))
      .filter((f: any) => f.calories > 0 || f.protein > 0 || f.carbs > 0 || f.fat > 0);

    // Cache results (ignore errors)
    if (foods.length > 0) {
      await supabase.from("food_cache").upsert({
        query_key: cacheKey,
        source: "open_food_facts",
        results: foods,
        cached_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: "query_key,source" }).catch(() => {});
    }

    return new Response(JSON.stringify({ foods, fromCache: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("open-food-facts-search error:", e);
    return new Response(JSON.stringify({ foods: [], error: e.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
