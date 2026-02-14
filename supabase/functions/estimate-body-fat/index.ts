import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Service role client for storage access
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const { photoIds } = await req.json();
    if (!photoIds || !Array.isArray(photoIds) || photoIds.length === 0) {
      throw new Error("photoIds array is required");
    }

    // Fetch photo records
    const { data: photos, error: photosError } = await supabase
      .from("progress_photos")
      .select("*")
      .in("id", photoIds)
      .eq("client_id", user.id);

    if (photosError || !photos || photos.length === 0) {
      throw new Error("Could not fetch photos");
    }

    // Fetch previous estimates for context
    const { data: previousEstimates } = await supabase
      .from("ai_body_fat_estimates")
      .select("estimated_bf_pct, confidence_low, confidence_high, created_at")
      .eq("client_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5);

    // Generate signed URLs for the photos
    const imageContents: { type: string; image_url: { url: string } }[] = [];

    for (const photo of photos) {
      const { data: urlData } = await supabaseAdmin.storage
        .from("progress-photos")
        .createSignedUrl(photo.storage_path, 600);

      if (urlData?.signedUrl) {
        imageContents.push({
          type: "image_url",
          image_url: { url: urlData.signedUrl },
        });
      }
    }

    if (imageContents.length === 0) {
      throw new Error("Could not generate URLs for photos");
    }

    // Build context about previous estimates
    let historyContext = "";
    if (previousEstimates && previousEstimates.length > 0) {
      historyContext = "\n\nPrevious body fat estimates for trend context:\n" +
        previousEstimates.map(e =>
          `- ${e.created_at}: ${e.estimated_bf_pct}% (range: ${e.confidence_low}-${e.confidence_high}%)`
        ).join("\n");
    }

    // Describe poses
    const poseDescriptions = photos.map(p => `${p.pose} pose (${p.photo_date})`).join(", ");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Call AI with tool calling for structured output
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are an expert fitness and physiology analyst. Analyze progress photos to estimate body fat percentage.

Guidelines:
- Provide your best estimate as a single number
- Provide a confidence range (low and high bounds)
- Note any lighting inconsistencies that could affect accuracy
- Compare to previous estimates if available and note trends
- Be honest about limitations of visual estimation
- Consider muscle definition, vascularity, abdominal visibility, and overall leanness
- For males: 6-9% contest lean, 10-14% athletic, 15-19% fit, 20-25% average, 25%+ above average
- For females: 14-17% contest lean, 18-22% athletic, 23-27% fit, 28-32% average, 32%+ above average`,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze these progress photos (${poseDescriptions}) and estimate body fat percentage with confidence range. Note any lighting issues.${historyContext}`,
              },
              ...imageContents,
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "body_fat_estimate",
              description: "Return structured body fat estimation results",
              parameters: {
                type: "object",
                properties: {
                  estimated_bf_pct: {
                    type: "number",
                    description: "Best estimate of body fat percentage",
                  },
                  confidence_low: {
                    type: "number",
                    description: "Lower bound of confidence range",
                  },
                  confidence_high: {
                    type: "number",
                    description: "Upper bound of confidence range",
                  },
                  lighting_warning: {
                    type: "boolean",
                    description: "Whether lighting inconsistency may affect accuracy",
                  },
                  analysis_notes: {
                    type: "string",
                    description: "Brief analysis notes including observations about muscle definition, leanness, and trend compared to previous estimates if available. 2-3 sentences max.",
                  },
                },
                required: ["estimated_bf_pct", "confidence_low", "confidence_high", "lighting_warning", "analysis_notes"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "body_fat_estimate" } },
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits depleted. Please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      throw new Error("AI analysis failed");
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall || toolCall.function.name !== "body_fat_estimate") {
      throw new Error("AI did not return structured estimation");
    }

    const result = JSON.parse(toolCall.function.arguments);

    // Save estimate to database
    const { data: saved, error: saveError } = await supabase
      .from("ai_body_fat_estimates")
      .insert({
        client_id: user.id,
        photo_ids: photoIds,
        estimated_bf_pct: result.estimated_bf_pct,
        confidence_low: result.confidence_low,
        confidence_high: result.confidence_high,
        lighting_warning: result.lighting_warning,
        ai_notes: result.analysis_notes,
      })
      .select()
      .single();

    if (saveError) {
      console.error("Save error:", saveError);
      // Return result even if save fails
    }

    return new Response(
      JSON.stringify({
        estimate: {
          id: saved?.id,
          estimated_bf_pct: result.estimated_bf_pct,
          confidence_low: result.confidence_low,
          confidence_high: result.confidence_high,
          lighting_warning: result.lighting_warning,
          ai_notes: result.analysis_notes,
        },
        previousEstimates: previousEstimates || [],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("estimate-body-fat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
