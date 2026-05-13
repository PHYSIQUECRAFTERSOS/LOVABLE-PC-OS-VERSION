# Improve AI Create New Phase — Programming Quality Pass

Update the system prompt in `supabase/functions/ai-generate-program/index.ts` (`buildSystemPrompt`, around line 180) and lightly extend `buildUserPrompt` (line 213) where new client signals are needed. No DB or UI changes.

---

## PART A — Confirmed rules (from prior message)

**Rule 24 — Chest pressing variant policy**

- Forbidden by default: "Flat Barbell Bench Press", "Incline Barbell Bench Press", any flat/incline barbell bench variant.
- Allowed only if: training_location contains "home" AND barbell is in equipment list, OR notes explicitly state barbell preference.
- Preferred chest pool: Smith Machine Bench, Incline Smith Machine Bench, Flat DB Bench, Incline DB Bench, Machine Seated Chest Press, Incline Machine Chest Press, Hammer Grip Incline DB Bench, DB Lying Hammer Press.
- Standing Cable Chest Press: only as the SECOND chest movement, never first.

**Rule 25 — Squat variant policy**

- Forbidden by default: Barbell Back Squat, Heel Elevated Barbell Squat, Barbell Sumo Squat, any barbell-loaded squat.
- Allowed only with home gym + barbell, or explicit barbell preference.
- Preferred pool: Smith Sumo Squat, Hack Squat (+ Glute/Quad Bias), Heel Elevated Goblet Squat, DB Goblet Squat, DB Sumo Squat, Heel Elevated Smith Back Squat, Smith Back Squat.
- Pendulum Squat: only if onboarding/equipment confirms gym has one.
- Heel Elevated DB Front Squat: home-gym only.

**Rule 26 — Heavier / higher-BF clients (≈200 lb @ 25%+ BF or 250 lb @ 40%+)**

- Never program: pull-ups, push-ups (any), pike push-ups, deficit push-ups, hanging leg raises, dips, plyometrics.
- Substitute: Assisted Pull-Up, Lat Pulldown, Incline/Machine Push-Up, Reverse Crunch, Lying Leg Raise, Seated Dip Machine.
- Bias whole program toward machines and seated/supported movements.

---

## PART B — New "make it feel like Kevin's programming" rules

These are the additional improvements. Pick which ones to ship; defaults below assume all in.

**Rule 27 — Pressing hierarchy (chest sequencing)**

- Every chest-containing day: first chest movement must be a heavy machine or DB press (Smith, Machine Press, or DB Bench — flat or incline). Second movement must be a different angle than the first (if first is incline, second is flat or low-incline, and vice versa). Third chest movement (if any) must be an isolation: pec deck, cable fly, or DB fly.
- No two consecutive chest exercises at the same angle.

**Rule 28 — Back day structure**

- Order: (1) vertical pull or heavy row primary, (2) horizontal row from a different implement, (3) lat-biased isolation (straight-arm pulldown, pullover), (4)  rear-delt 
- Always include at least one chest-supported row (Chest-Supported T-Bar, Chest-Supported Machine Row, ) on every back/pull day to remove lower-back fatigue.
- Deadlifts (conventional, sumo, trap-bar) only if client explicitly lists them as a preferred lift OR has lower-back-safe history. Default to RDL or hip-hinge machine.

**Rule 29 — Shoulder programming**

- Every push/upper day must include 1 lateral raise variant (DB, cable, or machine) as a dedicated medial-delt movement, separate from any pressing.
- Rear delts: minimum 6 sets/week across the program (rear-delt fly, face pull, reverse pec deck), placed on pull/upper days.
- Overhead pressing: prefer Seated DB Shoulder Press or Machine Shoulder Press over standing barbell OHP. Standing OHP only with explicit client preference.

**Rule 30 — Hamstring / posterior chain**

- Every leg/lower day must include both a knee-flexion hamstring movement (Lying or Seated Leg Curl) AND a hip-hinge hamstring movement (RDL variant, Single-Leg RDL, or 45° Back Extension loaded).
- Seated Leg Curl is preferred over Lying when both available (better stretch).

**Rule 31 — Glute-specific work**

- Female focus-area "glutes" OR any client with glutes as focus: at least 2 dedicated glute movements per leg day (Hip Thrust variant, Cable Kickback, Glute-Focused Hack Squat, B-Stance Hip Thrust, Smith Hip Thrust). Hip Thrust must use Smith or Machine — never barbell unless home gym.

**Rule 32 — Arm day / arm placement**

- Biceps: 1 stretch-loaded movement (Incline DB Curl, Bayesian Cable Curl) + 1 peak/short-head (Preacher, Spider, or Concentration) per week.
- Triceps: 1 overhead/long-head (Overhead Cable Extension, DB French Press) + 1 lateral-head (Cable Pressdown, Bench Dip Machine) per week.
- Never two biceps movements with the same arm angle back-to-back.

**Rule 33 — Movement pairing & superset hints (in notes? NO — keep notes empty)**

- Keep the existing "notes empty" rule. Instead, encode pairing through ordering only: place antagonist isolations adjacent (e.g. cable curl after triceps pressdown) to enable optional supersetting without writing it in notes.

**Rule 34 — Rep-range bias by goal**

- If client goal contains "fat loss" / "cut" / "lean": shift secondary compounds to 10-15 and isolations to 12-20. Rest on isolations: 60s.
- If goal contains "muscle gain" / "bulk" / "size": heavy compound 6-8, secondary 8-10, isolation 10-12. Rest on heavy: 150-180s.
- If goal is "recomp" / unspecified: keep current Rule 14 ranges.

**Rule 35 — Stretch-emphasis bias (J3U signature)**

- For each major muscle, at least ONE exercise per week must be in a fully stretched/lengthened position:
  - Chest: Incline DB Press, DB Fly, or Cable Fly (high-to-low)
  - Back: Pullover, Straight-Arm Pulldown, or Lat Prayer
  - Triceps: Overhead Cable Extension or DB French Press
  - Biceps: Incline DB Curl or Bayesian Curl
  - Quads: Heel-Elevated Squat variant or Sissy Squat
  - Hamstrings: RDL variant or Seated Leg Curl
  - Side delts: Cable Lateral (cross-body) or Y-Raise

**Rule 36 — Frequency rules**

- Each major muscle (chest, back, quads, hams, glutes, shoulders) must be hit at least 2x/week on any 4+ day split. 3-day full-body: 1x is acceptable.
- Biceps and triceps: minimum 2x/week of direct work on any 4+ day split.

**Rule 37 — Injury-aware substitutions (codified)**
Append to system prompt as an explicit map:

- Lower-back issue → no barbell rows, no conventional deadlift, no good mornings, no standing barbell OHP. Use chest-supported rows, hip-thrust hinge, machine shoulder press.
- Shoulder/AC issue → no behind-the-neck, no upright row, no wide-grip bench, no dips. Use neutral-grip DB press, cable lateral with thumb-up.
- Knee issue → no deep barbell squat, no walking lunges, no jumping. Use leg press (limited ROM), heel-elevated goblet, leg extension partials.
- Wrist/elbow issue → no straight-bar curls, no skullcrushers. Use EZ-bar, DB neutral grip, cable rope.

**Rule 38 — Session length cap**

- Total exercises per session: 5-7 (not counting the auto-injected mobility warmup or abs block).
- Total working sets per session: 16-22.
- If a focus area pushes volume past 22 sets, drop a non-focus accessory rather than adding a 7th exercise.

**Rule 39 — Female client bias** (only if client gender = female on profile)

- Default focus toward glutes + hamstrings unless client explicitly states otherwise.
- Reduce direct chest volume to 6-10 sets/week unless chest is focus area.
- Increase glute volume cap to 18-24 sets/week.

**Rule 40 — Beginner bias** (training_age < 1 year or self-reported beginner)

- Cap split at 3-4 days max even if more available.
- Prefer machines and fixed-path movements (Smith, Hack Squat, Machine Press) over free-weight DB to lower technique demand.
- Reduce isolation count, increase compound frequency.

---

## PART C — User-prompt enrichment

To let the model apply rules 34, 39, 40, and the heavier-client rule reliably, extend `buildUserPrompt` to surface fields that are likely already on the profile/onboarding rows (read-only, no schema changes):

- `goal` (cut / bulk / recomp / maintenance)
- `gender`
- `training_age` or "self-reported experience level"
- `preferred_lifts` (free-text, used for the barbell exemption)
- An explicit `is_heavier_client` boolean computed from weight_lb + body_fat_pct using the Rule 26 threshold, so the model doesn't have to re-derive it.

If any of those fields are not present on the existing tables, skip that piece — do not add columns in this pass.

---

## Acceptance

- Programs for commercial-gym clients show zero barbell flat/incline bench and zero barbell back/sumo squats.
- Every chest day has 2 different angles and (if 3 chest exercises) ends in an isolation.
- Every back day has at least one chest-supported row.
- Every push/upper day has a dedicated lateral raise.
- Every leg/lower day has both a knee-flexion AND a hip-hinge hamstring movement.
- A 230 lb / 35% BF client sees zero pull-ups, push-ups, dips, hanging leg raises.
- A female client with glutes focus gets ≥2 glute movements per leg day and zero barbell hip thrust.
- Goal = "cut" shifts isolation reps to 12-20 and isolation rest to 60s.
- No session exceeds 7 exercises (excluding auto warmup + abs).

---

## Open questions before I implement

1. Confirm rules to ship: all of 27–40, or which subset?
2. Do you want me to add `is_heavier_client` and `goal` plumbing into the user prompt now, or leave the model to infer?
3. Rule 39 (female bias): apply automatically when `gender = female`, or only when focus area is glutes/hams?
4. Rule 40 (beginner bias): is there a `training_age` field on onboarding I should read, or should I infer from a free-text experience field?