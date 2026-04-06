import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuthenticatedUser } from "../_shared/auth-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function safeParseJSON(raw: string) {
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  // Try to fix truncated JSON by closing open structures
  try {
    return JSON.parse(cleaned);
  } catch {
    // Attempt to repair truncated JSON
    let repaired = cleaned;
    // Count open/close braces and brackets
    const openBraces = (repaired.match(/{/g) || []).length;
    const closeBraces = (repaired.match(/}/g) || []).length;
    const openBrackets = (repaired.match(/\[/g) || []).length;
    const closeBrackets = (repaired.match(/\]/g) || []).length;
    
    // Remove trailing comma if present
    repaired = repaired.replace(/,\s*$/, "");
    // Remove incomplete key-value pair at end
    repaired = repaired.replace(/,\s*"[^"]*":\s*$/, "");
    repaired = repaired.replace(/,\s*"[^"]*":\s*"[^"]*$/, "");
    repaired = repaired.replace(/,\s*\{[^}]*$/, "");
    
    // Close missing brackets and braces
    for (let i = 0; i < openBrackets - closeBrackets; i++) repaired += "]";
    for (let i = 0; i < openBraces - closeBraces; i++) repaired += "}";
    
    return JSON.parse(repaired);
  }
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanWorkoutText(raw: string): string {
  const lines = raw.split("\n");
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length < 3) { deduped.push(line); continue; }
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    deduped.push(line);
  }

  const joined = deduped.join("\n");
  const boilerplatePatterns = [
    /TEMPO IS[\s\S]*?which is \[1:0:1:0\]/g,
    /The First number that appears[\s\S]*?beginning your eccentric[\s\S]*?2s\./g,
    /For the main exercise of the session[\s\S]*?bring a tripod\)/g,
    /I incorporate this if[\s\S]*?no programmed stretching/g,
    /IF YOU HIT TOP END[\s\S]*?READJUST FOR NEXT SET/g,
  ];

  let cleaned = joined;
  for (const pattern of boilerplatePatterns) {
    cleaned = cleaned.replace(pattern, "");
  }
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

  console.log("Original text length:", raw.length, "Cleaned text length:", cleaned.trim().length);
  return cleaned.trim();
}

function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth check
    const authResult = await requireAuthenticatedUser(req);
    if ("error" in authResult) {
      return jsonResponse({ error: authResult.error }, authResult.status);
    }
    const userId = authResult.user.id;

    // Check role
    const db = getServiceClient();
    const { data: roles } = await db
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const userRoles = (roles || []).map((r: any) => r.role);
    if (!userRoles.includes("coach") && !userRoles.includes("admin")) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const { job_id, file_paths, document_type } = await req.json();

    if (!job_id || !file_paths || !Array.isArray(file_paths) || file_paths.length === 0 || !document_type) {
      return jsonResponse({ error: "Missing required fields: job_id, file_paths, document_type" }, 400);
    }

    // Update job to processing
    await db
      .from("ai_import_jobs")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", job_id);

    // Check Lovable AI key
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      await db
        .from("ai_import_jobs")
        .update({ status: "failed", error_message: "LOVABLE_API_KEY not configured" })
        .eq("id", job_id);
      return jsonResponse({ error: "Missing LOVABLE_API_KEY" }, 500);
    }

    const userContentParts: any[] = [];
    const downloadedPaths: string[] = [];

    userContentParts.push({
      type: "text",
      text: "You must respond with ONLY a raw JSON object. No markdown. No code fences. No backticks. No explanation. Your entire response must start with the character { and end with the character }. Any other format will cause a critical system error.",
    });

    for (let i = 0; i < file_paths.length; i++) {
      const storagePath = file_paths[i];
      downloadedPaths.push(storagePath);

      const parts = storagePath.split("/");
      const bucket = parts[0];
      const filePath = parts.slice(1).join("/");

      const { data: fileData, error: dlErr } = await db.storage
        .from(bucket)
        .download(filePath);

      if (dlErr || !fileData) {
        console.error("Storage download error:", dlErr);
        await db
          .from("ai_import_jobs")
          .update({ status: "failed", error_message: `Failed to download file: ${dlErr?.message || "unknown"}` })
          .eq("id", job_id);
        return jsonResponse({ error: "Failed to download file from storage" }, 500);
      }

      const arrayBuffer = await fileData.arrayBuffer();
      const fileName = parts[parts.length - 1];
      console.log("Successfully downloaded file:", fileName, "size:", arrayBuffer.byteLength, "bytes");

      // Handle .txt files (pre-extracted text from PDFs) as plain text
      if (fileName.toLowerCase().endsWith(".txt")) {
        const rawText = new TextDecoder().decode(arrayBuffer);
        const extractedText = cleanWorkoutText(rawText);
        console.log("Extracted text length:", extractedText.length, "characters");
        userContentParts.push({
          type: "text",
          text: `[Document: ${fileName}]\n\n${extractedText}`,
        });
      } else {
        // Image files: send as base64 data URI
        const uint8 = new Uint8Array(arrayBuffer);
        let binary = "";
        for (let j = 0; j < uint8.length; j += 8192) {
          binary += String.fromCharCode(...uint8.slice(j, j + 8192));
        }
        const base64 = btoa(binary);
        const mediaType = detectMediaType(fileName);

        userContentParts.push({
          type: "image_url",
          image_url: { url: `data:${mediaType};base64,${base64}` },
        });
        userContentParts.push({ type: "text", text: `[File: ${fileName}]` });
      }
    }

    const extractionSuffix = document_type === "workout"
      ? `Extract ONLY the workout data from the above document.

IGNORE: warmup instructions, tempo explanations, stretching notes, execution notes, any repeated instructional text.

EXTRACT ONLY:
1. Program name and phase
2. Each workout day name (e.g. "Day 1: Chest and Back")
3. For each day, the list of exercises with: name, sets, reps, rest time

Return ONLY a raw JSON object. No markdown. No backticks. No explanation. Start with { and end with }.`
      : `Extract all ${document_type} data from the uploaded document(s). Follow the system instructions exactly.`;

    userContentParts.push({
      type: "text",
      text: extractionSuffix,
    });

    const systemPrompt = buildSystemPrompt(document_type);

    // Call Lovable AI Gateway with timeout
    const aiPromise = fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        max_tokens: 8192,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContentParts },
        ],
      }),
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("TIMEOUT")), 120000)
    );

    let aiRes: Response;
    try {
      aiRes = await Promise.race([aiPromise, timeoutPromise]);
    } catch (err: any) {
      if (err.message === "TIMEOUT") {
        await db
          .from("ai_import_jobs")
          .update({ status: "failed", error_message: "AI timeout - try a smaller document" })
          .eq("id", job_id);
        await cleanupStorage(db, downloadedPaths);
        return jsonResponse({ error: "AI timeout - try a smaller document" }, 408);
      }
      throw err;
    }

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI Gateway error:", aiRes.status, errText);

      let userError = `AI processing failed (${aiRes.status})`;
      if (aiRes.status === 429) userError = "AI rate limit reached — please wait a moment and try again.";
      if (aiRes.status === 402) userError = "AI credits exhausted — please add funds in Settings > Workspace > Usage.";
      if (aiRes.status === 502) userError = "AI service temporarily unavailable - please try again in 30 seconds";

      await db
        .from("ai_import_jobs")
        .update({ status: "failed", error_message: userError })
        .eq("id", job_id);
      await cleanupStorage(db, downloadedPaths);
      return jsonResponse({ error: userError }, aiRes.status === 429 ? 429 : aiRes.status === 402 ? 402 : aiRes.status === 502 ? 502 : 500);
    }

    const aiData = await aiRes.json();
    const content = aiData.choices?.[0]?.message?.content || "";
    console.log("AI response received, length:", content?.length, "chars");
    console.log("First 200 chars:", content?.substring(0, 200));
    console.log("Last 200 chars:", content?.substring(content.length - 200));

    let extracted: any;
    try {
      extracted = safeParseJSON(content);
    } catch (parseError) {
      console.error("JSON parse failed. Raw response:", content?.substring(0, 500));
      await db
        .from("ai_import_jobs")
        .update({
          status: "failed",
          error_message: "AI returned invalid JSON - please try again",
          extracted_json: { raw: content },
        })
        .eq("id", job_id);
      await cleanupStorage(db, downloadedPaths);
      return new Response(
        JSON.stringify({ error: "AI returned invalid JSON - please try again" }),
        {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fuzzy match against catalog
    let matchResults: any = null;
    if (document_type === "workout") {
      matchResults = await matchExercises(db, extracted);
    } else if (document_type === "meal") {
      matchResults = await matchFoods(db, extracted);
    }

    await db
      .from("ai_import_jobs")
      .update({
        status: "review",
        extracted_json: extracted,
        match_results: matchResults,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job_id);

    // Cleanup storage
    await cleanupStorage(db, downloadedPaths);

    return jsonResponse({ success: true, status: "review" });
  } catch (err: any) {
    console.error("ai-import-processor error:", err);
    return jsonResponse({ error: err.message || "Unknown error" }, 500);
  }
});

async function cleanupStorage(db: any, paths: string[]) {
  for (const p of paths) {
    try {
      const parts = p.split("/");
      const bucket = parts[0];
      const filePath = parts.slice(1).join("/");
      await db.storage.from(bucket).remove([filePath]);
    } catch (e) {
      console.error("Cleanup failed for", p, e);
    }
  }
}

function detectMediaType(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop();
  switch (ext) {
    case "pdf": return "application/pdf";
    case "png": return "image/png";
    case "jpg": case "jpeg": return "image/jpeg";
    case "gif": return "image/gif";
    case "webp": return "image/webp";
    default: return "application/pdf";
  }
}

function buildSystemPrompt(docType: string): string {
  const base = `You are a strict data extraction assistant. Extract ONLY data that is literally present in the document. Do NOT infer, guess, or add any data not in the document. Return valid JSON only.

IMPORTANT: This document may have repeated instruction sections on every page (warmup protocol, tempo explanation, etc.). Ignore all repeated boilerplate. Extract only the unique data sections. Skip any section that is a duplicate of content already extracted.`;

  if (docType === "workout") {
    return `${base}

Extract workout program data. Return JSON in this format:
{
  "program_name": "string",
  "days": [
    {
      "day_name": "string (e.g. Day 1: Push)",
      "exercises": [
        {
          "name": "string (exact name from PDF)",
          "sets": number or null,
          "reps": "string (e.g. '8-12' or '10')",
          "rest_seconds": number or null,
          "tempo": "string or null",
          "rir": number or null,
          "rpe": number or null,
          "notes": "string or null",
          "grouping_type": "superset | circuit | null",
          "grouping_id": "string or null (same ID for grouped exercises)"
        }
      ]
    }
  ]
}`;
  }

  if (docType === "meal") {
    return `${base}

Extract meal plan data. Return JSON in this format:
{
  "plan_name": "string",
  "days": [
    {
      "day_label": "string (e.g. Day 1, Monday)",
      "meals": [
        {
          "meal_name": "string (e.g. Breakfast, Meal 1)",
          "foods": [
            {
              "name": "string",
              "quantity": "string (e.g. '200g', '1 cup', '2 scoops')",
              "calories": number or null,
              "protein": number or null,
              "carbs": number or null,
              "fat": number or null
            }
          ]
        }
      ]
    }
  ]
}`;
  }

  // supplement
  return `${base}

Extract supplement stack data. Return JSON in this format:
{
  "supplements": [
    {
      "name": "string",
      "dose": "string (e.g. '5g', '1000 IU')",
      "timing": "string (e.g. 'morning', 'pre-workout')",
      "reason": "string or null",
      "notes": "string or null"
    }
  ]
}`;
}

async function matchExercises(db: any, extracted: any) {
  const allExerciseNames: string[] = [];
  for (const day of extracted.days || []) {
    for (const ex of day.exercises || []) {
      if (ex.name) allExerciseNames.push(ex.name);
    }
  }
  if (allExerciseNames.length === 0) return { exercises: {} };

  const { data: catalog } = await db
    .from("exercises")
    .select("id, name, muscle_group, equipment")
    .limit(1000);

  const exerciseMatches: Record<string, any> = {};
  for (const pdfName of allExerciseNames) {
    const normalizedPdf = pdfName.toLowerCase().trim();
    let bestMatch: any = null;
    let bestScore = 0;
    for (const cat of catalog || []) {
      const score = computeSimilarity(normalizedPdf, cat.name.toLowerCase().trim());
      if (score > bestScore) {
        bestScore = score;
        bestMatch = cat;
      }
    }
    exerciseMatches[pdfName] = {
      pdf_name: pdfName,
      matched_id: bestMatch?.id || null,
      matched_name: bestMatch?.name || null,
      confidence: bestScore,
      confidence_level: bestScore >= 0.85 ? "green" : bestScore >= 0.6 ? "yellow" : "red",
    };
  }
  return { exercises: exerciseMatches };
}

async function matchFoods(db: any, extracted: any) {
  const allFoodNames: string[] = [];
  for (const day of extracted.days || []) {
    for (const meal of day.meals || []) {
      for (const food of meal.foods || []) {
        if (food.name) allFoodNames.push(food.name);
      }
    }
  }
  if (allFoodNames.length === 0) return { foods: {} };

  const { data: catalog } = await db
    .from("food_items")
    .select("id, name, brand, calories, protein, carbs, fat")
    .limit(1000);

  const foodMatches: Record<string, any> = {};
  for (const pdfName of allFoodNames) {
    const normalizedPdf = pdfName.toLowerCase().trim();
    let bestMatch: any = null;
    let bestScore = 0;
    for (const cat of catalog || []) {
      const score = computeSimilarity(normalizedPdf, cat.name.toLowerCase().trim());
      if (score > bestScore) {
        bestScore = score;
        bestMatch = cat;
      }
    }
    foodMatches[pdfName] = {
      pdf_name: pdfName,
      matched_id: bestMatch?.id || null,
      matched_name: bestMatch?.name || null,
      matched_brand: bestMatch?.brand || null,
      confidence: bestScore,
      confidence_level: bestScore >= 0.85 ? "green" : bestScore >= 0.6 ? "yellow" : "red",
    };
  }
  return { foods: foodMatches };
}

function computeSimilarity(a: string, b: string): number {
  return levenshteinSimilarity(a, b) * 0.5 + tokenOverlap(a, b) * 0.5;
}

function levenshteinSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLen;
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function tokenOverlap(a: string, b: string): number {
  const tokensA = new Set(a.split(/\s+/).filter(Boolean));
  const tokensB = new Set(b.split(/\s+/).filter(Boolean));
  if (tokensA.size === 0 && tokensB.size === 0) return 1;
  let overlap = 0;
  for (const t of tokensA) if (tokensB.has(t)) overlap++;
  const union = new Set([...tokensA, ...tokensB]).size;
  return union === 0 ? 0 : overlap / union;
}
