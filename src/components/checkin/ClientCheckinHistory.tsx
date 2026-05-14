import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, ClipboardCheck, TrendingUp, TrendingDown, Minus, StickyNote, Copy, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import CoachNoteText from "./CoachNoteText";

type Submission = {
  id: string;
  week_number: number | null;
  submitted_at: string | null;
  submitted_at_pst: string | null;
  status: string;
  coach_response: string | null;
  coach_response_updated_at: string | null;
};

const draftKey = (subId: string) => `coach-note-draft:${subId}`;

const CoachNoteEditor: React.FC<{
  submission: Submission;
  clientId: string;
  previousNote: string | null;
  onSaved: () => void;
}> = ({ submission, clientId, previousNote, onSaved }) => {
  const initial = submission.coach_response ?? "";
  // sessionStorage draft trumps server value if present
  const draft = typeof window !== "undefined" ? sessionStorage.getItem(draftKey(submission.id)) : null;
  const [value, setValue] = useState<string>(draft ?? initial);
  const [saving, setSaving] = useState(false);
  const lastSavedRef = useRef<string>(initial);

  // Persist draft on every keystroke (debounced via micro-task)
  useEffect(() => {
    if (value === lastSavedRef.current) {
      sessionStorage.removeItem(draftKey(submission.id));
    } else {
      sessionStorage.setItem(draftKey(submission.id), value);
    }
  }, [value, submission.id]);

  const handleSave = async () => {
    setSaving(true);
    const trimmed = value.trim();
    const payload: Record<string, any> = {
      coach_response: trimmed.length === 0 ? null : value,
      coach_response_updated_at: new Date().toISOString(),
      // Reset read status so the client gets the unread indicator again
      coach_response_read_at: null,
    };
    const { error } = await supabase
      .from("checkin_submissions")
      .update(payload)
      .eq("id", submission.id)
      .select()
      .single();
    if (error) {
      console.error("[CoachNote] save failed", error);
      toast.error("Could not save note");
      setSaving(false);
      return;
    }
    lastSavedRef.current = value;
    sessionStorage.removeItem(draftKey(submission.id));

    // Fire push notification (non-blocking)
    if (trimmed.length > 0) {
      const week = submission.week_number;
      supabase.functions
        .invoke("send-push-notification", {
          body: {
            user_id: clientId,
            title: "New coach note",
            body: week
              ? `Your coach left a note on your Week ${week} check-in.`
              : "Your coach left a note on your check-in.",
            notification_type: "checkin",
            data: { route: "/progress?tab=forms", submission_id: submission.id },
          },
        })
        .catch((e) => console.warn("[CoachNote] push failed (non-fatal)", e));
    }

    toast.success(trimmed.length === 0 ? "Note cleared" : "Note saved");
    setSaving(false);
    onSaved();
  };

  // Enter inserts newline (default browser behavior). We only block any
  // accidental "submit on Enter" by NOT adding a keydown handler.
  return (
    <div className="pt-3 border-t border-border space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-primary flex items-center gap-1.5">
          <StickyNote className="h-3.5 w-3.5" /> Coach Note
        </p>
        {previousNote && previousNote.trim().length > 0 && value.trim().length === 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11px] text-muted-foreground hover:text-primary"
            onClick={() => setValue(previousNote)}
          >
            <Copy className="h-3 w-3 mr-1" /> Copy from previous week
          </Button>
        )}
      </div>
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Add a note for this check-in… (Enter for new line — click Save to submit)"
        className="min-h-[120px] bg-card border-border text-sm font-normal whitespace-pre-wrap resize-y"
      />
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">
          Visible to client.
          {submission.coach_response_updated_at && (
            <> Last saved {format(new Date(submission.coach_response_updated_at), "MMM d, h:mm a")}.</>
          )}
        </p>
        <Button
          type="button"
          size="sm"
          onClick={handleSave}
          disabled={saving || value === lastSavedRef.current}
          className="h-8"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
          Save Note
        </Button>
      </div>
    </div>
  );
};

const ClientCheckinHistory = ({ clientId }: { clientId: string }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: submissions, isLoading } = useQuery({
    queryKey: ["client-checkin-history", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checkin_submissions")
        .select("*")
        .eq("client_id", clientId)
        .not("submitted_at", "is", null)
        .order("submitted_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });

  const { data: allResponses } = useQuery({
    queryKey: ["client-checkin-all-responses", clientId, submissions?.map((s) => s.id)],
    queryFn: async () => {
      const subIds = submissions!.map((s) => s.id);
      const { data, error } = await supabase
        .from("checkin_responses")
        .select("*, checkin_questions(question_text, question_type, question_order)")
        .in("submission_id", subIds)
        .order("created_at");
      if (error) throw error;
      return data;
    },
    enabled: !!submissions && submissions.length > 0,
  });

  // Calculate trends from scale responses
  const trends = (() => {
    if (!submissions || !allResponses || submissions.length < 2) return null;

    const complianceScores: number[] = [];
    const stressScores: number[] = [];
    const weights: number[] = [];

    submissions.forEach((sub) => {
      const subResponses = allResponses.filter((r: any) => r.submission_id === sub.id);
      subResponses.forEach((r: any) => {
        const order = r.checkin_questions?.question_order;
        if (order === 1 && r.answer_scale !== null) complianceScores.push(r.answer_scale);
        if (order === 7 && r.answer_scale !== null) stressScores.push(r.answer_scale);
        if (order === 10 && r.answer_numeric !== null) weights.push(r.answer_numeric);
      });
    });

    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    const trend = (arr: number[]) => {
      if (arr.length < 2) return "stable";
      const recent = avg(arr.slice(0, Math.min(3, arr.length)));
      const older = avg(arr.slice(Math.min(3, arr.length)));
      if (recent === null || older === null) return "stable";
      if (recent > older + 0.5) return "up";
      if (recent < older - 0.5) return "down";
      return "stable";
    };

    return {
      complianceAvg: avg(complianceScores),
      stressAvg: avg(stressScores),
      weightTrend: trend(weights),
      latestWeight: weights.length > 0 ? weights[0] : null,
    };
  })();

  const TrendIcon = ({ direction }: { direction: string }) => {
    if (direction === "up") return <TrendingUp className="h-3.5 w-3.5 text-primary" />;
    if (direction === "down") return <TrendingDown className="h-3.5 w-3.5 text-destructive" />;
    return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
  };

  const getAnswerDisplay = (r: any) => {
    if (r.answer_text) return r.answer_text;
    if (r.answer_numeric !== null && r.answer_numeric !== undefined) return String(r.answer_numeric);
    if (r.answer_scale !== null && r.answer_scale !== undefined) return `${r.answer_scale}/10`;
    if (r.answer_boolean !== null && r.answer_boolean !== undefined) return r.answer_boolean ? "Yes" : "No";
    if (r.answer_choice) return r.answer_choice;
    return "—";
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <ClipboardCheck className="h-5 w-5" /> Check-In History
      </h3>

      {/* Trend Summary */}
      {trends && (
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Compliance Avg</p>
              <p className="text-xl font-bold text-foreground mt-1">
                {trends.complianceAvg !== null ? trends.complianceAvg.toFixed(1) : "—"}
                <span className="text-xs text-muted-foreground">/10</span>
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Stress Avg</p>
              <p className="text-xl font-bold text-foreground mt-1">
                {trends.stressAvg !== null ? trends.stressAvg.toFixed(1) : "—"}
                <span className="text-xs text-muted-foreground">/10</span>
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Weight</p>
              <div className="flex items-center justify-center gap-1 mt-1">
                <p className="text-xl font-bold text-foreground">
                  {trends.latestWeight !== null ? trends.latestWeight : "—"}
                </p>
                <TrendIcon direction={trends.weightTrend} />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Submission List */}
      {submissions && submissions.length > 0 ? (
        <div className="space-y-2">
          {submissions.map((sub) => {
            const subResponses = allResponses
              ?.filter((r: any) => r.submission_id === sub.id)
              .sort((a: any, b: any) => (a.checkin_questions?.question_order ?? 0) - (b.checkin_questions?.question_order ?? 0));
            const isExpanded = expandedId === sub.id;

            return (
              <Collapsible key={sub.id} open={isExpanded} onOpenChange={() => setExpandedId(isExpanded ? null : sub.id)}>
                <CollapsibleTrigger asChild>
                  <Card className="cursor-pointer hover:border-primary/30 transition-colors">
                    <CardContent className="py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                          <div>
                            <p className="text-sm font-medium">
                              Week {sub.week_number || "—"} · {sub.submitted_at ? format(new Date(sub.submitted_at), "MMM d, yyyy") : "—"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {sub.submitted_at_pst || (sub.submitted_at ? format(new Date(sub.submitted_at), "h:mm a") : "")}
                            </p>
                          </div>
                        </div>
                        <Badge variant={sub.status === "reviewed" ? "default" : "secondary"} className="text-xs">
                          {sub.status}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <Card className="mt-1 border-primary/20">
                    <CardContent className="py-4 space-y-3">
                      {subResponses?.map((r: any, idx: number) => (
                        <div key={r.id} className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">
                            {idx + 1}. {r.checkin_questions?.question_text}
                          </p>
                          <p className="text-sm text-foreground bg-muted/30 p-2 rounded">
                            {getAnswerDisplay(r)}
                          </p>
                        </div>
                      ))}
                      {sub.coach_response && (
                        <div className="pt-2 border-t border-border">
                          <p className="text-xs font-medium text-primary">Coach Response:</p>
                          <p className="text-sm text-foreground mt-1">{sub.coach_response}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-6">No check-in history yet.</p>
      )}
    </div>
  );
};

export default ClientCheckinHistory;
