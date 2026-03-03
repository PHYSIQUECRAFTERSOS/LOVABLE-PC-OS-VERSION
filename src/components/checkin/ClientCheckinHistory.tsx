import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, ClipboardCheck, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { format } from "date-fns";

const ClientCheckinHistory = ({ clientId }: { clientId: string }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
