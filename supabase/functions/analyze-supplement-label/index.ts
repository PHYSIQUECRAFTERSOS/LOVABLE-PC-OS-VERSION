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

const plainTextPrompt = `You are a supplement label reader. Analyze the image of this Supplement Facts or Nutrition Facts label.

Extract ALL vitamin and mineral information and return ONLY valid JSON (no markdown, no code blocks) in this exact format:
{
  "product_name": "product name if visible",
  "serving_size": "serving size as shown",
  "serving_unit": "capsule|tablet|scoop|ml|drop|serving|softgel|lozenge",
  "servings_per_container": 60,
  "nutrients": {
    "vitamin_d_mcg": 50,
    "magnesium_mg": 200
  },
  "confidence": "high|medium|low"
}

Use these standardized nutrient keys:
vitamin_a_mcg, vitamin_c_mg, vitamin_d_mcg, vitamin_e_mg, vitamin_k_mcg,
vitamin_b1_mg, vitamin_b2_mg, vitamin_b3_mg, vitamin_b5_mg, vitamin_b6_mg,
vitamin_b7_mcg, vitamin_b9_mcg, vitamin_b12_mcg,
calcium_mg, iron_mg, magnesium_mg, phosphorus_mg, potassium_mg,
zinc_mg, copper_mg, manganese_mg, selenium_mcg, chromium_mcg,
molybdenum_mcg, iodine_mcg, omega_3, omega_6

Convert IU to mcg/mg: Vitamin D (1 IU = 0.025 mcg), Vitamin A (1 IU = 0.3 mcg), Vitamin E (1 IU = 0.67 mg).
Only include nutrients with values > 0. Return ONLY the JSON object, nothing else.`;

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

async function callWithToolCalling(image: string, model: string, timeoutMs: number): Promise<any> {
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

async function callWithPlainText(image: string, model: string, timeoutMs: number): Promise<any> {
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
          {
            role: "user",
            content: [
              { type: "text", text: plainTextPrompt },
              { type: "image_url", image_url: { url: image } },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 2000,
      }),
    });
    clearTimeout(timeout);
    return response;
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

function parseToolCallResponse(data: any): any | null {
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) return null;

  try {
    const extracted = typeof toolCall.function.arguments === "string"
      ? JSON.parse(toolCall.function.arguments)
      : toolCall.function.arguments;
    
    if (Object.keys(extracted.nutrients || {}).length === 0) return null;
    return extracted;
  } catch {
    return null;
  }
}

function parsePlainTextResponse(data: any): any | null {
  const content = data.choices?.[0]?.message?.content || "";
  if (!content) return null;

  // Strip markdown code blocks if present
  let jsonStr = content;
  const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match) jsonStr = match[1].trim();

  try {
    const parsed = JSON.parse(jsonStr);
    if (Object.keys(parsed.nutrients || {}).length === 0) return null;
    return parsed;
  } catch {
    return null;
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

    // Phase 1: Try tool calling with multiple models
    const toolCallingModels = [
      { model: "google/gemini-2.5-pro", timeout: 20000 },
      { model: "google/gemini-2.5-flash", timeout: 15000 },
    ];

    let lastError = "";

    for (const { model, timeout } of toolCallingModels) {
      try {
        console.log(`[analyze-supplement-label] Tool calling: ${model}`);
        const response = await callWithToolCalling(image, model, timeout);

        if (!response.ok) {
          const text = await response.text();
          console.error(`[analyze-supplement-label] ${model} error:`, response.status, text);

          if (response.status === 429) {
            return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
              status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          if (response.status === 402) {
            return new Response(JSON.stringify({ error: "AI usage limit reached. Please add credits." }), {
              status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          lastError = `${model}: ${response.status} - ${text.substring(0, 100)}`;
          continue;
        }

        const data = await response.json();
        const extracted = parseToolCallResponse(data);

        if (extracted) {
          const nutrientCount = Object.keys(extracted.nutrients).length;
          console.log(`[analyze-supplement-label] Tool calling success (${model}): ${nutrientCount} nutrients`);
          return new Response(JSON.stringify({ extracted, error: null }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        lastError = `${model}: Tool call returned no nutrients`;
        console.warn(`[analyze-supplement-label] ${lastError}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        lastError = `${model}: ${msg}`;
        console.error(`[analyze-supplement-label] ${lastError}`);
      }
    }

    // Phase 2: Fallback to plain text (no tool calling) — more reliable with some models
    const plainTextModels = [
      { model: "google/gemini-2.5-flash", timeout: 15000 },
      { model: "openai/gpt-5-mini", timeout: 15000 },
    ];

    for (const { model, timeout } of plainTextModels) {
      try {
        console.log(`[analyze-supplement-label] Plain text fallback: ${model}`);
        const response = await callWithPlainText(image, model, timeout);

        if (!response.ok) {
          const text = await response.text();
          console.error(`[analyze-supplement-label] Plain text ${model} error:`, response.status, text);
          lastError = `${model} plain: ${response.status}`;
          continue;
        }

        const data = await response.json();
        const extracted = parsePlainTextResponse(data);

        if (extracted) {
          const nutrientCount = Object.keys(extracted.nutrients).length;
          console.log(`[analyze-supplement-label] Plain text success (${model}): ${nutrientCount} nutrients`);
          return new Response(JSON.stringify({ extracted, error: null }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        lastError = `${model} plain: No nutrients parsed`;
        console.warn(`[analyze-supplement-label] ${lastError}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        lastError = `${model} plain: ${msg}`;
        console.error(`[analyze-supplement-label] ${lastError}`);
      }
    }

    // All attempts failed
    console.error(`[analyze-supplement-label] All models failed. Last error: ${lastError}`);
    return new Response(
      JSON.stringify({ error: "Could not read label. Please retake with better lighting or enter manually.", extracted: null }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[analyze-supplement-label] Fatal error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
