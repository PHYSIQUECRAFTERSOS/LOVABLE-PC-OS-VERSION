import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Flame, Users, Calendar, Check, ChevronDown, ChevronUp } from "lucide-react";
import { Challenge, useChallenges, useJoinChallenge } from "@/hooks/useChallenges";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import ChallengeDetailView from "./ChallengeDetailView";

const ChallengesTab = () => {
  const { role } = useAuth();
  const { data: challenges, isLoading } = useChallenges();
  const joinChallenge = useJoinChallenge();
  const isCoach = role === "coach" || role === "admin";

  const [selectedChallenge, setSelectedChallenge] = useState<Challenge | null>(null);
  const [showPast, setShowPast] = useState(false);

  if (isLoading) {
    return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-lg" />)}</div>;
  }

  const active = (challenges || []).filter((c) => c.status === "active");
  const upcoming = (challenges || []).filter((c) => c.status === "upcoming");
  const past = (challenges || []).filter((c) => c.status === "completed" || c.status === "cancelled");

  const renderCard = (challenge: Challenge) => {
    const daysLeft = Math.max(0, Math.ceil((new Date(challenge.end_date).getTime() - Date.now()) / 86400000));
    const totalDays = Math.max(1, Math.ceil((new Date(challenge.end_date).getTime() - new Date(challenge.start_date).getTime()) / 86400000));
    const progressPct = challenge.status === "active" ? Math.min(100, Math.round(((totalDays - daysLeft) / totalDays) * 100)) : 0;

    return (
      <Card
        key={challenge.id}
        className={`border-border bg-card cursor-pointer hover:border-muted-foreground/30 transition-all ${challenge.status === "active" ? "border-primary/30" : ""}`}
        onClick={() => setSelectedChallenge(challenge)}
      >
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-primary" />
                <h3 className="font-semibold text-foreground">{challenge.title}</h3>
              </div>
              {challenge.description && (
                <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{challenge.description}</p>
              )}
            </div>
            <Badge variant={challenge.status === "active" ? "default" : challenge.status === "completed" ? "secondary" : "outline"}>
              {challenge.status === "completed" && <Check className="h-3 w-3 mr-1" />}
              {challenge.status}
            </Badge>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {challenge.participant_count || 0} joined</span>
            <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {challenge.status === "active" ? `${daysLeft} days left` : `${challenge.start_date} → ${challenge.end_date}`}</span>
          </div>
          {challenge.status === "active" && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Progress</span>
                <span>{progressPct}%</span>
              </div>
              <Progress value={progressPct} className="h-2" />
            </div>
          )}
          {challenge.status === "active" && !challenge.is_joined && !isCoach && (
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={(e) => { e.stopPropagation(); joinChallenge.mutate(challenge.id); }}
            >
              Join Challenge
            </Button>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      {active.length > 0 && active.map(renderCard)}
      {upcoming.length > 0 && (
        <>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Upcoming</p>
          {upcoming.map(renderCard)}
        </>
      )}

      {!active.length && !upcoming.length && (
        <div className="text-center py-12">
          <Flame className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">No active challenges. Check back soon!</p>
        </div>
      )}

      {past.length > 0 && (
        <div>
          <button
            onClick={() => setShowPast(!showPast)}
            className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
          >
            Past Challenges ({past.length})
            {showPast ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {showPast && <div className="space-y-3 mt-2">{past.map(renderCard)}</div>}
        </div>
      )}

      <ChallengeDetailView
        challenge={selectedChallenge}
        open={!!selectedChallenge}
        onOpenChange={(v) => { if (!v) setSelectedChallenge(null); }}
      />
    </div>
  );
};

export default ChallengesTab;
