import { useEffect, useMemo, useCallback, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useDataFetch, invalidateCache } from "@/hooks/useDataFetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import UserAvatar from "@/components/profile/UserAvatar";
import { GridSkeleton } from "@/components/ui/data-skeleton";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import {
  ClipboardCheck,
  AlertTriangle,
  CheckCircle2,
  Clock,
  CalendarClock,
  ArrowRight,
} from "lucide-react";

// ── Helpers: PST week boundaries ──

/** Get current Monday 00:00 PST and Sunday 23:59 PST */
function getPSTWeekWindow() {
  // Get current time in PST
  const now = new Date();
  const pstFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const pstDateStr = pstFormatter.format(now); // YYYY-MM-DD
  const pstDate = new Date(pstDateStr + "T00:00:00-08:00");

  // day: 0=Sun, 1=Mon, ...
  const day = pstDate.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const monday = new Date(pstDate);
  monday.setDate(monday.getDate() + diffToMonday);
  const mondayStr = monday.toISOString().split("T")[0];

  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  const sundayStr = sunday.toISOString().split("T")[0];

  // Thursday end for at-risk cutoff
  const thursday = new Date(monday);
  thursday.setDate(thursday.getDate() + 3);
  const thursdayStr = thursday.toISOString().split("T")[0];

  // Current PST day-of-week (0=Sun)
  const currentDayOfWeek = day;

  return { mondayStr, sundayStr, thursdayStr, currentDayOfWeek };
}

function getDayOfWeekPST(dateStr: string): number {
  const d = new Date(dateStr);
  // Format to PST date and get day
  const pstStr = d.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  return new Date(pstStr + "T12:00:00").getDay();
}

function formatTimestampInTz(isoStr: string, tz: string | null): string {
  try {
    const d = new Date(isoStr);
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz || "America/Los_Angeles",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
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
  formattedTime: string;
  recurrence: string;
  nextDueDate: string | null;
  timezone: string | null;
}

interface CheckinDashboardData {
  submittedWednesday: CheckinClient[];
  submittedThursday: CheckinClient[];
  notSubmitted: CheckinClient[];
  offWeek: CheckinClient[];
  isPastThursday: boolean;
}

// ── Component ──

const CheckinSubmissionDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [realtimeKey, setRealtimeKey] = useState(0);

  const queryKey = `checkin-dashboard-${user?.id}-${realtimeKey}`;

  const { data, loading, error } = useDataFetch<CheckinDashboardData>({
    queryKey,
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
    timeout: 5000,
    fallback: { submittedWednesday: [], submittedThursday: [], notSubmitted: [], offWeek: [], isPastThursday: false },
    queryFn: async (signal) => {
      if (!user) throw new Error("No user");

      const { mondayStr, sundayStr, thursdayStr, currentDayOfWeek } = getPSTWeekWindow();
      const isPastThursday = currentDayOfWeek >= 5 || currentDayOfWeek === 0; // Fri, Sat, Sun

      // 1. Get coach's active clients
      const { data: assignments } = await supabase
        .from("coach_clients")
        .select("client_id")
        .eq("coach_id", user.id)
        .eq("status", "active")
        .abortSignal(signal);

      if (!assignments?.length)
        return { submittedWednesday: [], submittedThursday: [], notSubmitted: [], offWeek: [], isPastThursday };

      const clientIds = assignments.map((a) => a.client_id);

      // 2. Parallel fetch: assignments, submissions, profiles
      const [assignmentsRes, submissionsRes, profilesRes] = await Promise.all([
        supabase
          .from("checkin_assignments")
          .select("client_id, recurrence, next_due_date, is_active")
          .in("client_id", clientIds)
          .eq("is_active", true)
          .abortSignal(signal),
        supabase
          .from("checkin_submissions")
          .select("client_id, submitted_at, status")
          .in("client_id", clientIds)
          .gte("submitted_at", `${mondayStr}T00:00:00`)
          .lte("submitted_at", `${sundayStr}T23:59:59`)
          .eq("status", "submitted")
          .abortSignal(signal),
        supabase
          .from("profiles")
          .select("user_id, full_name, avatar_url, timezone")
          .in("user_id", clientIds)
          .abortSignal(signal),
      ]);

      const checkinAssignments = assignmentsRes.data || [];
      const submissions = submissionsRes.data || [];
      const profiles = profilesRes.data || [];

      const profileMap = new Map(profiles.map((p) => [p.user_id, p]));
      const submissionMap = new Map<string, typeof submissions[0]>();
      for (const s of submissions) {
        // Keep the latest submission per client
        const existing = submissionMap.get(s.client_id);
        if (!existing || (s.submitted_at && (!existing.submitted_at || s.submitted_at > existing.submitted_at))) {
          submissionMap.set(s.client_id, s);
        }
      }

      const submittedWednesday: CheckinClient[] = [];
      const submittedThursday: CheckinClient[] = [];
      const notSubmitted: CheckinClient[] = [];
      const offWeek: CheckinClient[] = [];

      // Build a map of assignment info per client (if any)
      const assignmentMap = new Map<string, typeof checkinAssignments[0]>();
      for (const a of checkinAssignments) {
        if (!assignmentMap.has(a.client_id)) assignmentMap.set(a.client_id, a);
      }

      // Process ALL coach clients — fall back to "weekly" if no assignment exists
      for (const cid of clientIds) {
        const assignment = assignmentMap.get(cid);
        const profile = profileMap.get(cid);
        const submission = submissionMap.get(cid);
        const tz = profile?.timezone || null;
        const recurrence = assignment?.recurrence || "weekly";
        const nextDueDate = assignment?.next_due_date || null;

        const baseClient: CheckinClient = {
          clientId: cid,
          clientName: profile?.full_name || "Client",
          avatarUrl: profile?.avatar_url || null,
          submittedAt: submission?.submitted_at || null,
          formattedTime: submission?.submitted_at
            ? formatTimestampInTz(submission.submitted_at, tz)
            : "",
          recurrence,
          nextDueDate,
          timezone: tz,
        };

        // Check if biweekly and off-week
        if (recurrence === "biweekly" && nextDueDate) {
          const nextDue = new Date(nextDueDate);
          const sundayDate = new Date(sundayStr + "T23:59:59");
          if (nextDue > sundayDate) {
            offWeek.push(baseClient);
            continue;
          }
        }

        if (submission?.submitted_at) {
          const dayOfWeek = getDayOfWeekPST(submission.submitted_at);
          if (dayOfWeek === 2 || dayOfWeek === 3) {
            submittedWednesday.push(baseClient);
          } else if (dayOfWeek === 4) {
            submittedThursday.push(baseClient);
          } else {
            if (dayOfWeek <= 3) {
              submittedWednesday.push(baseClient);
            } else {
              submittedThursday.push(baseClient);
            }
          }
        } else {
          notSubmitted.push(baseClient);
        }
      }
      // Sort each list alphabetically
      const sortByName = (a: CheckinClient, b: CheckinClient) =>
        a.clientName.localeCompare(b.clientName);
      submittedWednesday.sort(sortByName);
      submittedThursday.sort(sortByName);
      notSubmitted.sort(sortByName);
      offWeek.sort(sortByName);

      return { submittedWednesday, submittedThursday, notSubmitted, offWeek, isPastThursday };
    },
  });

  // ── Realtime subscription ──
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("checkin-dashboard-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "checkin_submissions" },
        () => {
          invalidateCache(queryKey);
          setRealtimeKey((k) => k + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryKey]);

  if (loading && !data?.submittedWednesday?.length) return <GridSkeleton cards={3} />;
  if (!data) return null;

  const { submittedWednesday, submittedThursday, notSubmitted, offWeek, isPastThursday } = data;
  const totalAssigned = submittedWednesday.length + submittedThursday.length + notSubmitted.length;

  if (totalAssigned === 0 && offWeek.length === 0) return null;

  return (
    <div>
      <h2 className="font-display text-lg font-bold text-foreground flex items-center gap-2 mb-3">
        <ClipboardCheck className="h-5 w-5 text-primary" />
        Weekly Check-In Dashboard
        <span className="text-xs font-normal text-muted-foreground ml-2">
          Resets Monday · PST
        </span>
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ── Submitted Wednesday (Tue/Wed) ── */}
        <Card className="border-l-2 border-l-emerald-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-display flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              Submitted Wednesday
              {submittedWednesday.length > 0 && (
                <span className="ml-1 rounded-full bg-emerald-400/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                  {submittedWednesday.length}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {submittedWednesday.length === 0 ? (
              <p className="text-xs text-muted-foreground py-3 text-center">
                No submissions yet.
              </p>
            ) : (
              submittedWednesday.map((client) => (
                <ClientRow key={client.clientId} client={client} navigate={navigate} />
              ))
            )}
          </CardContent>
        </Card>

        {/* ── Submitted Thursday ── */}
        <Card className="border-l-2 border-l-blue-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-display flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-400" />
              Submitted Thursday
              {submittedThursday.length > 0 && (
                <span className="ml-1 rounded-full bg-blue-400/20 px-2 py-0.5 text-[10px] font-bold text-blue-400">
                  {submittedThursday.length}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {submittedThursday.length === 0 ? (
              <p className="text-xs text-muted-foreground py-3 text-center">
                No Thursday submissions.
              </p>
            ) : (
              submittedThursday.map((client) => (
                <ClientRow key={client.clientId} client={client} navigate={navigate} />
              ))
            )}
          </CardContent>
        </Card>

        {/* ── Not Submitted (At-Risk) ── */}
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
                  onClick={() => navigate(`/clients/${client.clientId}?tab=checkin`)}
                >
                  <UserAvatar
                    src={client.avatarUrl}
                    name={client.clientName}
                    className="h-7 w-7"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">{client.clientName}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {isPastThursday && (
                        <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-4">
                          Overdue
                        </Badge>
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

      {/* ── Off-Week Biweekly Clients ── */}
      {offWeek.length > 0 && (
        <Card className="mt-4 border-muted">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-display flex items-center gap-2 text-muted-foreground">
              <CalendarClock className="h-4 w-4" />
              Off-Week Clients
              <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold">
                {offWeek.length}
              </span>
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
                  <UserAvatar
                    src={client.avatarUrl}
                    name={client.clientName}
                    className="h-6 w-6"
                  />
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
    </div>
  );
};

// ── Client Row Sub-component ──

function ClientRow({
  client,
  navigate,
}: {
  client: CheckinClient;
  navigate: (path: string) => void;
}) {
  return (
    <div
      className="flex items-center gap-3 py-2 px-2 rounded hover:bg-secondary/50 cursor-pointer transition-colors"
      onClick={() => navigate(`/clients/${client.clientId}?tab=checkin`)}
    >
      <UserAvatar src={client.avatarUrl} name={client.clientName} className="h-7 w-7" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground truncate">{client.clientName}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[10px] text-muted-foreground">{client.formattedTime}</span>
          {client.recurrence === "biweekly" && (
            <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 border-primary/30 text-primary">
              🔄 Biweekly
            </Badge>
          )}
        </div>
      </div>
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
    </div>
  );
}

export default CheckinSubmissionDashboard;
