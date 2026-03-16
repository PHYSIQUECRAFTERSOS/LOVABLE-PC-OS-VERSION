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
  UtensilsCrossed,
  ClipboardCheck,
  CalendarClock,
  Clock,
} from "lucide-react";

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
  nutritionPct: number;
  checkinPct: number;
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

interface CommandCenterData {
  actionItems: ActionItem[];
  snapshot: ComplianceSnapshot;
  leaderboard: LeaderboardEntry[];
  atRisk: AtRiskClient[];
  unreadThreads: UnreadThread[];
  completedYesterday: YesterdayWorkoutClient[];
  missedYesterday: YesterdayWorkoutClient[];
  phaseDeadlines: PhaseDeadlineClient[];
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

  const { data, loading, error, timedOut, refetch } = useDataFetch<CommandCenterData>({
    queryKey: `coach-command-center-${user?.id}`,
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
    timeout: 5000,
    fallback: { actionItems: [], snapshot: { trainingPct: 0, nutritionPct: 0, checkinPct: 0, activeClients: 0, atRiskClients: 0 }, leaderboard: [], atRisk: [], unreadThreads: [], completedYesterday: [], missedYesterday: [], phaseDeadlines: [] },
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
        return { actionItems: [], snapshot: { trainingPct: 0, nutritionPct: 0, checkinPct: 0, activeClients: 0, atRiskClients: 0 }, leaderboard: [], atRisk: [], unreadThreads: [], completedYesterday: [], missedYesterday: [], phaseDeadlines: [] };

      const clientIds = assignments.map((a) => a.client_id);
      const now = new Date();
      const last7Start = format(subDays(now, 6), "yyyy-MM-dd");
      const last7Days = Array.from({ length: 7 }, (_, i) => format(subDays(now, 6 - i), "yyyy-MM-dd"));
      const yesterday = format(subDays(now, 1), "yyyy-MM-dd");

      // 2. Parallel data fetch — split to avoid deep type inference
      const profilesReq = supabase.from("profiles").select("user_id, full_name, avatar_url").in("user_id", clientIds).abortSignal(signal);
      const sessionsReq = supabase.from("workout_sessions").select("client_id, created_at, completed_at").in("client_id", clientIds).gte("created_at", `${last7Start}T00:00:00`).abortSignal(signal);
      const nutritionReq = supabase.from("nutrition_logs").select("client_id, logged_at").in("client_id", clientIds).gte("logged_at", `${last7Start}T00:00:00`).abortSignal(signal);
      const checkinsReq = supabase.from("weekly_checkins").select("client_id, week_date").in("client_id", clientIds).gte("week_date", last7Start).abortSignal(signal);
      const riskReq = supabase.from("client_risk_scores").select("client_id, score, risk_level, signals, calculated_at").in("client_id", clientIds).order("calculated_at", { ascending: false }).abortSignal(signal);
      const messagesReq = supabase.from("messages").select("id, sender_id, conversation_id, content, created_at").neq("sender_id", user.id).order("created_at", { ascending: false }).limit(20).abortSignal(signal);
      // Yesterday's scheduled workouts (coach schedules via target_client_id OR client's own)
      const yesterdayCalReq = supabase.from("calendar_events").select("user_id, target_client_id, linked_workout_id, is_completed, title").eq("event_date", yesterday).eq("event_type", "workout").abortSignal(signal);

      const [profilesRes, sessionsRes, nutritionRes, checkinsRes, riskRes, messagesRes, yesterdayCalRes] = await Promise.all([
        profilesReq, sessionsReq, nutritionReq, checkinsReq, riskReq, messagesReq, yesterdayCalReq,
      ]);

      const profiles = (profilesRes.data || []) as ClientProfile[];
      const sessions = sessionsRes.data || [];
      const nutritionLogs = nutritionRes.data || [];
      const checkins = checkinsRes.data || [];
      const riskScores = riskRes.data || [];
      const unreadMessages = messagesRes.data || [];

      const profileMap = new Map(profiles.map((p) => [p.user_id, p]));

      // ── Per-client metrics ──
      const clientMetrics = clientIds.map((cid) => {
        const profile = profileMap.get(cid);
        const clientSessions = sessions.filter((s) => s.client_id === cid);
        const completed = clientSessions.filter((s) => s.completed_at).length;
        const totalSessions = clientSessions.length;
        const trainingPct = totalSessions > 0 ? Math.round((completed / totalSessions) * 100) : 0;

        const clientNutrition = nutritionLogs.filter((n) => n.client_id === cid);
        const nutritionDays = new Set(clientNutrition.map((n) => format(new Date(n.logged_at), "yyyy-MM-dd"))).size;
        const nutritionPct = Math.round((nutritionDays / 7) * 100);

        const clientCheckins = checkins.filter((c) => c.client_id === cid);
        const checkinDone = clientCheckins.length > 0;

        // Streak calc
        let streak = 0;
        for (let i = 6; i >= 0; i--) {
          if (clientSessions.some((s) => format(new Date(s.created_at), "yyyy-MM-dd") === last7Days[i] && s.completed_at)) streak++;
          else break;
        }

        // Overall compliance weighted
        const overallCompliance = Math.round(trainingPct * 0.4 + nutritionPct * 0.35 + (checkinDone ? 100 : 0) * 0.15 + 50 * 0.1);

        // Days since last activity
        const allDates = [
          ...clientSessions.map((s) => new Date(s.created_at).getTime()),
          ...clientNutrition.map((n) => new Date(n.logged_at).getTime()),
        ];
        const lastActivity = allDates.length > 0 ? Math.max(...allDates) : 0;
        const daysInactive = lastActivity > 0 ? Math.floor((now.getTime() - lastActivity) / (1000 * 60 * 60 * 24)) : 99;

        // Missed days
        const missedWorkoutDays = 7 - completed;
        const missedNutritionDays = 7 - nutritionDays;

        // Risk from DB
        const latestRisk = riskScores.find((r) => r.client_id === cid);

        return {
          clientId: cid,
          clientName: profile?.full_name || "Client",
          avatarUrl: profile?.avatar_url,
          trainingPct,
          nutritionPct,
          checkinDone,
          overallCompliance,
          streak,
          daysInactive,
          missedWorkoutDays,
          missedNutritionDays,
          checkinCount: clientCheckins.length,
          riskScore: latestRisk?.score ?? (daysInactive > 3 ? 60 : overallCompliance < 50 ? 50 : 20),
          riskSignals: latestRisk?.signals as string[] ?? [],
        };
      });

      // ── Section 1: Action Items ──
      const actionItems: ActionItem[] = clientMetrics
        .filter((c) => {
          return c.missedWorkoutDays >= 2 || c.missedNutritionDays >= 2 || !c.checkinDone || c.overallCompliance < 70;
        })
        .map((c) => {
          const reasons: string[] = [];
          if (c.missedWorkoutDays >= 2) reasons.push(`${c.missedWorkoutDays} missed workouts`);
          if (c.missedNutritionDays >= 2) reasons.push(`${c.missedNutritionDays}d no nutrition log`);
          if (!c.checkinDone) reasons.push("No check-in");
          if (c.overallCompliance < 70) reasons.push(`Compliance ${c.overallCompliance}%`);
          return { clientId: c.clientId, clientName: c.clientName, avatarUrl: c.avatarUrl, reasons, compliancePct: c.overallCompliance };
        })
        .sort((a, b) => a.compliancePct - b.compliancePct);

      // ── Section 2: Snapshot ──
      const avgTraining = clientMetrics.length > 0 ? Math.round(clientMetrics.reduce((s, c) => s + c.trainingPct, 0) / clientMetrics.length) : 0;
      const avgNutrition = clientMetrics.length > 0 ? Math.round(clientMetrics.reduce((s, c) => s + c.nutritionPct, 0) / clientMetrics.length) : 0;
      const checkinRate = clientMetrics.length > 0 ? Math.round((clientMetrics.filter((c) => c.checkinDone).length / clientMetrics.length) * 100) : 0;
      const atRiskCount = clientMetrics.filter((c) => c.riskScore >= 61).length;

      const snapshot: ComplianceSnapshot = {
        trainingPct: avgTraining,
        nutritionPct: avgNutrition,
        checkinPct: checkinRate,
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
          if (c.missedWorkoutDays >= 3) signals.push("3+ missed workouts");
          if (c.missedNutritionDays >= 3) signals.push("3+ days no nutrition");
          if (c.daysInactive >= 7) signals.push("7d inactive");
          if (!c.checkinDone) signals.push("Missed check-in");
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
      const yesterdayEvents = (yesterdayCalRes.data || [])
        .filter((e) => {
          const effectiveClient = e.target_client_id || e.user_id;
          return clientIds.includes(effectiveClient);
        })
        .map((e) => ({ ...e, effectiveClientId: e.target_client_id || e.user_id }));

      const completedYesterday: YesterdayWorkoutClient[] = [];
      const missedYesterday: YesterdayWorkoutClient[] = [];
      const seenCompleted = new Set<string>();
      const seenMissed = new Set<string>();

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
          if (!seenMissed.has(cid)) { missedYesterday.push(entry); seenMissed.add(cid); }
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

      return { actionItems, snapshot, leaderboard, atRisk, unreadThreads, completedYesterday, missedYesterday, phaseDeadlines };
    },
  });

  if (loading && !data?.actionItems?.length) return <GridSkeleton cards={6} />;
  if ((error || timedOut) && !data?.actionItems?.length) return <RetryBanner onRetry={refetch} />;
  if (!data) return null;

  const { actionItems, snapshot, leaderboard, atRisk, unreadThreads, completedYesterday, missedYesterday } = data;

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
                    onClick={() => navigate("/messages")}
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
                    onClick={() => navigate("/messages")}
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

      {/* ─── SECTION 3: Compliance Snapshot ─── */}
      <div>
        <h2 className="font-display text-lg font-bold text-foreground flex items-center gap-2 mb-3">
          <Activity className="h-5 w-5 text-primary" />
          Compliance Snapshot
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <MetricCard icon={Zap} label="Training" value={`${snapshot.trainingPct}%`} pct={snapshot.trainingPct} />
          <MetricCard icon={UtensilsCrossed} label="Nutrition" value={`${snapshot.nutritionPct}%`} pct={snapshot.nutritionPct} />
          <MetricCard icon={ClipboardCheck} label="Check-ins" value={`${snapshot.checkinPct}%`} pct={snapshot.checkinPct} />
          <MetricCard icon={Users} label="Active" value={String(snapshot.activeClients)} />
          <MetricCard icon={Shield} label="At Risk" value={String(snapshot.atRiskClients)} isAlert={snapshot.atRiskClients > 0} />
        </div>
      </div>

      {/* ─── SECTION 3 & 4: Leaderboard + At-Risk side by side ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Leaderboard */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-display flex items-center gap-2">
              <Trophy className="h-4 w-4 text-primary" />
              Client Leaderboard
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {leaderboard.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">No client data yet.</p>
            ) : (
              leaderboard.map((entry, idx) => (
                <div
                  key={entry.clientId}
                  className="flex items-center gap-3 py-2 px-2 rounded hover:bg-secondary/50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/clients/${entry.clientId}`)}
                >
                  <span className={`text-xs font-bold w-5 text-center ${idx < 3 ? "text-primary" : "text-muted-foreground"}`}>
                    {idx + 1}
                  </span>
                  <UserAvatar src={entry.avatarUrl} name={entry.clientName} className="h-7 w-7" />
                  <span className="text-sm text-foreground flex-1 truncate">{entry.clientName}</span>
                  <span className="text-[10px] text-muted-foreground">{entry.streak}d streak</span>
                  <span className={`text-sm font-bold ${complianceColor(entry.compliancePct)}`}>{entry.compliancePct}%</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

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
