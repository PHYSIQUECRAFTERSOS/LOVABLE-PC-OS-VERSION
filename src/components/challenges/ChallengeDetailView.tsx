import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Trophy, Footprints, SlidersHorizontal, Calendar, Users, Star, Dumbbell, Target, Flame, UserMinus } from "lucide-react";
import { Challenge, useChallengeParticipants, useJoinChallenge, useLogChallengeEntry, useSaveTemplate, useChallengeTiers, useChallengeScoringRules, useRemoveChallengeParticipant } from "@/hooks/useChallenges";
import { useAuth } from "@/hooks/useAuth";
import ChallengeTierProgress from "./ChallengeTierProgress";
import TierIcon from "./TierIcon";

interface Props {
  challenge: Challenge | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const medals = ["🥇", "🥈", "🥉"];

const SCORING_ACTION_LABELS: Record<string, { label: string; icon: React.ElementType }> = {
  workout_completed: { label: "Workout Completed", icon: Dumbbell },
  personal_best: { label: "Personal Best", icon: Trophy },
  daily_logging: { label: "Daily Logging", icon: Target },
  streak_bonus: { label: "Streak Bonus", icon: Flame },
};

const ChallengeDetailView = ({ challenge, open, onOpenChange }: Props) => {
  const { user, role } = useAuth();
  const direction = challenge?.challenge_type === "custom" ? challenge.config?.direction : undefined;
  const { data: participants } = useChallengeParticipants(challenge?.id || null, direction);
  const { data: challengeTiers } = useChallengeTiers(challenge?.id || null);
  const { data: scoringRules } = useChallengeScoringRules(challenge?.id || null);
  const joinChallenge = useJoinChallenge();
  const logEntry = useLogChallengeEntry();
  const saveTemplate = useSaveTemplate();
  const isCoach = role === "coach" || role === "admin";

  const [logValue, setLogValue] = useState("");
  const [logDate, setLogDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [logNote, setLogNote] = useState("");
  const [showLogModal, setShowLogModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateName, setTemplateName] = useState("");

  if (!challenge) return null;

  const isJoined = participants?.some((p) => p.user_id === user?.id);
  const myParticipant = participants?.find((p) => p.user_id === user?.id);
  const daysLeft = Math.max(0, Math.ceil((new Date(challenge.end_date).getTime() - Date.now()) / 86400000));
  const totalDays = Math.max(1, Math.ceil((new Date(challenge.end_date).getTime() - new Date(challenge.start_date).getTime()) / 86400000));
  const elapsed = totalDays - daysLeft;
  const progressPct = Math.min(100, Math.round((elapsed / totalDays) * 100));

  const config = challenge.config || {};
  const isCustom = challenge.challenge_type === "custom";
  const isSteps = challenge.challenge_type === "steps";
  const isPR = challenge.challenge_type === "pr";

  const metricLabel = isCustom
    ? `${config.metric_name || "Value"} (${config.metric_unit || ""})`
    : isSteps ? "Steps" : config.metric || "Weight";

  const myPoints = Number(myParticipant?.current_value || 0);

  // Get participant tier
  const getParticipantTier = (points: number) => {
    if (!challengeTiers?.length) return null;
    const sorted = [...challengeTiers].sort((a, b) => b.min_points - a.min_points);
    return sorted.find((t) => points >= t.min_points) || challengeTiers[0];
  };

  const handleJoin = () => {
    if (challenge.id) joinChallenge.mutate(challenge.id);
  };

  const handleLog = () => {
    if (!logValue || !challenge.id) return;
    logEntry.mutate(
      {
        challengeId: challenge.id,
        value: Number(logValue),
        logDate,
        metadata: logNote ? { note: logNote } : null,
      },
      { onSuccess: () => { setLogValue(""); setLogNote(""); setShowLogModal(false); } }
    );
  };

  const handleSaveAsTemplate = async () => {
    if (!templateName) return;
    const durationDays = Math.ceil(
      (new Date(challenge.end_date).getTime() - new Date(challenge.start_date).getTime()) / 86400000
    );
    await saveTemplate.mutateAsync({
      created_by: user!.id,
      name: templateName,
      description: challenge.description,
      challenge_type: challenge.challenge_type,
      config: challenge.config,
      default_duration_days: durationDays,
      default_xp_reward: challenge.xp_reward,
    } as any);
    setShowTemplateModal(false);
    setTemplateName("");
  };

  const TypeIcon = isPR ? Trophy : isSteps ? Footprints : SlidersHorizontal;

  const statusColor = {
    active: "bg-green-500/20 text-green-400 border-green-500/30",
    upcoming: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    completed: "bg-muted text-muted-foreground border-border",
    draft: "bg-muted text-muted-foreground border-border",
    cancelled: "bg-destructive/20 text-destructive border-destructive/30",
  }[challenge.status] || "";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <TypeIcon className="h-5 w-5 text-primary" />
              <DialogTitle className="text-lg">{challenge.title}</DialogTitle>
            </div>
          </DialogHeader>

          {/* Status & Dates */}
          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant="outline" className={statusColor}>{challenge.status}</Badge>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" /> {challenge.start_date} → {challenge.end_date}
            </span>
            {challenge.status === "active" && (
              <span className="text-xs text-muted-foreground">{daysLeft} days left</span>
            )}
          </div>

          {challenge.description && (
            <p className="text-sm text-muted-foreground">{challenge.description}</p>
          )}

          {/* Challenge Progress */}
          {challenge.status === "active" && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Challenge Progress</span>
                <span>{progressPct}%</span>
              </div>
              <Progress value={progressPct} className="h-2" />
            </div>
          )}

          {/* Tier Progress for current user */}
          {myParticipant && challengeTiers && challengeTiers.length > 0 && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="pt-4 pb-3">
                <ChallengeTierProgress tiers={challengeTiers} currentPoints={myPoints} />
              </CardContent>
            </Card>
          )}

          {/* My Stats */}
          {myParticipant && (
            <Card className="border-border bg-card">
              <CardContent className="pt-4 pb-3">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-lg font-bold text-primary">{Number(myParticipant.current_value).toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground">Points</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-foreground">{Number(myParticipant.best_value).toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground">Best</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-foreground">#{myParticipant.rank || "—"}</p>
                    <p className="text-[10px] text-muted-foreground">Rank</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Scoring Rules */}
          {scoringRules && scoringRules.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                How to Earn Points
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {scoringRules.filter((r) => r.is_enabled).map((rule) => {
                  const meta = SCORING_ACTION_LABELS[rule.action_type];
                  const Icon = meta?.icon || Star;
                  return (
                    <div key={rule.action_type} className="flex items-center gap-2 p-2 rounded-lg bg-secondary/30">
                      <Icon className="h-3.5 w-3.5 text-primary shrink-0" />
                      <div>
                        <p className="text-[11px] font-medium text-foreground">{meta?.label || rule.action_type}</p>
                        <p className="text-[10px] text-primary font-bold">{rule.points} pts · 1×/day</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 flex-wrap">
            {challenge.status === "active" && !isJoined && (
              <Button onClick={handleJoin} disabled={joinChallenge.isPending} className="flex-1">
                <Users className="h-4 w-4 mr-1" /> Join Challenge
              </Button>
            )}

            {challenge.status === "active" && isJoined && (isSteps || isCustom) && (
              <Button onClick={() => setShowLogModal(true)} variant="outline" className="flex-1">
                {isSteps ? <Footprints className="h-4 w-4 mr-1" /> : <SlidersHorizontal className="h-4 w-4 mr-1" />}
                {isSteps ? "Log Steps" : "Log Progress"}
              </Button>
            )}

            {isCoach && (challenge.status === "active" || challenge.status === "completed") && (
              <Button variant="ghost" size="sm" onClick={() => { setTemplateName(challenge.title); setShowTemplateModal(true); }}>
                <Star className="h-4 w-4 mr-1" /> Save as Template
              </Button>
            )}
          </div>

          {isPR && isJoined && (
            <p className="text-xs text-muted-foreground text-center p-2 bg-secondary/30 rounded-lg">
              <Trophy className="inline h-3.5 w-3.5 mr-1 text-primary" />
              PRs are auto-detected from your workout logs. Just keep training!
            </p>
          )}

          {/* Leaderboard */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Leaderboard ({participants?.length || 0} participants)
            </h3>
            {!participants?.length ? (
              <p className="text-xs text-muted-foreground text-center py-4">No participants yet.</p>
            ) : (
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {participants.map((p, i) => {
                  const initials = (p.full_name || "U").split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
                  const isMe = p.user_id === user?.id;
                  const isTop3 = i < 3;
                  const pTier = getParticipantTier(Number(p.current_value));
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center gap-2.5 rounded-lg p-2.5 ${isMe ? "border border-primary/30 bg-primary/5" : isTop3 ? "bg-secondary/50" : "bg-card"}`}
                    >
                      <span className="w-6 text-center text-sm font-bold shrink-0">
                        {isTop3 ? medals[i] : <span className="text-muted-foreground">#{i + 1}</span>}
                      </span>
                      <Avatar className="h-7 w-7">
                        {p.avatar_url && <AvatarImage src={p.avatar_url} />}
                        <AvatarFallback className="text-[10px] bg-secondary">{initials}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-foreground truncate block">{p.full_name}</span>
                        {pTier && (
                          <span className="text-[9px] font-medium flex items-center gap-1" style={{ color: pTier.color }}>
                            <TierIcon name={pTier.name} size={14} /> {pTier.name}
                          </span>
                        )}
                      </div>
                      <span className="text-sm font-bold text-primary">
                        {Number(p.best_value).toLocaleString()}
                        {isCustom && <span className="text-[10px] text-muted-foreground ml-1">{config.metric_unit}</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Log Modal */}
      <Dialog open={showLogModal} onOpenChange={setShowLogModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{isSteps ? "Log Steps" : `Log ${config.metric_name || "Progress"}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Date</Label>
              <Input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">{metricLabel}</Label>
              <Input type="number" value={logValue} onChange={(e) => setLogValue(e.target.value)} placeholder={isSteps ? "e.g. 10000" : `e.g. 32`} />
            </div>
            {isCustom && (
              <div>
                <Label className="text-xs">Note (optional)</Label>
                <Textarea value={logNote} onChange={(e) => setLogNote(e.target.value)} placeholder="Any context..." className="min-h-[50px]" />
              </div>
            )}
            <Button onClick={handleLog} disabled={!logValue || logEntry.isPending} className="w-full">
              Submit
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Save as Template Modal */}
      <Dialog open={showTemplateModal} onOpenChange={setShowTemplateModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Save as Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Template Name</Label>
              <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="Template name" />
            </div>
            <Button onClick={handleSaveAsTemplate} disabled={!templateName || saveTemplate.isPending} className="w-full">
              Save Template
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ChallengeDetailView;
