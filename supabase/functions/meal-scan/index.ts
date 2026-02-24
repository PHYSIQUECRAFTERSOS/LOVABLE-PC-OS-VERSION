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

    // Use Lovable AI (Gemini Flash) for fast food recognition
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze this food photo. Identify each food item visible and estimate its macronutrients.

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

Be practical and accurate with portion estimates based on visual cues.`
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${image_base64}`
                }
              }
            ]
          }
        ],
        max_tokens: 1000,
        temperature: 0.2,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI API error:", aiResponse.status, errText);
      throw new Error(`AI service returned ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "";

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
      console.error("Failed to parse AI response:", content);
      result = { items: [], confidence: "low", notes: "Could not parse AI response" };
    }

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
