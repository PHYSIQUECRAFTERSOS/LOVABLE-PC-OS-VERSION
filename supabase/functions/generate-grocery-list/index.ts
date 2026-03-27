// Grocery list generation — categorizes meal plan foods via AI
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { client_id } = await req.json();
    if (!client_id) {
      return new Response(JSON.stringify({ error: "client_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Get all meal plans for this client (non-template)
    const { data: plans, error: planErr } = await supabase
      .from("meal_plans")
      .select("id")
      .eq("client_id", client_id)
      .eq("is_template", false);

    if (planErr) throw planErr;

    if (!plans || plans.length === 0) {
      return new Response(
        JSON.stringify({ error: "No meal plans found for this client" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const planIds = plans.map((p: any) => p.id);

    // Get all meal plan items with food names
    const { data: items, error: itemErr } = await supabase
      .from("meal_plan_items")
      .select("custom_name, food_item_id, food_items:food_item_id(name)")
      .in("meal_plan_id", planIds);

    if (itemErr) throw itemErr;

    if (!items || items.length === 0) {
      return new Response(
        JSON.stringify({ error: "No food items found in meal plans" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract unique food names
    const foodNames = new Set<string>();
    for (const item of items) {
      const name = item.custom_name || (item.food_items as any)?.name;
      if (name) foodNames.add(name.trim());
    }

    const uniqueFoods = Array.from(foodNames);

    // Call Lovable AI to categorize
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "You are a nutrition assistant. Categorize food items into grocery list categories. Use the tool provided to return the categorized list.",
          },
          {
            role: "user",
            content: `Categorize these foods from a meal plan into a grocery list. Foods: ${uniqueFoods.join(", ")}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "categorize_grocery_list",
              description: "Return a categorized grocery list from meal plan foods",
              parameters: {
                type: "object",
                properties: {
                  items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        category: {
                          type: "string",
                          enum: ["Protein", "Carbs", "Fats", "Vegetables", "Fruits"],
                        },
                        name: { type: "string" },
                      },
                      required: ["category", "name"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["items"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "categorize_grocery_list" } },
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const txt = await aiResponse.text();
      console.error("AI error:", status, txt);
      throw new Error("AI categorization failed");
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in AI response");

    const parsed = JSON.parse(toolCall.function.arguments);
    const categorizedItems = (parsed.items || []).map((item: any) => ({
      ...item,
      checked: false,
    }));

    // Upsert into grocery_lists
    const { data: existing } = await supabase
      .from("grocery_lists")
      .select("id")
      .eq("client_id", client_id)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("grocery_lists")
        .update({ items: categorizedItems, generated_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      await supabase
        .from("grocery_lists")
        .insert({ client_id, items: categorizedItems });
    }

    return new Response(JSON.stringify({ items: categorizedItems }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-grocery-list error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
