import { useState, useEffect } from "react";
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
  confidence_level: "green" | "yellow" | "red";
}

interface ExerciseMatchReviewProps {
  extracted: any;
  matchResults: { exercises: Record<string, ExerciseMatch> };
  onUpdateMatches: (updated: Record<string, ExerciseMatch>) => void;
}

const ConfidenceBadge = ({ level }: { level: string }) => {
  const colors = {
    green: "bg-green-500/20 text-green-400 border-green-500/30",
    yellow: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    red: "bg-red-500/20 text-red-400 border-red-500/30",
  };
  const labels = { green: "High", yellow: "Medium", red: "Low" };
  return (
    <Badge variant="outline" className={`text-[10px] ${colors[level as keyof typeof colors] || colors.red}`}>
      {labels[level as keyof typeof labels] || "Low"}
    </Badge>
  );
};

const ExerciseMatchReview = ({ extracted, matchResults, onUpdateMatches }: ExerciseMatchReviewProps) => {
  const [searchOpen, setSearchOpen] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [catalog, setCatalog] = useState<any[]>([]);

  useEffect(() => {
    const loadCatalog = async () => {
      const { data } = await supabase
        .from("exercises")
        .select("id, name, muscle_group, equipment")
        .order("name")
        .limit(500);
      setCatalog(data || []);
    };
    loadCatalog();
  }, []);

  const filteredCatalog = catalog.filter(
    (ex) =>
      !searchQuery ||
      ex.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectExercise = (pdfName: string, exercise: any | null) => {
    const updated = { ...matchResults.exercises };
    if (exercise) {
      updated[pdfName] = {
        ...updated[pdfName],
        matched_id: exercise.id,
        matched_name: exercise.name,
        confidence: 1.0,
        confidence_level: "green",
      };
    } else {
      updated[pdfName] = {
        ...updated[pdfName],
        matched_id: null,
        matched_name: null,
        confidence: 0,
        confidence_level: "red",
      };
    }
    onUpdateMatches(updated);
    setSearchOpen(null);
    setSearchQuery("");
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-foreground">Exercise Matching</h3>
      {(extracted.days || []).map((day: any, dayIdx: number) => (
        <div key={dayIdx} className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground">{day.day_name || `Day ${dayIdx + 1}`}</h4>
          <div className="space-y-1.5">
            {(day.exercises || []).map((ex: any, exIdx: number) => {
              const match = matchResults.exercises[ex.name];
              if (!match) return null;
              const isSearching = searchOpen === ex.name;

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
                        <ConfidenceBadge level={match.confidence_level} />
                      </div>
                    </div>
                    {match.confidence_level !== "green" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0 h-7 text-[10px]"
                        onClick={() => setSearchOpen(isSearching ? null : ex.name)}
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
                        />
                      </div>
                      <div className="max-h-32 overflow-y-auto space-y-0.5">
                        <button
                          className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted/50 flex items-center gap-1.5 text-primary"
                          onClick={() => selectExercise(ex.name, null)}
                        >
                          <Plus className="h-3 w-3" /> Create New: "{ex.name}"
                        </button>
                        {filteredCatalog.slice(0, 20).map((cat) => (
                          <button
                            key={cat.id}
                            className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted/50 flex items-center gap-1.5"
                            onClick={() => selectExercise(ex.name, cat)}
                          >
                            <Check className="h-3 w-3 text-muted-foreground" />
                            {cat.name}
                            {cat.muscle_group && (
                              <span className="text-[10px] text-muted-foreground">({cat.muscle_group})</span>
                            )}
                          </button>
                        ))}
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
