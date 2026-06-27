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

const HEADING_RE = /^(?:\[\s*away\s*\]\s*day\s*\d+\s*:.*|day\s*\d+\s*:.*|stretches)$/i;

function stripDecorations(line: string): string {
  return line
    .replace(/^[-•*\s]+/, "")
    .replace(/^▶\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalHeading(line: string): string | null {
  const clean = stripDecorations(line)
    .replace(/^EXERCISE\s+/i, "")
    .replace(/\s+Regular workout\b.*$/i, "")
    .trim();

  if (/^stretches$/i.test(clean)) return "Stretches";
  if (!HEADING_RE.test(clean)) return null;
  if (/\b(reps|lbs|set\s*\d|previous stats|tracking sheet)\b/i.test(clean)) return null;

  return clean
    .replace(/^\[\s*away\s*\]\s*/i, "[AWAY]")
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
  const explicitSet = normalized.match(/\b\d+\s+sets?\s*x\s*(.+?)(?=\s+Rest\b|\s*\(|$)/i);
  if (explicitSet?.[1]) return explicitSet[1].trim();
  const reps = normalized.match(/\b(AMRAP|\d+\s*-\s*\d+\s*reps(?:\s*\/\s*(?:side|leg|arm))?|\d+\s*reps(?:\s*\/\s*(?:side|leg|arm))?|\d+\s*seconds\s*\/\s*(?:side|exercise)|\d+\s*seconds?)\b/i);
  return reps?.[1]?.replace(/\s+/g, " ").trim() ?? null;
}

function extractSets(raw: string, groupSets: number | null): number | null {
  const explicit = raw.match(/\b(\d+)\s+sets?\s*x\b/i);
  if (explicit) return Number(explicit[1]);
  const single = raw.match(/\b(\d+)\s+set\s*x\b/i);
  if (single) return Number(single[1]);
  return groupSets;
}

function extractName(raw: string): string {
  let clean = stripDecorations(raw);
  clean = clean.replace(/\s+Rest\s+(?:for\s+)?\d+\s*(?:sec|secs|second|seconds|min|mins|minute|minutes|m).*$/i, "").trim();

  const markers = [
    /\b\d+\s+sets?\s*x\b/i,
    /\b\d+\s+set\s*x\b/i,
    /\b\d+\s*-\s*\d+\s*reps\b/i,
    /\b\d+\s*reps\b/i,
    /\bAMRAP\b/i,
    /\b\d+\s*seconds(?:\s*\/\s*(?:side|exercise))?\b/i,
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

function isExerciseBullet(line: string): boolean {
  if (!/^\s*▶/.test(line)) return false;
  if (/^\s*▶\s*$/.test(line)) return false;
  return /\b(reps?|AMRAP|seconds?|sets?\s*x|Rest\s+\d+)/i.test(line);
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

    if (!isExerciseBullet(line) || isExerciseInstruction(line)) continue;

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

  if (trackingNames.length >= exercises.length) {
    exercises.forEach((exercise, index) => {
      const fullName = trackingNames[index];
      if (fullName && (!exercise.name || exercise.name.includes("…") || fullName.length > exercise.name.length)) {
        exercise.name = fullName;
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
