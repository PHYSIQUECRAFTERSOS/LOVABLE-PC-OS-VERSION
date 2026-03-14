import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Trophy, Footprints, Calendar, Users, Crown, Star } from "lucide-react";
import { Challenge, useChallengeParticipants, useJoinChallenge, useLogChallengeEntry } from "@/hooks/useChallenges";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  challenge: Challenge | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const medals = ["🥇", "🥈", "🥉"];

const ChallengeDetailView = ({ challenge, open, onOpenChange }: Props) => {
  const { user } = useAuth();
  const { data: participants } = useChallengeParticipants(challenge?.id || null);
  const joinChallenge = useJoinChallenge();
  const logEntry = useLogChallengeEntry();

  const [stepsValue, setStepsValue] = useState("");
  const [stepsDate, setStepsDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [showLogModal, setShowLogModal] = useState(false);

  if (!challenge) return null;

  const isJoined = participants?.some((p) => p.user_id === user?.id);
  const myParticipant = participants?.find((p) => p.user_id === user?.id);
  const daysLeft = Math.max(0, Math.ceil((new Date(challenge.end_date).getTime() - Date.now()) / 86400000));
  const totalDays = Math.max(1, Math.ceil((new Date(challenge.end_date).getTime() - new Date(challenge.start_date).getTime()) / 86400000));
  const elapsed = totalDays - daysLeft;
  const progressPct = Math.min(100, Math.round((elapsed / totalDays) * 100));

  const handleJoin = () => {
    if (challenge.id) joinChallenge.mutate(challenge.id);
  };

  const handleLogSteps = () => {
    if (!stepsValue || !challenge.id) return;
    logEntry.mutate(
      { challengeId: challenge.id, value: Number(stepsValue), logDate: stepsDate },
      { onSuccess: () => { setStepsValue(""); setShowLogModal(false); } }
    );
  };

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
              {challenge.challenge_type === "pr" ? <Trophy className="h-5 w-5 text-primary" /> : <Footprints className="h-5 w-5 text-primary" />}
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

          {/* Progress */}
          {challenge.status === "active" && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Challenge Progress</span>
                <span>{progressPct}%</span>
              </div>
              <Progress value={progressPct} className="h-2" />
            </div>
          )}

          {/* My Stats */}
          {myParticipant && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="pt-4 pb-3">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-lg font-bold text-primary">{Number(myParticipant.current_value).toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground">Current</p>
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

          {/* Actions */}
          {challenge.status === "active" && !isJoined && (
            <Button onClick={handleJoin} disabled={joinChallenge.isPending} className="w-full">
              <Users className="h-4 w-4 mr-1" /> Join Challenge
            </Button>
          )}

          {challenge.status === "active" && isJoined && challenge.challenge_type === "steps" && (
            <Button onClick={() => setShowLogModal(true)} variant="outline" className="w-full">
              <Footprints className="h-4 w-4 mr-1" /> Log Steps
            </Button>
          )}

          {challenge.challenge_type === "pr" && isJoined && (
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
                      <span className="flex-1 text-sm font-medium text-foreground truncate">{p.full_name}</span>
                      <span className="text-sm font-bold text-primary">{Number(p.best_value).toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Log Steps Modal */}
      <Dialog open={showLogModal} onOpenChange={setShowLogModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Log Steps</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Date</Label>
              <Input type="date" value={stepsDate} onChange={(e) => setStepsDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Steps</Label>
              <Input type="number" value={stepsValue} onChange={(e) => setStepsValue(e.target.value)} placeholder="e.g. 10000" />
            </div>
            <Button onClick={handleLogSteps} disabled={!stepsValue || logEntry.isPending} className="w-full">
              Submit
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ChallengeDetailView;
