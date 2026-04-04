import { Badge } from "@/components/ui/badge";

interface FoodMatch {
  pdf_name: string;
  matched_id: string | null;
  matched_name: string | null;
  matched_brand: string | null;
  confidence: number;
  confidence_level: "green" | "yellow" | "red";
}

interface FoodMatchReviewProps {
  extracted: any;
  matchResults: { foods: Record<string, FoodMatch> };
  onUpdateMatches: (updated: Record<string, FoodMatch>) => void;
}

const ConfidenceBadge = ({ level }: { level: string }) => {
  const colors = {
    green: "bg-green-500/20 text-green-400 border-green-500/30",
    yellow: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    red: "bg-red-500/20 text-red-400 border-red-500/30",
  };
  const labels = { green: "Matched", yellow: "Partial", red: "Custom Food" };
  return (
    <Badge variant="outline" className={`text-[10px] ${colors[level as keyof typeof colors] || colors.red}`}>
      {labels[level as keyof typeof labels] || "Custom"}
    </Badge>
  );
};

const FoodMatchReview = ({ extracted, matchResults }: FoodMatchReviewProps) => {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-foreground">Food Matching</h3>
      {(extracted.days || []).map((day: any, dayIdx: number) => (
        <div key={dayIdx} className="space-y-3">
          <h4 className="text-xs font-medium text-muted-foreground">{day.day_label || `Day ${dayIdx + 1}`}</h4>
          {(day.meals || []).map((meal: any, mealIdx: number) => (
            <div key={mealIdx} className="bg-card border rounded-lg p-3 space-y-2">
              <p className="text-xs font-semibold text-foreground">{meal.meal_name}</p>
              {(meal.foods || []).map((food: any, foodIdx: number) => {
                const match = matchResults.foods[food.name];
                return (
                  <div key={foodIdx} className="flex items-center justify-between gap-2 py-1 border-t border-border/50 first:border-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-foreground truncate">{food.name}</p>
                        {food.quantity && (
                          <span className="text-[10px] text-muted-foreground shrink-0">{food.quantity}</span>
                        )}
                      </div>
                      {match && match.matched_name && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          → {match.matched_name}
                          {match.matched_brand && ` (${match.matched_brand})`}
                        </p>
                      )}
                      {food.calories != null && (
                        <p className="text-[10px] text-muted-foreground">
                          {food.calories}cal · {food.protein || 0}p · {food.carbs || 0}c · {food.fat || 0}f
                        </p>
                      )}
                    </div>
                    {match && <ConfidenceBadge level={match.confidence_level} />}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

export default FoodMatchReview;
