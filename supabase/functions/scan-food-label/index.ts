import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are a nutrition label reader. Extract all nutrition information visible on this food label. Return only a JSON object with these exact keys: food_name, brand, serving_size_value (number only), serving_size_unit (g, ml, oz, cup, scoop, slice, tsp, tbsp, bar, bottle, or unit), calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg. If a field is not visible on the label, return null for that field. Return only the JSON object with no preamble, no explanation, and no markdown formatting.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const { image_base64, mime_type } = await req.json();

    if (!image_base64 || typeof image_base64 !== "string") {
      return new Response(
        JSON.stringify({ error: "no_label_detected", message: "No image provided. Please try again." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const mimeType = mime_type || "image/jpeg";
    const imageUrl = `data:${mimeType};base64,${image_base64}`;

    // Try with Gemini Pro first (best vision), then Flash fallback
    const models = [
      { model: "google/gemini-2.5-pro", timeout: 25000 },
      { model: "google/gemini-2.5-flash", timeout: 15000 },
    ];

    let lastError = "";

    for (const { model, timeout } of models) {
      try {
        console.log(`[scan-food-label] Trying ${model}`);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);

        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              {
                role: "user",
                content: [
                  { type: "text", text: "Read the nutrition label in this image and extract all values." },
                  { type: "image_url", image_url: { url: imageUrl } },
                ],
              },
            ],
            temperature: 0.1,
            max_tokens: 1500,
          }),
        });

        clearTimeout(timer);

        if (!response.ok) {
          const errText = await response.text();
          console.error(`[scan-food-label] ${model} error:`, response.status, errText);

          if (response.status === 429) {
            return new Response(
              JSON.stringify({ error: "api_error", message: "Rate limit exceeded. Please try again shortly." }),
              { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          if (response.status === 402) {
            return new Response(
              JSON.stringify({ error: "api_error", message: "AI usage limit reached. Please contact your coach." }),
              { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          lastError = `${model}: ${response.status}`;
          continue;
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || "";

        // Extract JSON from response (handle markdown code blocks)
        let jsonStr = content;
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
          jsonStr = jsonMatch[1].trim();
        }

        let result;
        try {
          result = JSON.parse(jsonStr);
        } catch {
          console.error(`[scan-food-label] ${model} JSON parse failed:`, content);
          lastError = `${model}: Could not parse response`;
          continue;
        }

        // Validate we got at least a food name or some nutrition data
        const hasData = result.food_name || result.calories != null || result.protein_g != null;
        if (!hasData) {
          lastError = `${model}: No nutrition data extracted`;
          continue;
        }

        console.log(`[scan-food-label] Success with ${model}:`, result.food_name);
        return new Response(JSON.stringify({ data: result, error: null }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        lastError = `${model}: ${msg}`;
        console.error(`[scan-food-label] ${lastError}`);
      }
    }

    // All models failed
    console.error(`[scan-food-label] All models failed. Last: ${lastError}`);
    return new Response(
      JSON.stringify({
        error: "no_label_detected",
        message: "No nutrition label found in this image. Please try again with a clearer photo.",
        data: null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[scan-food-label] Fatal error:", e);
    return new Response(
      JSON.stringify({ error: "api_error", message: "Unable to read label. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
