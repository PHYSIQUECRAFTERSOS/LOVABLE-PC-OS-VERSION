import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const { image_base64 } = await req.json();

    if (!image_base64 || typeof image_base64 !== "string") {
      return new Response(
        JSON.stringify({ error: "image_base64 is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const PROMPT = `Analyze this food photo. Identify each food item visible and estimate its macronutrients.

Return ONLY valid JSON in this exact format:
{
  "items": [
    {
      "name": "food name",
      "portion": "estimated portion size (e.g. 1 cup, 200g)",
      "calories": 0,
      "protein": 0,
      "carbs": 0,
      "fat": 0
    }
  ],
  "confidence": "high" | "medium" | "low",
  "notes": "any relevant notes about the estimation"
}

If you cannot identify any food, return: {"items": [], "confidence": "low", "notes": "Could not detect food items"}

Be practical and accurate with portion estimates based on visual cues.`;

    const callAI = async () => {
      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "user", content: [
            { type: "text", text: PROMPT },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image_base64}` } },
          ] }],
          max_tokens: 4000,
          temperature: 0.2,
          response_format: { type: "json_object" },
        }),
      });
      if (!aiResponse.ok) {
        const errText = await aiResponse.text();
        console.error("AI API error:", aiResponse.status, errText);
        throw new Error(`AI service returned ${aiResponse.status}`);
      }
      const aiData = await aiResponse.json();
      const choice = aiData.choices?.[0];
      if (choice?.finish_reason === "length") console.warn("meal-scan: AI answer was cut off (length limit)");
      return String(choice?.message?.content || "");
    };

    let result = parseResult(await callAI());
    if (!result) {
      console.warn("meal-scan: unreadable answer, retrying once");
      result = parseResult(await callAI());
    }
    if (!result) result = { items: [], confidence: "low", notes: "Could not parse AI response" };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("meal-scan error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error", items: [] }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function parseResult(content: string): { items: unknown[]; confidence: string; notes: string } | null {
  let str = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  const first = str.indexOf("{");
  if (first > 0) str = str.slice(first);
  try {
    const r = JSON.parse(str);
    if (r && Array.isArray(r.items)) return { items: r.items, confidence: r.confidence || "medium", notes: r.notes || "" };
  } catch { /* fall through to salvage */ }
  // Salvage complete item objects from a truncated answer
  const arrStart = str.indexOf("[");
  if (arrStart === -1) { console.error("Failed to parse AI response:", content); return null; }
  const items: unknown[] = [];
  let depth = 0, objStart = -1, inStr = false, esc = false;
  for (let i = arrStart + 1; i < str.length; i++) {
    const c = str[i];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === "{") { if (depth === 0) objStart = i; depth++; }
    else if (c === "}") { depth--; if (depth === 0 && objStart >= 0) { try { items.push(JSON.parse(str.slice(objStart, i + 1))); } catch { /* skip */ } objStart = -1; } }
    else if (c === "]" && depth === 0) break;
  }
  if (items.length === 0) { console.error("Failed to parse AI response:", content); return null; }
  console.warn(`meal-scan: salvaged ${items.length} items from truncated answer`);
  return { items, confidence: "medium", notes: "" };
}
