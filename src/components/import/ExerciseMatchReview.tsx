import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Check, Plus, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface ExerciseMatch {
  pdf_name: string;
  matched_id: string | null;
  matched_name: string | null;
  confidence: number;
  confidence_score?: number;
  confidence_level: "green" | "yellow" | "red";
  from_alias?: boolean;
}

interface ExerciseMatchReviewProps {
  extracted: any;
  matchResults: { exercises: Record<string, ExerciseMatch> };
  onUpdateMatches: (updated: Record<string, ExerciseMatch>) => void;
}

// Single threshold per spec
const AUTO_ACCEPT_SCORE = 80;

const ConfidenceBadge = ({ score }: { score: number }) => {
  const isHigh = score >= AUTO_ACCEPT_SCORE;
  const cls = isHigh
    ? "bg-green-500/20 text-green-400 border-green-500/30"
    : "bg-red-500/20 text-red-400 border-red-500/30";
  return (
    <Badge variant="outline" className={`text-[10px] ${cls}`}>
      {isHigh ? "High" : "Low"} {Math.round(score)}%
    </Badge>
  );
};

// ---------- Lightweight client-side scorer (mirrors edge function) ----------
const NOISE = new Set(["me", "mb", "mh", "myo", "amrap", "drop", "rp", "skip", "to"]);
function normalize(s: string): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b\d{1,2}:\d{2}\b/g, " ")
    .replace(/[.,;:!?'"`/\\\-–—_+*&|<>=\[\]{}()@#$%^~]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((t) => t && !NOISE.has(t))
    .map((t) => (t.length > 3 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t))
    .join(" ");
}
function tokenSet(s: string) { return new Set(s.split(" ").filter(Boolean)); }
function lev(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const dp = new Array(n + 1).fill(0).map((_, j) => j);
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
function score(a: string, b: string): number {
  const an = normalize(a), bn = normalize(b);
  if (!an || !bn) return 0;
  if (an === bn) return 100;
  const sa = tokenSet(an), sb = tokenSet(bn);
  if (sa.size && sa.size === sb.size) {
    let all = true; for (const t of sa) if (!sb.has(t)) { all = false; break; }
    if (all) return 95;
  }
  let aInB = true; for (const t of sa) if (!sb.has(t)) { aInB = false; break; }
  let bInA = true; for (const t of sb) if (!sa.has(t)) { bInA = false; break; }
  if ((aInB || bInA) && sa.size && sb.size) {
    const min = Math.min(sa.size, sb.size), max = Math.max(sa.size, sb.size);
    if (min / max >= 0.5) return 90;
  }
  const max = Math.max(an.length, bn.length);
  return max === 0 ? 0 : (1 - lev(an, bn) / max) * 85;
}
// ---------------------------------------------------------------------------

const ExerciseMatchReview = ({ extracted, matchResults, onUpdateMatches }: ExerciseMatchReviewProps) => {
  const [searchOpen, setSearchOpen] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);

  const fetchCandidates = useCallback(async (query: string): Promise<any[]> => {
    const norm = normalize(query);
    const tokens = norm.split(" ").filter((t) => t.length >= 3).slice(0, 4);
    if (tokens.length === 0 && !norm) return [];

    let q = supabase
      .from("exercises")
      .select("id, name, primary_muscle, equipment, youtube_thumbnail, youtube_url, tags");

    if (tokens.length > 0) {
      const orClause = tokens.map((t) => `name.ilike.%${t.replace(/[%_]/g, "")}%`).join(",");
      q = q.or(orClause);
    } else {
      q = q.ilike("name", `%${norm}%`);
    }

    const { data, error } = await q.limit(50);
    if (error) { console.error("Exercise search error:", error); return []; }
    // Rank with scorer
    const ranked = (data || [])
      .map((row: any) => ({ ...row, _score: score(query, row.name) }))
      .sort((a, b) => b._score - a._score)
      .slice(0, 10);
    return ranked;
  }, []);

  // Open Fix → pre-fill with extracted name and pre-fetch candidates immediately
  const openFix = async (extractedName: string) => {
    setSearchOpen(extractedName);
    setSearchQuery(extractedName);
    const results = await fetchCandidates(extractedName);
    setSearchResults(results);
  };

  // Live re-rank as the coach types
  useEffect(() => {
    if (!searchOpen) return;
    const timer = setTimeout(async () => {
      const results = await fetchCandidates(searchQuery);
      setSearchResults(results);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery, searchOpen, fetchCandidates]);

  const persistAlias = async (extractedName: string, exerciseId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const normalized = normalize(extractedName);
      if (!normalized) return;
      // Upsert: increment hit_count if exists
      await supabase.from("exercise_extraction_aliases").upsert(
        {
          extracted_name: extractedName,
          normalized_name: normalized,
          exercise_id: exerciseId,
          created_by: user.id,
          last_used_at: new Date().toISOString(),
        },
        { onConflict: "normalized_name,exercise_id" },
      );
    } catch (e) {
      console.error("persistAlias error", e);
    }
  };

  const selectExercise = (pdfName: string, exercise: any | null) => {
    const updated = { ...matchResults.exercises };
    if (exercise) {
      updated[pdfName] = {
        ...updated[pdfName],
        matched_id: exercise.id,
        matched_name: exercise.name,
        confidence: 1.0,
        confidence_score: 100,
        confidence_level: "green",
      };
      void persistAlias(pdfName, exercise.id);
    } else {
      updated[pdfName] = {
        ...updated[pdfName],
        matched_id: null,
        matched_name: null,
        confidence: 0,
        confidence_score: 0,
        confidence_level: "red",
      };
    }
    onUpdateMatches(updated);
    setSearchOpen(null);
    setSearchQuery("");
    setSearchResults([]);
  };

  // Support both "days" and "workout_days" from AI extraction
  const days = extracted.days || extracted.workout_days || [];

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-foreground">Exercise Matching</h3>
      {days.map((day: any, dayIdx: number) => (
        <div key={dayIdx} className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground">{day.day_name || `Day ${dayIdx + 1}`}</h4>
          <div className="space-y-1.5">
            {(day.exercises || []).map((ex: any, exIdx: number) => {
              const match = matchResults.exercises[ex.name];
              if (!match) return null;
              const isSearching = searchOpen === ex.name;
              const displayScore =
                match.confidence_score ?? Math.round((match.confidence ?? 0) * 100);
              const isLow = displayScore < AUTO_ACCEPT_SCORE;

              return (
                <div key={exIdx} className="bg-card border rounded-lg p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{ex.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-muted-foreground">→</span>
                        <span className="text-xs text-muted-foreground truncate">
                          {match.matched_name || "No match"}
                        </span>
                        <ConfidenceBadge score={displayScore} />
                      </div>
                    </div>
                    {isLow && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0 h-7 text-[10px]"
                        onClick={() => {
                          if (isSearching) {
                            setSearchOpen(null);
                            setSearchQuery("");
                            setSearchResults([]);
                          } else {
                            void openFix(ex.name);
                          }
                        }}
                      >
                        {isSearching ? "Close" : "Fix"}
                        <ChevronDown className="h-3 w-3 ml-1" />
                      </Button>
                    )}
                  </div>

                  {isSearching && (
                    <div className="mt-2 space-y-2 border-t pt-2">
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                        <Input
                          placeholder="Search exercises..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-7 h-7 text-xs"
                          autoFocus
                        />
                      </div>
                      <div className="max-h-40 overflow-y-auto space-y-0.5">
                        {searchResults.slice(0, 5).map((cat) => (
                          <button
                            key={cat.id}
                            className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted/50 flex items-center gap-1.5"
                            onClick={() => selectExercise(ex.name, cat)}
                          >
                            <Check className="h-3 w-3 text-muted-foreground shrink-0" />
                            <span className="flex-1 truncate">{cat.name}</span>
                            {typeof cat._score === "number" && (
                              <span className="text-[10px] text-muted-foreground shrink-0">
                                {Math.round(cat._score)}%
                              </span>
                            )}
                          </button>
                        ))}
                        {searchQuery && searchResults.length === 0 && (
                          <p className="text-[10px] text-muted-foreground px-2 py-2">
                            No matches found. You can create this as a new exercise below.
                          </p>
                        )}
                        <button
                          className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted/50 flex items-center gap-1.5 text-primary border-t border-border mt-1 pt-2"
                          onClick={() => selectExercise(ex.name, null)}
                        >
                          <Plus className="h-3 w-3" /> Create New: &quot;{searchQuery || ex.name}&quot;
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

export default ExerciseMatchReview;
