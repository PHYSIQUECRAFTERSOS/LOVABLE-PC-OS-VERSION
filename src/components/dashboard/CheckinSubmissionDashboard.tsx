import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useDataFetch, invalidateCache } from "@/hooks/useDataFetch";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import UserAvatar from "@/components/profile/UserAvatar";
import { GridSkeleton } from "@/components/ui/data-skeleton";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import {
  ClipboardCheck, AlertTriangle, CheckCircle2, Clock,
  CalendarClock, ArrowRight, Settings, ChevronDown, ChevronUp,
} from "lucide-react";
import ReviewerSettingsDialog from "./ReviewerSettingsDialog";

// ── Helpers: PST week boundaries ──

function getPSTWeekWindow() {
  const now = new Date();
  const pstFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  const pstDateStr = pstFormatter.format(now);
  const pstDate = new Date(pstDateStr + "T00:00:00-08:00");
  const day = pstDate.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(pstDate);
  monday.setDate(monday.getDate() + diffToMonday);
  const mondayStr = monday.toISOString().split("T")[0];
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  const sundayStr = sunday.toISOString().split("T")[0];
  const thursday = new Date(monday);
  thursday.setDate(thursday.getDate() + 3);
  const thursdayStr = thursday.toISOString().split("T")[0];
  const currentDayOfWeek = day;
  return { mondayStr, sundayStr, thursdayStr, currentDayOfWeek };
}

function getDayOfWeekPST(dateStr: string): number {
  const d = new Date(dateStr);
  const pstStr = d.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  return new Date(pstStr + "T12:00:00").getDay();
}

function formatTimestampInTz(isoStr: string, tz: string | null): string {
  try {
    const d = new Date(isoStr);
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz || "America/Los_Angeles",
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
    }).format(d);
  } catch {
    return format(new Date(isoStr), "MMM d, h:mm a");
  }
}

// ── Types ──

interface CheckinClient {
  clientId: string;
  clientName: string;
  avatarUrl: string | null;
  submittedAt: string | null;
  submissionId: string | null;
  formattedTime: string;
  recurrence: string;
  nextDueDate: string | null;
  timezone: string | null;
  isReviewed: boolean;
  reviewerColor: string | null;
  reviewerName: string | null;
}

interface CheckinDashboardData {
  submittedWednesday: CheckinClient[];
  submittedThursday: CheckinClient[];
  notSubmitted: CheckinClient[];
  offWeek: CheckinClient[];
  isPastThursday: boolean;
}

interface Reviewer {
  id: string;
  name: string;
  color: string;
}

// ── Component ──

const CheckinSubmissionDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const reactQueryClient = useQueryClient();
  const [realtimeKey, setRealtimeKey] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [completedExpanded, setCompletedExpanded] = useState(false);
  // Track optimistic reviewed state: submissionId -> true
  const [optimisticReviewed, setOptimisticReviewed] = useState<Record<string, boolean>>({});

  const queryKey = `checkin-dashboard-${user?.id}-${realtimeKey}`;

  // Fetch reviewer data
  const { data: reviewers = [] } = useQuery({
    queryKey: ["checkin-reviewers", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checkin_reviewers")
        .select("id, name, color")
        .eq("coach_id", user!.id)
        .order("sort_order");
      if (error) throw error;
      return data as Reviewer[];
    },
    enabled: !!user,
  });

  const { data: reviewerAssignments = [] } = useQuery({
    queryKey: ["client-reviewer-assignments", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_reviewer_assignments")
        .select("client_id, reviewer_id")
        .eq("coach_id", user!.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // Build lookup maps
  const reviewerMap = useMemo(() => new Map(reviewers.map((r) => [r.id, r])), [reviewers]);
  const clientReviewerMap = useMemo(
    () => new Map(reviewerAssignments.map((a) => [a.client_id, a.reviewer_id])),
    [reviewerAssignments]
  );

  const { data, loading } = useDataFetch<CheckinDashboardData>({
    queryKey,
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
    timeout: 5000,
    fallback: { submittedWednesday: [], submittedThursday: [], notSubmitted: [], offWeek: [], isPastThursday: false },
    queryFn: async (signal) => {
      if (!user) throw new Error("No user");
      const { mondayStr, sundayStr, currentDayOfWeek } = getPSTWeekWindow();
      const isPastThursday = currentDayOfWeek >= 5 || currentDayOfWeek === 0;

      const { data: assignments } = await supabase
        .from("coach_clients").select("client_id")
        .eq("coach_id", user.id).eq("status", "active").abortSignal(signal);

      if (!assignments?.length)
        return { submittedWednesday: [], submittedThursday: [], notSubmitted: [], offWeek: [], isPastThursday };

      const clientIds = assignments.map((a) => a.client_id);

      const [assignmentsRes, submissionsRes, profilesRes] = await Promise.all([
        supabase.from("checkin_assignments").select("client_id, recurrence, next_due_date, is_active")
          .in("client_id", clientIds).eq("is_active", true).abortSignal(signal),
        supabase.from("checkin_submissions").select("id, client_id, submitted_at, status, reviewed_at")
          .in("client_id", clientIds)
          .gte("submitted_at", `${mondayStr}T00:00:00`)
          .lte("submitted_at", `${sundayStr}T23:59:59`)
          .eq("status", "submitted").abortSignal(signal),
        supabase.from("profiles").select("user_id, full_name, avatar_url, timezone")
          .in("user_id", clientIds).abortSignal(signal),
      ]);

      const checkinAssignments = assignmentsRes.data || [];
      const submissions = submissionsRes.data || [];
      const profiles = profilesRes.data || [];

      const profileMap = new Map(profiles.map((p) => [p.user_id, p]));
      const submissionMap = new Map<string, typeof submissions[0]>();
      for (const s of submissions) {
        const existing = submissionMap.get(s.client_id);
        if (!existing || (s.submitted_at && (!existing.submitted_at || s.submitted_at > existing.submitted_at))) {
          submissionMap.set(s.client_id, s);
        }
      }

      const submittedWednesday: CheckinClient[] = [];
      const submittedThursday: CheckinClient[] = [];
      const notSubmitted: CheckinClient[] = [];
      const offWeek: CheckinClient[] = [];

      const assignmentMap = new Map<string, typeof checkinAssignments[0]>();
      for (const a of checkinAssignments) {
        if (!assignmentMap.has(a.client_id)) assignmentMap.set(a.client_id, a);
      }

      for (const cid of clientIds) {
        const assignment = assignmentMap.get(cid);
        const profile = profileMap.get(cid);
        const submission = submissionMap.get(cid);
        const tz = profile?.timezone || null;
        const recurrence = assignment?.recurrence || "weekly";
        const nextDueDate = assignment?.next_due_date || null;
        const reviewerId = clientReviewerMap.get(cid);
        const reviewer = reviewerId ? reviewerMap.get(reviewerId) : null;

        const baseClient: CheckinClient = {
          clientId: cid,
          clientName: profile?.full_name || "Client",
          avatarUrl: profile?.avatar_url || null,
          submittedAt: submission?.submitted_at || null,
          submissionId: submission?.id || null,
          formattedTime: submission?.submitted_at ? formatTimestampInTz(submission.submitted_at, tz) : "",
          recurrence,
          nextDueDate,
          timezone: tz,
          isReviewed: !!submission?.reviewed_at,
          reviewerColor: reviewer?.color || null,
          reviewerName: reviewer?.name || null,
        };

        if (recurrence === "biweekly" && nextDueDate) {
          const nextDue = new Date(nextDueDate);
          const sundayDate = new Date(getPSTWeekWindow().sundayStr + "T23:59:59");
          if (nextDue > sundayDate) { offWeek.push(baseClient); continue; }
        }

        if (submission?.submitted_at) {
          const dayOfWeek = getDayOfWeekPST(submission.submitted_at);
          if (dayOfWeek <= 3) submittedWednesday.push(baseClient);
          else submittedThursday.push(baseClient);
        } else {
          notSubmitted.push(baseClient);
        }
      }

      const sortByName = (a: CheckinClient, b: CheckinClient) => a.clientName.localeCompare(b.clientName);
      submittedWednesday.sort(sortByName);
      submittedThursday.sort(sortByName);
      notSubmitted.sort(sortByName);
      offWeek.sort(sortByName);

      return { submittedWednesday, submittedThursday, notSubmitted, offWeek, isPastThursday };
    },
  });

  // Mark reviewed mutation
  const markReviewed = useMutation({
    mutationFn: async ({ submissionId, reviewed }: { submissionId: string; reviewed: boolean }) => {
      const { error } = await supabase
        .from("checkin_submissions")
        .update({
          reviewed_at: reviewed ? new Date().toISOString() : null,
          status: reviewed ? "reviewed" : "submitted",
        })
        .eq("id", submissionId);
      if (error) throw error;
    },
    onMutate: ({ submissionId, reviewed }) => {
      setOptimisticReviewed((prev) => ({ ...prev, [submissionId]: reviewed }));
    },
    onSuccess: () => {
      invalidateCache(queryKey);
      setRealtimeKey((k) => k + 1);
    },
    onError: (e: any, { submissionId }) => {
      setOptimisticReviewed((prev) => { const n = { ...prev }; delete n[submissionId]; return n; });
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  // Realtime
  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel("checkin-dashboard-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "checkin_submissions" }, () => {
        invalidateCache(queryKey);
        setRealtimeKey((k) => k + 1);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, queryKey]);

  if (loading && !data?.submittedWednesday?.length) return <GridSkeleton cards={3} />;
  if (!data) return null;

  const { submittedWednesday, submittedThursday, notSubmitted, offWeek, isPastThursday } = data;
  const totalAssigned = submittedWednesday.length + submittedThursday.length + notSubmitted.length;
  if (totalAssigned === 0 && offWeek.length === 0) return null;

  // Helper: check if reviewed (optimistic or from data)
  const isClientReviewed = (client: CheckinClient) => {
    if (client.submissionId && optimisticReviewed[client.submissionId] !== undefined) {
      return optimisticReviewed[client.submissionId];
    }
    return client.isReviewed;
  };

  // Compute reviewed counts
  const allSubmitted = [...submittedWednesday, ...submittedThursday];
  const reviewedClients = allSubmitted.filter(isClientReviewed);
  const reviewedCount = reviewedClients.length;
  const totalSubmitted = allSubmitted.length;
  const reviewProgress = totalSubmitted > 0 ? Math.round((reviewedCount / totalSubmitted) * 100) : 0;

  const getColumnReviewedCount = (clients: CheckinClient[]) =>
    clients.filter(isClientReviewed).length;

  return (
    <div>
      <h2 className="font-display text-lg font-bold text-foreground flex items-center gap-2 mb-3">
        <ClipboardCheck className="h-5 w-5 text-primary" />
        Weekly Check-In Dashboard
        <span className="text-xs font-normal text-muted-foreground ml-2">Resets Monday · PST</span>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto h-8 w-8 text-muted-foreground hover:text-primary"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings className="h-4 w-4" />
        </Button>
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ── Submitted Wednesday ── */}
        <SubmissionColumn
          title="Submitted Wednesday"
          icon={<CheckCircle2 className="h-4 w-4 text-emerald-400" />}
          borderClass="border-l-emerald-500"
          badgeColor="bg-emerald-400/20 text-emerald-400"
          clients={submittedWednesday}
          reviewedCount={getColumnReviewedCount(submittedWednesday)}
          navigate={navigate}
          isClientReviewed={isClientReviewed}
          onToggleReview={(client) => {
            if (!client.submissionId) return;
            markReviewed.mutate({ submissionId: client.submissionId, reviewed: !isClientReviewed(client) });
          }}
          emptyText="No submissions yet."
        />

        {/* ── Submitted Thursday ── */}
        <SubmissionColumn
          title="Submitted Thursday"
          icon={<Clock className="h-4 w-4 text-blue-400" />}
          borderClass="border-l-blue-500"
          badgeColor="bg-blue-400/20 text-blue-400"
          clients={submittedThursday}
          reviewedCount={getColumnReviewedCount(submittedThursday)}
          navigate={navigate}
          isClientReviewed={isClientReviewed}
          onToggleReview={(client) => {
            if (!client.submissionId) return;
            markReviewed.mutate({ submissionId: client.submissionId, reviewed: !isClientReviewed(client) });
          }}
          emptyText="No Thursday submissions."
        />

        {/* ── Not Submitted ── */}
        <Card className="border-l-2 border-l-destructive">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-display flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Not Submitted
              {notSubmitted.length > 0 && (
                <span className="ml-1 rounded-full bg-destructive/20 px-2 py-0.5 text-[10px] font-bold text-destructive">
                  {notSubmitted.length}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {notSubmitted.length === 0 ? (
              <div className="py-3 text-center">
                <CheckCircle2 className="h-5 w-5 text-emerald-400 mx-auto mb-1" />
                <p className="text-xs text-muted-foreground">All clients submitted!</p>
              </div>
            ) : (
              notSubmitted.map((client) => (
                <div
                  key={client.clientId}
                  className="flex items-center gap-3 py-2 px-2 rounded hover:bg-secondary/50 cursor-pointer transition-colors"
                  style={{ borderLeft: client.reviewerColor ? `3px solid ${client.reviewerColor}` : undefined }}
                  onClick={() => navigate(`/clients/${client.clientId}?tab=checkin`)}
                >
                  <UserAvatar src={client.avatarUrl} name={client.clientName} className="h-7 w-7" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm text-foreground truncate">{client.clientName}</p>
                      {client.reviewerName && (
                        <span
                          className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold shrink-0"
                          style={{ backgroundColor: client.reviewerColor + "33", color: client.reviewerColor || undefined }}
                        >
                          {client.reviewerName}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {isPastThursday && (
                        <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-4">Overdue</Badge>
                      )}
                      {client.recurrence === "biweekly" && (
                        <span className="text-[9px] text-muted-foreground">🔄 Biweekly</span>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Completed Summary ── */}
      {totalSubmitted > 0 && (
        <Card className="mt-4 border-primary/20">
          <CardContent className="py-3">
            <div
              className="flex items-center gap-3 cursor-pointer"
              onClick={() => setCompletedExpanded(!completedExpanded)}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1.5">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Reviews Completed</span>
                  <span className="text-xs text-muted-foreground">
                    {reviewedCount}/{totalSubmitted}
                  </span>
                </div>
                <Progress value={reviewProgress} className="h-2" />
              </div>
              {completedExpanded ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
            </div>
            {completedExpanded && reviewedClients.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border space-y-1">
                {reviewedClients.map((c) => (
                  <div key={c.clientId} className="flex items-center gap-2 py-1 px-2 opacity-60">
                    <UserAvatar src={c.avatarUrl} name={c.clientName} className="h-5 w-5" />
                    <span className="text-xs text-foreground line-through truncate">{c.clientName}</span>
                    {c.reviewerName && (
                      <span
                        className="text-[8px] px-1 py-0.5 rounded-full font-semibold ml-auto shrink-0"
                        style={{ backgroundColor: (c.reviewerColor || "#888") + "33", color: c.reviewerColor || undefined }}
                      >
                        {c.reviewerName}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Off-Week ── */}
      {offWeek.length > 0 && (
        <Card className="mt-4 border-muted">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-display flex items-center gap-2 text-muted-foreground">
              <CalendarClock className="h-4 w-4" />
              Off-Week Clients
              <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold">{offWeek.length}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {offWeek.map((client) => (
                <div
                  key={client.clientId}
                  className="flex items-center gap-2 py-1.5 px-2.5 rounded-lg bg-secondary/30 hover:bg-secondary/50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/clients/${client.clientId}?tab=checkin`)}
                >
                  <UserAvatar src={client.avatarUrl} name={client.clientName} className="h-6 w-6" />
                  <span className="text-xs text-foreground">{client.clientName}</span>
                  <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4">
                    🔄 Next: {client.nextDueDate ? format(new Date(client.nextDueDate), "MMM d") : "TBD"}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <ReviewerSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
};

// ── Submission Column ──

function SubmissionColumn({
  title, icon, borderClass, badgeColor, clients, reviewedCount,
  navigate, isClientReviewed, onToggleReview, emptyText,
}: {
  title: string;
  icon: React.ReactNode;
  borderClass: string;
  badgeColor: string;
  clients: CheckinClient[];
  reviewedCount: number;
  navigate: (path: string) => void;
  isClientReviewed: (c: CheckinClient) => boolean;
  onToggleReview: (c: CheckinClient) => void;
  emptyText: string;
}) {
  return (
    <Card className={`border-l-2 ${borderClass}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-display flex items-center gap-2">
          {icon}
          {title}
          {clients.length > 0 && (
            <span className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${badgeColor}`}>
              {reviewedCount}/{clients.length}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {clients.length === 0 ? (
          <p className="text-xs text-muted-foreground py-3 text-center">{emptyText}</p>
        ) : (
          clients.map((client) => {
            const reviewed = isClientReviewed(client);
            return (
              <div
                key={client.clientId}
                className={`flex items-center gap-2 py-2 px-2 rounded hover:bg-secondary/50 transition-colors ${reviewed ? "opacity-50" : ""}`}
                style={{ borderLeft: client.reviewerColor ? `3px solid ${client.reviewerColor}` : undefined }}
              >
                <Checkbox
                  checked={reviewed}
                  onCheckedChange={() => onToggleReview(client)}
                  className="shrink-0"
                />
                <div
                  className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer"
                  onClick={() => navigate(`/clients/${client.clientId}?tab=checkin`)}
                >
                  <UserAvatar src={client.avatarUrl} name={client.clientName} className="h-7 w-7" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className={`text-sm text-foreground truncate ${reviewed ? "line-through" : ""}`}>
                        {client.clientName}
                      </p>
                      {client.reviewerName && (
                        <span
                          className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold shrink-0"
                          style={{ backgroundColor: (client.reviewerColor || "#888") + "33", color: client.reviewerColor || undefined }}
                        >
                          {client.reviewerName}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] text-muted-foreground">{client.formattedTime}</span>
                      {client.recurrence === "biweekly" && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 border-primary/30 text-primary">
                          🔄 Biweekly
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

export default CheckinSubmissionDashboard;
