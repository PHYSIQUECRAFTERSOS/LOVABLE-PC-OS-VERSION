import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { query, limit = 25, user_id } = await req.json();
    const q = (query ?? "").trim();

    if (!q || q.length < 2) {
      return new Response(JSON.stringify({ foods: [], source: "empty" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Step 1: Search local cache
    const { data: localResults } = await supabase
      .from("foods")
      .select("*")
      .or(`name.ilike.%${q}%,brand.ilike.%${q}%`)
      .order("popularity_score", { ascending: false })
      .order("is_verified", { ascending: false })
      .limit(limit);

    const localFoods = localResults ?? [];

    // Log search (fire and forget)
    if (user_id) {
      supabase.from("food_search_log").insert({
        query: q,
        results_count: localFoods.length,
        user_id,
      }).then(() => {});
    }

    // Step 2: If enough local results, return immediately
    if (localFoods.length >= 5) {
      return new Response(JSON.stringify({ foods: localFoods, source: "cache" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 3: Hit Open Food Facts API
    const offUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=25&sort_by=unique_scans_n&fields=code,product_name,brands,nutriments,serving_size,image_front_small_url`;

    let offFoods: any[] = [];

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);

      const offResponse = await fetch(offUrl, {
        headers: { "User-Agent": "PhysiqueCraftersOS/1.0" },
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (offResponse.ok) {
        const offData = await offResponse.json();
        const products = offData.products ?? [];

        offFoods = products
          .filter((p: any) => p.product_name && p.nutriments)
          .map((p: any) => {
            const n = p.nutriments;
            return {
              off_id: p.code ?? null,
              name: p.product_name?.trim() ?? "Unknown",
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
              popularity_score: 0,
            };
          })
          .filter((f: any) => f.calories_per_100g !== null && f.off_id);

        // Step 4: Cache new foods (upsert by off_id)
        if (offFoods.length > 0) {
          await supabase
            .from("foods")
            .upsert(offFoods, { onConflict: "off_id", ignoreDuplicates: true });
        }
      }
    } catch (offErr) {
      console.warn("OFF API failed, returning local only:", offErr);
    }

    // Step 5: Merge local + OFF, deduplicate
    const existingOffIds = new Set(localFoods.map((f: any) => f.off_id).filter(Boolean));
    const newOffFoods = offFoods.filter((f) => !existingOffIds.has(f.off_id));
    const merged = [...localFoods, ...newOffFoods].slice(0, limit);

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
