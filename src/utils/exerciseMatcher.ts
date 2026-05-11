/**
 * Exercise fuzzy-matching utility.
 * Used by:
 *  - the ai-generate-program edge function (server-side, to validate AI output
 *    against the coach's library)
 *  - the AI Create preview screen (client-side, when the coach edits a row)
 *
 * Strategy:
 *  1. Normalize (lowercase, strip punctuation, expand common abbreviations).
 *  2. Exact match on normalized strings.
 *  3. Token-set match (every input token present in candidate, or vice versa).
 *  4. Levenshtein-ratio fallback (>= 0.8 threshold).
 */

export interface ExerciseLike {
  id: string;
  name: string;
  [k: string]: any;
}

const ABBR: Record<string, string> = {
  db: "dumbbell",
  bb: "barbell",
  rdl: "romanian deadlift",
  sldl: "stiff leg deadlift",
  ohp: "overhead press",
  bw: "bodyweight",
  kb: "kettlebell",
  ez: "ez bar",
  bf: "bulgarian split squat",
  bss: "bulgarian split squat",
  ghr: "glute ham raise",
  gh: "glute ham",
  smith: "smith machine",
};

export function normalizeExerciseName(raw: string): string {
  if (!raw) return "";
  let s = raw.toLowerCase().trim();
  // strip parens / brackets
  s = s.replace(/[\(\)\[\]\{\}]/g, " ");
  // strip punctuation
  s = s.replace(/[.,;:!?'"`/\\\-_+*&|<>=@#$%^~]/g, " ");
  // collapse whitespace
  s = s.replace(/\s+/g, " ").trim();
  // expand abbreviations token-by-token
  const tokens = s.split(" ").map((t) => ABBR[t] ?? t);
  // singularize trailing 's' on tokens > 3 chars (squats -> squat)
  const singular = tokens
    .join(" ")
    .split(" ")
    .map((t) => (t.length > 3 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t));
  return singular.join(" ").trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

function ratio(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  return 1 - levenshtein(a, b) / max;
}

function tokenSet(s: string): Set<string> {
  return new Set(s.split(" ").filter(Boolean));
}

export interface MatchResult<T extends ExerciseLike> {
  exercise: T;
  score: number;
  method: "exact" | "token-set" | "fuzzy";
}

/**
 * Find the best library match for `name`. Returns null if nothing meets the
 * 0.8 similarity threshold.
 */
export function findExerciseInLibrary<T extends ExerciseLike>(
  name: string,
  library: T[],
  threshold = 0.8,
): MatchResult<T> | null {
  if (!name || !library?.length) return null;
  const target = normalizeExerciseName(name);
  if (!target) return null;
  const targetTokens = tokenSet(target);

  let best: MatchResult<T> | null = null;

  for (const ex of library) {
    const candidate = normalizeExerciseName(ex.name);
    if (!candidate) continue;

    if (candidate === target) {
      return { exercise: ex, score: 1, method: "exact" };
    }

    // Token-set check (all tokens of one are contained in the other, with
    // at least 50% size overlap)
    const candTokens = tokenSet(candidate);
    if (targetTokens.size > 0 && candTokens.size > 0) {
      let aInB = true;
      for (const t of targetTokens) if (!candTokens.has(t)) { aInB = false; break; }
      let bInA = true;
      for (const t of candTokens) if (!targetTokens.has(t)) { bInA = false; break; }
      if (aInB || bInA) {
        const overlap = Math.min(targetTokens.size, candTokens.size) /
                        Math.max(targetTokens.size, candTokens.size);
        if (overlap >= 0.5) {
          const score = 0.9 + overlap * 0.05;
          if (!best || score > best.score) {
            best = { exercise: ex, score, method: "token-set" };
          }
          continue;
        }
      }
    }

    const r = ratio(target, candidate);
    if (r >= threshold && (!best || r > best.score)) {
      best = { exercise: ex, score: r, method: "fuzzy" };
    }
  }

  return best;
}
