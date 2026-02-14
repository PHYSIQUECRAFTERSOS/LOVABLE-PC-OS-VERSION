import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Eye, CheckCircle, MessageSquare } from "lucide-react";
import { format } from "date-fns";

const CheckinReviewDashboard = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [viewSubmission, setViewSubmission] = useState<any>(null);
  const [coachNotes, setCoachNotes] = useState("");

  const { data: submissions } = useQuery({
    queryKey: ["coach-checkin-submissions", user?.id],
    queryFn: async () => {
      // Get all assignments for this coach
      const { data: assignments } = await supabase
        .from("checkin_assignments")
        .select("id, client_id, checkin_templates(name)")
        .eq("coach_id", user!.id);
      if (!assignments || assignments.length === 0) return [];

      const assignmentIds = assignments.map((a) => a.id);
      const { data: subs, error } = await supabase
        .from("checkin_submissions")
        .select("*")
        .in("assignment_id", assignmentIds)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;

      // Get client names
      const clientIds = [...new Set(subs?.map((s) => s.client_id) || [])];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", clientIds);

      return (subs || []).map((s) => ({
        ...s,
        client_name: profiles?.find((p) => p.user_id === s.client_id)?.full_name || "Client",
        template_name: assignments.find((a) => a.id === s.assignment_id)?.checkin_templates?.name || "Check-in",
      }));
    },
    enabled: !!user,
  });

  const { data: responses } = useQuery({
    queryKey: ["submission-responses", viewSubmission?.id],
    queryFn: async () => {
      const { data: resp, error } = await supabase
        .from("checkin_responses")
        .select("*, checkin_questions(question_text, question_type)")
        .eq("submission_id", viewSubmission!.id);
      if (error) throw error;
      return resp;
    },
    enabled: !!viewSubmission,
  });

  const reviewMutation = useMutation({
    mutationFn: async () => {
      if (!viewSubmission) throw new Error("No submission");
      const { error } = await supabase
        .from("checkin_submissions")
        .update({ status: "reviewed", coach_notes: coachNotes || null })
        .eq("id", viewSubmission.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coach-checkin-submissions"] });
      toast({ title: "Marked as reviewed" });
      setViewSubmission(null);
      setCoachNotes("");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const getAnswerDisplay = (r: any) => {
    if (r.answer_text) return r.answer_text;
    if (r.answer_numeric !== null) return String(r.answer_numeric);
    if (r.answer_scale !== null) return `${r.answer_scale}/10`;
    if (r.answer_boolean !== null) return r.answer_boolean ? "Yes" : "No";
    if (r.answer_choice) return r.answer_choice;
    return "—";
  };

  if (viewSubmission && responses) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">{viewSubmission.template_name}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {viewSubmission.client_name} · {viewSubmission.due_date}
              </p>
            </div>
            <Badge variant={viewSubmission.status === "reviewed" ? "default" : "secondary"}>
              {viewSubmission.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {responses.map((r: any) => (
            <div key={r.id} className="space-y-1">
              <p className="text-sm font-medium">{r.checkin_questions?.question_text}</p>
              <p className="text-sm text-muted-foreground bg-muted/30 p-2 rounded">{getAnswerDisplay(r)}</p>
            </div>
          ))}

          <div className="space-y-2 pt-2 border-t">
            <Label className="text-sm">Coach Notes</Label>
            <Textarea
              value={coachNotes}
              onChange={(e) => setCoachNotes(e.target.value)}
              placeholder="Add feedback for the client..."
              rows={2}
            />
          </div>

          <div className="flex gap-2">
            <Button onClick={() => reviewMutation.mutate()}>
              <CheckCircle className="h-4 w-4 mr-1" /> Mark Reviewed
            </Button>
            <Button variant="outline" onClick={() => setViewSubmission(null)}>Back</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Client Check-In Submissions</h3>

      {submissions && submissions.length > 0 ? (
        <div className="space-y-2">
          {submissions.map((s: any) => (
            <Card
              key={s.id}
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => { setViewSubmission(s); setCoachNotes(s.coach_notes || ""); }}
            >
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{s.client_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.template_name} · Due {s.due_date}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={s.status === "reviewed" ? "default" : s.status === "submitted" ? "secondary" : "outline"}
                      className="text-xs"
                    >
                      {s.status}
                    </Badge>
                    {s.submitted_at && (
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(s.submitted_at), "MMM d")}
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No submissions yet.</p>
      )}
    </div>
  );
};

export default CheckinReviewDashboard;
