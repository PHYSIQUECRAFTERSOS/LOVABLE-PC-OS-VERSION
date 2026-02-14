import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Heart,
  Target,
  MessageSquare,
  RefreshCw,
  Award,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const MICRO_ACTIONS = [
  "Log one meal today",
  "Do a 10-minute walk",
  "Complete one set of any exercise",
  "Log today's weight",
  "Do a 5-minute stretch",
  "Drink 2 glasses of water",
];

const STEPS = [
  { step: 1, title: "Acknowledge", description: "It's okay. Setbacks are part of the process." },
  { step: 2, title: "Choose One Action", description: "Pick one small action to do today." },
  { step: 3, title: "Recommit", description: "Write your recommitment statement." },
  { step: 4, title: "Reset", description: "Fresh start. Your streak resets now." },
  { step: 5, title: "Celebrate", description: "You earned the Recommitment badge." },
];

const RecommitFlow = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [needsRecommit, setNeedsRecommit] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [recommitText, setRecommitText] = useState("");
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [activeEvent, setActiveEvent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    checkIfNeeded();
  }, [user]);

  const checkIfNeeded = async () => {
    if (!user) return;
    setLoading(true);

    // Check if user has high/critical risk nudges in last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data: nudges } = await supabase
      .from("retention_nudges")
      .select("risk_level_at_send")
      .eq("client_id", user.id)
      .gte("sent_at", sevenDaysAgo)
      .in("risk_level_at_send", ["high", "critical"]);

    // Check for incomplete recommit events
    const { data: events } = await supabase
      .from("recommit_events")
      .select("*")
      .eq("client_id", user.id)
      .is("completed_at", null)
      .order("created_at", { ascending: false })
      .limit(1);

    if (events && events.length > 0) {
      setActiveEvent(events[0].id);
      setCurrentStep(events[0].step_completed);
      setSelectedAction(events[0].micro_action || null);
      setNeedsRecommit(true);
    } else if (nudges && nudges.length > 0) {
      setNeedsRecommit(true);
    } else {
      setNeedsRecommit(false);
    }

    setLoading(false);
  };

  const startFlow = async () => {
    if (!user) return;
    setSaving(true);

    const { data, error } = await supabase
      .from("recommit_events")
      .insert({ client_id: user.id, step_completed: 1 })
      .select("id")
      .single();

    setSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    setActiveEvent(data.id);
    setCurrentStep(1);
  };

  const advanceStep = async (nextStep: number) => {
    if (!activeEvent) return;
    setSaving(true);

    const updates: Record<string, unknown> = { step_completed: nextStep };
    if (nextStep === 3) updates.micro_action = selectedAction;
    if (nextStep === 4) updates.public_post = recommitText;
    if (nextStep === 5) {
      updates.streak_reset = true;
      updates.badge_awarded = true;
      updates.completed_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from("recommit_events")
      .update(updates)
      .eq("id", activeEvent);

    setSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    if (nextStep === 5) {
      setCompleted(true);
      toast({ title: "🏆 Recommitment Complete!", description: "You've earned the Recommitment badge." });

      // Mark recent nudges as re-engaged
      if (user) {
        await supabase
          .from("retention_nudges")
          .update({ reengaged_at: new Date().toISOString() })
          .eq("client_id", user.id)
          .is("reengaged_at", null);
      }
    } else {
      setCurrentStep(nextStep);
    }
  };

  if (loading) return null;
  if (!needsRecommit) return null;

  if (completed) {
    return (
      <Card className="border-primary/30 glow-gold">
        <CardContent className="py-8 text-center">
          <Award className="mx-auto h-12 w-12 text-primary mb-3" />
          <h3 className="text-lg font-bold text-foreground">You're Back</h3>
          <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
            Your streak is reset and your Recommitment badge has been awarded.
            Every champion falls — what matters is getting back up.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!activeEvent) {
    return (
      <Card className="border-primary/20">
        <CardContent className="py-8 text-center">
          <Heart className="mx-auto h-10 w-10 text-primary mb-3" />
          <h3 className="text-lg font-bold text-foreground">
            Ready to Reset With Intention?
          </h3>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
            It looks like things have slowed down. That's completely normal. This
            5-step flow will help you recommit on your own terms — no pressure, no
            judgment.
          </p>
          <Button onClick={startFlow} disabled={saving} className="mt-4 gap-2">
            <RefreshCw className="h-4 w-4" />
            {saving ? "Starting..." : "Begin Recommit Flow"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-primary" />
          Recommit Flow
        </CardTitle>
        <Progress value={(currentStep / 5) * 100} className="h-1.5 mt-2" />
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Step indicators */}
        <div className="flex gap-1">
          {STEPS.map((s) => (
            <div
              key={s.step}
              className={`flex-1 text-center text-[10px] py-1 rounded ${
                s.step === currentStep
                  ? "bg-primary/20 text-primary font-medium"
                  : s.step < currentStep
                  ? "bg-secondary text-muted-foreground"
                  : "bg-secondary/50 text-muted-foreground/50"
              }`}
            >
              {s.step <= currentStep && s.step < currentStep ? (
                <CheckCircle2 className="h-3 w-3 mx-auto" />
              ) : (
                s.title
              )}
            </div>
          ))}
        </div>

        {/* Step 1: Acknowledge */}
        {currentStep === 1 && (
          <div className="text-center py-4">
            <Heart className="mx-auto h-8 w-8 text-primary mb-3" />
            <p className="text-sm text-foreground font-medium">
              Setbacks don't define you.
            </p>
            <p className="text-xs text-muted-foreground mt-2 max-w-sm mx-auto">
              Every person who achieves lasting results has moments where
              consistency slips. What separates them is the decision to start
              again.
            </p>
            <Button onClick={() => advanceStep(2)} className="mt-4 gap-2" size="sm" disabled={saving}>
              I acknowledge this <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        )}

        {/* Step 2: Choose micro action */}
        {currentStep === 2 && (
          <div>
            <p className="text-sm font-medium text-foreground mb-3">
              Choose one small action for today:
            </p>
            <div className="grid grid-cols-2 gap-2">
              {MICRO_ACTIONS.map((action) => (
                <button
                  key={action}
                  onClick={() => setSelectedAction(action)}
                  className={`text-left text-xs px-3 py-2.5 rounded-lg border transition-colors ${
                    selectedAction === action
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-secondary/50 text-foreground hover:border-primary/30"
                  }`}
                >
                  <Target className="h-3 w-3 inline mr-1.5" />
                  {action}
                </button>
              ))}
            </div>
            <Button
              onClick={() => advanceStep(3)}
              className="mt-3 gap-2 w-full"
              size="sm"
              disabled={!selectedAction || saving}
            >
              Continue <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        )}

        {/* Step 3: Write recommitment */}
        {currentStep === 3 && (
          <div>
            <p className="text-sm font-medium text-foreground mb-2">
              Write your recommitment:
            </p>
            <p className="text-xs text-muted-foreground mb-3">
              This is for you. What does getting back on track mean to you right
              now?
            </p>
            <Textarea
              placeholder="I'm recommitting to my goals because..."
              value={recommitText}
              onChange={(e) => setRecommitText(e.target.value)}
              rows={3}
              className="text-sm resize-none"
            />
            <Button
              onClick={() => advanceStep(4)}
              className="mt-3 gap-2 w-full"
              size="sm"
              disabled={!recommitText.trim() || saving}
            >
              <MessageSquare className="h-3 w-3" /> Post & Continue
            </Button>
          </div>
        )}

        {/* Step 4: Reset streak */}
        {currentStep === 4 && (
          <div className="text-center py-4">
            <RefreshCw className="mx-auto h-8 w-8 text-primary mb-3" />
            <p className="text-sm font-medium text-foreground">
              Your streak resets now.
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Day 1 starts today. Your micro-action:{" "}
              <Badge variant="secondary" className="text-[10px]">
                {selectedAction}
              </Badge>
            </p>
            <Button
              onClick={() => advanceStep(5)}
              className="mt-4 gap-2"
              size="sm"
              disabled={saving}
            >
              <Award className="h-3 w-3" /> Complete & Earn Badge
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RecommitFlow;
