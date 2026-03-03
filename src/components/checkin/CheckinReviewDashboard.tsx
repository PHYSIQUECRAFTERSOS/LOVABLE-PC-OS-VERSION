import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Eye, CheckCircle, MessageSquare, Clock, AlertCircle,
  ChevronLeft, Send, X,
} from "lucide-react";
import { format, formatDistanceToNow, subHours } from "date-fns";

interface SubmissionWithProfile {
  id: string;
  client_id: string;
  template_id: string;
  due_date: string;
  submitted_at: string | null;
  submitted_at_pst: string | null;
  week_number: number | null;
  status: string;
  coach_notes: string | null;
  coach_response: string | null;
  reviewed_at: string | null;
  created_at: string;
  client_name: string;
  avatar_url: string | null;
  template_name: string;
}

const CheckinReviewDashboard = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [viewSubmission, setViewSubmission] = useState<SubmissionWithProfile | null>(null);
  const [coachNotes, setCoachNotes] = useState("");
  const [coachResponse, setCoachResponse] = useState("");

  // Fetch submitted check-ins (last 72 hours for the queue)
  const { data: submissions, isLoading: subsLoading } = useQuery({
    queryKey: ["coach-checkin-submissions", user?.id],
    queryFn: async () => {
      const seventyTwoHoursAgo = subHours(new Date(), 72).toISOString();

      // Get coach's clients
      const { data: clientLinks } = await supabase
        .from("coach_clients")
        .select("client_id")
        .eq("coach_id", user!.id)
        .eq("status", "active");
      if (!clientLinks || clientLinks.length === 0) return [];

      const clientIds = clientLinks.map((c) => c.client_id);

      const { data: subs, error } = await supabase
        .from("checkin_submissions")
        .select("*")
        .in("client_id", clientIds)
        .gte("submitted_at", seventyTwoHoursAgo)
        .not("submitted_at", "is", null)
        .order("submitted_at", { ascending: false });
      if (error) throw error;

      // Get profiles
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, avatar_url")
        .in("user_id", clientIds);

      // Get template names
      const templateIds = [...new Set((subs || []).map((s) => s.template_id).filter(Boolean))];
      const { data: templates } = templateIds.length > 0
        ? await supabase.from("checkin_templates").select("id, name").in("id", templateIds)
        : { data: [] };

      return (subs || []).map((s) => ({
        ...s,
        client_name: profiles?.find((p) => p.user_id === s.client_id)?.full_name || "Client",
        avatar_url: profiles?.find((p) => p.user_id === s.client_id)?.avatar_url || null,
        template_name: templates?.find((t) => t.id === s.template_id)?.name || "Weekly Check-In",
      })) as SubmissionWithProfile[];
    },
    enabled: !!user,
    refetchInterval: 30000,
  });

  // Fetch clients who haven't submitted
  const { data: notSubmitted, isLoading: notSubLoading } = useQuery({
    queryKey: ["coach-not-submitted", user?.id],
    queryFn: async () => {
      const { data: clientLinks } = await supabase
        .from("coach_clients")
        .select("client_id")
        .eq("coach_id", user!.id)
        .eq("status", "active");
      if (!clientLinks || clientLinks.length === 0) return [];

      const clientIds = clientLinks.map((c) => c.client_id);

      // Get last submission for each client
      const { data: lastSubs } = await supabase
        .from("checkin_submissions")
        .select("client_id, submitted_at")
        .in("client_id", clientIds)
        .not("submitted_at", "is", null)
        .order("submitted_at", { ascending: false });

      // Get profiles
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, avatar_url")
        .in("user_id", clientIds);

      // Build map of last submission per client
      const lastSubMap = new Map<string, string>();
      (lastSubs || []).forEach((s) => {
        if (!lastSubMap.has(s.client_id)) {
          lastSubMap.set(s.client_id, s.submitted_at!);
        }
      });

      // Find clients who haven't submitted this week
      const now = new Date();
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0, 0, 0, 0);

      return clientIds
        .filter((id) => {
          const last = lastSubMap.get(id);
          return !last || new Date(last) < startOfWeek;
        })
        .map((id) => {
          const profile = profiles?.find((p) => p.user_id === id);
          const lastDate = lastSubMap.get(id);
          return {
            client_id: id,
            full_name: profile?.full_name || "Client",
            avatar_url: profile?.avatar_url || null,
            last_submitted: lastDate || null,
            days_since: lastDate
              ? Math.floor((Date.now() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24))
              : null,
          };
        })
        .sort((a, b) => (b.days_since ?? 999) - (a.days_since ?? 999));
    },
    enabled: !!user,
  });

  // Fetch responses for viewed submission
  const { data: responses } = useQuery({
    queryKey: ["submission-responses", viewSubmission?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checkin_responses")
        .select("*, checkin_questions(question_text, question_type, question_order)")
        .eq("submission_id", viewSubmission!.id)
        .order("created_at");
      if (error) throw error;
      return (data || []).sort(
        (a: any, b: any) => (a.checkin_questions?.question_order ?? 0) - (b.checkin_questions?.question_order ?? 0)
      );
    },
    enabled: !!viewSubmission,
  });

  const reviewMutation = useMutation({
    mutationFn: async () => {
      if (!viewSubmission) throw new Error("No submission");
      const { error } = await supabase
        .from("checkin_submissions")
        .update({
          status: "reviewed",
          coach_notes: coachNotes || null,
          coach_response: coachResponse || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", viewSubmission.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coach-checkin-submissions"] });
      toast({ title: "Marked as reviewed ✅" });
      setViewSubmission(null);
      setCoachNotes("");
      setCoachResponse("");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const getAnswerDisplay = (r: any) => {
    if (r.answer_text) return r.answer_text;
    if (r.answer_numeric !== null && r.answer_numeric !== undefined) return String(r.answer_numeric);
    if (r.answer_scale !== null && r.answer_scale !== undefined) return `${r.answer_scale}/10`;
    if (r.answer_boolean !== null && r.answer_boolean !== undefined) return r.answer_boolean ? "Yes" : "No";
    if (r.answer_choice) return r.answer_choice;
    return "—";
  };

  const unreviewedCount = submissions?.filter((s) => s.status !== "reviewed").length || 0;

  // Submission detail view
  if (viewSubmission) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => { setViewSubmission(null); setCoachNotes(""); setCoachResponse(""); }}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Avatar className="h-10 w-10">
              <AvatarImage src={viewSubmission.avatar_url || undefined} />
              <AvatarFallback className="bg-primary/10 text-primary font-bold">
                {(viewSubmission.client_name || "C").charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <CardTitle className="text-lg">{viewSubmission.client_name}</CardTitle>
              <p className="text-xs text-muted-foreground">
                {viewSubmission.template_name} · Week {viewSubmission.week_number}
                {viewSubmission.submitted_at_pst && ` · ${viewSubmission.submitted_at_pst}`}
              </p>
            </div>
            <Badge variant={viewSubmission.status === "reviewed" ? "default" : "secondary"}>
              {viewSubmission.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {responses ? (
            responses.map((r: any, idx: number) => (
              <div key={r.id} className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  <span className="text-muted-foreground mr-2">{idx + 1}.</span>
                  {r.checkin_questions?.question_text}
                </p>
                <div className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg">
                  {getAnswerDisplay(r)}
                </div>
              </div>
            ))
          ) : (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
            </div>
          )}

          <div className="space-y-3 pt-3 border-t border-border">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Coach Notes (private)</Label>
              <Textarea
                value={coachNotes}
                onChange={(e) => setCoachNotes(e.target.value)}
                placeholder="Internal notes about this check-in..."
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Response to Client</Label>
              <Textarea
                value={coachResponse}
                onChange={(e) => setCoachResponse(e.target.value)}
                placeholder="Write a response the client can see..."
                rows={3}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={() => reviewMutation.mutate()} disabled={reviewMutation.isPending} className="flex-1">
              <CheckCircle className="h-4 w-4 mr-1" /> Mark Reviewed
            </Button>
            <Button variant="outline" onClick={() => { setViewSubmission(null); setCoachNotes(""); setCoachResponse(""); }}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Tabs defaultValue="submitted" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="submitted" className="gap-1.5">
            <CheckCircle className="h-3.5 w-3.5" />
            Submitted
            {unreviewedCount > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-[10px]">
                {unreviewedCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="missing" className="gap-1.5">
            <AlertCircle className="h-3.5 w-3.5" />
            Not Submitted
            {notSubmitted && notSubmitted.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                {notSubmitted.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="submitted" className="mt-4 space-y-2">
          {subsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
            </div>
          ) : submissions && submissions.length > 0 ? (
            submissions.map((s) => (
              <Card
                key={s.id}
                className="cursor-pointer hover:border-primary/40 transition-colors"
                onClick={() => { setViewSubmission(s); setCoachNotes(s.coach_notes || ""); setCoachResponse(s.coach_response || ""); }}
              >
                <CardContent className="py-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarImage src={s.avatar_url || undefined} />
                      <AvatarFallback className="bg-primary/10 text-primary font-bold text-sm">
                        {(s.client_name || "C").charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{s.client_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.submitted_at && formatDistanceToNow(new Date(s.submitted_at), { addSuffix: true })}
                        {s.submitted_at_pst && ` · ${s.submitted_at_pst}`}
                      </p>
                    </div>
                    <Badge
                      variant={s.status === "reviewed" ? "default" : "secondary"}
                      className="text-xs shrink-0"
                    >
                      {s.status === "reviewed" ? "Reviewed" : "Unreviewed"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No submissions in the last 72 hours</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="missing" className="mt-4 space-y-2">
          {notSubLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
            </div>
          ) : notSubmitted && notSubmitted.length > 0 ? (
            notSubmitted.map((c) => (
              <Card key={c.client_id}>
                <CardContent className="py-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarImage src={c.avatar_url || undefined} />
                      <AvatarFallback className="bg-destructive/10 text-destructive font-bold text-sm">
                        {(c.full_name || "C").charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.last_submitted
                          ? `Last submitted ${format(new Date(c.last_submitted), "MMM d, yyyy")}`
                          : "Never submitted"}
                      </p>
                    </div>
                    {c.days_since !== null && (
                      <Badge variant="outline" className="text-xs shrink-0">
                        <Clock className="h-3 w-3 mr-1" />
                        {c.days_since}d ago
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">All clients have submitted this week! 🎉</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CheckinReviewDashboard;
