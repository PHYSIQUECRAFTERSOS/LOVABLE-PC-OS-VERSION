import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Trophy, Footprints, ChevronLeft, ChevronRight, Check, Sparkles } from "lucide-react";
import { useCreateChallenge, useBadges, useCreateBadge } from "@/hooks/useChallenges";
import { useAllClients } from "@/hooks/useCulture";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const STEPS = ["Type", "Configure", "Participants", "Rewards", "Review"];

const CreateChallengeWizard = ({ open, onOpenChange }: Props) => {
  const { user } = useAuth();
  const createChallenge = useCreateChallenge();
  const { data: badges } = useBadges();
  const createBadge = useCreateBadge();
  const { data: allClients } = useAllClients();

  const [step, setStep] = useState(0);
  const [challengeType, setChallengeType] = useState<"pr" | "steps" | "">("");

  // Config
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [exerciseName, setExerciseName] = useState("");
  const [metric, setMetric] = useState("weight");
  const [unit, setUnit] = useState("lbs");
  const [dailyTarget, setDailyTarget] = useState(10000);
  const [stepsMetric, setStepsMetric] = useState("total_steps");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [xpReward, setXpReward] = useState(100);

  // Participants
  const [enrollment, setEnrollment] = useState("all");
  const [maxParticipants, setMaxParticipants] = useState<number | "">("");
  const [selectedClients, setSelectedClients] = useState<string[]>([]);

  // Rewards
  const [selectedBadgeId, setSelectedBadgeId] = useState<string | "">("");
  const [newBadgeName, setNewBadgeName] = useState("");
  const [newBadgeIcon, setNewBadgeIcon] = useState("🏆");

  const reset = () => {
    setStep(0);
    setChallengeType("");
    setTitle("");
    setDescription("");
    setExerciseName("");
    setMetric("weight");
    setUnit("lbs");
    setDailyTarget(10000);
    setStepsMetric("total_steps");
    setStartDate("");
    setEndDate("");
    setXpReward(100);
    setEnrollment("all");
    setMaxParticipants("");
    setSelectedClients([]);
    setSelectedBadgeId("");
    setNewBadgeName("");
    setNewBadgeIcon("🏆");
  };

  const canNext = () => {
    if (step === 0) return !!challengeType;
    if (step === 1) return !!title && !!startDate && !!endDate && new Date(endDate) > new Date(startDate);
    return true;
  };

  const handlePublish = async (asDraft: boolean) => {
    let badgeId = selectedBadgeId || null;

    // Create inline badge if needed
    if (!badgeId && newBadgeName) {
      try {
        const badge = await createBadge.mutateAsync({
          name: newBadgeName,
          icon: newBadgeIcon,
          category: "challenge",
        });
        badgeId = badge.id;
      } catch { /* ignore */ }
    }

    const today = new Date().toLocaleDateString("en-CA");
    let status = asDraft ? "draft" : "upcoming";
    if (!asDraft && startDate <= today) status = "active";

    const config = challengeType === "pr"
      ? { exercise_name: exerciseName, metric, unit }
      : { daily_target: dailyTarget, metric: stepsMetric, input_method: "manual" };

    await createChallenge.mutateAsync({
      created_by: user!.id,
      title,
      description: description || null,
      challenge_type: challengeType,
      status,
      start_date: startDate,
      end_date: endDate,
      config,
      xp_reward: xpReward,
      badge_id: badgeId,
      max_participants: maxParticipants ? Number(maxParticipants) : null,
      visibility: enrollment === "invite_only" ? "invite_only" : "all",
    } as any);

    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">Create Challenge</DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1 mb-4">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-1">
              <div className={`h-2 w-2 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`} />
              {i < STEPS.length - 1 && <div className={`h-px w-4 ${i < step ? "bg-primary" : "bg-muted"}`} />}
            </div>
          ))}
          <span className="ml-2 text-xs text-muted-foreground">{STEPS[step]}</span>
        </div>

        {/* Step 0: Type */}
        {step === 0 && (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => { setChallengeType("pr"); setTitle(""); }}
              className={`p-4 rounded-lg border text-left transition-all ${challengeType === "pr" ? "border-primary bg-primary/10" : "border-border bg-card hover:border-muted-foreground/30"}`}
            >
              <Trophy className="h-8 w-8 text-primary mb-2" />
              <p className="font-semibold text-sm text-foreground">PR Challenge</p>
              <p className="text-xs text-muted-foreground mt-1">Track personal records on any exercise. Auto-detects from workout logs.</p>
            </button>
            <button
              onClick={() => { setChallengeType("steps"); setTitle("Steps Challenge"); }}
              className={`p-4 rounded-lg border text-left transition-all ${challengeType === "steps" ? "border-primary bg-primary/10" : "border-border bg-card hover:border-muted-foreground/30"}`}
            >
              <Footprints className="h-8 w-8 text-primary mb-2" />
              <p className="font-semibold text-sm text-foreground">Steps Challenge</p>
              <p className="text-xs text-muted-foreground mt-1">Hit daily step targets. Manual entry now, health app sync coming soon.</p>
            </button>
          </div>
        )}

        {/* Step 1: Configure */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Challenge name" />
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What's this challenge about?" className="min-h-[60px]" />
            </div>

            {challengeType === "pr" && (
              <>
                <div>
                  <Label className="text-xs">Exercise Name</Label>
                  <Input value={exerciseName} onChange={(e) => setExerciseName(e.target.value)} placeholder="e.g. Bench Press" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Metric</Label>
                    <Select value={metric} onValueChange={setMetric}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="weight">Weight</SelectItem>
                        <SelectItem value="reps">Reps</SelectItem>
                        <SelectItem value="volume">Volume (W×R)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Unit</Label>
                    <Select value={unit} onValueChange={setUnit}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lbs">lbs</SelectItem>
                        <SelectItem value="kg">kg</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </>
            )}

            {challengeType === "steps" && (
              <>
                <div>
                  <Label className="text-xs">Daily Target</Label>
                  <Input type="number" value={dailyTarget} onChange={(e) => setDailyTarget(Number(e.target.value))} />
                </div>
                <div>
                  <Label className="text-xs">Ranking Metric</Label>
                  <Select value={stepsMetric} onValueChange={setStepsMetric}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="total_steps">Total Steps</SelectItem>
                      <SelectItem value="daily_average">Daily Average</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Start Date</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">End Date</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-xs">XP Reward</Label>
              <Input type="number" value={xpReward} onChange={(e) => setXpReward(Number(e.target.value))} />
            </div>
          </div>
        )}

        {/* Step 2: Participants */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Enrollment</Label>
              <Select value={enrollment} onValueChange={setEnrollment}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clients (Auto-enroll)</SelectItem>
                  <SelectItem value="opt_in">Opt-In (Clients choose)</SelectItem>
                  <SelectItem value="invite_only">Invite Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {enrollment === "invite_only" && (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                <Label className="text-xs">Select Clients</Label>
                {(allClients || []).map((c) => (
                  <label key={c.user_id} className="flex items-center gap-2 p-2 rounded hover:bg-secondary/50 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={selectedClients.includes(c.user_id)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedClients([...selectedClients, c.user_id]);
                        else setSelectedClients(selectedClients.filter((id) => id !== c.user_id));
                      }}
                      className="rounded"
                    />
                    {c.full_name}
                  </label>
                ))}
              </div>
            )}
            <div>
              <Label className="text-xs">Max Participants (optional)</Label>
              <Input type="number" value={maxParticipants} onChange={(e) => setMaxParticipants(e.target.value ? Number(e.target.value) : "")} placeholder="Unlimited" />
            </div>
          </div>
        )}

        {/* Step 3: Rewards */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Award Badge</Label>
              <Select value={selectedBadgeId} onValueChange={setSelectedBadgeId}>
                <SelectTrigger><SelectValue placeholder="Select a badge (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {(badges || []).map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.icon} {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!selectedBadgeId && (
              <Card className="border-border bg-card">
                <CardContent className="pt-4 space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground">Or create a new badge</p>
                  <div className="grid grid-cols-[60px_1fr] gap-2">
                    <div>
                      <Label className="text-xs">Icon</Label>
                      <Input value={newBadgeIcon} onChange={(e) => setNewBadgeIcon(e.target.value)} className="text-center text-lg" maxLength={4} />
                    </div>
                    <div>
                      <Label className="text-xs">Name</Label>
                      <Input value={newBadgeName} onChange={(e) => setNewBadgeName(e.target.value)} placeholder="Badge name" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
            <div>
              <Label className="text-xs">XP Reward</Label>
              <Input type="number" value={xpReward} onChange={(e) => setXpReward(Number(e.target.value))} />
            </div>
            {(selectedBadgeId || newBadgeName) && (
              <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs text-foreground">
                <Sparkles className="inline h-3.5 w-3.5 text-primary mr-1" />
                Completing this challenge awards <strong>{xpReward} XP</strong>
                {(selectedBadgeId || newBadgeName) && <> and the <strong>{selectedBadgeId ? (badges || []).find((b) => b.id === selectedBadgeId)?.name : newBadgeName}</strong> badge</>}.
              </div>
            )}
          </div>
        )}

        {/* Step 4: Review */}
        {step === 4 && (
          <div className="space-y-3">
            <Card className="border-border bg-card">
              <CardContent className="pt-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Type</span><Badge variant="outline">{challengeType === "pr" ? "PR Challenge" : "Steps Challenge"}</Badge></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Title</span><span className="font-medium text-foreground">{title}</span></div>
                {description && <div><span className="text-muted-foreground text-xs">{description}</span></div>}
                <div className="flex justify-between"><span className="text-muted-foreground">Dates</span><span className="text-foreground">{startDate} → {endDate}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">XP Reward</span><span className="text-primary font-bold">{xpReward} XP</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Enrollment</span><span className="text-foreground capitalize">{enrollment.replace("_", " ")}</span></div>
                {challengeType === "pr" && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Exercise</span><span className="text-foreground">{exerciseName} ({metric})</span></div>
                )}
                {challengeType === "steps" && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Daily Target</span><span className="text-foreground">{dailyTarget.toLocaleString()} steps</span></div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between pt-2">
          {step > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => setStep(step - 1)}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          ) : <div />}

          {step < 4 ? (
            <Button size="sm" onClick={() => setStep(step + 1)} disabled={!canNext()}>
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => handlePublish(true)} disabled={createChallenge.isPending}>
                Save as Draft
              </Button>
              <Button size="sm" onClick={() => handlePublish(false)} disabled={createChallenge.isPending}>
                <Check className="h-4 w-4 mr-1" /> Publish
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreateChallengeWizard;
