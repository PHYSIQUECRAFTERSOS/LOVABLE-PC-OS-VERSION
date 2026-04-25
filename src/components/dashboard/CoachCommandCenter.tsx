import { useAuth } from "@/hooks/useAuth";
import CheckinSubmissionDashboard from "@/components/dashboard/CheckinSubmissionDashboard";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import UserAvatar from "@/components/profile/UserAvatar";
import { useDataFetch } from "@/hooks/useDataFetch";
import { GridSkeleton, RetryBanner } from "@/components/ui/data-skeleton";
import { useNavigate } from "react-router-dom";
import { format, subDays, addDays, differenceInDays } from "date-fns";
import {
  AlertTriangle,
  MessageSquare,
  Trophy,
  Shield,
  Zap,
  Users,
  TrendingDown,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Activity,
  
  ClipboardCheck,
  CalendarClock,
  Clock,
  UserPlus,
  Camera,
  ClipboardList,
  Eye,
  Repeat,
} from "lucide-react";
import { useState } from "react";
import QuickMessageDialog from "@/components/dashboard/QuickMessageDialog";

// ── Types ──

interface ClientProfile {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
}

interface ActionItem {
  clientId: string;
  clientName: string;
  avatarUrl?: string | null;
  reasons: string[];
  compliancePct: number;
}

interface ComplianceSnapshot {
  trainingPct: number;
  checkinPct: number;
  overallPct: number;
  activeClients: number;
  atRiskClients: number;
}

interface LeaderboardEntry {
  clientId: string;
  clientName: string;
  avatarUrl?: string | null;
  compliancePct: number;
  streak: number;
  checkinCount: number;
}

interface AtRiskClient {
  clientId: string;
  clientName: string;
  avatarUrl?: string | null;
  riskScore: number;
  daysInactive: number;
  signals: string[];
}

interface UnreadThread {
  conversationId: string;
  participantName: string;
  avatarUrl?: string | null;
  lastMessage: string;
  sentAt: string;
  isAtRisk: boolean;
}

interface YesterdayWorkoutClient {
  clientId: string;
  clientName: string;
  avatarUrl?: string | null;
  workoutTitle: string;
}

interface PhaseDeadlineClient {
  clientId: string;
  clientName: string;
  avatarUrl?: string | null;
  phaseName: string;
  endDate: string;
  daysLeft: number;
}

interface ProgramRenewal {
  clientId: string;
  clientName: string;
  avatarUrl?: string | null;
  tierName: string | null;
  endDate: string;
  daysLeft: number;
}

interface M2MClient {
  clientId: string;
  clientName: string;
  avatarUrl?: string | null;
  tierName: string | null;
  startDate: string;
}

interface NewClientReadiness {
  clientId: string;
  clientName: string;
  avatarUrl: string | null;
  assignedAt: string;
  onboardingComplete: boolean;
  photoCount: number;
}

interface CommandCenterData {
  actionItems: ActionItem[];
  snapshot: ComplianceSnapshot;
  leaderboard: LeaderboardEntry[];
  atRisk: AtRiskClient[];
  unreadThreads: UnreadThread[];
  completedYesterday: YesterdayWorkoutClient[];
  missedYesterday: YesterdayWorkoutClient[];
  phaseDeadlines: PhaseDeadlineClient[];
  newClients: NewClientReadiness[];
  programRenewals: ProgramRenewal[];
  m2mClients: M2MClient[];
}

// ── Helpers ──

function complianceColor(pct: number) {
  if (pct >= 80) return "text-emerald-400";
  if (pct >= 60) return "text-yellow-400";
  return "text-destructive";
}

function complianceBg(pct: number) {
  if (pct >= 80) return "bg-emerald-400";
  if (pct >= 60) return "bg-yellow-400";
  return "bg-destructive";
}

function riskBadge(score: number) {
  if (score >= 81) return { label: "Critical", cls: "bg-destructive/20 text-destructive" };
  if (score >= 61) return { label: "High", cls: "bg-destructive/10 text-orange-400" };
  if (score >= 31) return { label: "Moderate", cls: "bg-yellow-400/10 text-yellow-400" };
  return { label: "Low", cls: "bg-emerald-400/10 text-emerald-400" };
}

// ── Main Component ──

const CoachCommandCenter = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [quickMsgClient, setQuickMsgClient] = useState<{ id: string; name: string; avatar?: string | null; prefill?: string } | null>(null);

  const { data, loading, error, timedOut, refetch } = useDataFetch<CommandCenterData>({
    queryKey: `coach-command-center-${user?.id}`,
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
    timeout: 5000,
    fallback: { actionItems: [], snapshot: { trainingPct: 0, checkinPct: 0, overallPct: 0, activeClients: 0, atRiskClients: 0 }, leaderboard: [], atRisk: [], unreadThreads: [], completedYesterday: [], missedYesterday: [], phaseDeadlines: [], newClients: [], programRenewals: [], m2mClients: [] },
    queryFn: async (signal) => {
      if (!user) throw new Error("No user");

      // 1. Get assigned clients
      const { data: assignments } = await supabase
        .from("coach_clients")
        .select("client_id")
        .eq("coach_id", user.id)
        .eq("status", "active")
        .abortSignal(signal);

      if (!assignments?.length)
        return { actionItems: [], snapshot: { trainingPct: 0, checkinPct: 0, overallPct: 0, activeClients: 0, atRiskClients: 0 }, leaderboard: [], atRisk: [], unreadThreads: [], completedYesterday: [], missedYesterday: [], phaseDeadlines: [], newClients: [], programRenewals: [], m2mClients: [] };

      const clientIds = assignments.map((a) => a.client_id);
      const now = new Date();
      const last7Start = format(subDays(now, 6), "yyyy-MM-dd");
      const last7Days = Array.from({ length: 7 }, (_, i) => format(subDays(now, 6 - i), "yyyy-MM-dd"));
      const yesterday = format(subDays(now, 1), "yyyy-MM-dd");

      // 2. Parallel data fetch — calendar-events-driven compliance
      const profilesReq = supabase.from("profiles").select("user_id, full_name, avatar_url").in("user_id", clientIds).abortSignal(signal);
      // Calendar events for last 7 days (workout + checkin only) — source of truth for compliance
      const calEventsReq = supabase.from("calendar_events").select("user_id, target_client_id, event_type, is_completed, event_date, linked_workout_id, title").in("event_type", ["workout", "checkin"]).gte("event_date", last7Start).lte("event_date", format(now, "yyyy-MM-dd")).abortSignal(signal);
      // Workout sessions for double-verification (catch completed workouts where calendar wasn't flagged)
      const sessionsReq = supabase.from("workout_sessions").select("client_id, created_at, completed_at, session_date, workout_id, workouts:workout_id(name)").in("client_id", clientIds).gte("created_at", `${last7Start}T00:00:00`).abortSignal(signal);
      const riskReq = supabase.from("client_risk_scores").select("client_id, score, risk_level, signals, calculated_at").in("client_id", clientIds).order("calculated_at", { ascending: false }).abortSignal(signal);
      const messagesReq = supabase.from("messages").select("id, sender_id, conversation_id, content, created_at").neq("sender_id", user.id).order("created_at", { ascending: false }).limit(20).abortSignal(signal);
      // Yesterday's scheduled workouts (coach schedules via target_client_id OR client's own)
      const yesterdayCalReq = supabase.from("calendar_events").select("user_id, target_client_id, linked_workout_id, is_completed, title").eq("event_date", yesterday).eq("event_type", "workout").abortSignal(signal);

      const [profilesRes, calEventsRes, sessionsRes, riskRes, messagesRes, yesterdayCalRes] = await Promise.all([
        profilesReq, calEventsReq, sessionsReq, riskReq, messagesReq, yesterdayCalReq,
      ]);

      const profiles = (profilesRes.data || []) as ClientProfile[];
      const allCalEvents = calEventsRes.data || [];
      const sessions = sessionsRes.data || [];
      const riskScores = riskRes.data || [];
      const unreadMessages = messagesRes.data || [];

      const profileMap = new Map(profiles.map((p) => [p.user_id, p]));

      // Build a set of (clientId, workoutId) pairs that have completed workout_sessions for double-verification
      const completedSessionKeys = new Set<string>();
      for (const s of sessions) {
        if (s.completed_at && s.workout_id) {
          completedSessionKeys.add(`${s.client_id}::${s.workout_id}`);
        }
      }

      // ── Per-client metrics (calendar-events-driven) ──
      const clientMetrics = clientIds.map((cid) => {
        const profile = profileMap.get(cid);

        // Get calendar events for this client (coach-scheduled via target_client_id OR client's own)
        const clientEvents = allCalEvents.filter((e) => {
          const effectiveClient = e.target_client_id || e.user_id;
          return effectiveClient === cid;
        });

        const workoutEvents = clientEvents.filter((e) => e.event_type === "workout");
        const checkinEvents = clientEvents.filter((e) => e.event_type === "checkin");

        // Double-verify: a workout event is "completed" if is_completed OR matching workout_session exists
        const completedWorkouts = workoutEvents.filter((e) => {
          if (e.is_completed) return true;
          if (e.linked_workout_id) {
            return completedSessionKeys.has(`${cid}::${e.linked_workout_id}`);
          }
          return false;
        }).length;
        const totalWorkouts = workoutEvents.length;
        const trainingPct = totalWorkouts > 0 ? Math.round((completedWorkouts / totalWorkouts) * 100) : 100;

        const completedCheckins = checkinEvents.filter((e) => e.is_completed).length;
        const totalCheckins = checkinEvents.length;
        const checkinPct = totalCheckins > 0 ? Math.round((completedCheckins / totalCheckins) * 100) : 100;

        const totalScheduled = totalWorkouts + totalCheckins;
        const totalCompleted = completedWorkouts + completedCheckins;

        // Overall compliance: simple ratio of completed/scheduled, 100% if nothing scheduled
        const overallCompliance = totalScheduled > 0 ? Math.round((totalCompleted / totalScheduled) * 100) : 100;

        // Missed counts (actual scheduled events that weren't completed)
        const missedWorkouts = totalWorkouts - completedWorkouts;
        const missedCheckins = totalCheckins - completedCheckins;

        // Streak: consecutive days (from today backwards) where all scheduled events were completed
        let streak = 0;
        for (let i = 6; i >= 0; i--) {
          const dayStr = last7Days[i];
          const dayEvents = clientEvents.filter((e) => e.event_date === dayStr);
          if (dayEvents.length === 0) continue; // skip days with no events
          const allDone = dayEvents.every((e) => {
            if (e.is_completed) return true;
            if (e.event_type === "workout" && e.linked_workout_id) {
              return completedSessionKeys.has(`${cid}::${e.linked_workout_id}`);
            }
            return false;
          });
          if (allDone) streak++;
          else break;
        }

        // Days since last activity (from sessions)
        const clientSessions = sessions.filter((s) => s.client_id === cid);
        const allDates = clientSessions.map((s) => new Date(s.created_at).getTime());
        const lastActivity = allDates.length > 0 ? Math.max(...allDates) : 0;
        const daysInactive = lastActivity > 0 ? Math.floor((now.getTime() - lastActivity) / (1000 * 60 * 60 * 24)) : 99;

        // Risk from DB
        const latestRisk = riskScores.find((r) => r.client_id === cid);

        return {
          clientId: cid,
          clientName: profile?.full_name || "Client",
          avatarUrl: profile?.avatar_url,
          trainingPct,
          checkinPct,
          overallCompliance,
          streak,
          daysInactive,
          missedWorkouts,
          missedCheckins,
          totalScheduled,
          checkinCount: completedCheckins,
          riskScore: latestRisk?.score ?? (daysInactive > 3 ? 60 : overallCompliance < 50 ? 50 : 20),
          riskSignals: latestRisk?.signals as string[] ?? [],
        };
      });

      // ── Section 1: Action Items ──
      const actionItems: ActionItem[] = clientMetrics
        .filter((c) => {
          // Only flag if there are actual missed scheduled events or low compliance with scheduled events
          return c.missedWorkouts >= 2 || c.missedCheckins >= 1 || (c.totalScheduled > 0 && c.overallCompliance < 70);
        })
        .map((c) => {
          const reasons: string[] = [];
          if (c.missedWorkouts >= 2) reasons.push(`${c.missedWorkouts} missed workouts`);
          if (c.missedCheckins >= 1) reasons.push(`${c.missedCheckins} missed check-in${c.missedCheckins > 1 ? "s" : ""}`);
          if (c.totalScheduled > 0 && c.overallCompliance < 70) reasons.push(`Compliance ${c.overallCompliance}%`);
          return { clientId: c.clientId, clientName: c.clientName, avatarUrl: c.avatarUrl, reasons, compliancePct: c.overallCompliance };
        })
        .sort((a, b) => a.compliancePct - b.compliancePct);

      // ── Section 2: Snapshot ──
      const avgTraining = clientMetrics.length > 0 ? Math.round(clientMetrics.reduce((s, c) => s + c.trainingPct, 0) / clientMetrics.length) : 0;
      const avgCheckin = clientMetrics.length > 0 ? Math.round(clientMetrics.reduce((s, c) => s + c.checkinPct, 0) / clientMetrics.length) : 0;
      const avgOverall = clientMetrics.length > 0 ? Math.round(clientMetrics.reduce((s, c) => s + c.overallCompliance, 0) / clientMetrics.length) : 0;
      const atRiskCount = clientMetrics.filter((c) => c.riskScore >= 61).length;

      const snapshot: ComplianceSnapshot = {
        trainingPct: avgTraining,
        checkinPct: avgCheckin,
        overallPct: avgOverall,
        activeClients: clientMetrics.length,
        atRiskClients: atRiskCount,
      };

      // ── Section 3: Leaderboard ──
      const leaderboard: LeaderboardEntry[] = [...clientMetrics]
        .sort((a, b) => b.overallCompliance - a.overallCompliance)
        .slice(0, 10)
        .map((c) => ({
          clientId: c.clientId,
          clientName: c.clientName,
          avatarUrl: c.avatarUrl,
          compliancePct: c.overallCompliance,
          streak: c.streak,
          checkinCount: c.checkinCount,
        }));

      // ── Section 4: At-Risk ──
      const atRisk: AtRiskClient[] = clientMetrics
        .filter((c) => c.riskScore >= 31)
        .sort((a, b) => b.riskScore - a.riskScore)
        .map((c) => {
          const signals: string[] = [];
          if (c.missedWorkouts >= 3) signals.push("3+ missed workouts");
          if (c.missedCheckins >= 1) signals.push("Missed check-in");
          if (c.daysInactive >= 7) signals.push("7d inactive");
          if (c.daysInactive >= 7) signals.push("7d inactive");
          if (c.overallCompliance < 50) signals.push("Low compliance");
          return { clientId: c.clientId, clientName: c.clientName, avatarUrl: c.avatarUrl, riskScore: c.riskScore, daysInactive: c.daysInactive, signals };
        });

      // ── Section 5: Unread Threads ──
      const atRiskIds = new Set(atRisk.map((r) => r.clientId));
      const unreadThreads: UnreadThread[] = unreadMessages
        .filter((m) => clientIds.includes(m.sender_id))
        .slice(0, 5)
        .map((m) => {
          const profile = profileMap.get(m.sender_id);
          return {
            conversationId: m.conversation_id,
            participantName: profile?.full_name || "Client",
            avatarUrl: profile?.avatar_url,
            lastMessage: (m.content || "").slice(0, 80),
            sentAt: m.created_at,
            isAtRisk: atRiskIds.has(m.sender_id),
          };
        });

      // ── Section 6: Yesterday's Workout Results ──
      // Use BOTH calendar events AND workout_sessions to detect completions
      const yesterdayEvents = (yesterdayCalRes.data || [])
        .filter((e) => {
          const effectiveClient = e.target_client_id || e.user_id;
          return clientIds.includes(effectiveClient);
        })
        .map((e) => ({ ...e, effectiveClientId: e.target_client_id || e.user_id }));

      // Also check workout_sessions completed yesterday (primary source of truth)
      const yesterdaySessions = sessions.filter((s) => {
        if (!s.completed_at) return false;
        const sessionDate = (s as any).session_date || format(new Date(s.completed_at), "yyyy-MM-dd");
        return sessionDate === yesterday;
      });

      const completedYesterday: YesterdayWorkoutClient[] = [];
      const missedYesterday: YesterdayWorkoutClient[] = [];
      const seenCompleted = new Set<string>();
      const seenMissed = new Set<string>();

      // First: add clients with completed workout_sessions yesterday
      for (const sess of yesterdaySessions) {
        const cid = sess.client_id;
        if (!clientIds.includes(cid) || seenCompleted.has(cid)) continue;
        const profile = profileMap.get(cid);
        const workoutName = (sess as any).workouts?.name || "Workout";
        completedYesterday.push({
          clientId: cid,
          clientName: profile?.full_name || "Client",
          avatarUrl: profile?.avatar_url,
          workoutTitle: workoutName,
        });
        seenCompleted.add(cid);
      }

      // Then: supplement with calendar events (for completed calendar events not caught by sessions)
      for (const ev of yesterdayEvents) {
        const cid = ev.effectiveClientId;
        const profile = profileMap.get(cid);
        const entry: YesterdayWorkoutClient = {
          clientId: cid,
          clientName: profile?.full_name || "Client",
          avatarUrl: profile?.avatar_url,
          workoutTitle: ev.title || "Workout",
        };
        if (ev.is_completed) {
          if (!seenCompleted.has(cid)) { completedYesterday.push(entry); seenCompleted.add(cid); }
        } else {
          // Only mark as missed if the client didn't complete a session yesterday
          if (!seenCompleted.has(cid) && !seenMissed.has(cid)) { missedYesterday.push(entry); seenMissed.add(cid); }
        }
      }

      // ── Section 7: Phase Deadlines ──
      const phaseDeadlines: PhaseDeadlineClient[] = [];
      const { data: programAssignments } = await supabase
        .from("client_program_assignments")
        .select("client_id, program_id, current_phase_id, start_date")
        .in("client_id", clientIds)
        .in("status", ["active", "subscribed"]);

      if (programAssignments?.length) {
        const programIds = [...new Set(programAssignments.map((a) => a.program_id))];
        const { data: allPhases } = await supabase
          .from("program_phases")
          .select("id, program_id, phase_order, duration_weeks, name")
          .in("program_id", programIds)
          .order("phase_order", { ascending: true });

        if (allPhases?.length) {
          const phasesByProgram = new Map<string, typeof allPhases>();
          allPhases.forEach((p) => {
            if (!phasesByProgram.has(p.program_id)) phasesByProgram.set(p.program_id, []);
            phasesByProgram.get(p.program_id)!.push(p);
          });

          for (const a of programAssignments) {
            const phases = phasesByProgram.get(a.program_id);
            if (!phases?.length || !a.current_phase_id) continue;
            const currentPhase = phases.find((p) => p.id === a.current_phase_id);
            if (!currentPhase) continue;

            let totalWeeks = 0;
            for (const p of phases) {
              totalWeeks += p.duration_weeks;
              if (p.id === a.current_phase_id) break;
            }

            const endDate = addDays(new Date(a.start_date), totalWeeks * 7);
            const daysLeft = differenceInDays(endDate, now);
            const profile = profileMap.get(a.client_id);

            if (daysLeft <= 7) {
              phaseDeadlines.push({
                clientId: a.client_id,
                clientName: profile?.full_name || "Client",
                avatarUrl: profile?.avatar_url,
                phaseName: currentPhase.name,
                endDate: format(endDate, "MMM d, yyyy"),
                daysLeft,
              });
            }
          }
          phaseDeadlines.sort((a, b) => a.daysLeft - b.daysLeft);
        }
      }

      // ── Section 8: New Clients Readiness ──
      const sevenDaysAgo = format(subDays(now, 7), "yyyy-MM-dd");
      const { data: recentAssignments } = await supabase
        .from("coach_clients")
        .select("client_id, assigned_at")
        .eq("coach_id", user.id)
        .eq("status", "active")
        .gte("assigned_at", `${sevenDaysAgo}T00:00:00`);

      const newClients: NewClientReadiness[] = [];
      if (recentAssignments?.length) {
        const newClientIds = recentAssignments.map((a) => a.client_id);
        const [onboardingRes, photosRes] = await Promise.all([
          supabase.from("onboarding_profiles").select("user_id, onboarding_completed").in("user_id", newClientIds),
          supabase.from("progress_photos").select("client_id, pose").in("client_id", newClientIds),
        ]);
        const onboardingMap = new Map((onboardingRes.data || []).map((o) => [o.user_id, o.onboarding_completed]));
        const photoCountMap = new Map<string, number>();
        (photosRes.data || []).forEach((p) => {
          photoCountMap.set(p.client_id, (photoCountMap.get(p.client_id) || 0) + 1);
        });

        for (const a of recentAssignments) {
          const profile = profileMap.get(a.client_id);
          const onboardingComplete = onboardingMap.get(a.client_id) ?? false;
          const photoCount = photoCountMap.get(a.client_id) ?? 0;
          newClients.push({
            clientId: a.client_id,
            clientName: profile?.full_name || "Client",
            avatarUrl: profile?.avatar_url ?? null,
            assignedAt: a.assigned_at,
            onboardingComplete,
            photoCount,
          });
        }
        // Sort: missing both first, then missing one, then complete
        newClients.sort((a, b) => {
          const aScore = (a.onboardingComplete ? 0 : 2) + (a.photoCount >= 3 ? 0 : 1);
          const bScore = (b.onboardingComplete ? 0 : 2) + (b.photoCount >= 3 ? 0 : 1);
          return bScore - aScore;
        });
      }

      // ── Section 9: Program Renewals & M2M (from client_program_tracker) ──
      const programRenewals: ProgramRenewal[] = [];
      const m2mClients: M2MClient[] = [];
      const { data: trackerRows } = await (supabase as any)
        .from("client_program_tracker")
        .select("client_id, client_name, tier_name, end_date, start_date, is_month_to_month")
        .eq("coach_id", user.id);
      if (trackerRows?.length) {
        for (const row of trackerRows) {
          const profile = profileMap.get(row.client_id);
          if (row.is_month_to_month) {
            m2mClients.push({
              clientId: row.client_id,
              clientName: row.client_name,
              avatarUrl: profile?.avatar_url,
              tierName: row.tier_name,
              startDate: format(new Date(row.start_date), "MMM d, yyyy"),
            });
          } else {
            const dLeft = differenceInDays(new Date(row.end_date), now);
            if (dLeft <= 30) {
              programRenewals.push({
                clientId: row.client_id,
                clientName: row.client_name,
                avatarUrl: profile?.avatar_url,
                tierName: row.tier_name,
                endDate: format(new Date(row.end_date), "MMM d, yyyy"),
                daysLeft: dLeft,
              });
            }
          }
        }
        programRenewals.sort((a, b) => a.daysLeft - b.daysLeft);
        m2mClients.sort((a, b) => a.clientName.localeCompare(b.clientName));
      }

      return { actionItems, snapshot, leaderboard, atRisk, unreadThreads, completedYesterday, missedYesterday, phaseDeadlines, newClients, programRenewals, m2mClients };
    },
  });

  if (loading && !data?.actionItems?.length) return <GridSkeleton cards={6} />;
  if ((error || timedOut) && !data?.actionItems?.length) return <RetryBanner onRetry={refetch} />;
  if (!data) return null;

  const { actionItems, snapshot, leaderboard, atRisk, unreadThreads, completedYesterday, missedYesterday, phaseDeadlines, newClients, programRenewals = [], m2mClients = [] } = data;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ─── SECTION 1: Daily Action Panel ─── */}
      <div>
        <h2 className="font-display text-lg font-bold text-foreground flex items-center gap-2 mb-3">
          <AlertTriangle className="h-5 w-5 text-primary" />
          Clients Requiring Attention
          {actionItems.length > 0 && (
            <span className="ml-2 rounded-full bg-destructive/20 px-2 py-0.5 text-xs font-bold text-destructive">
              {actionItems.length}
            </span>
          )}
        </h2>
        {actionItems.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">All clients on track. No immediate actions needed.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {actionItems.map((item) => (
              <Card
                key={item.clientId}
                className="cursor-pointer hover:border-primary/40 transition-colors"
                onClick={() => navigate(`/clients/${item.clientId}`)}
              >
                <CardContent className="py-3 flex items-center gap-4">
                  <UserAvatar src={item.avatarUrl} name={item.clientName} className="h-9 w-9 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{item.clientName}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {item.reasons.map((r, i) => (
                        <span key={i} className="inline-flex items-center rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
                          {r}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-lg font-bold ${complianceColor(item.compliancePct)}`}>{item.compliancePct}%</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* ─── SECTION 2: Yesterday's Workout Results ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Completed Yesterday */}
        <Card className="border-emerald-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-display flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              Completed Yesterday
              {completedYesterday.length > 0 && (
                <span className="ml-1 rounded-full bg-emerald-400/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                  {completedYesterday.length}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {completedYesterday.length === 0 ? (
              <p className="text-xs text-muted-foreground py-3 text-center">No workouts completed yesterday.</p>
            ) : (
              completedYesterday.map((client) => (
                <div key={client.clientId} className="flex items-center gap-3 py-2 px-2 rounded hover:bg-secondary/50 transition-colors">
                  <UserAvatar src={client.avatarUrl} name={client.clientName} className="h-7 w-7" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">{client.clientName}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{client.workoutTitle}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-emerald-400 hover:text-emerald-300"
                    onClick={() => setQuickMsgClient({ id: client.clientId, name: client.clientName, avatar: client.avatarUrl, prefill: `Great work on "${client.workoutTitle}" yesterday! 💪` })}
                  >
                    <MessageSquare className="h-3.5 w-3.5 mr-1" />
                    Congrats
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Missed Yesterday */}
        <Card className="border-destructive/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-display flex items-center gap-2">
              <XCircle className="h-4 w-4 text-destructive" />
              Missed Yesterday
              {missedYesterday.length > 0 && (
                <span className="ml-1 rounded-full bg-destructive/20 px-2 py-0.5 text-[10px] font-bold text-destructive">
                  {missedYesterday.length}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {missedYesterday.length === 0 ? (
              <p className="text-xs text-muted-foreground py-3 text-center">No missed workouts yesterday.</p>
            ) : (
              missedYesterday.map((client) => (
                <div key={client.clientId} className="flex items-center gap-3 py-2 px-2 rounded hover:bg-secondary/50 transition-colors">
                  <UserAvatar src={client.avatarUrl} name={client.clientName} className="h-7 w-7" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">{client.clientName}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{client.workoutTitle}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-destructive hover:text-destructive/80"
                    onClick={() => setQuickMsgClient({ id: client.clientId, name: client.clientName, avatar: client.avatarUrl, prefill: "" })}
                  >
                    <MessageSquare className="h-3.5 w-3.5 mr-1" />
                    Check In
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── SECTION 3: Phase Deadline Alerts ─── */}
      <div>
        <h2 className="font-display text-lg font-bold text-foreground flex items-center gap-2 mb-3">
          <CalendarClock className="h-5 w-5 text-primary" />
          Training Phase Deadlines
        </h2>
        {phaseDeadlines.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center">
              <CheckCircle2 className="h-7 w-7 text-emerald-400 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No phases ending within 7 days.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Overdue */}
            {phaseDeadlines.some((c) => c.daysLeft <= 0) && (
              <Card className="border-destructive/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-display flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-destructive" />
                    Overdue
                    <span className="ml-1 rounded-full bg-destructive/20 px-2 py-0.5 text-[10px] font-bold text-destructive">
                      {phaseDeadlines.filter((c) => c.daysLeft <= 0).length}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {phaseDeadlines.filter((c) => c.daysLeft <= 0).map((client) => (
                    <div
                      key={client.clientId}
                      className="flex items-center gap-3 py-2 px-2 rounded hover:bg-secondary/50 cursor-pointer transition-colors"
                      onClick={() => navigate(`/clients/${client.clientId}`)}
                    >
                      <UserAvatar src={client.avatarUrl} name={client.clientName} className="h-7 w-7" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate">{client.clientName}</p>
                        <p className="text-[10px] text-muted-foreground">{client.phaseName} · ended {client.endDate}</p>
                      </div>
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-destructive/20 text-destructive">
                        {Math.abs(client.daysLeft)}d overdue
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Due within 7 days */}
            {phaseDeadlines.some((c) => c.daysLeft > 0) && (
              <Card className="border-amber-500/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-display flex items-center gap-2">
                    <Clock className="h-4 w-4 text-amber-400" />
                    Due Within 7 Days
                    <span className="ml-1 rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                      {phaseDeadlines.filter((c) => c.daysLeft > 0).length}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {phaseDeadlines.filter((c) => c.daysLeft > 0).map((client) => (
                    <div
                      key={client.clientId}
                      className="flex items-center gap-3 py-2 px-2 rounded hover:bg-secondary/50 cursor-pointer transition-colors"
                      onClick={() => navigate(`/clients/${client.clientId}`)}
                    >
                      <UserAvatar src={client.avatarUrl} name={client.clientName} className="h-7 w-7" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate">{client.clientName}</p>
                        <p className="text-[10px] text-muted-foreground">{client.phaseName} · ends {client.endDate}</p>
                      </div>
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-amber-400/20 text-amber-400">
                        {client.daysLeft}d left
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      {/* ─── SECTION 4: At-Risk Clients (full width) ─── */}
      <div>
        {/* At-Risk Panel */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-display flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-destructive" />
              At-Risk Clients
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {atRisk.length === 0 ? (
              <div className="py-4 text-center">
                <CheckCircle2 className="h-6 w-6 text-emerald-400 mx-auto mb-1" />
                <p className="text-xs text-muted-foreground">No at-risk clients detected.</p>
              </div>
            ) : (
              atRisk.map((client) => {
                const badge = riskBadge(client.riskScore);
                return (
                  <div
                    key={client.clientId}
                    className="flex items-center gap-3 py-2 px-2 rounded hover:bg-secondary/50 transition-colors"
                  >
                    <UserAvatar src={client.avatarUrl} name={client.clientName} className="h-7 w-7" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">{client.clientName}</p>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {client.signals.slice(0, 2).map((s, i) => (
                          <span key={i} className="text-[9px] text-muted-foreground">{s}</span>
                        ))}
                      </div>
                    </div>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${badge.cls}`}>{badge.label}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-primary hover:text-primary"
                      onClick={(e) => { e.stopPropagation(); navigate("/messages"); }}
                    >
                      <MessageSquare className="h-3.5 w-3.5 mr-1" />
                      Message
                    </Button>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>


      {/* ─── SECTION 5: Messaging Quick Access ─── */}
      {unreadThreads.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-display flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              Unread Messages
              <span className="ml-1 rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">
                {unreadThreads.length}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {unreadThreads.map((thread) => (
              <div
                key={thread.conversationId}
                className="flex items-center gap-3 py-2 px-2 rounded hover:bg-secondary/50 cursor-pointer transition-colors"
                onClick={() => navigate("/messages")}
              >
                <div className="relative">
                  <UserAvatar src={thread.avatarUrl} name={thread.participantName} className="h-7 w-7" />
                  {thread.isAtRisk && (
                    <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-destructive border-2 border-card" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{thread.participantName}</p>
                  <p className="text-xs text-muted-foreground truncate">{thread.lastMessage}</p>
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {format(new Date(thread.sentAt), "h:mm a")}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ─── SECTION 6: Weekly Check-In Dashboard ─── */}
      <CheckinSubmissionDashboard />

      {/* ─── SECTION 7: New Clients Readiness ─── */}
      <div>
        <h2 className="font-display text-lg font-bold text-foreground flex items-center gap-2 mb-3">
          <UserPlus className="h-5 w-5 text-primary" />
          New Clients (Last 7 Days)
          {newClients.length > 0 && (
            <span className="ml-1 rounded-full bg-primary/20 px-2 py-0.5 text-xs font-bold text-primary">
              {newClients.length}
            </span>
          )}
        </h2>
        {newClients.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center">
              <CheckCircle2 className="h-7 w-7 text-emerald-400 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No new clients in the last 7 days.</p>
            </CardContent>
          </Card>
        ) : (
          (() => {
            const missingOnboarding = newClients.filter((c) => !c.onboardingComplete).length;
            const missingPhotos = newClients.filter((c) => c.photoCount < 3).length;
            const allReady = missingOnboarding === 0 && missingPhotos === 0;
            return (
              <>
                {!allReady && (
                  <div className="flex gap-2 mb-3">
                    {missingOnboarding > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/10 px-2.5 py-1 text-[11px] font-medium text-amber-400">
                        <ClipboardList className="h-3 w-3" />
                        {missingOnboarding} missing onboarding
                      </span>
                    )}
                    {missingPhotos > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/10 px-2.5 py-1 text-[11px] font-medium text-amber-400">
                        <Camera className="h-3 w-3" />
                        {missingPhotos} missing photos
                      </span>
                    )}
                  </div>
                )}
                {allReady && (
                  <Card className="border-emerald-500/20 mb-3">
                    <CardContent className="py-4 text-center">
                      <CheckCircle2 className="h-7 w-7 text-emerald-400 mx-auto mb-1" />
                      <p className="text-sm text-muted-foreground">All new clients are set up and ready to go! 🎉</p>
                    </CardContent>
                  </Card>
                )}
                <div className="space-y-2">
                  {newClients.map((client) => {
                    const daysAgo = differenceInDays(new Date(), new Date(client.assignedAt));
                    const allComplete = client.onboardingComplete && client.photoCount >= 3;
                    const missingItems: string[] = [];
                    if (!client.onboardingComplete) missingItems.push("onboarding form");
                    if (client.photoCount < 3) missingItems.push("progress photos");

                    return (
                      <Card
                        key={client.clientId}
                        className="cursor-pointer hover:border-primary/40 transition-colors"
                        onClick={() => navigate(`/clients/${client.clientId}`)}
                      >
                        <CardContent className="py-3 flex items-center gap-3">
                          <UserAvatar src={client.avatarUrl} name={client.clientName} className="h-9 w-9 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-foreground truncate">{client.clientName}</p>
                              <span className="text-[10px] text-muted-foreground shrink-0">
                                {daysAgo === 0 ? "Today" : `${daysAgo}d ago`}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 mt-1">
                              <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${client.onboardingComplete ? "text-emerald-400" : "text-amber-400"}`}>
                                {client.onboardingComplete ? <CheckCircle2 className="h-3 w-3" /> : <ClipboardList className="h-3 w-3" />}
                                Onboarding
                              </span>
                              <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${client.photoCount >= 3 ? "text-emerald-400" : "text-amber-400"}`}>
                                {client.photoCount >= 3 ? <CheckCircle2 className="h-3 w-3" /> : <Camera className="h-3 w-3" />}
                                Photos{client.photoCount > 0 && client.photoCount < 3 ? ` (${client.photoCount}/3)` : ""}
                              </span>
                            </div>
                          </div>
                          {allComplete ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs text-primary hover:text-primary shrink-0"
                              onClick={(e) => { e.stopPropagation(); navigate(`/clients/${client.clientId}`); }}
                            >
                              <Eye className="h-3.5 w-3.5 mr-1" />
                              View
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs text-primary hover:text-primary shrink-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                const name = client.clientName.split(" ")[0];
                                let prefill = "";
                                if (!client.onboardingComplete && client.photoCount < 3) {
                                  prefill = `Hey ${name}, just checking in — when you get a chance, please complete your onboarding form and upload your progress photos (front, side, back) so I can get your program dialed in! 💪`;
                                } else if (!client.onboardingComplete) {
                                  prefill = `Hey ${name}, just a quick reminder to finish your onboarding form so I can start building your program! 🙌`;
                                } else {
                                  prefill = `Hey ${name}, just checking in — when you get a chance, please upload your progress photos (front, side, back) so I can assess your body composition and get your program dialed in. 📸`;
                                }
                                setQuickMsgClient({ id: client.clientId, name: client.clientName, avatar: client.avatarUrl, prefill });
                              }}
                            >
                              <MessageSquare className="h-3.5 w-3.5 mr-1" />
                              Message
                            </Button>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </>
            );
          })()
        )}
      </div>

      {/* ─── SECTION 9: Program Renewals ─── */}
      {programRenewals.length > 0 && (
        <div>
          <h2 className="font-display text-lg font-bold text-foreground flex items-center gap-2 mb-3">
            <CalendarClock className="h-5 w-5 text-primary" />
            Program Renewals
            <span className="ml-2 rounded-full bg-yellow-500/20 px-2 py-0.5 text-xs font-bold text-yellow-400">{programRenewals.length}</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {programRenewals.map((r) => {
              const urgBg = r.daysLeft <= 7 ? "border-red-500/40 bg-red-500/5" : r.daysLeft <= 14 ? "border-orange-500/40 bg-orange-500/5" : "border-yellow-500/40 bg-yellow-500/5";
              const urgText = r.daysLeft <= 7 ? "text-red-400" : r.daysLeft <= 14 ? "text-orange-400" : "text-yellow-400";
              return (
                <Card key={r.clientId} className={`cursor-pointer hover:bg-accent/10 transition-colors ${urgBg}`} onClick={() => navigate(`/clients/${r.clientId}`)}>
                  <CardContent className="p-3 flex items-center gap-3">
                    <UserAvatar src={r.avatarUrl} name={r.clientName} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{r.clientName}</p>
                      <p className="text-[11px] text-muted-foreground">{r.tierName || "—"} · ends {r.endDate}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-lg font-bold font-display ${urgText}`}>{r.daysLeft <= 0 ? "Expired" : `${r.daysLeft}d`}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-primary hover:text-primary shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        const firstName = r.clientName.split(" ")[0];
                        setQuickMsgClient({
                          id: r.clientId,
                          name: r.clientName,
                          avatar: r.avatarUrl,
                          prefill: `Hey ${firstName}, your program wraps up on ${r.endDate}! I'd love to set up a quick renewal call to discuss your next phase. When works best for you? 💪`,
                        });
                      }}
                    >
                      <MessageSquare className="h-3.5 w-3.5 mr-1" />
                      Message
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}


      {/* ─── SECTION 10: Compliance Snapshot (moved to bottom) ─── */}
      <div>
        <h2 className="font-display text-lg font-bold text-foreground flex items-center gap-2 mb-3">
          <Activity className="h-5 w-5 text-primary" />
          Compliance Snapshot
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <MetricCard icon={Zap} label="Training" value={`${snapshot.trainingPct}%`} pct={snapshot.trainingPct} />
          <MetricCard icon={ClipboardCheck} label="Check-ins" value={`${snapshot.checkinPct}%`} pct={snapshot.checkinPct} />
          <MetricCard icon={Activity} label="Overall" value={`${snapshot.overallPct}%`} pct={snapshot.overallPct} />
          <MetricCard icon={Users} label="Active" value={String(snapshot.activeClients)} />
          <MetricCard icon={Shield} label="At Risk" value={String(snapshot.atRiskClients)} isAlert={snapshot.atRiskClients > 0} />
        </div>
      </div>

      <QuickMessageDialog
        open={!!quickMsgClient}
        onOpenChange={(open) => { if (!open) setQuickMsgClient(null); }}
        clientId={quickMsgClient?.id || ""}
        clientName={quickMsgClient?.name || ""}
        clientAvatar={quickMsgClient?.avatar}
        prefillMessage={quickMsgClient?.prefill}
      />
    </div>
  );
};

// ── Metric Card Sub-component ──

function MetricCard({
  icon: Icon,
  label,
  value,
  pct,
  isAlert,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  pct?: number;
  isAlert?: boolean;
}) {
  return (
    <Card className={isAlert ? "border-destructive/30" : ""}>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center justify-between mb-2">
          <Icon className={`h-4 w-4 ${isAlert ? "text-destructive" : "text-muted-foreground"}`} />
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        </div>
        <p className={`text-2xl font-bold font-display ${pct !== undefined ? complianceColor(pct) : isAlert ? "text-destructive" : "text-foreground"}`}>
          {value}
        </p>
        {pct !== undefined && (
          <div className="mt-2 h-1 w-full rounded-full bg-secondary overflow-hidden">
            <div className={`h-full rounded-full transition-all ${complianceBg(pct)}`} style={{ width: `${Math.min(pct, 100)}%` }} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default CoachCommandCenter;
