// Shared fuzzy-matching engine for AI Import (exercises, foods, supplements).
// Single 80% threshold. Uses MAX of multiple signals so any strong signal wins.

const NOISE_TOKENS = new Set([
  "me", "mb", "mh", "myo", "amrap", "drop", "rest-pause", "rp",
  "skip", "to", "video", "tutorial", "demo", "see", "above",
]);

const PARENS_RE = /\([^)]*\)/g;
const PUNCT_RE = /[.,;:!?'"`/\\–—_+*&|<>=[\]{}()@#$%^~]/g;
const TIMECODE_RE = /\b\d{1,2}:\d{2}\b/g;
const MULTI_WS_RE = /\s+/g;

export type SynonymMap = Map<string, string[]>;

/** Strip punctuation, parens, timecodes, noise tokens; lowercase; collapse whitespace. */
export function normalize(s: string): string {
  if (!s) return "";
  let out = s.toLowerCase();
  out = out.replace(PARENS_RE, " ");
  out = out.replace(TIMECODE_RE, " ");
  out = out.replace(PUNCT_RE, " ");
  out = out.replace(MULTI_WS_RE, " ").trim();
  // Drop noise tokens
  const tokens = out.split(" ").filter((t) => t && !NOISE_TOKENS.has(t));
  return tokens.join(" ");
}

/** Expand each token via the synonym map to its canonical form. Singularize trailing 's'. */
export function expandTokens(s: string, syn: SynonymMap): string {
  const tokens = s.split(" ").filter(Boolean);
  const out: string[] = [];
  for (const t of tokens) {
    const expansions = syn.get(t);
    if (expansions && expansions.length > 0) {
      out.push(...expansions[0].split(" ")); // first canonical
    } else {
      out.push(t);
    }
  }
  // Singularize trailing 's' on tokens >3 chars (lunges -> lunge, squats -> squat)
  return out
    .map((t) => (t.length > 3 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t))
    .join(" ");
}

function tokenSet(s: string): Set<string> {
  return new Set(s.split(" ").filter(Boolean));
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = new Array(n + 1);
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

function levenshteinRatio(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  return 1 - levenshtein(a, b) / max;
}

function trigrams(s: string): Set<string> {
  const padded = `  ${s}  `;
  const out = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3));
  return out;
}

function trigramSimilarity(a: string, b: string): number {
  const ta = trigrams(a), tb = trigrams(b);
  if (ta.size === 0 && tb.size === 0) return 1;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Score 0-100 between two strings. Pre-normalize+expand both before calling. */
export function scoreNormalized(aNorm: string, bNorm: string): number {
  if (!aNorm || !bNorm) return 0;
  if (aNorm === bNorm) return 100;

  const setA = tokenSet(aNorm);
  const setB = tokenSet(bNorm);

  // Token-set match (same tokens, any order)
  if (setA.size > 0 && setA.size === setB.size) {
    let allShared = true;
    for (const t of setA) if (!setB.has(t)) { allShared = false; break; }
    if (allShared) return 95;
  }

  // Token-subset match
  let aInB = true; for (const t of setA) if (!setB.has(t)) { aInB = false; break; }
  let bInA = true; for (const t of setB) if (!setA.has(t)) { bInA = false; break; }
  if ((aInB || bInA) && setA.size > 0 && setB.size > 0) {
    const minSize = Math.min(setA.size, setB.size);
    const maxSize = Math.max(setA.size, setB.size);
    if (minSize / maxSize >= 0.5) return 90;
  }

  const lev = levenshteinRatio(aNorm, bNorm) * 85;
  const tri = trigramSimilarity(aNorm, bNorm) * 85;
  return Math.max(lev, tri);
}

/** Full-pipeline score (0-100) including normalize + synonym expansion. */
export function scoreMatch(extracted: string, candidate: string, syn: SynonymMap): number {
  const a = expandTokens(normalize(extracted), syn);
  const b = expandTokens(normalize(candidate), syn);
  return scoreNormalized(a, b);
}

/** Build candidate query terms (trigram-friendly tokens) for a SQL ilike OR. */
export function candidateTokens(extracted: string, syn: SynonymMap): string[] {
  const expanded = expandTokens(normalize(extracted), syn);
  const tokens = expanded.split(" ").filter((t) => t.length >= 3);
  // Cap at 4 tokens to keep queries fast
  return Array.from(new Set(tokens)).slice(0, 4);
}
