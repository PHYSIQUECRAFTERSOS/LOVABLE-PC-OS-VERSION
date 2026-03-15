import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Trophy, Footprints, SlidersHorizontal, ChevronLeft, ChevronRight, Check, Sparkles, FileText, PlusCircle, Dumbbell, Target, Flame, Zap } from "lucide-react";
import { useCreateChallenge, useBadges, useCreateBadge, useChallengeTemplates, useSaveTemplate, insertDefaultChallengeTiersAndRules, DEFAULT_CHALLENGE_TIERS, DEFAULT_SCORING_RULES, type ChallengeTemplate } from "@/hooks/useChallenges";
import TierIcon from "./TierIcon";
import { supabase } from "@/integrations/supabase/client";
import { useAllClients } from "@/hooks/useCulture";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChallengeCreated?: (challengeId: string) => void;
}

const NO_BADGE_VALUE = "none";

const SCORING_ACTION_LABELS: Record<string, { label: string; desc: string; icon: React.ElementType }> = {
  workout_completed: { label: "Workout Completed", desc: "Earn points for each workout logged", icon: Dumbbell },
  personal_best: { label: "Personal Best Set", desc: "Bonus for hitting a new PR", icon: Trophy },
  daily_logging: { label: "Daily Logging", desc: "Points for logging meals/steps/metrics", icon: Target },
  streak_bonus: { label: "Streak Bonus (7+ days)", desc: "Reward consistency with streaks", icon: Flame },
};

const CreateChallengeWizard = ({ open, onOpenChange, onChallengeCreated }: Props) => {
  const { user } = useAuth();
  const createChallenge = useCreateChallenge();
  const { data: badges } = useBadges();
  const createBadge = useCreateBadge();
  const { data: allClients } = useAllClients();
  const { data: templates } = useChallengeTemplates();
  const saveTemplate = useSaveTemplate();

  const hasTemplates = (templates || []).length > 0;
  const [step, setStep] = useState(hasTemplates ? -1 : 0);
  const [challengeType, setChallengeType] = useState<"pr" | "steps" | "custom" | "">("");
  const [fromTemplateId, setFromTemplateId] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);

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

  // Custom challenge fields
  const [customMetricName, setCustomMetricName] = useState("");
  const [customMetricUnit, setCustomMetricUnit] = useState("");
  const [customDirection, setCustomDirection] = useState("higher_is_better");
  const [customTargetValue, setCustomTargetValue] = useState<number | "">("");

  // Scoring rules
  const [scoringRules, setScoringRules] = useState(
    DEFAULT_SCORING_RULES.map((r) => ({ ...r }))
  );

  // Tiers
  const [challengeTiers, setChallengeTiers] = useState(
    DEFAULT_CHALLENGE_TIERS.map((t) => ({ ...t }))
  );

  // Participants
  const [enrollment, setEnrollment] = useState("all");
  const [maxParticipants, setMaxParticipants] = useState<number | "">("");
  const [selectedClients, setSelectedClients] = useState<string[]>([]);

  // Rewards
  const [selectedBadgeId, setSelectedBadgeId] = useState<string | null>(null);
  const [newBadgeName, setNewBadgeName] = useState("");
  const [newBadgeIcon, setNewBadgeIcon] = useState("🏆");

  // Save as template
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");

  useEffect(() => {
    if (open) {
      setStep(hasTemplates ? -1 : 0);
    }
  }, [open, hasTemplates]);

  const STEPS = ["Type", "Configure", "Rules & Scoring", "Participants", "Rewards", "Review"];

  const reset = () => {
    setStep(hasTemplates ? -1 : 0);
    setChallengeType("");
    setFromTemplateId(null);
    setIsPublishing(false);
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
    setCustomMetricName("");
    setCustomMetricUnit("");
    setCustomDirection("higher_is_better");
    setCustomTargetValue("");
    setScoringRules(DEFAULT_SCORING_RULES.map((r) => ({ ...r })));
    setChallengeTiers(DEFAULT_CHALLENGE_TIERS.map((t) => ({ ...t })));
    setEnrollment("all");
    setMaxParticipants("");
    setSelectedClients([]);
    setSelectedBadgeId(null);
    setNewBadgeName("");
    setNewBadgeIcon("🏆");
    setSaveAsTemplate(false);
    setTemplateName("");
  };

  const loadTemplate = (tpl: any) => {
    setFromTemplateId(tpl.id);
    setChallengeType(tpl.challenge_type);
    setTitle(tpl.name);
    setDescription(tpl.description || "");
    setXpReward(tpl.default_xp_reward || 100);
    setEnrollment(tpl.default_enrollment || "opt_in");
    if (tpl.default_duration_days) {
      const start = new Date();
      const end = new Date();
      end.setDate(end.getDate() + tpl.default_duration_days);
      setStartDate(start.toLocaleDateString("en-CA"));
      setEndDate(end.toLocaleDateString("en-CA"));
    }
    const config = tpl.config || {};
    if (tpl.challenge_type === "pr") {
      setExerciseName(config.exercise_name || "");
      setMetric(config.metric || "weight");
      setUnit(config.unit || "lbs");
    } else if (tpl.challenge_type === "steps") {
      setDailyTarget(config.daily_target || 10000);
      setStepsMetric(config.metric || "total_steps");
    } else if (tpl.challenge_type === "custom") {
      setCustomMetricName(config.metric_name || "");
      setCustomMetricUnit(config.metric_unit || "");
      setCustomDirection(config.direction || "higher_is_better");
      setCustomTargetValue(config.target_value ?? "");
    }
    setStep(0);
  };

  const canNext = () => {
    if (step === -1) return true;
    if (step === 0) return !!challengeType;
    if (step === 1) {
      if (!title || !startDate || !endDate) return false;
      if (new Date(endDate) <= new Date(startDate)) return false;
      if (challengeType === "custom" && (!customMetricName || !customMetricUnit)) return false;
      return true;
    }
    return true;
  };

  const buildConfig = () => {
    if (challengeType === "pr") {
      return { exercise_name: exerciseName, metric, unit };
    } else if (challengeType === "steps") {
      return { daily_target: dailyTarget, metric: stepsMetric, input_method: "manual" };
    } else {
      return {
        metric_name: customMetricName,
        metric_unit: customMetricUnit,
        direction: customDirection,
        target_value: customTargetValue !== "" ? Number(customTargetValue) : null,
        input_method: "manual",
      };
    }
  };

  const handlePublish = async (asDraft: boolean) => {
    setIsPublishing(true);
    try {
      let badgeId = selectedBadgeId;

      if (!badgeId && newBadgeName) {
        try {
          const badge = await createBadge.mutateAsync({
            name: newBadgeName,
            icon: newBadgeIcon,
            category: "challenge",
          });
          badgeId = badge.id;
        } catch {
          // badge is optional
        }
      }

      const today = new Date().toLocaleDateString("en-CA");
      let status = asDraft ? "draft" : "upcoming";
      if (!asDraft && startDate <= today) status = "active";

      const config = buildConfig();

      const challengeData = await createChallenge.mutateAsync({
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

      if (challengeData?.id) {
        try {
          await insertDefaultChallengeTiersAndRules(challengeData.id, scoringRules, challengeTiers);
        } catch (e) {
          console.error("Failed to insert tiers/rules:", e);
        }

        const db2 = supabase as any;
        if (enrollment === "all" && allClients?.length) {
          const participants = allClients.map((c: any) => ({ challenge_id: challengeData.id, user_id: c.user_id }));
          const { error: enrollAllError } = await db2.from("challenge_participants").insert(participants);
          if (enrollAllError) throw enrollAllError;
        }

        if (enrollment === "invite_only" && selectedClients.length > 0) {
          const participants = selectedClients.map((uid) => ({ challenge_id: challengeData.id, user_id: uid }));
          const { error: inviteOnlyError } = await db2.from("challenge_participants").insert(participants);
          if (inviteOnlyError) throw inviteOnlyError;
        }
      }

      if (saveAsTemplate && templateName) {
        const durationDays = Math.ceil(
          (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000
        );
        await saveTemplate.mutateAsync({
          created_by: user!.id,
          name: templateName,
          description: description || null,
          challenge_type: challengeType,
          config,
          default_duration_days: durationDays,
          default_xp_reward: xpReward,
          default_enrollment: enrollment,
        } as any);
      }

      if (fromTemplateId) {
        const db2 = supabase as any;
        const { data: tpl } = await db2.from("challenge_templates").select("usage_count").eq("id", fromTemplateId).maybeSingle();
        if (tpl) {
          await db2.from("challenge_templates").update({ usage_count: (tpl.usage_count || 0) + 1 }).eq("id", fromTemplateId);
        }
      }

      onChallengeCreated?.(challengeData.id);
      toast.success("Challenge created and opened.");
      reset();
      onOpenChange(false);
    } catch (err: any) {
      console.error("Challenge publish error:", err);
      toast.error(err?.message || "Failed to create challenge. Please try again.");
    } finally {
      setIsPublishing(false);
    }
  };

  const updateScoringRule = (actionType: string, field: string, value: any) => {
    setScoringRules((prev) =>
      prev.map((r) => (r.action_type === actionType ? { ...r, [field]: value } : r))
    );
  };

  const updateTier = (index: number, field: string, value: any) => {
    setChallengeTiers((prev) =>
      prev.map((t, i) => (i === index ? { ...t, [field]: value } : t))
    );
  };

  const typeLabel = challengeType === "pr" ? "PR Challenge" : challengeType === "steps" ? "Steps Challenge" : "Custom Challenge";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">Create Challenge</DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        {step >= 0 && (
          <div className="flex items-center gap-1 mb-4">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-1">
                <div className={`h-2 w-2 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`} />
                {i < STEPS.length - 1 && <div className={`h-px w-4 ${i < step ? "bg-primary" : "bg-muted"}`} />}
              </div>
            ))}
            <span className="ml-2 text-xs text-muted-foreground">{STEPS[step]}</span>
          </div>
        )}

        {/* Step -1: Template Picker */}
        {step === -1 && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setStep(0)}
                className="p-4 rounded-lg border border-border bg-card hover:border-muted-foreground/30 text-left transition-all"
              >
                <PlusCircle className="h-8 w-8 text-primary mb-2" />
                <p className="font-semibold text-sm text-foreground">Start from Scratch</p>
                <p className="text-xs text-muted-foreground mt-1">Build a new challenge from the ground up.</p>
              </button>
              <button
                onClick={() => {}}
                className="p-4 rounded-lg border border-primary/20 bg-primary/5 text-left cursor-default"
              >
                <FileText className="h-8 w-8 text-primary mb-2" />
                <p className="font-semibold text-sm text-foreground">Start from Template</p>
                <p className="text-xs text-muted-foreground mt-1">Pre-fill from a saved configuration.</p>
              </button>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {(templates || []).map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => loadTemplate(tpl)}
                  className="w-full p-3 rounded-lg border border-border bg-card hover:border-primary/30 text-left transition-all flex items-center gap-3"
                >
                  <span className="text-lg">
                    {tpl.challenge_type === "pr" ? "🏆" : tpl.challenge_type === "steps" ? "👣" : "⚙️"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{tpl.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {tpl.default_duration_days ? `${tpl.default_duration_days} days` : "No duration set"}
                      {tpl.usage_count > 0 && ` · Used ${tpl.usage_count}×`}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0">{tpl.challenge_type}</Badge>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 0: Type */}
        {step === 0 && (
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => { setChallengeType("pr"); if (!title) setTitle(""); }}
              className={`p-4 rounded-lg border text-left transition-all ${challengeType === "pr" ? "border-primary bg-primary/10" : "border-border bg-card hover:border-muted-foreground/30"}`}
            >
              <Trophy className="h-7 w-7 text-primary mb-2" />
              <p className="font-semibold text-sm text-foreground">PR Challenge</p>
              <p className="text-xs text-muted-foreground mt-1">Track personal records on any exercise.</p>
            </button>
            <button
              onClick={() => { setChallengeType("steps"); if (!title) setTitle("Steps Challenge"); }}
              className={`p-4 rounded-lg border text-left transition-all ${challengeType === "steps" ? "border-primary bg-primary/10" : "border-border bg-card hover:border-muted-foreground/30"}`}
            >
              <Footprints className="h-7 w-7 text-primary mb-2" />
              <p className="font-semibold text-sm text-foreground">Steps Challenge</p>
              <p className="text-xs text-muted-foreground mt-1">Hit daily step targets.</p>
            </button>
            <button
              onClick={() => { setChallengeType("custom"); if (!title) setTitle(""); }}
              className={`p-4 rounded-lg border text-left transition-all ${challengeType === "custom" ? "border-primary bg-primary/10" : "border-border bg-card hover:border-muted-foreground/30"}`}
            >
              <SlidersHorizontal className="h-7 w-7 text-primary mb-2" />
              <p className="font-semibold text-sm text-foreground">Custom</p>
              <p className="text-xs text-muted-foreground mt-1">Define your own metric.</p>
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

            {challengeType === "custom" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Metric Name</Label>
                    <Input value={customMetricName} onChange={(e) => setCustomMetricName(e.target.value)} placeholder="e.g. Waist Measurement" />
                  </div>
                  <div>
                    <Label className="text-xs">Metric Unit</Label>
                    <Input value={customMetricUnit} onChange={(e) => setCustomMetricUnit(e.target.value)} placeholder="e.g. inches" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Direction</Label>
                  <Select value={customDirection} onValueChange={setCustomDirection}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="higher_is_better">Higher is Better</SelectItem>
                      <SelectItem value="lower_is_better">Lower is Better</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Target Value (optional)</Label>
                  <Input
                    type="number"
                    value={customTargetValue}
                    onChange={(e) => setCustomTargetValue(e.target.value ? Number(e.target.value) : "")}
                    placeholder="Leave empty for no target"
                  />
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

        {/* Step 2: Rules & Scoring */}
        {step === 2 && (
          <div className="space-y-5">
            {/* Scoring Rules */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Point Scoring Rules
              </h3>
              <p className="text-[10px] text-muted-foreground mb-3">
                Each action earns points <strong>1× per day</strong>. Points determine tier progression.
              </p>
              <div className="space-y-2">
                {scoringRules.map((rule) => {
                  const meta = SCORING_ACTION_LABELS[rule.action_type];
                  const Icon = meta?.icon || Zap;
                  return (
                    <div
                      key={rule.action_type}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                        rule.is_enabled ? "border-primary/30 bg-primary/5" : "border-border bg-card opacity-60"
                      }`}
                    >
                      <Switch
                        checked={rule.is_enabled}
                        onCheckedChange={(v) => updateScoringRule(rule.action_type, "is_enabled", v)}
                      />
                      <Icon className="h-4 w-4 text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{meta?.label || rule.action_type}</p>
                        <p className="text-[10px] text-muted-foreground">{meta?.desc}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Input
                          type="number"
                          value={rule.points}
                          onChange={(e) => updateScoringRule(rule.action_type, "points", Number(e.target.value) || 1)}
                          className="w-14 h-7 text-xs text-center"
                          disabled={!rule.is_enabled}
                        />
                        <span className="text-[10px] text-muted-foreground">pts</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Challenge Tiers */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Challenge Tiers
              </h3>
              <p className="text-[10px] text-muted-foreground mb-3">
                Participants climb tiers as they earn points. Customize names & thresholds.
              </p>
              <div className="space-y-2">
                {challengeTiers.map((tier, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 p-2.5 rounded-lg border border-border bg-card"
                  >
                    <div
                      className="h-8 w-8 rounded-full flex items-center justify-center border-2 shrink-0"
                      style={{ borderColor: tier.color, backgroundColor: `${tier.color}15` }}
                    >
                      <TierIcon name={tier.name} size={20} />
                    </div>
                    <Input
                      value={tier.name}
                      onChange={(e) => updateTier(i, "name", e.target.value)}
                      className="h-7 text-xs flex-1"
                      placeholder="Tier name"
                    />
                    <div className="flex items-center gap-1 shrink-0">
                      <Input
                        type="number"
                        value={tier.min_points}
                        onChange={(e) => updateTier(i, "min_points", Number(e.target.value) || 0)}
                        className="w-16 h-7 text-xs text-center"
                      />
                      <span className="text-[10px] text-muted-foreground">pts</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Participants */}
        {step === 3 && (
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
                {(allClients || []).map((c: any) => (
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

        {/* Step 4: Rewards */}
        {step === 4 && (
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

        {/* Step 5: Review */}
        {step === 5 && (
          <div className="space-y-3">
            <Card className="border-border bg-card">
              <CardContent className="pt-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Type</span><Badge variant="outline">{typeLabel}</Badge></div>
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
                {challengeType === "custom" && (
                  <>
                    <div className="flex justify-between"><span className="text-muted-foreground">Metric</span><span className="text-foreground">{customMetricName} ({customMetricUnit})</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Direction</span><span className="text-foreground">{customDirection === "lower_is_better" ? "Lower is Better" : "Higher is Better"}</span></div>
                    {customTargetValue !== "" && (
                      <div className="flex justify-between"><span className="text-muted-foreground">Target</span><span className="text-foreground">{customTargetValue} {customMetricUnit}</span></div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Scoring Rules Summary */}
            <Card className="border-border bg-card">
              <CardContent className="pt-4 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Scoring Rules</p>
                {scoringRules.filter((r) => r.is_enabled).map((r) => (
                  <div key={r.action_type} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{SCORING_ACTION_LABELS[r.action_type]?.label}</span>
                    <span className="text-primary font-bold">{r.points} pts</span>
                  </div>
                ))}
                <p className="text-[10px] text-muted-foreground">Daily cap: 1× per action per day</p>
              </CardContent>
            </Card>

            {/* Tiers Summary */}
            <Card className="border-border bg-card">
              <CardContent className="pt-4 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tiers</p>
                <div className="flex items-center gap-2 flex-wrap">
                  {challengeTiers.map((t) => (
                    <div key={t.name} className="flex items-center gap-1 text-xs">
                      <TierIcon name={t.name} size={16} />
                      <span style={{ color: t.color }} className="font-medium">{t.name}</span>
                      <span className="text-muted-foreground">({t.min_points}+)</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Save as Template */}
            <div className="flex items-start gap-2 p-3 rounded-lg border border-border bg-card">
              <Checkbox
                id="save-template"
                checked={saveAsTemplate}
                onCheckedChange={(v) => {
                  setSaveAsTemplate(!!v);
                  if (v && !templateName) setTemplateName(title);
                }}
              />
              <div className="flex-1">
                <label htmlFor="save-template" className="text-xs font-medium text-foreground cursor-pointer">
                  Save as Template
                </label>
                {saveAsTemplate && (
                  <Input
                    className="mt-2 h-8 text-xs"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="Template name"
                  />
                )}
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between pt-2">
          {step > (hasTemplates ? -1 : 0) ? (
            <Button variant="ghost" size="sm" onClick={() => setStep(step - 1)}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          ) : <div />}

          {step < 5 ? (
            step === -1 ? <div /> : (
              <Button size="sm" onClick={() => setStep(step + 1)} disabled={!canNext()}>
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => handlePublish(true)} disabled={isPublishing}>
                Save as Draft
              </Button>
              <Button size="sm" onClick={() => handlePublish(false)} disabled={isPublishing}>
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
