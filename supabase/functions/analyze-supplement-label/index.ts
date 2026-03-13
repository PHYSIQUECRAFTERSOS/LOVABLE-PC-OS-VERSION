import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const systemPrompt = `You are a supplement label reader. Analyze the image of a Supplement Facts or Nutrition Facts label and extract ALL information.

Return a JSON object using this exact tool call. Be precise with amounts and units.

Rules:
- Convert IU to mcg/mg where applicable (Vitamin D: 1 IU = 0.025 mcg, Vitamin A: 1 IU = 0.3 mcg RAE, Vitamin E: 1 IU = 0.67 mg)
- Use standard units: mg, mcg, g, IU
- If a value is listed as "0" or not present, omit it
- Extract the serving size exactly as shown (e.g., "1 capsule", "2 tablets", "1 scoop (5g)")
- For each vitamin/mineral, use the standardized key from this list:
  vitamin_a_mcg, vitamin_c_mg, vitamin_d_mcg, vitamin_e_mg, vitamin_k_mcg,
  vitamin_b1_mg, vitamin_b2_mg, vitamin_b3_mg, vitamin_b5_mg, vitamin_b6_mg,
  vitamin_b7_mcg, vitamin_b9_mcg, vitamin_b12_mcg,
  calcium_mg, iron_mg, magnesium_mg, phosphorus_mg, potassium_mg,
  zinc_mg, copper_mg, manganese_mg, selenium_mcg, chromium_mcg,
  molybdenum_mcg, iodine_mcg, omega_3, omega_6
- Also extract macros if present: calories, protein, carbs, fat, fiber, sugar, sodium`;

const toolDef = {
  type: "function",
  function: {
    name: "extract_supplement_facts",
    description: "Extract structured supplement facts from a label image",
    parameters: {
      type: "object",
      properties: {
        product_name: { type: "string", description: "Product name if visible" },
        serving_size: { type: "string", description: "Serving size as shown on label" },
        serving_unit: { type: "string", enum: ["capsule", "tablet", "scoop", "ml", "drop", "serving", "softgel", "lozenge"], description: "Type of serving unit" },
        servings_per_container: { type: "number", description: "Number of servings per container" },
        nutrients: {
          type: "object",
          description: "Nutrient amounts per serving using standardized keys",
          additionalProperties: { type: "number" },
        },
        confidence: { type: "string", enum: ["high", "medium", "low"], description: "Confidence in extraction accuracy" },
      },
      required: ["serving_size", "nutrients", "confidence"],
      additionalProperties: false,
    },
  },
};

async function callAI(image: string, model: string, timeoutMs: number): Promise<any> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
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
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract all supplement/nutrition facts from this label image. Read every line carefully." },
              { type: "image_url", image_url: { url: image } },
            ],
          },
        ],
        tools: [toolDef],
        tool_choice: { type: "function", function: { name: "extract_supplement_facts" } },
      }),
    });

    clearTimeout(timeout);
    return response;
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { image } = await req.json();
    if (!image || typeof image !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing image data" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Try with gemini-2.5-pro first (better at reading dense label text)
    // Fall back to gemini-3-flash-preview if pro fails
    const models = ["google/gemini-2.5-pro", "google/gemini-3-flash-preview"];
    let lastError = "";

    for (const model of models) {
      try {
        console.log(`[analyze-supplement-label] Trying model: ${model}`);
        const response = await callAI(image, model, model.includes("pro") ? 15000 : 12000);

        if (!response.ok) {
          const text = await response.text();
          console.error(`AI gateway error (${model}):`, response.status, text);

          if (response.status === 429) {
            return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
              status: 429,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          if (response.status === 402) {
            return new Response(JSON.stringify({ error: "AI usage limit reached. Please add credits." }), {
              status: 402,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          // For 400 "unable to process image", try next model
          if (response.status === 400) {
            lastError = `${model}: Unable to process image`;
            continue;
          }

          lastError = `${model}: AI analysis failed (${response.status})`;
          continue;
        }

        const data = await response.json();
        const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

        if (!toolCall?.function?.arguments) {
          lastError = `${model}: No structured response`;
          continue;
        }

        let extracted: any;
        try {
          extracted = typeof toolCall.function.arguments === "string"
            ? JSON.parse(toolCall.function.arguments)
            : toolCall.function.arguments;
        } catch {
          lastError = `${model}: Invalid JSON response`;
          continue;
        }

        const nutrientCount = Object.keys(extracted.nutrients || {}).length;
        if (nutrientCount === 0) {
          lastError = `${model}: No nutrients detected`;
          continue;
        }

        console.log(`[analyze-supplement-label] Success with ${model}: ${nutrientCount} nutrients`);
        return new Response(JSON.stringify({ extracted, error: null }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (modelErr) {
        console.error(`[analyze-supplement-label] ${model} error:`, modelErr);
        lastError = `${model}: ${modelErr instanceof Error ? modelErr.message : "Unknown error"}`;
        continue;
      }
    }

    // All models failed
    return new Response(
      JSON.stringify({ error: lastError || "Could not read label. Please retake with better lighting.", extracted: null }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("analyze-supplement-label error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
