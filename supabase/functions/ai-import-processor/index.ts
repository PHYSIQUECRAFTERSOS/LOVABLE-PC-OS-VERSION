import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuthenticatedUser } from "../_shared/auth-utils.ts";
import {
  scoreNormalized,
  normalize,
  expandTokens,
  candidateTokens,
  type SynonymMap,
} from "../_shared/fuzzy-match.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function safeParseJSON(raw: string) {
  let cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  // Find JSON boundaries
  const jsonStart = cleaned.indexOf("{");
  if (jsonStart > 0) cleaned = cleaned.substring(jsonStart);

  try {
    return JSON.parse(cleaned);
  } catch {
    console.log("Initial parse failed, attempting truncation repair...");
    let repaired = cleaned;

    // Walk backward to find the last complete key-value pair
    // Remove any trailing incomplete value (string, number, object, etc.)
    // Strategy: find last complete }, then trim everything after it that's incomplete
    
    // Remove trailing partial strings/numbers/keys
    repaired = repaired.replace(/,\s*$/, "");
    repaired = repaired.replace(/,?\s*"[^"]*":\s*"[^"]*$/s, ""); // incomplete string value
    repaired = repaired.replace(/,?\s*"[^"]*":\s*[\d.]*$/s, "");  // incomplete number value
    repaired = repaired.replace(/,?\s*"[^"]*":\s*$/s, "");         // key with no value
    repaired = repaired.replace(/,?\s*"[^"]*$/s, "");              // incomplete key
    repaired = repaired.replace(/,\s*$/, "");                       // trailing comma again

    // Now close any open structures
    const stack: string[] = [];
    let inString = false;
    let escape = false;
    for (let i = 0; i < repaired.length; i++) {
      const ch = repaired[i];
      if (escape) { escape = false; continue; }
      if (ch === "\\") { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === "{") stack.push("}");
      else if (ch === "[") stack.push("]");
      else if (ch === "}" || ch === "]") stack.pop();
    }
    
    // Close in reverse order
    while (stack.length > 0) repaired += stack.pop();

    console.log("Repaired JSON length:", repaired.length, "added closers:", stack.length);
    
    try {
      return JSON.parse(repaired);
    } catch (e2) {
      // Last resort: fix trailing commas before closers
      repaired = repaired.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");
      return JSON.parse(repaired);
    }
  }
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

import { extractTrainerizeWorkoutSummary as runTrainerizeParser } from "../_shared/trainerizeWorkoutParser.ts";

const TRAINERIZE_WORKOUT_SUMMARY_START = "<<<TRAINERIZE_WORKOUT_BOUNDARY_SUMMARY_JSON>>>";
const TRAINERIZE_WORKOUT_SUMMARY_END = "<<<END_TRAINERIZE_WORKOUT_BOUNDARY_SUMMARY_JSON>>>";

function extractTrainerizeSummaryFromText(text: string): any | null {
  const start = text.indexOf(TRAINERIZE_WORKOUT_SUMMARY_START);
  const end = text.indexOf(TRAINERIZE_WORKOUT_SUMMARY_END);
  if (start >= 0 && end > start) {
    const jsonText = text.slice(start + TRAINERIZE_WORKOUT_SUMMARY_START.length, end).trim();
    try {
      const parsed = JSON.parse(jsonText);
      if (Array.isArray(parsed?.workouts) && parsed.workouts.length > 0) return parsed;
    } catch (err) {
      console.warn("Failed to parse client-prepended Trainerize boundary summary; will retry server-side parse", err);
    }
  }
  // Server-side fallback: run the deterministic parser directly on the raw text.
  // This makes the guard work even when the client failed to prepend the summary
  // (older clients, network truncation, or a copy-pasted text upload).
  try {
    const parsed = runTrainerizeParser(text);
    if (parsed && Array.isArray(parsed.workouts) && parsed.workouts.length > 0) {
      console.log(`[ai-import] Server-side Trainerize parser produced ${parsed.workouts.length} workouts as fallback`);
      return parsed;
    }
  } catch (err) {
    console.warn("Server-side Trainerize parse failed", err);
  }
  return null;
}

function cleanWorkoutText(raw: string): string {
  // When the client has already prepended a machine-readable Trainerize
  // boundary summary, keep it intact. The global line de-duper below would
  // otherwise strip repeated JSON fields like "sets": 3 and corrupt the guard.
  if (extractTrainerizeSummaryFromText(raw)) {
    console.log("Trainerize boundary summary detected; preserving uploaded text verbatim");
    return raw.trim();
  }

  const lines = raw.split("\n");
  const deduped: string[] = [];
  let previousTrimmed = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length < 3) { deduped.push(line); continue; }
    // Only remove consecutive duplicate OCR/header lines. Global de-duping can
    // delete legitimate repeated exercises or repeated workout headings.
    if (trimmed === previousTrimmed) continue;
    previousTrimmed = trimmed;
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

// Strip global boilerplate, per-set exercise cues, and rep/set fragments that
// the AI sometimes captures as a workout's top-level instructions. Anything
// that smells like an exercise row note (e.g. "Set 3: 3 reps (AMRAP)",
// "Rest: 15 seconds") or the global warmup/tempo paragraph is removed. If
// nothing legitimate is left we return null so the field stays clean.
function sanitizeWorkoutInstructions(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const kept: string[] = [];
  const badPatterns: RegExp[] = [
    /^warmup\b/i,
    /^for the main exercise/i,
    /^get into the gym/i,
    /^let'?s say my top set/i,
    /^if you hit top end/i,
    /tempo\s*\[/i,
    /^the (first|second|third|final) number/i,
    /^set\s*\d+\s*[:\-]/i,
    /^rest\s*[:\-]?\s*\d+\s*(sec|second|min)/i,
    /^\d+\s*(set|rep)s?\s*(x|@)/i,
    /\(amrap\)/i,
    /drop\s*set/i,
    /myo[-\s]?rep/i,
    /^\d+\s*reps?\b/i,
    /^each side as well$/i,
    /^physique crafters$/i,
  ];
  for (const line of lines) {
    if (badPatterns.some((p) => p.test(line))) continue;
    kept.push(line);
  }
  const result = kept.join("\n").trim();
  return result.length > 0 ? result : null;
}

function normalizeAgainstTrainerizeSummary(extracted: any, summary: any): any {
  if (!summary || !Array.isArray(summary.workouts) || summary.workouts.length === 0) return extracted;

  const summaryWorkouts = summary.workouts.filter((w: any) => w?.day_name && Array.isArray(w?.exercises));
  if (summaryWorkouts.length === 0) return extracted;

  const summaryByName = new Map(summaryWorkouts.map((w: any) => [String(w.day_name), w]));
  const aiWorkouts: any[] = Array.isArray(extracted?.workouts) ? extracted.workouts : [];
  const aiByName = new Map(aiWorkouts.filter((w: any) => w?.day_name).map((w: any) => [String(w.day_name), w]));

  const workouts = summaryWorkouts.map((summaryWorkout: any) => {
    const name = String(summaryWorkout.day_name);
    const aiWorkout = aiByName.get(name) || null;
    const aiExercises = Array.isArray(aiWorkout?.exercises) ? aiWorkout.exercises : [];
    const summaryExercises = Array.isArray(summaryWorkout.exercises) ? summaryWorkout.exercises : [];

    // If the deterministic parser found any exercises, it is the source of truth.
    // Borrow only tempo/rir/rpe/notes from the AI by position when the summary
    // doesn't already specify them (the parser doesn't read tempo/RIR).
    let exercises: any[];
    if (summaryExercises.length > 0) {
      exercises = summaryExercises.map((sex: any, i: number) => {
        const aex = aiExercises[i] || {};
        return {
          ...sex,
          tempo: sex.tempo ?? aex.tempo ?? null,
          rir: sex.rir ?? aex.rir ?? null,
          rpe: sex.rpe ?? aex.rpe ?? null,
          notes: sex.notes ?? aex.notes ?? null,
        };
      });
    } else {
      exercises = aiExercises;
    }

    // Trust the deterministic parser for per-workout instructions. When the
    // Trainerize summary matched, the parser intentionally leaves instructions
    // null because Trainerize print exports almost never carry a true
    // per-workout description — the text that visually sits "above" the table
    // is global boilerplate (warmup protocol, tempo rules) repeated on every
    // page. Letting the AI fill this field caused workouts to inherit
    // unrelated cues like "Rest: 15 seconds / Set 3: 3 reps (AMRAP)" or the
    // global warmup paragraph.
    const sanitizedAiInstructions = sanitizeWorkoutInstructions(aiWorkout?.instructions);
    return {
      ...(aiWorkout || {}),
      day_name: name,
      instructions: summaryWorkout.instructions ?? sanitizedAiInstructions ?? null,
      exercises,
      superset_groups: summaryExercises.length > 0
        ? (summaryWorkout.superset_groups || [])
        : (Array.isArray(aiWorkout?.superset_groups) && aiWorkout.superset_groups.length > 0
            ? aiWorkout.superset_groups
            : (summaryWorkout.superset_groups || [])),
    };
  });

  const schedule = Array.isArray(summary.schedule) && summary.schedule.length > 0
    ? summary.schedule
        .filter((s: any) => summaryByName.has(String(s?.day_name)))
        .map((s: any, i: number) => ({ position: Number(s.position) || i + 1, day_name: String(s.day_name) }))
    : workouts.map((w: any, i: number) => ({ position: i + 1, day_name: w.day_name }));

  const result = {
    ...(extracted || {}),
    program_name: extracted?.program_name || summary.program_name || "Imported Trainerize Workout Program",
    program_phase: extracted?.program_phase ?? summary.program_phase ?? null,
    workouts,
    schedule,
  };

  console.log(`[ai-import] Trainerize guard enforced: ${workouts.length} workouts, ${schedule.length} scheduled entries`);
  return result;
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
    let trainerizeBoundarySummary: any | null = null;

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
        const parsedSummary = document_type === "workout" ? extractTrainerizeSummaryFromText(rawText) : null;
        if (parsedSummary && !trainerizeBoundarySummary) {
          trainerizeBoundarySummary = parsedSummary;
          console.log(`[ai-import] Trainerize boundary summary found in ${fileName}: ${parsedSummary.workouts?.length || 0} workouts`);
        }
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
      ? `Extract the workout program from the above document.

If a ${TRAINERIZE_WORKOUT_SUMMARY_START} block is present, it is the SOURCE OF TRUTH for workout boundaries and exercise rows:
- Return exactly the workouts[] listed in that summary block, no more and no fewer.
- Keep every day_name EXACTLY as written in that summary block.
- Do not create workouts from exercise-demo pages, Tracking Sheet rows, Previous Stats, boilerplate, or instruction text.
- You may clean obvious PDF truncation in exercise names only when the raw text below clearly gives the full name.

IGNORE the global tempo / warmup / stretching / execution boilerplate that repeats on every page.

EXTRACT:
1. program_name and program_phase
2. workouts[] — ONE entry per UNIQUE day heading (verbatim, including any "[AWAY]" prefix, brackets, casing, and " A" / " B" suffix). If the same heading appears multiple times in the PDF with the same exercise list, define it ONCE here.
3. For each unique workout: its full exercises[] (name, sets, reps, rest_seconds, tempo, rir, rpe, notes, grouping) AND its per-workout instructions (the text directly under that heading, before the first exercise; skip repeated global boilerplate).
4. schedule[] — the ordered list of every scheduled day in the program in the order printed in the PDF. Each schedule entry references a workouts[] entry by its EXACT day_name string.

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
        model: "google/gemini-2.5-flash",
        max_tokens: 16384,
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

    if (document_type === "workout" && trainerizeBoundarySummary) {
      extracted = normalizeAgainstTrainerizeSummary(extracted, trainerizeBoundarySummary);
    }

    // Normalize new shape ({ workouts[], schedule[] }) → also populate days[] so the
    // downstream exercise-matcher and superset rest normalizer keep working unchanged.
    if (document_type === "workout") {
      const hasNewShape = Array.isArray(extracted?.workouts) && extracted.workouts.length > 0;
      if (hasNewShape) {
        const workoutsByName = new Map<string, any>();
        for (const w of extracted.workouts) {
          if (w?.day_name) workoutsByName.set(String(w.day_name), w);
        }
        const schedule: any[] = Array.isArray(extracted.schedule) && extracted.schedule.length > 0
          ? extracted.schedule
          : extracted.workouts.map((w: any, i: number) => ({ position: i + 1, day_name: w.day_name }));
        // Build flat days[] mirroring the schedule, each entry referencing the unique template.
        extracted.days = schedule.map((s: any) => {
          const tpl = workoutsByName.get(String(s.day_name));
          return {
            day_name: s.day_name,
            instructions: tpl?.instructions ?? null,
            exercises: tpl?.exercises || [],
            superset_groups: tpl?.superset_groups || [],
            _template_key: s.day_name,
          };
        });
      }
    }

    // Server-side guard: even if the AI hallucinates a 60s rest on a superset member,
    // force null. The client-side redistribution then resolves it to 0 for first/middle
    // members and the group's rest_seconds_between_rounds for the last member.
    if (document_type === "workout") {
      const days = extracted?.days || extracted?.workout_days || [];
      let normalizedCount = 0;
      for (const day of days) {
        const groupIds = new Set<string>(
          ((day?.superset_groups || []) as any[])
            .map((g: any) => (g?.grouping_id ? String(g.grouping_id) : ""))
            .filter(Boolean),
        );
        for (const ex of day?.exercises || []) {
          const gid = ex?.grouping_id ? String(ex.grouping_id) : "";
          if (gid && groupIds.has(gid) && ex.rest_seconds != null) {
            ex.rest_seconds = null;
            normalizedCount++;
          }
        }
      }
      if (normalizedCount > 0) {
        console.log(`[ai-import] normalized ${normalizedCount} superset-member rest_seconds → null`);
      }
    }

    // Fuzzy match against catalog
    let matchResults: any = null;
    if (document_type === "workout") {
      matchResults = await matchExercises(db, extracted);
      // Also look up existing master library workouts by exact name (case-insensitive)
      // so the importer can REUSE them instead of creating duplicates.
      const uniqueNames: string[] = Array.from(new Set(
        ((extracted?.workouts as any[]) || []).map((w: any) => String(w?.day_name || "")).filter(Boolean),
      ));
      const masterMatches: Record<string, { id: string; name: string }> = {};
      if (uniqueNames.length > 0) {
        const { data: masters } = await db
          .from("workouts")
          .select("id, name")
          .eq("coach_id", userId)
          .eq("is_template", true)
          .in("name", uniqueNames);
        const byLower = new Map<string, { id: string; name: string }>();
        for (const m of (masters || []) as any[]) {
          byLower.set(String(m.name).toLowerCase(), { id: m.id, name: m.name });
        }
        for (const n of uniqueNames) {
          const hit = byLower.get(n.toLowerCase());
          if (hit) masterMatches[n] = hit;
        }
      }
      matchResults = { ...(matchResults || {}), master_workouts: masterMatches };
    } else if (document_type === "meal") {
      matchResults = await matchFoods(db, extracted, userId);

    } else if (document_type === "supplement") {
      matchResults = await matchSupplements(db, extracted);
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
  "program_phase": "string or null",
  "workouts": [
    {
      "day_name": "string — copy the heading VERBATIM, including any '[AWAY]' prefix, brackets, casing, and ' A' / ' B' suffix (e.g. '[AWAY]Day 1: Upper', 'Day 1: UPPER A', 'Day 4 : LOWER B & calves & abs')",
      "instructions": "string or null — ONLY the per-workout instructional paragraph(s) printed directly under this heading before its first exercise. STRICT RULES: (a) return null when nothing custom is written for THIS specific workout; (b) NEVER copy global boilerplate that repeats across pages (warmup protocol starting with 'Warmup' / 'For the main exercise of the session', 'Get into the gym', 'LET'S SAY MY TOP SET', tempo explanation, stretching protocol); (c) NEVER copy text that belongs to a single exercise row such as set/rep counts, 'Rest: 15 seconds', 'Set 3: 3 reps (AMRAP)', drop-set or myo-rep notes — those belong on the exercise, not the workout.",
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
      ],
      "superset_groups": [
        {
          "grouping_id": "string (matches grouping_id on member exercises)",
          "rest_seconds_between_rounds": number or null
        }
      ]
    }
  ],
  "schedule": [
    { "position": 1, "day_name": "string — must EXACTLY match a workouts[].day_name above" }
  ]
}

CRITICAL DAY-NAME RULES:
1. NEVER strip, normalize, or merge day_name prefixes/suffixes. '[AWAY]Day 1: Upper' and 'Day 1: UPPER A' are DIFFERENT workouts and MUST stay distinct.
2. Define each unique day_name ONCE in workouts[]. Reference it from schedule[] every time it is scheduled — do NOT duplicate the exercises.
3. schedule[] must list every scheduled day in the order the PDF prints them, across all weeks. position starts at 1 and increments by 1.
4. If the PDF clearly shows only one rotation (e.g. 4 unique days in a single block) and no week-by-week schedule, schedule[] should still list every workouts[] entry once in order.

CRITICAL REST RULES:
1. If the PDF does NOT specify a rest value for an exercise, return rest_seconds: null. Do NOT invent 60 or any default. Mobility, warmup, and stretching rows almost always have no rest specified — return null for those.
2. Convert rest values to seconds: "2 min" = 120, "90 sec" = 90, "15 sec" = 15, "1 min 30 sec" = 90.
3. "Rest X between sets" applies to that single exercise. Put it in that exercise's rest_seconds.
4. There is NO default rest value. If you are tempted to write 60 because nothing is specified, write null instead. Repeat: there is no default — null means "PDF didn't say".

CRITICAL SUPERSET / CIRCUIT RULES:
1. When you see a header like "Superset of N sets", "Giant set", or "Circuit", every exercise listed under that header until the next "Rest for X" line or the next non-grouped exercise belongs to the same group.
2. Assign every exercise in that group the SAME grouping_id (use short strings: "g1", "g2", "g3"...). Set grouping_type to "superset" or "circuit" accordingly.
3. The "Rest for X sec" / "Rest X min" line that appears AFTER the superset block (often followed by "Repeat new set") belongs to the GROUP, not to any individual exercise. Add an entry to superset_groups with that grouping_id and put the rest value in rest_seconds_between_rounds.
4. For exercises inside a superset, set their individual rest_seconds to null. The group rest is the only rest that applies (the app will redistribute it to the last exercise in the group at write time).
5. Do NOT copy the group rest value onto every member exercise.`;
  }

  if (docType === "meal") {

    return `${base}

Extract meal plan data. Return JSON in this format:
{
  "plan_name": "string",
  "days": [
    {
      "day_label": "string (e.g. 'Workout Day', 'Rest Day', 'Day 1', 'Monday')",
      "day_type": "training | rest | all_days",
      "meals": [
        {
          "meal_name": "string (e.g. Breakfast, Meal 1)",
          "foods": [
            {
              "name": "string (food name only — never include the quantity)",
              "quantity_value": number (REQUIRED — numeric amount, e.g. 130, 3, 0.5),
              "quantity_unit": "string (REQUIRED — one of: 'g','ml','oz','slice','unit','scoop','cup','tbsp','tsp','piece','serving')",
              "calories": number (REQUIRED — copy verbatim from PDF row),
              "protein": number (REQUIRED — grams, copy verbatim),
              "carbs": number (REQUIRED — grams, copy verbatim),
              "fat": number (REQUIRED — grams, copy verbatim)
            }
          ]
        }
      ]
    }
  ]
}

QUANTITY RULES (MANDATORY):
- Split the printed quantity into number + unit. Examples:
  "130 grams" → quantity_value: 130, quantity_unit: "g"
  "3 slice" / "3 slices" → quantity_value: 3, quantity_unit: "slice"
  "2 unit" / "2 whole" → quantity_value: 2, quantity_unit: "unit"
  "1 scoop" → quantity_value: 1, quantity_unit: "scoop"
  "5 ml" → quantity_value: 5, quantity_unit: "ml"
  "1 tbsp" → quantity_value: 1, quantity_unit: "tbsp"
- Never store the unit inside "name". "Turkey Bacon" not "Turkey Bacon 3 slices".

MACRO RULES (MANDATORY):
- If the PDF row gives calories/protein/carbs/fat, those numbers ARE the source of truth.
  Copy them verbatim. Do NOT round, infer, recalculate, or substitute from any database.
- Strip the trailing "g" from macro cells (e.g. "13g" → 13).
- If a macro cell is blank or missing, use 0.

DAY TYPE CLASSIFICATION RULES (MANDATORY):
- If the day_label or any header above the day contains: "workout", "training", "lift", "lifting", "gym", "high carb", "high-carb", "on day", "on-day" → set day_type = "training"
- If it contains: "rest", "non-training", "non-workout", "off day", "off-day", "recovery", "low carb", "low-carb" → set day_type = "rest"
- If exactly two days are present and neither matches a keyword above, default the FIRST day to "training" and the SECOND to "rest".
- If only one day is present and no keyword matches, set day_type = "all_days".
- If both detected days resolve to the same type, force the second to the opposite type.

Always include the day_type field. Do NOT omit it.`;
  }


  // supplement
  return `${base}

Extract supplement stack data. Return JSON in this format:
{
  "plan_name": "string (e.g. 'Client Name Stack' or 'Supplement Protocol')",
  "supplements": [
    {
      "name": "string (supplement name in Title Case, e.g. 'Multivitamin (Triumph)', 'Vitamin D3 + K2', 'Berberine')",
      "brand": "string or null (brand if a product line follows the heading, e.g. 'Legion', 'Triumph', 'CanPrev')",
      "dosage": "string (numeric amount only, e.g. '5', '3000', '500')",
      "dosage_unit": "string (unit only, e.g. 'g', 'mg', 'IU', 'mcg', 'pills', 'tsp', 'TBSP', 'capsule', 'drop')",
      "timing_slot": "string (MUST be one of: 'fasted', 'meal_1', 'meal_2', 'pre_workout', 'post_workout', 'before_bed', 'with_meal', 'any_time')",
      "coach_note": "string or null (dosing instructions, when to take, combo dosages, special notes)",
      "reason": "string or null (why this supplement is recommended)"
    }
  ]
}

CRITICAL NAME RULES (MANDATORY — never break these):
1. The "name" field MUST NEVER be empty, null, or missing.
2. If a dosage line ("3 pills / day", "5000 IU", "500mg berberine") has no inline product name, walk UPWARD to the nearest ALL-CAPS or Title-Case section heading (e.g. MULTIVITAMIN, VITAMIN D3 + K2, BERBERINE, FISH OIL, IODINE, PROBIOTICS, PSYLLIUM HUSK, MAGNESIUM, CREATINE) and use that as the "name" in Title Case.
3. If the line right after the heading is a product/brand line (single word like "Triumph", "Legion", or "Nutrawave"), put it in "brand" — do NOT replace "name" with it.
4. As an absolute last resort, set "name": "Unmapped Supplement". NEVER leave it blank.

COMBO ENTRY RULES (very important):
- If a heading combines two ingredients with "+", "&", "and", "/", or "OR" (e.g. "VITAMIN D3 + K2", "MAGNESIUM SUCROSOMIAL OR BIGLYCINATE"), output ONE single supplement row (not two).
- The "name" is the full combo in Title Case ("Vitamin D3 + K2").
- "dosage" and "dosage_unit" use the FIRST listed dosage (e.g. for "Vit D 5000 IU /D day, K2 90 MCG" → dosage="5000", dosage_unit="IU").
- Put ALL component dosages in "coach_note" (e.g. coach_note: "D3 5000 IU + K2 90 MCG").

WORKED EXAMPLES from a typical PC weekly PDF:

PDF text:
  MULTIVITAMIN
  Triumph
  3 pills / day (morning with first meal)
→ { "name": "Multivitamin (Triumph)", "brand": "Legion", "dosage": "3", "dosage_unit": "pills", "timing_slot": "meal_1", "coach_note": "Morning with first meal" }

PDF text:
  VITAMIN D3 + K2
  Vit D 5000 IU /D day (morning with first meal)
  K2 90 MCG
→ { "name": "Vitamin D3 + K2", "dosage": "5000", "dosage_unit": "IU", "timing_slot": "meal_1", "coach_note": "D3 5000 IU + K2 90 MCG, morning with first meal" }

PDF text:
  Berberine
  WORKOUT DAYS: Take 1 pill with meal 2
→ { "name": "Berberine", "dosage": "500", "dosage_unit": "mg", "timing_slot": "meal_2", "coach_note": "Workout days: 1 pill with meal 2" }

TIMING SLOT MAPPING RULES:
- "morning", "fasted", "empty stomach", "before any meal", "with ACV" → "fasted"
- "with meal 1", "with first meal", "with breakfast", "morning with first meal" → "meal_1"
- "with meal 2", "with second meal", "with lunch" → "meal_2"
- "pre-workout", "before workout", "before training" → "pre_workout"
- "post-workout", "after workout", "after training" → "post_workout"
- "before bed", "before sleep", "at night", "bedtime" → "before_bed"
- "with highest carb meal", "with largest meal" → "with_meal"
- "any time", "as needed", "throughout the day" → "any_time"

If a supplement has MULTIPLE timings on DIFFERENT days (e.g. "Workout days: meal 2 / Rest days: meal 1"), still output ONE row and describe the variation in coach_note. Only split into multiple rows if the SAME day has two distinct doses at two distinct times.

IMPORTANT: Extract dosage as a clean number and unit separately. For example "5g/day" → dosage: "5", dosage_unit: "g". For "3 pills" → dosage: "3", dosage_unit: "pills".`;
}



// Single threshold per spec: 80% auto-accept (green), below = needs review (red).
const AUTO_ACCEPT_SCORE = 80;

async function loadSynonyms(db: any): Promise<SynonymMap> {
  const { data } = await db.from("exercise_synonyms").select("term, canonical");
  const map: SynonymMap = new Map();
  for (const row of data || []) {
    const term = (row.term || "").toLowerCase().trim();
    const canon = (row.canonical || "").toLowerCase().trim();
    if (!term || !canon) continue;
    const arr = map.get(term) || [];
    arr.push(canon);
    map.set(term, arr);
  }
  return map;
}

function levelFor(score: number): "green" | "red" {
  return score >= AUTO_ACCEPT_SCORE ? "green" : "red";
}

/** ilike OR clause for trigram-prefiltered candidate selection. */
function buildOrClause(tokens: string[], column: string): string {
  if (tokens.length === 0) return "";
  return tokens.map((t) => `${column}.ilike.%${t.replace(/[%_]/g, "")}%`).join(",");
}

async function matchExercises(db: any, extracted: any) {
  const days = extracted.days || extracted.workout_days || [];
  const allExerciseNames: string[] = [];
  for (const day of days) {
    for (const ex of day.exercises || []) {
      if (ex.name) allExerciseNames.push(ex.name);
    }
  }
  if (allExerciseNames.length === 0) return { exercises: {} };

  const syn = await loadSynonyms(db);

  // Load remembered aliases (normalized → exercise_id)
  const aliasMap = new Map<string, { id: string; name: string }>();
  const normalizedSet = Array.from(
    new Set(allExerciseNames.map((n) => expandTokens(normalize(n), syn))),
  ).filter(Boolean);

  if (normalizedSet.length > 0) {
    const { data: aliases } = await db
      .from("exercise_extraction_aliases")
      .select("normalized_name, exercise_id, exercises:exercise_id(id, name)")
      .in("normalized_name", normalizedSet);
    for (const row of aliases || []) {
      if (row.exercises?.id) {
        aliasMap.set(row.normalized_name, { id: row.exercises.id, name: row.exercises.name });
      }
    }
  }

  // Build a candidate pool by trigram-prefiltering per exercise, plus a global fallback
  const exerciseMatches: Record<string, any> = {};

  for (const pdfName of allExerciseNames) {
    const normExpanded = expandTokens(normalize(pdfName), syn);

    // 1. Alias hit → 100
    const alias = aliasMap.get(normExpanded);
    if (alias) {
      exerciseMatches[pdfName] = {
        pdf_name: pdfName,
        matched_id: alias.id,
        matched_name: alias.name,
        confidence: 100,
        confidence_level: "green",
        from_alias: true,
      };
      continue;
    }

    // 2. Trigram-prefiltered candidate query
    const tokens = candidateTokens(pdfName, syn);
    let candidates: any[] = [];
    if (tokens.length > 0) {
      const orClause = buildOrClause(tokens, "name");
      const { data } = await db
        .from("exercises")
        .select("id, name, primary_muscle, equipment")
        .or(orClause)
        .limit(50);
      candidates = data || [];
    }

    // Fallback: if no token candidates (very short name), pull a broader sample
    if (candidates.length === 0) {
      const { data } = await db
        .from("exercises")
        .select("id, name, primary_muscle, equipment")
        .ilike("name", `%${normExpanded.split(" ")[0] || pdfName}%`)
        .limit(50);
      candidates = data || [];
    }

    let bestMatch: any = null;
    let bestScore = 0;
    for (const cat of candidates) {
      const candNorm = expandTokens(normalize(cat.name), syn);
      const score = scoreNormalized(normExpanded, candNorm);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = cat;
      }
    }

    exerciseMatches[pdfName] = {
      pdf_name: pdfName,
      matched_id: bestMatch?.id || null,
      matched_name: bestMatch?.name || null,
      confidence: Math.round(bestScore) / 100, // keep legacy 0..1 shape
      confidence_score: Math.round(bestScore), // new 0..100
      confidence_level: levelFor(bestScore),
    };
  }
  return { exercises: exerciseMatches };
}

async function matchFoods(db: any, extracted: any, coachId: string) {
  // Collect each food row with its PDF macros so we can use them to disambiguate
  // verified/global candidates when no coach custom food matches by name.
  type PdfRow = {
    name: string;
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
    quantity_value?: number;
    quantity_unit?: string;
  };
  const allFoodRows: PdfRow[] = [];
  const seenNames = new Set<string>();
  for (const day of extracted.days || []) {
    for (const meal of day.meals || []) {
      for (const food of meal.foods || []) {
        if (!food?.name) continue;
        // Match keying is by name (multiple rows with same name reuse same match) —
        // keep the first occurrence's macros for fallback scoring.
        if (seenNames.has(food.name)) continue;
        seenNames.add(food.name);
        allFoodRows.push({
          name: food.name,
          calories: Number(food.calories) || 0,
          protein: Number(food.protein) || 0,
          carbs: Number(food.carbs) || 0,
          fat: Number(food.fat) || 0,
          quantity_value: Number(food.quantity_value) || 0,
          quantity_unit: String(food.quantity_unit || "").toLowerCase(),
        });
      }
    }
  }
  if (allFoodRows.length === 0) return { foods: {} };

  const syn = await loadSynonyms(db);
  const foodMatches: Record<string, any> = {};

  // --- Custom foods threshold (name-first within coach's library) ---
  const CUSTOM_NAME_THRESHOLD = 60;

  // Estimate per-gram calories for a candidate. Returns null if unknown.
  function candidatePerGramCal(c: any): number | null {
    const serving = Number(c.serving_size) || 0;
    const cal = Number(c.calories) || 0;
    if (serving > 0 && cal > 0 && String(c.serving_unit || "g").toLowerCase() === "g") {
      return cal / serving;
    }
    return null;
  }

  // Macro distance: percentage difference between PDF row macros and what the
  // candidate would produce at the same gram weight. Lower = closer. Range 0..100.
  function macroDistance(row: PdfRow, c: any): number {
    const perG = candidatePerGramCal(c);
    if (perG == null) return 50; // unknown — neutral
    // Only meaningful when PDF unit is grams (or convertible). Otherwise compare per 100g.
    const gramBasis =
      row.quantity_unit === "g" || row.quantity_unit === "grm" || row.quantity_unit === "gram"
        ? row.quantity_value || 100
        : 100;
    const pdfCal = row.quantity_unit === "g" ? row.calories || 0 : (row.calories || 0);
    const candCalAtBasis = perG * gramBasis;
    if (!pdfCal && !candCalAtBasis) return 0;
    const diff = Math.abs(pdfCal - candCalAtBasis) / Math.max(pdfCal, candCalAtBasis, 1);
    // Also factor protein/carbs/fat per 100g if available
    const candProteinPer100 = Number(c.protein) && Number(c.serving_size)
      ? (Number(c.protein) / Number(c.serving_size)) * 100 : 0;
    const candCarbsPer100 = Number(c.carbs) && Number(c.serving_size)
      ? (Number(c.carbs) / Number(c.serving_size)) * 100 : 0;
    const candFatPer100 = Number(c.fat) && Number(c.serving_size)
      ? (Number(c.fat) / Number(c.serving_size)) * 100 : 0;
    // Estimate PDF per 100g if grams
    let macroDiff = 0;
    if (row.quantity_unit === "g" && (row.quantity_value || 0) > 0) {
      const k = 100 / row.quantity_value!;
      const pP = (row.protein || 0) * k;
      const pC = (row.carbs || 0) * k;
      const pF = (row.fat || 0) * k;
      const d = (a: number, b: number) =>
        a + b === 0 ? 0 : Math.abs(a - b) / Math.max(a, b, 1);
      macroDiff = (d(pP, candProteinPer100) + d(pC, candCarbsPer100) + d(pF, candFatPer100)) / 3;
    }
    // Composite (lower = better). Convert to 0..100 percentage distance.
    return Math.min(100, Math.round((diff * 0.6 + macroDiff * 0.4) * 100));
  }

  async function queryBucket(tokens: string[], pdfName: string, normExpanded: string, filter: (q: any) => any) {
    let candidates: any[] = [];
    if (tokens.length > 0) {
      const orClause = buildOrClause(tokens, "name");
      const q = filter(db.from("food_items").select("id, name, brand, calories, protein, carbs, fat, serving_size, serving_unit, created_by, is_verified")).or(orClause).limit(50);
      const { data } = await q;
      candidates = data || [];
    }
    if (candidates.length === 0) {
      const q = filter(db.from("food_items").select("id, name, brand, calories, protein, carbs, fat, serving_size, serving_unit, created_by, is_verified")).ilike("name", `%${normExpanded.split(" ")[0] || pdfName}%`).limit(50);
      const { data } = await q;
      candidates = data || [];
    }
    return candidates;
  }

  function bestByName(candidates: any[], pdfNorm: string): { match: any; score: number } {
    let bestMatch: any = null;
    let bestScore = 0;
    for (const cat of candidates) {
      const candNorm = expandTokens(normalize(cat.name), syn);
      let score = scoreNormalized(pdfNorm, candNorm);
      if (candNorm.includes(pdfNorm) || pdfNorm.includes(candNorm)) score += 10;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = cat;
      }
    }
    return { match: bestMatch, score: bestScore };
  }

  function bestByMacrosAndName(candidates: any[], pdfNorm: string, row: PdfRow): { match: any; score: number } {
    let bestMatch: any = null;
    let bestComposite = -Infinity;
    let bestNameScore = 0;
    for (const cat of candidates) {
      const candNorm = expandTokens(normalize(cat.name), syn);
      let nameScore = scoreNormalized(pdfNorm, candNorm);
      if (candNorm.includes(pdfNorm) || pdfNorm.includes(candNorm)) nameScore += 10;
      // Macro distance 0 (perfect) .. 100 (far). Convert to "macro score" 0..100.
      const macroScore = 100 - macroDistance(row, cat);
      // Composite: name weighted 55%, macro 45% — macros tip the balance among similarly-named candidates.
      const composite = nameScore * 0.55 + macroScore * 0.45;
      if (composite > bestComposite) {
        bestComposite = composite;
        bestMatch = cat;
        bestNameScore = nameScore;
      }
    }
    return { match: bestMatch, score: bestNameScore };
  }

  for (const row of allFoodRows) {
    const pdfName = row.name;
    const normExpanded = expandTokens(normalize(pdfName), syn);
    const tokens = candidateTokens(pdfName, syn);

    let source: string = "none";
    let chosen: any = null;
    let chosenScore = 0;

    // Phase 1: Coach's custom foods ONLY — name-first match. Prefer these whenever a reasonable name match exists.
    const coachCandidates = await queryBucket(tokens, pdfName, normExpanded, (q) => q.eq("created_by", coachId));
    if (coachCandidates.length > 0) {
      const { match, score } = bestByName(coachCandidates, normExpanded);
      if (match && score >= CUSTOM_NAME_THRESHOLD) {
        chosen = match;
        chosenScore = Math.max(score, 90); // coach custom wins → high confidence
        source = "coach_library";
      }
    }

    // Phase 2: Fallback to verified DB, then global — pick by closest calories + macros to PDF row.
    if (!chosen) {
      const verifiedCandidates = await queryBucket(tokens, pdfName, normExpanded, (q) => q.eq("is_verified", true));
      if (verifiedCandidates.length > 0) {
        const { match, score } = bestByMacrosAndName(verifiedCandidates, normExpanded, row);
        if (match) {
          chosen = match;
          chosenScore = score;
          source = "verified";
        }
      }
    }
    if (!chosen) {
      const globalCandidates = await queryBucket(tokens, pdfName, normExpanded, (q) => q);
      if (globalCandidates.length > 0) {
        const { match, score } = bestByMacrosAndName(globalCandidates, normExpanded, row);
        if (match) {
          chosen = match;
          chosenScore = score;
          source = "global";
        }
      }
    }

    foodMatches[pdfName] = {
      pdf_name: pdfName,
      matched_id: chosen?.id || null,
      matched_name: chosen?.name || null,
      matched_brand: chosen?.brand || null,
      source: chosen ? source : "none",
      confidence: Math.round(chosenScore) / 100,
      confidence_score: Math.round(chosenScore),
      confidence_level: levelFor(chosenScore),
    };
  }
  return { foods: foodMatches };
}



async function loadSupplementSynonyms(db: any): Promise<SynonymMap> {
  const map: SynonymMap = new Map();
  try {
    const { data } = await db.from("supplement_synonyms").select("term, canonical");
    for (const row of data || []) {
      const term = (row.term || "").toLowerCase().trim();
      const canon = (row.canonical || "").toLowerCase().trim();
      if (!term || !canon) continue;
      const arr = map.get(term) || [];
      arr.push(canon);
      map.set(term, arr);
    }
  } catch (_e) { /* table may not exist yet */ }
  return map;
}

async function matchSupplements(db: any, extracted: any) {
  const supplements = extracted.supplements || [];
  if (supplements.length === 0) return { supplements: {} };

  const syn = await loadSupplementSynonyms(db);
  const SUPP_AUTO_ACCEPT = 65; // lower than exercises — short supplement names trigram-score lower

  const { data: catalog } = await db
    .from("master_supplements")
    .select("id, name, brand, default_dosage, default_dosage_unit, is_master")
    .eq("is_active", true)
    .limit(1000);

  const suppMatches: Record<string, any> = {};
  for (const supp of supplements) {
    if (!supp.name) continue;
    const pdfNorm = normalize(supp.name);
    const normExpanded = expandTokens(pdfNorm, syn);
    let bestMatch: any = null;
    let bestScore = 0;
    for (const cat of catalog || []) {
      const catName = normalize(cat.name);
      const candNorm = expandTokens(catName, syn);
      let score = scoreNormalized(normExpanded, candNorm);
      // Substring boost: "multivitamin" ⊂ "multivitamin triumph" → force-accept
      if (pdfNorm.length >= 4 && (catName.includes(pdfNorm) || pdfNorm.includes(catName))) {
        score = Math.max(score, 90);
      }
      // Prefer is_master canonical rows when scores tie
      if (score > bestScore || (score === bestScore && cat.is_master && !bestMatch?.is_master)) {
        bestScore = score;
        bestMatch = cat;
      }
    }
    suppMatches[supp.name] = {
      pdf_name: supp.name,
      matched_id: bestScore >= SUPP_AUTO_ACCEPT ? bestMatch?.id : null,
      matched_name: bestScore >= SUPP_AUTO_ACCEPT ? bestMatch?.name : null,
      confidence: Math.round(bestScore) / 100,
      confidence_score: Math.round(bestScore),
      confidence_level: bestScore >= SUPP_AUTO_ACCEPT ? "green" : "red",
    };
  }
  return { supplements: suppMatches };
}
