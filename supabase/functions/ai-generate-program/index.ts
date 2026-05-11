// supabase/functions/ai-generate-program/index.ts
//
// Coach-only AI program generator (J3U methodology).
// Reads client onboarding + recent progress photo, calls Lovable AI Gateway
// (Gemini 2.5 Pro Vision), validates the generated program against J3U rules,
// and returns a preview payload to the coach. Saving to the database is done
// client-side via a separate mutation flow.
//
// Vision: Gemini 2.5 Pro can ingest a base64 image inline. We pass the most
// recent progress photo so the model can co-estimate body fat / size.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { findExerciseInLibrary, normalizeExerciseName } from "./fuzzy.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// ---------- forbidden lists (encoded server-side too) ----------
const PULL_DAY_FORBIDDEN = [
  "hamstring", "glute", "quad", "calf", "hip thrust", "glute bridge",
  "romanian deadlift", "stiff leg deadlift", "stiff-leg deadlift",
  "deadlift", "good morning", "leg curl", "leg extension", "leg press",
  "hack squat", "squat", "lunge", "split squat", "step up", "step-up",
  "hip abductor", "hip adductor", "calf raise", "donkey calf", "kickback",
];

const UPPER_PUSH_LOWER_TOKENS = [
  "leg", "squat", "deadlift", "lunge", "calf", "glute", "hamstring", "quad",
  "hip thrust", "leg curl", "leg extension", "leg press", "hack squat",
  "split squat", "step up", "step-up",
];

const BODYWEIGHT_TOKENS = [
  "pull-up", "pull up", "pullup", "chin-up", "chin up", "chinup",
  "dip", "push-up", "push up", "pushup", "muscle up", "muscle-up",
  "inverted row", "australian pull",
];

interface AIExercise {
  name: string;
  sets: number;
  reps: string;
  rest_seconds: number;
  notes: string;
  is_amrap?: boolean;
  primary_muscle?: string | null;
}
interface AIDay {
  day_label: string;          // e.g. "Push", "Pull", "Legs", "Upper", "Lower", "Full Body A"
  day_of_week: number;        // 0-6 (0=Mon)
  category: "push" | "pull" | "legs" | "upper" | "lower" | "fullbody";
  exercises: AIExercise[];
}
interface AIProgram {
  rationale: string;
  conflict_flags: string[];
  weekly_volume: Record<string, number>;
  days: AIDay[];
}

const containsAny = (haystack: string, needles: string[]) =>
  needles.some((n) => haystack.includes(n));

const isBodyweightExercise = (name: string) =>
  containsAny(name.toLowerCase(), BODYWEIGHT_TOKENS);

function validateProgram(
  prog: AIProgram,
  ctx: {
    availableDays: number;
    library: { id: string; name: string; primary_muscle?: string | null; equipment?: string | null }[];
    planetFitness: boolean;
    cannotDoTokens: string[];
    previousExerciseNames: Set<string>;
    focusMuscle: string | null;
    focusBumpAllowed: boolean;
  },
): { ok: boolean; errors: string[]; resolvedDays: AIDay[] } {
  const errors: string[] = [];
  const days = prog.days || [];

  if (days.length === 0) errors.push("No training days returned.");
  if (days.length > 5) errors.push("More than 5 training days (cap is 5).");
  if (days.length > ctx.availableDays) {
    errors.push(`Returned ${days.length} days but client only has ${ctx.availableDays} available.`);
  }

  // Resolve every exercise to library
  const resolvedDays: AIDay[] = [];
  for (const day of days) {
    const resolvedExercises: AIExercise[] = [];
    for (const ex of day.exercises || []) {
      const match = findExerciseInLibrary(ex.name, ctx.library);
      if (!match) {
        errors.push(`Exercise "${ex.name}" on ${day.day_label} not found in library.`);
        continue;
      }
      const canonical = match.exercise;
      const lowered = canonical.name.toLowerCase();

      // Cannot-do list
      if (ctx.cannotDoTokens.some((t) => lowered.includes(t))) {
        errors.push(`Exercise "${canonical.name}" is on the client's cannot-do list.`);
      }

      // Planet Fitness barbell filter
      if (ctx.planetFitness) {
        const eq = (canonical.equipment || "").toLowerCase();
        if (eq.includes("barbell") || lowered.includes("barbell")) {
          errors.push(`Barbell exercise "${canonical.name}" not allowed at Planet Fitness.`);
        }
      }

      // Pull/Push/Upper day forbidden tokens
      const lowerName = lowered;
      if (day.category === "pull" && containsAny(lowerName, PULL_DAY_FORBIDDEN)) {
        errors.push(`Lower-body exercise "${canonical.name}" cannot appear on a Pull day.`);
      }
      if ((day.category === "push" || day.category === "upper") &&
          containsAny(lowerName, UPPER_PUSH_LOWER_TOKENS)) {
        errors.push(`Lower-body exercise "${canonical.name}" cannot appear on ${day.day_label}.`);
      }

      // Previous-program reuse
      const norm = normalizeExerciseName(canonical.name);
      if (ctx.previousExerciseNames.has(norm)) {
        errors.push(`Exercise "${canonical.name}" was used in the immediately previous phase.`);
      }

      // AMRAP rule
      const repsLower = (ex.reps || "").toLowerCase();
      const amrap = ex.is_amrap || repsLower.includes("amrap") || repsLower.includes("failure");
      if (amrap && !isBodyweightExercise(canonical.name)) {
        errors.push(`AMRAP only allowed on bodyweight movements. "${canonical.name}" is not bodyweight.`);
      }

      // No coaching note
      if (!ex.notes || ex.notes.trim().length < 10) {
        errors.push(`Exercise "${canonical.name}" missing a coaching note.`);
      }

      resolvedExercises.push({
        ...ex,
        name: canonical.name,
        primary_muscle: canonical.primary_muscle || ex.primary_muscle || null,
        is_amrap: amrap,
      });
    }
    resolvedDays.push({ ...day, exercises: resolvedExercises });
  }

  // Weekly volume per muscle (hard ceiling 22)
  const volume: Record<string, number> = {};
  for (const day of resolvedDays) {
    for (const ex of day.exercises) {
      const m = (ex.primary_muscle || "").toLowerCase().trim();
      if (!m) continue;
      volume[m] = (volume[m] || 0) + (ex.sets || 0);
    }
  }
  for (const [m, sets] of Object.entries(volume)) {
    if (sets > 22) errors.push(`${m} programmed at ${sets} sets/wk (ceiling 22).`);
  }
  prog.weekly_volume = volume;

  return { ok: errors.length === 0, errors, resolvedDays };
}

function buildSystemPrompt(): string {
  return `You are a senior hypertrophy coach generating an 8-week training program in the J3U (John Jewett) methodology.

OUTPUT FORMAT: You will be asked to call the function "submit_program" with the structured program. Do not write the program in plain text.

HARD RULES (non-negotiable):
1. Cap at 5 training days/week. Never 6.
2. Same exercises every week for all 8 weeks. Coach manually progresses load.
3. NO RPE in any field. Columns are Exercise, Sets, Reps, Rest, Notes.
4. AMRAP allowed ONLY on bodyweight movements (pull-ups, dips, push-ups, etc.). For loaded movements use a numeric rep range.
5. Exercise selection MUST come from the provided library. Do not invent exercises. Use exact names where possible.
6. Do NOT use any exercise from the immediately previous phase (the "forbidden" list provided).
7. Pull days: ONLY back, rear delts, biceps. NO hamstrings, glutes, quads, calves, deadlifts of any kind, RDLs, leg curls, hip thrusts, lunges, squats. Back extensions are OK only as back-thickness work, not as a hip hinge.
8. Upper days: chest, back, shoulders, biceps, triceps. No lower body.
9. Push days: chest, shoulders, triceps. No lower body.
10. All hamstring/glute/quad/calf work goes on Legs (5-day), Lower (4-day Upper/Lower or 5-day), or Full Body days (3-day).
11. Split selection by available days: 3 → Full Body A/B/C OR Upper/Lower/Full; 4 → Upper/Lower/Upper/Lower OR Chest+Back+Arms / Legs+Shoulders A/B; 5 → Push/Pull/Legs/Upper/Lower.
12. Order within a session: focus-area muscle first, then heavy compound primary, heavy compound secondary, isolation primary, isolation secondary, optional finisher (isolation only).
13. Weekly working sets per muscle: focus-area / lagging 16-22, average 10-16, strong 8-12. Calves and abs 10-20. HARD CEILING 22 sets per muscle per week.
14. Reps: heavy compound 6-10, secondary compound 8-12, isolation 10-15, stretch-loaded isolation 12-20.
15. Rest seconds: heavy compound 120-180, secondary compound 90-120, isolation 60-90.
16. Every exercise must have a 1-2 sentence J3U-style execution cue (specific to the lift — bracing, tempo, ROM).
17. Respect injuries and the client's cannot-do list. Avoid contraindicated variants.
18. Equipment filter: Planet Fitness = no barbells. Home gym = only what is in the equipment list. Full commercial = no filter.
19. If client is high-BF + high-BW (subjective; rough threshold 30%+ BF and 230+ lb), avoid weighted walking lunges, pull-ups, dips, plyometrics, deep barbell squats. Bias toward seated and machine-supported moves.
20. Focus area: train it FIRST in every session it appears AND bump volume to 16-22 sets/wk — UNLESS the focus area is abs/belly/stomach/midsection. In that case, do NOT bump ab volume; raise a conflict_flag noting it is a body-comp (nutrition) priority.
21. Rest seconds: ALWAYS use 120 seconds for every exercise, EXCEPT abdominal/core exercises which use 60 seconds. Do not vary.
22. Do NOT include warmups, mobility drills, or activation work — the system auto-prepends a mobility routine to every workout.

Return rationale (1 short paragraph), conflict_flags (array of strings), weekly_volume (per primary muscle, sets/wk), and days (array). For each day include day_label (e.g. "Push", "Pull", "Legs", "Upper A", "Lower A", "Full Body A"), day_of_week (0=Mon ... 6=Sun), category (push/pull/legs/upper/lower/fullbody), and exercises (each with name, sets, reps, rest_seconds, notes, is_amrap, primary_muscle).`;
}

function buildUserPrompt(p: {
  client: any;
  onboarding: any;
  bodyFat: number | null;
  weightLb: number | null;
  heightDisplay: string;
  availableDays: number;
  trainingLocation: string;
  homeEquipment: string;
  injuries: string;
  focusMuscle: string;
  focusBumpAllowed: boolean;
  cannotDoNote: string;
  coachOverride: string;
  library: { name: string; primary_muscle?: string | null; equipment?: string | null }[];
  forbiddenExercises: string[];
}): string {
  const libBrief = p.library
    .slice(0, 400)
    .map((e) => `${e.name}${e.primary_muscle ? ` [${e.primary_muscle}]` : ""}${e.equipment ? ` (${e.equipment})` : ""}`)
    .join("\n");

  return `CLIENT PROFILE
Name: ${p.client?.full_name || "Client"}
Height: ${p.heightDisplay}
Weight: ${p.weightLb ? `${p.weightLb} lb` : "unknown"}
Body fat %: ${p.bodyFat != null ? p.bodyFat : "unknown — estimate from photo"}
Available days/week: ${p.availableDays}
Training location: ${p.trainingLocation}
Home equipment list: ${p.homeEquipment || "n/a"}
Injuries / surgeries: ${p.injuries || "none reported"}
Cannot-do notes (free-text): ${p.cannotDoNote || "none"}
Focus area: ${p.focusMuscle || "balanced"} (volume bump ${p.focusBumpAllowed ? "ALLOWED" : "FORBIDDEN — abs/midsection focus, raise conflict_flag"})

COACH OVERRIDE NOTES:
${p.coachOverride || "(none)"}

EXERCISES FORBIDDEN (used in immediately previous phase — do NOT include these):
${p.forbiddenExercises.length ? p.forbiddenExercises.join(", ") : "(none)"}

EXERCISE LIBRARY (use exact names from this list, fuzzy variants will be auto-resolved):
${libBrief}

Generate the 8-week J3U program for this client. Call submit_program with the structured output.`;
}

const PROGRAM_TOOL = {
  type: "function",
  function: {
    name: "submit_program",
    description: "Submit the generated 8-week J3U training program.",
    parameters: {
      type: "object",
      properties: {
        rationale: { type: "string" },
        conflict_flags: { type: "array", items: { type: "string" } },
        weekly_volume: {
          type: "object",
          additionalProperties: { type: "number" },
        },
        days: {
          type: "array",
          items: {
            type: "object",
            properties: {
              day_label: { type: "string" },
              day_of_week: { type: "number" },
              category: { type: "string", enum: ["push", "pull", "legs", "upper", "lower", "fullbody"] },
              exercises: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    sets: { type: "number" },
                    reps: { type: "string" },
                    rest_seconds: { type: "number" },
                    notes: { type: "string" },
                    is_amrap: { type: "boolean" },
                    primary_muscle: { type: "string" },
                  },
                  required: ["name", "sets", "reps", "rest_seconds", "notes"],
                },
              },
            },
            required: ["day_label", "day_of_week", "category", "exercises"],
          },
        },
      },
      required: ["rationale", "days"],
    },
  },
};

// ---------- main handler ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY not configured" }, 500);

    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Auth + coach role check
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const coachUserId = userData.user.id;

    const { data: rolesData } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", coachUserId);
    const roles = (rolesData || []).map((r: any) => r.role);
    if (!roles.includes("coach") && !roles.includes("admin")) {
      return json({ error: "Coach role required" }, 403);
    }

    const body = await req.json();
    const { clientId, currentPhaseId, coachOverride } = body || {};
    if (!clientId) return json({ error: "clientId required" }, 400);

    // Fetch in parallel
    const [
      profileR, onboardingR, photoR, libraryR, currentPhaseEndR, prevExercisesR,
    ] = await Promise.allSettled([
      admin.from("profiles").select("user_id, full_name").eq("user_id", clientId).maybeSingle(),
      admin.from("onboarding_profiles").select("*").eq("user_id", clientId).maybeSingle(),
      admin.from("progress_photos")
        .select("id, storage_path, photo_date, created_at")
        .eq("client_id", clientId)
        .order("photo_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin.from("exercises")
        .select("id, name, primary_muscle, secondary_muscle, equipment, category, movement_pattern")
        .order("name", { ascending: true })
        .limit(800),
      currentPhaseId
        ? admin.from("calendar_events")
            .select("event_date")
            .eq("target_client_id", clientId)
            .eq("event_type", "workout")
            .order("event_date", { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      currentPhaseId
        ? admin.from("program_workouts")
            .select("workout_id, workout_exercises:workouts!inner(workout_exercises(exercise_id, exercises(name)))")
            .eq("phase_id", currentPhaseId)
        : Promise.resolve({ data: [] }),
    ]);

    const profile = profileR.status === "fulfilled" ? (profileR.value as any).data : null;
    const onboarding = onboardingR.status === "fulfilled" ? (onboardingR.value as any).data : null;
    const photo = photoR.status === "fulfilled" ? (photoR.value as any).data : null;
    const library = (libraryR.status === "fulfilled" ? (libraryR.value as any).data : []) || [];
    const currentPhaseEnd = currentPhaseEndR.status === "fulfilled" ? (currentPhaseEndR.value as any).data : null;

    if (!onboarding) {
      return json({ error: "Client has no onboarding profile on file." }, 400);
    }

    // Body fat resolution
    const storedBF: number | null =
      onboarding.bodyfat_final_confirmed ??
      onboarding.estimated_body_fat_pct ??
      null;

    // Photo download (base64) for vision
    let photoDataUrl: string | null = null;
    if (photo?.storage_path) {
      try {
        const { data: blob } = await admin.storage.from("progress-photos").download(photo.storage_path);
        if (blob) {
          const buf = await blob.arrayBuffer();
          // Encode chunked to avoid call-stack overflow
          const bytes = new Uint8Array(buf);
          let bin = "";
          const chunk = 0x8000;
          for (let i = 0; i < bytes.length; i += chunk) {
            bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
          }
          const b64 = btoa(bin);
          const ext = (photo.storage_path.split(".").pop() || "jpeg").toLowerCase();
          const mime = ext === "png" ? "image/png" : "image/jpeg";
          photoDataUrl = `data:${mime};base64,${b64}`;
        }
      } catch (e) {
        console.warn("[ai-generate-program] photo download failed:", e);
      }
    }

    if (!photoDataUrl && storedBF == null) {
      return json({
        error: "Cannot generate: client has no progress photo and no body fat % on file. Please ask the client to upload a photo or enter a manual estimate.",
      }, 400);
    }

    // Onboarding-derived fields
    const trainingLocation = onboarding.training_location || "unknown";
    const homeEquipment = onboarding.home_equipment_list || "";
    const planetFitness = /planet\s*fitness/i.test(trainingLocation);

    const heightDisplay = onboarding.height_feet != null
      ? `${onboarding.height_feet}'${onboarding.height_inches || 0}"`
      : (onboarding.height_cm ? `${onboarding.height_cm} cm` : "unknown");

    const weightLb = onboarding.weight_lb ?? (onboarding.current_weight_kg ? Number((onboarding.current_weight_kg * 2.20462).toFixed(1)) : null);

    const availableDaysList: string[] = Array.isArray(onboarding.available_days) ? onboarding.available_days : [];
    let availableDays = Math.min(5, availableDaysList.length || 0);
    if (availableDays === 0) {
      // fallback: parse "3" from workout_days_realistic
      const m = (onboarding.workout_days_realistic || "").match(/\d+/);
      availableDays = m ? Math.min(5, parseInt(m[0])) : 4;
    }

    const focusMuscleRaw: string =
      onboarding.work_on_most || onboarding.favorite_body_part || "";
    const focusBumpAllowed = !/abs|belly|stomach|midsection|gut|core/i.test(focusMuscleRaw);

    const injuries = [onboarding.injuries, onboarding.surgeries].filter(Boolean).join(" | ");
    const cannotDoNote = onboarding.final_notes || "";

    // Crude cannot-do tokens (free-text heuristic)
    const cannotDoTokens: string[] = [];
    const lowered = `${injuries} ${cannotDoNote}`.toLowerCase();
    ["squat", "deadlift", "bench", "overhead press", "lunge", "pull-up", "pullup",
     "dip", "row", "rdl", "hip thrust", "leg press"].forEach((tok) => {
      if (new RegExp(`(can'?t|no|avoid|skip|cannot)\\s+[^.]{0,30}${tok}`).test(lowered)) {
        cannotDoTokens.push(tok);
      }
    });

    // Previous-phase exercises
    const previousExerciseNames = new Set<string>();
    if (prevExercisesR.status === "fulfilled") {
      const rows: any[] = (prevExercisesR.value as any).data || [];
      // Re-query workouts properly — the chained select above is fragile, do a clean fallback
      const workoutIds = rows.map((r: any) => r.workout_id).filter(Boolean);
      if (workoutIds.length) {
        const { data: weRows } = await admin
          .from("workout_exercises")
          .select("exercises(name)")
          .in("workout_id", workoutIds);
        for (const we of weRows || []) {
          const nm = (we as any)?.exercises?.name;
          if (nm) previousExerciseNames.add(normalizeExerciseName(nm));
        }
      }
    }

    // Filter library to what coach can use given location
    let usableLibrary = library;
    if (planetFitness) {
      usableLibrary = library.filter((e: any) => {
        const eq = (e.equipment || "").toLowerCase();
        const nm = (e.name || "").toLowerCase();
        return !eq.includes("barbell") && !nm.includes("barbell");
      });
    }

    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt({
      client: profile,
      onboarding,
      bodyFat: storedBF,
      weightLb,
      heightDisplay,
      availableDays,
      trainingLocation,
      homeEquipment,
      injuries,
      focusMuscle: focusMuscleRaw,
      focusBumpAllowed,
      cannotDoNote,
      coachOverride: coachOverride || "",
      library: usableLibrary,
      forbiddenExercises: Array.from(previousExerciseNames),
    });

    // Build messages — Vision content if photo available
    const userContent: any = photoDataUrl
      ? [
          { type: "text", text: userPrompt },
          { type: "image_url", image_url: { url: photoDataUrl } },
        ]
      : userPrompt;

    let lastErrors: string[] = [];
    let resolvedDays: AIDay[] | null = null;
    let progResult: AIProgram | null = null;

    for (let attempt = 0; attempt < 2; attempt++) {
      const retryMsg = attempt > 0
        ? `\n\nPrevious attempt failed validation:\n- ${lastErrors.slice(0, 8).join("\n- ")}\n\nFix all issues and resubmit.`
        : "";

      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt + retryMsg },
            { role: "user", content: userContent },
          ],
          tools: [PROGRAM_TOOL],
          tool_choice: { type: "function", function: { name: "submit_program" } },
        }),
      });

      if (!aiResp.ok) {
        const txt = await aiResp.text();
        if (aiResp.status === 429) return json({ error: "AI rate limit hit. Please retry in a moment." }, 429);
        if (aiResp.status === 402) return json({ error: "AI credits exhausted. Top up Lovable AI workspace usage." }, 402);
        console.error("AI gateway error", aiResp.status, txt);
        return json({ error: `AI gateway error ${aiResp.status}` }, 502);
      }

      const aiJson = await aiResp.json();
      const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall?.function?.arguments) {
        lastErrors = ["AI did not return a structured program."];
        continue;
      }

      let parsed: AIProgram;
      try {
        parsed = JSON.parse(toolCall.function.arguments);
      } catch {
        lastErrors = ["AI returned invalid JSON."];
        continue;
      }

      const v = validateProgram(parsed, {
        availableDays,
        library: usableLibrary,
        planetFitness,
        cannotDoTokens,
        previousExerciseNames,
        focusMuscle: focusMuscleRaw,
        focusBumpAllowed,
      });

      if (v.ok) {
        progResult = parsed;
        resolvedDays = v.resolvedDays;
        lastErrors = [];
        break;
      }
      lastErrors = v.errors;
      progResult = parsed;
      resolvedDays = v.resolvedDays;
    }

    if (!progResult || !resolvedDays) {
      return json({ error: "AI generation failed.", errors: lastErrors }, 500);
    }

    // Compute schedule start = day after current phase end (or today)
    const startDate = (() => {
      const base = currentPhaseEnd?.event_date ? new Date(currentPhaseEnd.event_date) : new Date();
      const d = new Date(base);
      d.setDate(d.getDate() + 1);
      return d.toLocaleDateString("en-CA");
    })();
    const endDate = (() => {
      const d = new Date(startDate);
      d.setDate(d.getDate() + 55); // start + 55 = 56 day span (8w)
      return d.toLocaleDateString("en-CA");
    })();

    // ---------- Post-process: normalize rest times + prepend mobility drill ----------
    const AB_NAME_RE = /\b(ab|abs|core|crunch|plank|sit[- ]?up|leg raise|hanging|hollow|dead\s*bug|woodchop|russian twist|cable crunch|knee raise|toes?[- ]to[- ]bar|ab wheel)\b/i;
    const AB_MUSCLES = new Set(["abs", "core", "abdominals", "obliques"]);
    const isAb = (ex: AIExercise) => {
      const m = (ex.primary_muscle || "").toLowerCase().trim();
      return AB_MUSCLES.has(m) || AB_NAME_RE.test(ex.name || "");
    };

    const classifyDay = (label: string): "upper" | "lower" | "full" => {
      const l = (label || "").toLowerCase();
      if (/full[\s-]?body/.test(l)) return "full";
      const hasUpper = /(pull|push|upper|chest|arm|back)/.test(l);
      const hasLower = /(leg|lower|glute|hamstring|quad|calves|calf)/.test(l);
      if (hasLower) return "lower"; // shoulders+legs => lower
      if (hasUpper) return "upper";
      return "full";
    };

    const MOBILITY_NAMES = {
      upper: "upper body mobility routine",
      lower: "lower body mobility routine",
      full: "Full Body Mobility Routine",
    };

    for (const day of resolvedDays) {
      // Normalize rest times for non-mobility exercises
      for (const ex of day.exercises) {
        ex.rest_seconds = isAb(ex) ? 60 : 120;
      }

      // Prepend mobility drill
      const kind = classifyDay(day.day_label);
      const mobilityName = MOBILITY_NAMES[kind];
      const match = findExerciseInLibrary(mobilityName, library);
      if (match) {
        const exId = (match.exercise as any).id;
        day.exercises.unshift({
          name: match.exercise.name,
          sets: 1,
          reps: "10/exercise",
          rest_seconds: 0,
          notes: "1 set, 10 reps per exercise",
          is_amrap: false,
          primary_muscle: match.exercise.primary_muscle || "mobility",
          // @ts-ignore - exercise_id consumed client-side at save
          exercise_id: exId,
        } as AIExercise);
      } else {
        console.warn(`[ai-generate-program] mobility drill not found in library: ${mobilityName} (day: ${day.day_label})`);
      }
    }

    return json({
      ok: true,
      program: {
        ...progResult,
        days: resolvedDays,
      },
      meta: {
        start_date: startDate,
        end_date: endDate,
        weeks: 8,
        photo_used: !!photoDataUrl,
        body_fat_estimated_from_photo: storedBF == null && !!photoDataUrl,
        warnings: lastErrors, // soft warnings if last attempt still had issues
      },
    });
  } catch (e) {
    console.error("[ai-generate-program] fatal:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
