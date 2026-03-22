import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// USDA FoodData Central API
const USDA_BASE = "https://api.nal.usda.gov/fdc/v1";
const USDA_API_KEY = Deno.env.get("USDA_API_KEY") || "DEMO_KEY";

// Nutrient ID mapping from USDA FoodData Central
const NUTRIENT_MAP: Record<number, string> = {
  1008: "calories",
  1003: "protein",
  1005: "carbs",
  1004: "fat",
  1079: "fiber",
  2000: "total_sugars",
  1063: "added_sugars",
  1258: "saturated_fat",
  1292: "monounsaturated_fat",
  1293: "polyunsaturated_fat",
  1257: "trans_fat",
  1253: "cholesterol",
  1093: "sodium",
  1104: "vitamin_a_mcg",
  1162: "vitamin_c_mg",
  1114: "vitamin_d_mcg",
  1109: "vitamin_e_mg",
  1185: "vitamin_k_mcg",
  1165: "vitamin_b1_mg",
  1166: "vitamin_b2_mg",
  1167: "vitamin_b3_mg",
  1170: "vitamin_b5_mg",
  1175: "vitamin_b6_mg",
  1176: "vitamin_b7_mcg",
  1177: "vitamin_b9_mcg",
  1178: "vitamin_b12_mcg",
  1087: "calcium_mg",
  1089: "iron_mg",
  1090: "magnesium_mg",
  1091: "phosphorus_mg",
  1092: "potassium_mg",
  1095: "zinc_mg",
  1098: "copper_mg",
  1101: "manganese_mg",
  1103: "selenium_mcg",
  1096: "chromium_mcg",
  1102: "molybdenum_mcg",
  1100: "iodine_mcg",
  // Omega-3 (ALA + EPA + DHA)
  1404: "omega_3_ala",
  1278: "omega_3_epa",
  1272: "omega_3_dha",
  // Omega-6
  1269: "omega_6_la",
  1316: "omega_6_aa",
};

function extractNutrients(foodNutrients: any[]): Record<string, number> {
  const result: Record<string, number> = {};
  
  for (const fn of foodNutrients) {
    const nutrientId = fn.nutrientId || fn.nutrient?.id;
    const amount = fn.amount || fn.value || 0;
    const key = NUTRIENT_MAP[nutrientId];
    if (key) {
      result[key] = Math.round(amount * 100) / 100;
    }
  }

  // Combine omega-3 sources
  result.omega_3 = (result.omega_3_ala || 0) + (result.omega_3_epa || 0) + (result.omega_3_dha || 0);
  result.omega_6 = (result.omega_6_la || 0) + (result.omega_6_aa || 0);
  
  // Net carbs
  result.net_carbs = Math.max(0, (result.carbs || 0) - (result.fiber || 0));

  // Clean up temp keys
  delete result.omega_3_ala;
  delete result.omega_3_epa;
  delete result.omega_3_dha;
  delete result.omega_6_la;
  delete result.omega_6_aa;

  return result;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, query, fdcId, pageSize } = await req.json();

    if (action === "search") {
      const url = `${USDA_BASE}/foods/search?api_key=${USDA_API_KEY}&query=${encodeURIComponent(query)}&pageSize=${pageSize || 15}&dataType=Foundation,SR Legacy,Branded`;
      
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`USDA API error: ${resp.status}`);
      const data = await resp.json();

      const foods = (data.foods || []).map((f: any) => {
        const nutrients = extractNutrients(f.foodNutrients || []);
        return {
          fdcId: f.fdcId,
          description: f.description,
          brandOwner: f.brandOwner || null,
          brandName: f.brandName || null,
          dataType: f.dataType,
          servingSize: f.servingSize || 100,
          servingSizeUnit: f.servingSizeUnit || "g",
          ...nutrients,
        };
      });

      return new Response(JSON.stringify({ foods, totalHits: data.totalHits }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "detail") {
      const url = `${USDA_BASE}/food/${fdcId}?api_key=${USDA_API_KEY}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`USDA API error: ${resp.status}`);
      const f = await resp.json();

      const nutrients = extractNutrients(f.foodNutrients || []);
      
      return new Response(JSON.stringify({
        fdcId: f.fdcId,
        description: f.description,
        brandOwner: f.brandOwner || null,
        dataType: f.dataType,
        servingSize: f.servingSize || 100,
        servingSizeUnit: f.servingSizeUnit || "g",
        foodCategory: f.foodCategory?.description || null,
        ingredients: f.ingredients || null,
        ...nutrients,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("usda-food-search error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
