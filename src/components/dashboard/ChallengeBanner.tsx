import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { X, Trophy, Footprints, SlidersHorizontal } from "lucide-react";
import { useUndismissedChallenges, useDismissBanner, Challenge } from "@/hooks/useChallenges";

const ChallengeBanner = () => {
  const { data: challenges } = useUndismissedChallenges();
  const dismiss = useDismissBanner();
  const navigate = useNavigate();

  if (!challenges?.length) return null;

  return (
    <div className="space-y-2">
      {challenges.map((c: Challenge) => {
        const Icon = c.challenge_type === "pr" ? Trophy : c.challenge_type === "steps" ? Footprints : SlidersHorizontal;
        return (
          <div
            key={c.id}
            className="relative flex items-center gap-2 rounded-lg border-l-4 border-l-primary border border-border bg-card px-3 py-3 overflow-hidden"
          >
            <Icon className="h-5 w-5 text-primary shrink-0" />
            <div className="flex-1 min-w-0 pr-5">
              <p className="text-sm font-semibold text-foreground truncate">{c.title}</p>
              {c.description && (
                <p className="text-xs text-muted-foreground line-clamp-2">{c.description}</p>
              )}
            </div>
            <Button
              size="sm"
              variant="default"
              className="shrink-0 text-xs px-3"
              onClick={() => navigate("/challenges")}
            >
              View
            </Button>
            <button
              onClick={(e) => { e.stopPropagation(); dismiss.mutate(c.id); }}
              className="absolute top-1.5 right-1.5 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default ChallengeBanner;
