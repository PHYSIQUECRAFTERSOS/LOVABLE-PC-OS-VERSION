// Deno copy of src/utils/exerciseMatcher.ts (kept colocated so the edge function
// stays self-contained — Supabase Edge Functions cannot import from /src).
// Keep these two in sync if you change matching logic.

export interface ExerciseLike {
  id: string;
  name: string;
  [k: string]: any;
}

const ABBR: Record<string, string> = {
  db: "dumbbell", bb: "barbell", rdl: "romanian deadlift",
  sldl: "stiff leg deadlift", ohp: "overhead press", bw: "bodyweight",
  kb: "kettlebell", ez: "ez bar", bf: "bulgarian split squat",
  bss: "bulgarian split squat", ghr: "glute ham raise", smith: "smith machine",
};

export function normalizeExerciseName(raw: string): string {
  if (!raw) return "";
  let s = raw.toLowerCase().trim();
  s = s.replace(/[\(\)\[\]\{\}]/g, " ");
  s = s.replace(/[.,;:!?'"`/\\\-_+*&|<>=@#$%^~]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  const tokens = s.split(" ").map((t) => ABBR[t] ?? t);
  const singular = tokens
    .join(" ")
    .split(" ")
    .map((t) => (t.length > 3 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t));
  return singular.join(" ").trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]; dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

const ratio = (a: string, b: string) => {
  const max = Math.max(a.length, b.length);
  return max === 0 ? 1 : 1 - levenshtein(a, b) / max;
};

const tokenSet = (s: string) => new Set(s.split(" ").filter(Boolean));

export interface MatchResult<T extends ExerciseLike> {
  exercise: T; score: number; method: "exact" | "token-set" | "fuzzy";
}

export function findExerciseInLibrary<T extends ExerciseLike>(
  name: string, library: T[], threshold = 0.8,
): MatchResult<T> | null {
  if (!name || !library?.length) return null;
  const target = normalizeExerciseName(name);
  if (!target) return null;
  const tt = tokenSet(target);
  let best: MatchResult<T> | null = null;
  for (const ex of library) {
    const cand = normalizeExerciseName(ex.name);
    if (!cand) continue;
    if (cand === target) return { exercise: ex, score: 1, method: "exact" };
    const ct = tokenSet(cand);
    if (tt.size && ct.size) {
      let aInB = true; for (const t of tt) if (!ct.has(t)) { aInB = false; break; }
      let bInA = true; for (const t of ct) if (!tt.has(t)) { bInA = false; break; }
      if (aInB || bInA) {
        const overlap = Math.min(tt.size, ct.size) / Math.max(tt.size, ct.size);
        if (overlap >= 0.5) {
          const s = 0.9 + overlap * 0.05;
          if (!best || s > best.score) best = { exercise: ex, score: s, method: "token-set" };
          continue;
        }
      }
    }
    const r = ratio(target, cand);
    if (r >= threshold && (!best || r > best.score)) {
      best = { exercise: ex, score: r, method: "fuzzy" };
    }
  }
  return best;
}
