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
  CalendarClock, ArrowRight, Settings,
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
  const currentDayOfWeek = day;
  return { mondayStr, sundayStr, currentDayOfWeek };
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

// ── Default day config (fallback) ──
const DEFAULT_DAY_CONFIGS = [
  { id: "default-wed", label: "Submitted Wednesday", day_of_week: 3, sort_order: 0 },
  { id: "default-thu", label: "Submitted Thursday", day_of_week: 4, sort_order: 1 },
];

// Colors/icons for dynamic columns
const COLUMN_STYLES = [
  { borderClass: "border-l-emerald-500", badgeColor: "bg-emerald-400/20 text-emerald-400", icon: <CheckCircle2 className="h-4 w-4 text-emerald-400" /> },
  { borderClass: "border-l-blue-500", badgeColor: "bg-blue-400/20 text-blue-400", icon: <Clock className="h-4 w-4 text-blue-400" /> },
  { borderClass: "border-l-violet-500", badgeColor: "bg-violet-400/20 text-violet-400", icon: <CheckCircle2 className="h-4 w-4 text-violet-400" /> },
  { borderClass: "border-l-amber-500", badgeColor: "bg-amber-400/20 text-amber-400", icon: <Clock className="h-4 w-4 text-amber-400" /> },
];

// ── Types ──

interface DayConfig {
  id: string;
  label: string;
  day_of_week: number;
  sort_order: number;
}

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

interface DayBucket {
  config: DayConfig;
  clients: CheckinClient[];
}

interface CheckinDashboardData {
  buckets: DayBucket[];
  notSubmitted: CheckinClient[];
  offWeek: CheckinClient[];
  isPastLastDay: boolean;
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
  const [_completedExpanded, _setCompletedExpanded] = useState(false); // unused, kept for hook order
  const [optimisticReviewed, setOptimisticReviewed] = useState<Record<string, boolean>>({});

  // Fetch coach day configs
  const { data: coachDayConfigs = [] } = useQuery({
    queryKey: ["checkin-day-config", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coach_checkin_day_config")
        .select("*")
        .eq("coach_id", user!.id)
        .order("sort_order");
      if (error) throw error;
      return data as DayConfig[];
    },
    enabled: !!user,
  });

  const activeDayConfigs = coachDayConfigs.length > 0 ? coachDayConfigs : DEFAULT_DAY_CONFIGS;

  const queryKey = `checkin-dashboard-${user?.id}-${realtimeKey}-${activeDayConfigs.map(d => d.day_of_week).join(",")}`;

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
    fallback: { buckets: [], notSubmitted: [], offWeek: [], isPastLastDay: false },
    queryFn: async (signal) => {
      if (!user) throw new Error("No user");
      const { mondayStr, sundayStr, currentDayOfWeek } = getPSTWeekWindow();

      // Determine if we're past the last configured day
      const sortedDays = [...activeDayConfigs].sort((a, b) => a.sort_order - b.sort_order);
      const maxDay = Math.max(...sortedDays.map(d => d.day_of_week));
      const isPastLastDay = currentDayOfWeek > maxDay || currentDayOfWeek === 0;

      const { data: assignments } = await supabase
        .from("coach_clients").select("client_id")
        .eq("coach_id", user.id).eq("status", "active").abortSignal(signal);

      if (!assignments?.length)
        return { buckets: [], notSubmitted: [], offWeek: [], isPastLastDay };

      const clientIds = assignments.map((a) => a.client_id);

      const [assignmentsRes, submissionsRes, profilesRes, checkinEventsRes] = await Promise.all([
        supabase.from("checkin_assignments").select("client_id, recurrence, next_due_date, is_active")
          .in("client_id", clientIds).eq("is_active", true).abortSignal(signal),
        supabase.from("checkin_submissions").select("id, client_id, submitted_at, status, reviewed_at")
          .in("client_id", clientIds)
          .gte("submitted_at", `${mondayStr}T00:00:00`)
          .lte("submitted_at", `${sundayStr}T23:59:59`)
          .in("status", ["submitted", "reviewed"]).abortSignal(signal),
        supabase.from("profiles").select("user_id, full_name, avatar_url, timezone")
          .in("user_id", clientIds).abortSignal(signal),
        supabase.from("calendar_events")
          .select("id, target_client_id, user_id, event_date, is_completed")
          .eq("event_type", "checkin")
          .gte("event_date", mondayStr)
          .lte("event_date", sundayStr)
          .abortSignal(signal),
      ]);

      const checkinAssignments = assignmentsRes.data || [];
      const submissions = submissionsRes.data || [];
      const profiles = profilesRes.data || [];
      const checkinEvents = checkinEventsRes.data || [];

      // Build set of client IDs who have a check-in calendar event this week
      const clientsWithCheckinThisWeek = new Set<string>();
      for (const ev of checkinEvents) {
        if (ev.target_client_id && clientIds.includes(ev.target_client_id)) {
          clientsWithCheckinThisWeek.add(ev.target_client_id);
        }
        if (ev.user_id && clientIds.includes(ev.user_id)) {
          clientsWithCheckinThisWeek.add(ev.user_id);
        }
      }

      const profileMap = new Map(profiles.map((p) => [p.user_id, p]));
      const submissionMap = new Map<string, typeof submissions[0]>();
      for (const s of submissions) {
        const existing = submissionMap.get(s.client_id);
        if (!existing || (s.submitted_at && (!existing.submitted_at || s.submitted_at > existing.submitted_at))) {
          submissionMap.set(s.client_id, s);
        }
      }

      // Initialize buckets
      const buckets: DayBucket[] = sortedDays.map(config => ({ config, clients: [] }));
      const notSubmitted: CheckinClient[] = [];
      const offWeek: CheckinClient[] = [];

      const assignmentMap = new Map<string, typeof checkinAssignments[0]>();
      for (const a of checkinAssignments) {
        if (!assignmentMap.has(a.client_id)) assignmentMap.set(a.client_id, a);
      }

      // Only iterate over clients who have a check-in event on calendar this week
      // OR who have a biweekly assignment (to populate off-week section)
      const eligibleClientIds = clientIds.filter(cid => {
        if (clientsWithCheckinThisWeek.has(cid)) return true;
        // Include biweekly clients so they can appear in off-week
        const assignment = assignmentMap.get(cid);
        if (assignment?.recurrence === "biweekly") return true;
        return false;
      });

      for (const cid of eligibleClientIds) {
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
          const submissionDay = getDayOfWeekPST(submission.submitted_at);
          // Find which bucket this submission belongs to
          // Sort configs by day_of_week descending, find first where submissionDay >= config day
          let placed = false;
          for (let i = sortedDays.length - 1; i >= 0; i--) {
            if (submissionDay >= sortedDays[i].day_of_week) {
              buckets[i].clients.push(baseClient);
              placed = true;
              break;
            }
          }
          // If submitted before the first configured day, put in first bucket
          if (!placed && buckets.length > 0) {
            buckets[0].clients.push(baseClient);
          }
        } else {
          notSubmitted.push(baseClient);
        }
      }

      const sortByName = (a: CheckinClient, b: CheckinClient) => a.clientName.localeCompare(b.clientName);
      buckets.forEach(b => b.clients.sort(sortByName));
      notSubmitted.sort(sortByName);
      offWeek.sort(sortByName);

      return { buckets, notSubmitted, offWeek, isPastLastDay };
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

  if (loading && !data?.buckets?.length) return <GridSkeleton cards={3} />;
  if (!data) return null;

  const { buckets, notSubmitted, offWeek, isPastLastDay } = data;
  const totalAssigned = buckets.reduce((sum, b) => sum + b.clients.length, 0) + notSubmitted.length;
  if (totalAssigned === 0 && offWeek.length === 0) return null;

  const isClientReviewed = (client: CheckinClient) => {
    if (client.submissionId && optimisticReviewed[client.submissionId] !== undefined) {
      return optimisticReviewed[client.submissionId];
    }
    return client.isReviewed;
  };

  const allSubmitted = buckets.flatMap(b => b.clients);
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

      <div className={`grid grid-cols-1 gap-4 ${buckets.length + 1 <= 3 ? `lg:grid-cols-${buckets.length + 1}` : "lg:grid-cols-4"}`}
        style={{ gridTemplateColumns: `repeat(${Math.min(buckets.length + 1, 4)}, minmax(0, 1fr))` }}
      >
        {/* Dynamic submission day columns — hide reviewed clients */}
        {buckets.map((bucket, idx) => {
          const style = COLUMN_STYLES[idx % COLUMN_STYLES.length];
          const unreviewedClients = bucket.clients.filter(c => !isClientReviewed(c));
          return (
            <SubmissionColumn
              key={bucket.config.id}
              title={bucket.config.label}
              icon={style.icon}
              borderClass={style.borderClass}
              badgeColor={style.badgeColor}
              clients={unreviewedClients}
              reviewedCount={0}
              navigate={navigate}
              isClientReviewed={isClientReviewed}
              onToggleReview={(client) => {
                if (!client.submissionId) return;
                markReviewed.mutate({ submissionId: client.submissionId, reviewed: !isClientReviewed(client) });
              }}
              emptyText={`No ${bucket.config.label} submissions.`}
            />
          );
        })}

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
                      {isPastLastDay && (
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

      {/* ── Finished Check-In Review ── */}
      <Card className="mt-4 border-primary/20">
        <CardContent className="py-3">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Finished Check-In Review</span>
            <span className="text-xs text-muted-foreground">
              {totalSubmitted > 0 ? `${reviewedCount}/${totalSubmitted}` : "0 reviewed"}
            </span>
            </div>
            <Progress value={reviewProgress} className="h-2 mb-3" />
            {reviewedClients.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-2">
                No reviews completed yet — check off clients above.
              </p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {reviewedClients.map((c) => (
                  <div
                    key={c.clientId}
                    className="flex items-center gap-2 py-2 px-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
                    style={{ borderLeft: c.reviewerColor ? `3px solid ${c.reviewerColor}` : undefined }}
                  >
                    <Checkbox
                      checked={true}
                      onCheckedChange={() => {
                        if (!c.submissionId) return;
                        markReviewed.mutate({ submissionId: c.submissionId, reviewed: false });
                      }}
                      className="shrink-0"
                    />
                    <div
                      className="flex items-center gap-2 cursor-pointer"
                      onClick={() => navigate(`/clients/${c.clientId}?tab=checkin`)}
                    >
                      <UserAvatar src={c.avatarUrl} name={c.clientName} className="h-7 w-7" />
                      <div>
                        <p className="text-sm text-foreground line-through opacity-60 whitespace-nowrap">
                          {c.clientName}
                        </p>
                        <span className="text-[10px] text-muted-foreground">{c.formattedTime}</span>
                      </div>
                    </div>
                    {c.reviewerName && (
                      <span
                        className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold shrink-0"
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
