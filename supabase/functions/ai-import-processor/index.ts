import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuthenticatedUser } from "../_shared/auth-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

    // Check Anthropic key
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      await db
        .from("ai_import_jobs")
        .update({ status: "failed", error_message: "ANTHROPIC_API_KEY not configured" })
        .eq("id", job_id);
      return jsonResponse({ error: "Missing ANTHROPIC_API_KEY" }, 500);
    }

    // Download files from storage
    const contentBlocks: any[] = [];
    const downloadedPaths: string[] = [];

    for (let i = 0; i < file_paths.length; i++) {
      const storagePath = file_paths[i];
      downloadedPaths.push(storagePath);

      // Extract bucket and path: "ai-import-uploads/userId/filename.pdf"
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
      const uint8 = new Uint8Array(arrayBuffer);
      // Convert to base64
      let binary = "";
      for (let j = 0; j < uint8.length; j += 8192) {
        binary += String.fromCharCode(...uint8.slice(j, j + 8192));
      }
      const base64 = btoa(binary);

      const fileName = parts[parts.length - 1];
      const mediaType = detectMediaType(fileName);

      if (mediaType === "application/pdf") {
        contentBlocks.push({
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: base64 },
        });
      } else {
        contentBlocks.push({
          type: "image",
          source: { type: "base64", media_type: mediaType, data: base64 },
        });
      }
      contentBlocks.push({ type: "text", text: `[File: ${fileName}]` });
    }

    contentBlocks.push({
      type: "text",
      text: `Extract all ${document_type} data from the uploaded document(s). Follow the system instructions exactly.`,
    });

    const systemPrompt = buildSystemPrompt(document_type);

    // Call Anthropic with timeout
    const anthropicPromise = fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{ role: "user", content: contentBlocks }],
      }),
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("TIMEOUT")), 120000)
    );

    let anthropicRes: Response;
    try {
      anthropicRes = await Promise.race([anthropicPromise, timeoutPromise]);
    } catch (err: any) {
      if (err.message === "TIMEOUT") {
        await db
          .from("ai_import_jobs")
          .update({ status: "failed", error_message: "Claude API timeout - try a smaller document" })
          .eq("id", job_id);
        await cleanupStorage(db, downloadedPaths);
        return jsonResponse({ error: "Claude API timeout - try a smaller document" }, 408);
      }
      throw err;
    }

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error("Anthropic error:", anthropicRes.status, errText);
      await db
        .from("ai_import_jobs")
        .update({ status: "failed", error_message: `AI error: ${anthropicRes.status}` })
        .eq("id", job_id);
      await cleanupStorage(db, downloadedPaths);
      return jsonResponse({ error: `AI processing failed (${anthropicRes.status})` }, 500);
    }

    const anthropicData = await anthropicRes.json();
    const textContent = anthropicData.content
      ?.filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("");

    // Parse JSON from response
    let extracted: any;
    try {
      const jsonMatch = textContent.match(/```json\s*([\s\S]*?)```/);
      extracted = JSON.parse(jsonMatch ? jsonMatch[1].trim() : textContent.trim());
    } catch {
      await db
        .from("ai_import_jobs")
        .update({
          status: "failed",
          error_message: "Failed to parse AI response as JSON",
          extracted_json: { raw: textContent },
        })
        .eq("id", job_id);
      await cleanupStorage(db, downloadedPaths);
      return jsonResponse({ error: "Failed to parse extraction" }, 500);
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
