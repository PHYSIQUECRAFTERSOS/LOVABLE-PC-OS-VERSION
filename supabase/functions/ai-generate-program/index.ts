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
    homeGym: boolean;
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

      // Arnold Press is forbidden unless client trains at home gym
      if (!ctx.homeGym && /arnold\s*press/i.test(canonical.name)) {
        errors.push(`"${canonical.name}" is only allowed for home-gym clients.`);
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
13. Weekly working sets per muscle: focus-area / lagging 16-22, average 10-16, strong 8-12. Calves 10-20. HARD CEILING 22 sets per muscle per week. Do NOT program abs (the system injects a standardized abs block post-process).
14. Reps: heavy compound 6-10, secondary compound 8-12, isolation 10-15, stretch-loaded isolation 12-20.
15. Rest seconds: heavy compound 120-180, secondary compound 90-120, isolation 60-90.
16. Leave the "notes" field as an empty string for every exercise. Do not write coaching cues.
17. Respect injuries and the client's cannot-do list. Avoid contraindicated variants.
18. Equipment filter: Planet Fitness = no barbells. Home gym = only what is in the equipment list. Full commercial = no filter.
19. If client is high-BF + high-BW (subjective; rough threshold 30%+ BF and 230+ lb), avoid weighted walking lunges, pull-ups, dips, plyometrics, deep barbell squats. Bias toward seated and machine-supported moves.
20. Focus area: train it FIRST in every session it appears AND bump volume to 16-22 sets/wk — UNLESS the focus area is abs/belly/stomach/midsection. In that case, raise a conflict_flag noting it is a body-comp (nutrition) priority.
21. ABSOLUTE: Do NOT include ANY abdominal/core/oblique exercises (no crunches, planks, sit-ups, leg raises, hanging knee raises, ab wheel, woodchops, russian twists, dead bugs, hollow holds, cable crunches, etc.). The system injects a standardized abs block on 2 days post-process. Default rest is 120 seconds for every exercise.
22. Do NOT include warmups, mobility drills, or activation work — the system auto-prepends a mobility routine to every workout.
23. Do NOT use "Arnold Press" or any Arnold-press variant UNLESS the client trains at a home gym (training_location contains "home").
24. CHEST PRESSING VARIANT POLICY. Do NOT program "Flat Barbell Bench Press", "Incline Barbell Bench Press", or any flat/incline barbell bench variant by DEFAULT. Allowed ONLY if (a) training_location contains "home" AND barbell is in the home equipment list, OR (b) the coach override / client notes explicitly state a barbell preference. Preferred chest pressing pool (pick from these first): Smith Machine Bench Press, Incline Smith Machine Bench Press, Flat Dumbbell Bench Press, Incline Dumbbell Bench Press, Machine Seated Chest Press, Incline Machine Chest Press, Hammer Grip Incline DB Bench Press, Dumbbell Lying Hammer Press. "Standing Cable Chest Press" is allowed ONLY as a SECOND chest movement, never the first.
25. SQUAT VARIANT POLICY. Do NOT program "Barbell Back Squat", "Heel Elevated Barbell Squat", "Barbell Sumo Squat", or any barbell-loaded squat by DEFAULT. Allowed only with the same home-gym + barbell, or explicit barbell preference exemption as Rule 24. Preferred squat pool: Smith Machine Sumo Squat, Hack Squat (Glute Bias / Quad Bias variants), Heel Elevated Goblet Squat, Dumbbell Goblet Squat, Dumbbell Sumo Squat, Heel Elevated Smith Machine Back Squat, Smith Machine Back Squat. "Pendulum Squat" only if equipment list confirms one is available. "Heel Elevated Dumbbell Front Squat" only if training_location contains "home".
26. HEAVIER / HIGHER-BF CLIENTS. If is_heavier_client=true (roughly 200+ lb at 25%+ BF, or 250+ lb at 40%+ BF) NEVER program: pull-ups, push-ups (any variant), pike push-ups, deficit push-ups, hanging leg raises, dips, plyometrics. Substitute regressed equivalents: Assisted Pull-Up, Lat Pulldown, Incline Push-Up or Machine Push-Up, Reverse Crunch, Lying Leg Raise, Seated Dip Machine. Bias the entire program toward machine-based and seated/supported movements. Layers on top of Rule 19.
27. CHEST SEQUENCING. On every chest-containing day: the FIRST chest movement must be a heavy machine or DB press (Smith, Machine Press, or DB Bench — flat or incline). The SECOND must be a different angle than the first (incline ↔ flat). The THIRD chest movement (if any) must be an isolation (pec deck, cable fly, or DB fly). Never two consecutive chest exercises at the same angle.
28. BACK DAY STRUCTURE. Order: (1) vertical pull or heavy row primary, (2) horizontal row from a DIFFERENT implement than #1, (3) lat-biased isolation (straight-arm pulldown or pullover), (4) optional rear-delt finisher. Always include at least one chest-supported row (Chest-Supported T-Bar Row, Chest-Supported Machine Row, or Seal Row) on every back/pull day. Deadlifts (conventional, sumo, trap-bar) only if client explicitly lists them as preferred OR has clean lower-back history; default to RDL or hip-hinge machine.
29. SHOULDER PROGRAMMING. Every push/upper day must include 1 dedicated lateral raise variant (DB, cable, or machine), separate from any pressing. Rear delts: minimum 6 sets/week across the program (rear-delt fly, face pull, reverse pec deck), placed on pull/upper days. Overhead pressing: prefer Seated DB Shoulder Press or Machine Shoulder Press over standing barbell OHP.
30. HAMSTRINGS / POSTERIOR CHAIN. Every leg/lower day must include BOTH a knee-flexion hamstring movement (Lying or Seated Leg Curl) AND a hip-hinge hamstring movement (RDL variant, Single-Leg RDL, or loaded 45° Back Extension). Prefer Seated Leg Curl over Lying when both available.
31. GLUTE-SPECIFIC WORK. If focus area is "glutes" (or female client with focus unspecified): minimum 2 dedicated glute movements per leg day (Hip Thrust variant, Cable Kickback, Glute-Focused Hack Squat, B-Stance Hip Thrust, Smith Hip Thrust). Hip Thrust must use Smith or Machine — never barbell unless Rule 24 home-gym exemption applies.
32. ARM PROGRAMMING. Biceps weekly: 1 stretch-loaded (Incline DB Curl or Bayesian Cable Curl) + 1 peak/short-head (Preacher, Spider, or Concentration). Triceps weekly: 1 overhead/long-head (Overhead Cable Extension or DB French Press) + 1 lateral-head (Cable Pressdown or Bench Dip Machine). Never two biceps movements at the same arm angle back-to-back.
33. ANTAGONIST PAIRING (ordering only — DO NOT write notes). Keep the empty-notes rule. Encode pairing through ORDER: place antagonist isolations adjacent (e.g. cable curl directly after triceps pressdown).
34. REP-RANGE BIAS BY GOAL. If primary_goal contains "fat loss" / "cut" / "lean": secondary compounds 10-15, isolations 12-20, isolation rest 60s. If primary_goal contains "muscle gain" / "bulk" / "size": heavy compound 6-8, secondary 8-10, isolation 10-12, heavy compound rest 150-180s. Otherwise keep Rule 14 ranges.
35. STRETCH-EMPHASIS BIAS (J3U signature). For each major muscle, ≥1 exercise per week in a fully stretched/lengthened position. Chest → Incline DB Press, DB Fly, or High-to-Low Cable Fly. Back → Pullover, Straight-Arm Pulldown, Lat Prayer. Triceps → Overhead Cable Extension or DB French Press. Biceps → Incline DB Curl or Bayesian Curl. Quads → Heel-Elevated Squat variant or Sissy Squat. Hamstrings → RDL variant or Seated Leg Curl. Side delts → Cross-Body Cable Lateral or Y-Raise.
36. FREQUENCY. Each major muscle (chest, back, quads, hams, glutes, shoulders) hit ≥2x/week on any 4+ day split. 3-day full-body: 1x/week is acceptable. Biceps and triceps: ≥2x/week direct work on any 4+ day split.
37. INJURY-AWARE SUBSTITUTIONS. Lower-back → no barbell rows, no conventional deadlift, no good mornings, no standing barbell OHP; use chest-supported rows, hip-thrust hinge, machine shoulder press. Shoulder/AC → no behind-the-neck, no upright row, no wide-grip bench, no dips; use neutral-grip DB press, thumb-up cable lateral. Knee → no deep barbell squat, no walking lunges, no jumping; use leg press (limited ROM), heel-elevated goblet, leg extension partials. Wrist/elbow → no straight-bar curls, no skullcrushers; use EZ-bar, DB neutral grip, cable rope.
38. SESSION LENGTH CAP. 5-7 exercises per session (excluding auto warmup + abs block). 16-22 working sets per session. If focus-area volume would push past 22 sets, drop a non-focus accessory rather than adding a 7th exercise.
39. FEMALE CLIENT BIAS. If gender = female: default focus toward glutes + hamstrings unless client explicitly states otherwise. Reduce direct chest volume to 6-10 sets/week unless chest is the focus area. Increase glute volume cap to 18-24 sets/week.
40. BEGINNER BIAS. If notes/onboarding indicate a beginner (<1 year experience or self-described beginner): cap split at 3-4 days max even if more available; prefer machines and fixed-path movements over free-weight DB; reduce isolation count and increase compound frequency.

Return rationale as an empty string, conflict_flags (array of strings), weekly_volume (per primary muscle, sets/wk), and days (array). For each day include day_label (e.g. "Push", "Pull", "Legs", "Upper A", "Lower A", "Full Body A"), day_of_week (0=Mon ... 6=Sun), category (push/pull/legs/upper/lower/fullbody), and exercises (each with name, sets, reps, rest_seconds, notes as empty string, is_amrap, primary_muscle).`;
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

  const goal = (p.onboarding?.primary_goal || "").toString().trim() || "(unspecified)";
  const gender = (p.onboarding?.gender || p.client?.gender || "").toString().trim() || "(unspecified)";
  const bf = p.bodyFat;
  const wt = p.weightLb;
  const isHeavierClient =
    !!(wt && bf != null && ((wt >= 200 && bf >= 25) || (wt >= 250 && bf >= 40)));

  return `CLIENT PROFILE
Name: ${p.client?.full_name || "Client"}
Gender: ${gender}
Primary goal: ${goal}
Height: ${p.heightDisplay}
Weight: ${p.weightLb ? `${p.weightLb} lb` : "unknown"}
Body fat %: ${p.bodyFat != null ? p.bodyFat : "unknown — estimate from photo"}
is_heavier_client: ${isHeavierClient} (Rule 26 trigger)
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
    const homeGym = /home/i.test(trainingLocation);

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
        homeGym,
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

    // Blank the rationale — clients should see a clean, custom-looking phase
    progResult.rationale = "";

    for (const day of resolvedDays) {
      // Normalize rest times + strip coaching notes for non-mobility exercises
      for (const ex of day.exercises) {
        ex.rest_seconds = isAb(ex) ? 60 : 120;
        ex.notes = "";
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
        // Defensive: mobility rest must always be 0
        day.exercises[0].rest_seconds = 0;
      } else {
        console.warn(`[ai-generate-program] mobility drill not found in library: ${mobilityName} (day: ${day.day_label})`);
      }
    }

    // ---------- Mandatory Abs Injection: 2 days/week, 2 distinct exercises x 3 sets x 60s ----------
    // Strip any abs the AI emitted (defensive; prompt forbids it)
    for (const day of resolvedDays) {
      day.exercises = day.exercises.filter((ex) => !isAb(ex));
    }

    // Pick 2 ab days with at least 2 full days of separation (delta in day_of_week >= 3)
    // Prefer the pair with the largest gap; tie-break: prefer pairs where both days are upper-focused.
    const trainingDays = [...resolvedDays].sort((a, b) => a.day_of_week - b.day_of_week);
    const isLegHeavy = (d: AIDay) => d.category === "legs" || d.category === "lower";
    let abDayIndices: [number, number] | null = null;
    if (trainingDays.length >= 2) {
      let best: { i: number; j: number; gap: number; upperBonus: number } | null = null;
      for (let i = 0; i < trainingDays.length; i++) {
        for (let j = i + 1; j < trainingDays.length; j++) {
          const gap = Math.abs(trainingDays[j].day_of_week - trainingDays[i].day_of_week);
          if (gap < 3) continue; // must have ≥2 rest days between sessions
          const upperBonus = (!isLegHeavy(trainingDays[i]) ? 1 : 0) + (!isLegHeavy(trainingDays[j]) ? 1 : 0);
          if (
            !best ||
            gap > best.gap ||
            (gap === best.gap && upperBonus > best.upperBonus)
          ) {
            best = { i, j, gap, upperBonus };
          }
        }
      }
      // Fallback: no pair satisfied 2-day separation — pick the pair with the largest gap regardless
      if (!best) {
        for (let i = 0; i < trainingDays.length; i++) {
          for (let j = i + 1; j < trainingDays.length; j++) {
            const gap = Math.abs(trainingDays[j].day_of_week - trainingDays[i].day_of_week);
            if (!best || gap > best.gap) best = { i, j, gap, upperBonus: 0 };
          }
        }
      }
      if (best) abDayIndices = [best.i, best.j];
    }

    // Pick 4 distinct ab exercises from the usable library, excluding forbidden (previous-phase) names
    const forbiddenNorms = new Set(Array.from(previousExerciseNames));
    const abPool = (usableLibrary as any[]).filter((e) => {
      const m = (e.primary_muscle || "").toLowerCase().trim();
      const matchesAb = AB_MUSCLES.has(m) || AB_NAME_RE.test(e.name || "");
      if (!matchesAb) return false;
      const norm = normalizeExerciseName(e.name);
      return !forbiddenNorms.has(norm);
    });

    // Deterministic shuffle seeded by client id (so re-running for same client yields same picks unless library changes)
    const seedStr = String(clientId || "seed");
    let seed = 0;
    for (const c of seedStr) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };
    const shuffled = [...abPool].sort(() => rand() - 0.5);

    if (abDayIndices && shuffled.length > 0) {
      // Take up to 4; if fewer than 4, recycle but keep within-day exercises distinct
      const picks = shuffled.slice(0, Math.min(4, shuffled.length));
      // Distribute: day1 gets picks[0,1], day2 gets picks[2,3]. If <4 available, fall back gracefully.
      const day1Abs = [picks[0], picks[1 % picks.length]].filter(Boolean);
      const day2Abs = [picks[2 % picks.length], picks[3 % picks.length]].filter(Boolean);
      // Ensure within-day distinctness
      const dedupe = (arr: any[]) => {
        const seen = new Set<string>();
        return arr.filter((e) => {
          const n = normalizeExerciseName(e.name);
          if (seen.has(n)) return false;
          seen.add(n);
          return true;
        });
      };
      const assignments: Array<{ day: AIDay; abs: any[] }> = [
        { day: trainingDays[abDayIndices[0]], abs: dedupe(day1Abs).slice(0, 2) },
        { day: trainingDays[abDayIndices[1]], abs: dedupe(day2Abs).slice(0, 2) },
      ];

      for (const { day, abs } of assignments) {
        if (abs.length === 0) continue;
        for (const ex of abs) {
          day.exercises.push({
            name: ex.name,
            sets: 3,
            reps: "12-15",
            rest_seconds: 60,
            notes: "",
            is_amrap: false,
            primary_muscle: ex.primary_muscle || "abs",
            // @ts-ignore - exercise_id consumed client-side at save
            exercise_id: ex.id,
          } as AIExercise);
        }
        // Append " & Abs" to label (idempotent)
        if (!/&\s*Abs\s*$/i.test(day.day_label)) {
          day.day_label = `${day.day_label} & Abs`;
        }
      }
    } else {
      console.warn(
        `[ai-generate-program] abs injection skipped: abDayIndices=${JSON.stringify(abDayIndices)} abPoolSize=${abPool.length}`,
      );
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
