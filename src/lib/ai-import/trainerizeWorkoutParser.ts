type ParsedExercise = {
  name: string;
  sets: number | null;
  reps: string | null;
  rest_seconds: number | null;
  tempo: string | null;
  rir: number | null;
  rpe: number | null;
  notes: string | null;
  grouping_type: "superset" | "circuit" | null;
  grouping_id: string | null;
};

type ParsedWorkout = {
  day_name: string;
  instructions: string | null;
  exercises: ParsedExercise[];
  superset_groups: Array<{ grouping_id: string; rest_seconds_between_rounds: number | null }>;
};

export type TrainerizeWorkoutSummary = {
  detected_source: "trainerize_print_log";
  program_name: string;
  program_phase: string | null;
  workouts: ParsedWorkout[];
  schedule: Array<{ position: number; day_name: string }>;
};

export const TRAINERIZE_WORKOUT_SUMMARY_START = "<<<TRAINERIZE_WORKOUT_BOUNDARY_SUMMARY_JSON>>>";
export const TRAINERIZE_WORKOUT_SUMMARY_END = "<<<END_TRAINERIZE_WORKOUT_BOUNDARY_SUMMARY_JSON>>>";

const HEADING_RE = /^(?:\([^)]+\)\s*)?(?:\[\s*away\s*\]\s*)?day\s*\d+\s*:.*$|^stretches$/i;

function stripDecorations(line: string): string {
  return line
    .replace(/^[-•*\s]+/, "")
    .replace(/^▶\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalHeading(line: string): string | null {
  let clean = stripDecorations(line)
    .replace(/^EXERCISE\s+/i, "")
    .replace(/\s+Regular workout\b.*$/i, "")
    .trim();

  // Strip concatenated global boilerplate that often runs into the heading line
  // (e.g. "Day 1: Chest & Back & arms ATempo [2:0:1:0]FOR ALL EXERCISES except abs")
  clean = clean
    .replace(/Tempo\s*\[.*$/i, "")
    .replace(/FOR ALL EXERCISES.*$/i, "")
    .replace(/Which is\s*\[.*$/i, "")
    .replace(/ALL SET SHOULD.*$/i, "")
    .replace(/2\s+Second eccentric.*$/i, "")
    .replace(/\s*\[\+\]\s*$/i, "")
    .replace(/\s+\+\s*$/i, "")
    .trim();

  if (/^stretches$/i.test(clean)) return "Stretches";
  if (!HEADING_RE.test(clean)) return null;
  if (/\b(reps|lbs|set\s*\d|previous stats|tracking sheet)\b/i.test(clean)) return null;

  return clean
    .replace(/\[\s*away\s*\]\s*/i, "[AWAY]")
    .replace(/\s+/g, " ")
    .trim();
}

function secondsFromRest(raw: string): number | null {
  const match = raw.match(/Rest\s+(?:for\s+)?(\d+)\s*(sec|secs|second|seconds|min|mins|minute|minutes|m)\b/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  return /^m/i.test(match[2]) ? value * 60 : value;
}

function extractReps(raw: string): string | null {
  const normalized = raw.replace(/\s+/g, " ").trim();
  // No leading \b — PDFs often concatenate the trailing letter of the name into
  // the count (e.g. "press3 sets x 8-10 reps").
  const explicitSet = normalized.match(/\d+\s+sets?\s*x\s*(.+?)(?=\s+Rest\b|\s*\(|$)/i);
  if (explicitSet?.[1]) return explicitSet[1].trim();
  const reps = normalized.match(/\b(AMRAP|\d+\s*-\s*\d+\s*re(?:ps?|s)(?:\s*\/\s*(?:side|leg|arm))?|\d+\s*re(?:ps?|s)(?:\s*\/\s*(?:side|leg|arm))?|\d+\s*seconds\s*\/\s*(?:side|exercise)|\d+\s*seconds?)\b/i);
  return reps?.[1]?.replace(/\s+/g, " ").trim() ?? null;
}

function extractSets(raw: string, groupSets: number | null): number | null {
  const explicit = raw.match(/(\d+)\s+sets?\s*x/i);
  if (explicit) return Number(explicit[1]);
  const single = raw.match(/(\d+)\s+set\s*x/i);
  if (single) return Number(single[1]);
  return groupSets;
}

function extractName(raw: string): string {
  let clean = stripDecorations(raw);
  clean = clean.replace(/\s+Rest\s+(?:for\s+)?\d+\s*(?:sec|secs|second|seconds|min|mins|minute|minutes|m).*$/i, "").trim();

  const markers = [
    /\d+\s+sets?\s*x/i,
    /\d+\s+set\s*x/i,
    /\d+\s*-\s*\d+\s*re(?:ps?|s)\b/i,
    /\d+\s*re(?:ps?|s)\b/i,
    /\bAMRAP\b/i,
    /\d+\s*seconds(?:\s*\/\s*(?:side|exercise))?\b/i,
  ];
  let cut = clean.length;
  for (const marker of markers) {
    const match = marker.exec(clean);
    if (match?.index != null && match.index < cut) cut = match.index;
  }

  return clean.slice(0, cut).replace(/[.…]+$/g, "").replace(/\s+/g, " ").trim();
}

function noteFromRow(raw: string): string | null {
  const notes: string[] = [];
  const parens = raw.match(/\(([^)]+)\)/g) || [];
  for (const p of parens) notes.push(p.replace(/[()]/g, "").trim());
  if (/drop set/i.test(raw) && !notes.some((n) => /drop set/i.test(n))) notes.push("drop set");
  if (/double drop/i.test(raw) && !notes.some((n) => /double drop/i.test(n))) notes.push("double drop set");
  return notes.length ? Array.from(new Set(notes)).join("; ") : null;
}

// Lines that look like exercise rows on their own (have a "N sets x M ..." signature).
// Detection no longer depends on a leading ▶ — many Trainerize PDFs strip the bullet
// glyph or place it on a separate line below the block.
function isPlainExerciseRow(line: string): boolean {
  const c = stripDecorations(line);
  if (!c || c.length < 4) return false;
  if (isExerciseInstruction(line)) return false;
  if (
    /^(EXERCISE\b|Exercise Name|Tracking Sheet|Previous Stats|Dismiss|Instructions|Warmup|Tempo\b|Superset of|Rest for|Rest\s+\d|Repeat new set|Phase\s+\d|Format:|NAME\s|PRINT\b|Page \d|---|Physique Crafters)/i.test(c)
  ) return false;
  if (/^Set\s+\d/i.test(c)) return false;
  if (/^https?:\/\//i.test(c)) return false;
  if (/^\d{4}-\d{2}-\d{2}/.test(c)) return false;
  // Boilerplate / coach-cue prose
  if (
    /^(The\b|For\b|If\b|You\b|Then\b|Example\b|ALL\b|IF\b|Which\b|This\b|That\b|We\b|Stand\b|Lower\b|Push\b|Keep\b|Bump\b|2\s+Second|EACH SIDE|Dumbbell bench press\b)/i.test(c)
  ) return false;
  // Strong signatures: "N set(s) x ..." (reps, range, or seconds)
  // Strong signatures: "N set(s) x ..." (reps, range, or seconds). No leading \b
  // because PDFs often concatenate the name into the count, e.g. "press3 sets x".
  if (/\d+\s+sets?\s*x\s*\d/i.test(c)) return true;
  if (/\d+\s+set\s*x\s*\d/i.test(c)) return true;
  return false;
}

// Inside a "Superset of N sets" block, members appear as "Name 8-10 reps" — no
// "sets x" signature. Only accept these while we are actively inside a superset.
function isSupersetMember(line: string): boolean {
  const c = stripDecorations(line);
  if (!c) return false;
  if (isExerciseInstruction(line)) return false;
  if (/^(Rest|Repeat|Superset|Tracking|Previous|Set\s+\d|EXERCISE|Dismiss|Instructions|Warmup|Tempo\b|Physique Crafters|Page \d|---|https?:\/\/)/i.test(c)) return false;
  if (/^\d{4}-\d{2}-\d{2}/.test(c)) return false;
  if (/^(The\b|For\b|If\b|You\b|Then\b|Example\b|ALL\b|IF\b|Which\b|This\b|That\b|We\b|EACH SIDE)/i.test(c)) return false;
  // Must START with a non-digit (real name), then contain a reps/seconds/AMRAP token.
  if (!/^\D/.test(c)) return false;
  return (
    /\b\d+\s*-\s*\d+\s*re(?:ps?|s)\b/i.test(c) ||
    /\b\d+\s*re(?:ps?|s)\b/i.test(c) ||
    /\b\d+\s*seconds?(?:\s*\/\s*(?:side|exercise|leg|arm))?\b/i.test(c) ||
    /\bAMRAP\b/i.test(c)
  );
}

function isExerciseInstruction(line: string): boolean {
  const clean = stripDecorations(line);
  return /^\d+[).]/.test(clean) || /^EACH SIDE AS WELL$/i.test(clean);
}

function cleanedTrackingName(line: string): string | null {
  const clean = stripDecorations(line)
    .replace(/\bSet\s*\d\b.*$/i, "")
    .replace(/\breps\b.*$/i, "")
    .replace(/\blbs\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!clean) return null;
  if (/^(Exercise Name|Tracking Sheet|Previous Stats|EXERCISE|Physique Crafters)$/i.test(clean)) return null;
  if (/^https?:\/\//i.test(clean) || /^--- Page/i.test(clean) || /^Page \d+/i.test(clean)) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(clean)) return null;
  return clean.length > 2 ? clean : null;
}

function trackingNamesFromSegment(lines: string[]): string[] {
  const start = lines.findIndex((line) => /Tracking Sheet/i.test(line));
  if (start < 0) return [];
  const names: string[] = [];
  const seen = new Set<string>();
  for (let i = start + 1; i < lines.length; i++) {
    if (/Previous Stats/i.test(lines[i])) break;
    const name = cleanedTrackingName(lines[i]);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

function parsedExerciseKey(ex: ParsedExercise): string {
  return `${ex.name.toLowerCase()}|${ex.reps || ""}|${ex.sets || ""}|${ex.grouping_id || ""}`;
}

function parseWorkoutSegment(dayName: string, lines: string[]): ParsedWorkout {
  const trackingIndex = lines.findIndex((line) => /Tracking Sheet/i.test(line));
  const beforeTracking = trackingIndex >= 0 ? lines.slice(0, trackingIndex) : lines;
  const trackingNames = trackingNamesFromSegment(lines);
  const exercises: ParsedExercise[] = [];
  const supersetGroups: ParsedWorkout["superset_groups"] = [];
  const seen = new Set<string>();
  let groupCounter = 0;
  let currentGroup: { id: string; sets: number | null } | null = null;

  for (const line of beforeTracking) {
    const clean = stripDecorations(line);
    const superset = clean.match(/^Superset\s+of\s+(\d+)\s+sets?/i);
    if (superset) {
      groupCounter += 1;
      currentGroup = { id: `g${groupCounter}`, sets: Number(superset[1]) };
      continue;
    }

    if (currentGroup && /^Rest\s+(?:for\s+)?\d+/i.test(clean)) {
      supersetGroups.push({ grouping_id: currentGroup.id, rest_seconds_between_rounds: secondsFromRest(clean) });
      continue;
    }

    if (/^Repeat new set/i.test(clean)) {
      currentGroup = null;
      continue;
    }

    const isPlain = isPlainExerciseRow(line);
    const isMember = !isPlain && currentGroup != null && isSupersetMember(line);
    if (!isPlain && !isMember) continue;
    if (isExerciseInstruction(line)) continue;

    const name = extractName(line);
    const reps = extractReps(line);
    if (!name || !reps) continue;

    const exercise: ParsedExercise = {
      name,
      sets: extractSets(line, currentGroup?.sets ?? null),
      reps,
      rest_seconds: currentGroup ? null : secondsFromRest(line),
      tempo: null,
      rir: null,
      rpe: null,
      notes: noteFromRow(line),
      grouping_type: currentGroup ? "superset" : null,
      grouping_id: currentGroup?.id ?? null,
    };

    const key = parsedExerciseKey(exercise);
    if (seen.has(key)) continue;
    seen.add(key);
    exercises.push(exercise);
  }

  // Repair truncated exercise names (containing "…") by matching against the
  // Tracking-Sheet's full name list. Avoid positional overrides — those misalign
  // when the exercise count differs from the tracking-name count.
  if (trackingNames.length > 0) {
    exercises.forEach((exercise) => {
      if (!exercise.name) return;
      const isTruncated = exercise.name.includes("…") || /…\s*$/.test(exercise.name);
      const stem = exercise.name.replace(/[.…]+$/g, "").trim().toLowerCase();
      if (!stem) return;
      const match = trackingNames.find((tn) => tn.toLowerCase().startsWith(stem));
      if (match && (isTruncated || match.length > exercise.name.length)) {
        exercise.name = match;
      }
    });
  }

  const usedGroupIds = new Set(exercises.map((ex) => ex.grouping_id).filter(Boolean) as string[]);
  const filteredGroups = supersetGroups.filter((group) => usedGroupIds.has(group.grouping_id));

  return {
    day_name: dayName,
    instructions: null,
    exercises,
    superset_groups: filteredGroups,
  };
}

function extractProgramName(lines: string[]): { program_name: string; program_phase: string | null } {
  const phaseLine = lines.find((line) => /^Phase\s+\d+\s*:/i.test(stripDecorations(line)));
  const phase = phaseLine ? stripDecorations(phaseLine) : null;
  return {
    program_name: phase || "Imported Trainerize Workout Program",
    program_phase: phase,
  };
}

export function extractTrainerizeWorkoutSummary(text: string): TrainerizeWorkoutSummary | null {
  if (!/trainerize\.com|PrintTrackingLog|Physique Crafters/i.test(text)) return null;

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const headingHits: Array<{ index: number; name: string }> = [];
  const firstByName = new Map<string, number>();

  lines.forEach((line, index) => {
    const heading = canonicalHeading(line);
    if (!heading) return;
    headingHits.push({ index, name: heading });
    if (!firstByName.has(heading)) firstByName.set(heading, index);
  });

  const uniqueNames: string[] = [];
  for (const hit of headingHits) {
    if (!uniqueNames.includes(hit.name)) uniqueNames.push(hit.name);
  }

  if (uniqueNames.length < 2) return null;

  const workouts: ParsedWorkout[] = [];
  for (let i = 0; i < uniqueNames.length; i++) {
    const name = uniqueNames[i];
    const nextFirst = i + 1 < uniqueNames.length ? firstByName.get(uniqueNames[i + 1]) ?? lines.length : lines.length;
    const starts = headingHits.filter((hit) => hit.name === name && hit.index < nextFirst).map((hit) => hit.index);
    const start = starts.length ? starts[starts.length - 1] : firstByName.get(name) ?? 0;
    const segment = lines.slice(start, nextFirst);
    const workout = parseWorkoutSegment(name, segment);
    if (workout.exercises.length > 0) workouts.push(workout);
  }

  if (workouts.length < 2) return null;

  const { program_name, program_phase } = extractProgramName(lines);
  return {
    detected_source: "trainerize_print_log",
    program_name,
    program_phase,
    workouts,
    schedule: workouts.map((workout, index) => ({ position: index + 1, day_name: workout.day_name })),
  };
}

export function prependTrainerizeWorkoutSummary(text: string): string {
  const summary = extractTrainerizeWorkoutSummary(text);
  if (!summary) return text;
  return [
    TRAINERIZE_WORKOUT_SUMMARY_START,
    JSON.stringify(summary, null, 2),
    TRAINERIZE_WORKOUT_SUMMARY_END,
    "",
    "=== RAW PDF TEXT BELOW ===",
    text,
  ].join("\n");
}
