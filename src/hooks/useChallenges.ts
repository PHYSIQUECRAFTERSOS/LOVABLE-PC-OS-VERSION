import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

// Cast for new tables not yet in auto-generated types
const db = supabase as any;

export interface Challenge {
  id: string;
  created_by: string;
  title: string;
  description: string | null;
  challenge_type: string;
  status: string;
  start_date: string;
  end_date: string;
  config: any;
  xp_reward: number;
  badge_id: string | null;
  max_participants: number | null;
  visibility: string;
  created_at: string;
  updated_at: string;
  participant_count?: number;
  is_joined?: boolean;
}

export interface ChallengeParticipant {
  id: string;
  challenge_id: string;
  user_id: string;
  joined_at: string;
  status: string;
  current_value: number;
  best_value: number;
  xp_earned: number;
  completed_at: string | null;
  rank: number | null;
  full_name?: string;
  avatar_url?: string;
}

export interface Tier {
  id: string;
  name: string;
  min_xp: number;
  color: string;
  icon: string | null;
  sort_order: number;
}

export interface ChallengeTier {
  id: string;
  challenge_id: string;
  name: string;
  min_points: number;
  color: string;
  icon: string;
  sort_order: number;
}

export interface ChallengeScoringRule {
  id: string;
  challenge_id: string;
  action_type: string;
  points: number;
  daily_cap: number;
  is_enabled: boolean;
}

export interface UserXPSummary {
  user_id: string;
  total_xp: number;
  current_tier_id: string | null;
  elite_weeks: number;
  current_streak: number;
  longest_streak: number;
  comebacks: number;
  resets: number;
  lifetime_avg_pct: number;
  full_name?: string;
  avatar_url?: string;
  tier_name?: string;
  tier_color?: string;
}

export interface Badge {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  category: string | null;
}

export interface ChallengeTemplate {
  id: string;
  created_by: string;
  name: string;
  description: string | null;
  challenge_type: string;
  config: any;
  default_duration_days: number | null;
  default_xp_reward: number;
  default_enrollment: string;
  usage_count: number;
  is_archived: boolean;
  created_at: string;
}

// ---- Queries ----

export function useTiers() {
  return useQuery({
    queryKey: ["tiers"],
    queryFn: async () => {
      const { data, error } = await db.from("tiers").select("*").order("sort_order");
      if (error) throw error;
      return data as Tier[];
    },
  });
}

export function useBadges() {
  return useQuery({
    queryKey: ["badges"],
    queryFn: async () => {
      const { data, error } = await db.from("badges").select("*").order("name");
      if (error) throw error;
      return data as Badge[];
    },
  });
}

export function useChallenges() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["challenges"],
    queryFn: async () => {
      const { data: challenges, error } = await db
        .from("challenges")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (!challenges?.length) return [];

      const challengeIds = challenges.map((c: any) => c.id);
      
      // Guard empty array
      let participants: any[] = [];
      if (challengeIds.length > 0) {
        const { data: pData, error: pError } = await db
          .from("challenge_participants")
          .select("challenge_id, user_id")
          .in("challenge_id", challengeIds);
        if (!pError) participants = pData || [];
      }

      return challenges.map((c: any) => {
        const pList = participants.filter((p: any) => p.challenge_id === c.id);
        return {
          ...c,
          participant_count: pList.length,
          is_joined: user ? pList.some((p: any) => p.user_id === user.id) : false,
        } as Challenge;
      });
    },
    enabled: !!user,
  });
}

export function useChallengeDetail(challengeId: string | null) {
  return useQuery({
    queryKey: ["challenge-detail", challengeId],
    queryFn: async () => {
      if (!challengeId) return null;
      const { data, error } = await db
        .from("challenges")
        .select("*")
        .eq("id", challengeId)
        .maybeSingle();
      if (error) throw error;
      return data as Challenge | null;
    },
    enabled: !!challengeId,
  });
}

export function useChallengeParticipants(challengeId: string | null, direction?: string) {
  return useQuery({
    queryKey: ["challenge-participants", challengeId],
    queryFn: async () => {
      if (!challengeId) return [];
      const ascending = direction === "lower_is_better";
      const { data, error } = await db
        .from("challenge_participants")
        .select("*")
        .eq("challenge_id", challengeId)
        .eq("status", "active")
        .order("best_value", { ascending });
      if (error) throw error;
      if (!data?.length) return [];

      const userIds = data.map((p: any) => p.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, avatar_url")
        .in("user_id", userIds);
      const profileMap = Object.fromEntries((profiles || []).map((p: any) => [p.user_id, p]));

      return data.map((p: any, i: number) => ({
        ...p,
        rank: i + 1,
        full_name: profileMap[p.user_id]?.full_name || "Unknown",
        avatar_url: profileMap[p.user_id]?.avatar_url || null,
      })) as ChallengeParticipant[];
    },
    enabled: !!challengeId,
  });
}

export function useChallengeTiers(challengeId: string | null) {
  return useQuery({
    queryKey: ["challenge-tiers", challengeId],
    queryFn: async () => {
      if (!challengeId) return [];
      const { data, error } = await db
        .from("challenge_tiers")
        .select("*")
        .eq("challenge_id", challengeId)
        .order("sort_order");
      if (error) throw error;
      return (data || []) as ChallengeTier[];
    },
    enabled: !!challengeId,
  });
}

export function useChallengeScoringRules(challengeId: string | null) {
  return useQuery({
    queryKey: ["challenge-scoring-rules", challengeId],
    queryFn: async () => {
      if (!challengeId) return [];
      const { data, error } = await db
        .from("challenge_scoring_rules")
        .select("*")
        .eq("challenge_id", challengeId);
      if (error) throw error;
      return (data || []) as ChallengeScoringRule[];
    },
    enabled: !!challengeId,
  });
}

export function useMyXPSummary() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-xp-summary", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await db
        .from("user_xp_summary")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!data) return null;

      let tier_name = "Bronze";
      let tier_color = "#CD7F32";
      if (data.current_tier_id) {
        const { data: tier } = await db
          .from("tiers")
          .select("name, color")
          .eq("id", data.current_tier_id)
          .maybeSingle();
        if (tier) {
          tier_name = tier.name;
          tier_color = tier.color;
        }
      }
      return { ...data, tier_name, tier_color } as UserXPSummary;
    },
    enabled: !!user,
  });
}

export function useMyUserBadges() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-user-badges", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await db
        .from("user_badges")
        .select("*, badges:badge_id(name, icon, description, category)")
        .eq("user_id", user.id)
        .order("earned_at", { ascending: false });
      return data || [];
    },
    enabled: !!user,
  });
}

export interface LeaderboardEntry {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  total_points: number;
  rank: number;
}

export function useChallengeLeaderboard() {
  return useQuery({
    queryKey: ["challenge-leaderboard"],
    queryFn: async () => {
      // Get all active challenges
      const { data: activeChallenges, error: cErr } = await db
        .from("challenges")
        .select("id")
        .eq("status", "active");
      if (cErr) throw cErr;
      if (!activeChallenges?.length) return [];

      const challengeIds = activeChallenges.map((c: any) => c.id);

      // Get all participants from active challenges
      const { data: participants, error: pErr } = await db
        .from("challenge_participants")
        .select("user_id, current_value")
        .in("challenge_id", challengeIds);
      if (pErr) throw pErr;
      if (!participants?.length) return [];

      // Aggregate points per user across all active challenges
      const userPoints: Record<string, number> = {};
      participants.forEach((p: any) => {
        userPoints[p.user_id] = (userPoints[p.user_id] || 0) + (Number(p.current_value) || 0);
      });

      const userIds = Object.keys(userPoints);
      if (!userIds.length) return [];

      // Get profiles
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, avatar_url")
        .in("user_id", userIds);
      const profileMap = Object.fromEntries((profiles || []).map((p: any) => [p.user_id, p]));

      // Build sorted leaderboard
      const entries: LeaderboardEntry[] = userIds
        .map((uid) => ({
          user_id: uid,
          full_name: profileMap[uid]?.full_name || "Unknown",
          avatar_url: profileMap[uid]?.avatar_url || null,
          total_points: userPoints[uid],
          rank: 0,
        }))
        .sort((a, b) => b.total_points - a.total_points);

      entries.forEach((e, i) => { e.rank = i + 1; });

      return entries;
    },
  });
}

// Keep old export name as alias for backward compat
export const useGlobalXPLeaderboard = useChallengeLeaderboard;

// ---- Templates ----

export function useChallengeTemplates() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["challenge-templates"],
    queryFn: async () => {
      const { data, error } = await db
        .from("challenge_templates")
        .select("*")
        .eq("is_archived", false)
        .order("usage_count", { ascending: false });
      if (error) throw error;
      return (data || []) as ChallengeTemplate[];
    },
    enabled: !!user,
  });
}

export function useSaveTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (template: Partial<ChallengeTemplate>) => {
      const { data, error } = await db.from("challenge_templates").insert(template).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["challenge-templates"] });
      toast.success("Template saved! Use it next time you create a challenge.");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ---- Banner Dismissals ----

export function useUndismissedChallenges() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["undismissed-challenges", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data: dismissals } = await db
        .from("challenge_banner_dismissals")
        .select("challenge_id")
        .eq("user_id", user.id);
      const dismissedIds = (dismissals || []).map((d: any) => d.challenge_id);

      const { data: challenges, error } = await db
        .from("challenges")
        .select("*")
        .in("status", ["upcoming", "active"])
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;

      let filtered = (challenges || []).filter((c: any) => !dismissedIds.includes(c.id));

      const inviteOnly = filtered.filter((c: any) => c.visibility === "invite_only");
      if (inviteOnly.length > 0) {
        const { data: myParts } = await db
          .from("challenge_participants")
          .select("challenge_id")
          .eq("user_id", user.id)
          .in("challenge_id", inviteOnly.map((c: any) => c.id));
        const myPartIds = new Set((myParts || []).map((p: any) => p.challenge_id));
        filtered = filtered.filter((c: any) => c.visibility !== "invite_only" || myPartIds.has(c.id));
      }

      return filtered.slice(0, 3) as Challenge[];
    },
    enabled: !!user,
  });
}

export function useDismissBanner() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (challengeId: string) => {
      const { error } = await db
        .from("challenge_banner_dismissals")
        .insert({ user_id: user!.id, challenge_id: challengeId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["undismissed-challenges"] });
    },
  });
}

// ---- Mutations ----

export function useCreateChallenge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (challenge: Partial<Challenge>) => {
      const { data, error } = await db
        .from("challenges")
        .insert(challenge)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["challenges"] });
      qc.invalidateQueries({ queryKey: ["undismissed-challenges"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useJoinChallenge() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (challengeId: string) => {
      const { error } = await db
        .from("challenge_participants")
        .insert({ challenge_id: challengeId, user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: (_: any, challengeId: string) => {
      qc.invalidateQueries({ queryKey: ["challenges"] });
      qc.invalidateQueries({ queryKey: ["challenge-participants", challengeId] });
      toast.success("Joined challenge!");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useRemoveChallengeParticipant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ challengeId, userId }: { challengeId: string; userId: string }) => {
      const { error } = await db
        .from("challenge_participants")
        .delete()
        .eq("challenge_id", challengeId)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: (_: any, { challengeId }: { challengeId: string; userId: string }) => {
      qc.invalidateQueries({ queryKey: ["challenges"] });
      qc.invalidateQueries({ queryKey: ["challenge-participants", challengeId] });
      toast.success("Participant removed.");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useLogChallengeEntry() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation<void, Error, { challengeId: string; value: number; logDate: string; metadata?: any }>({
    mutationFn: async ({ challengeId, value, logDate, metadata }) => {
      const { error: logError } = await db
        .from("challenge_logs")
        .insert({
          challenge_id: challengeId,
          user_id: user!.id,
          log_date: logDate,
          value,
          source: "manual",
          metadata: metadata || null,
        });
      if (logError) throw logError;

      const { data: participant } = await db
        .from("challenge_participants")
        .select("*")
        .eq("challenge_id", challengeId)
        .eq("user_id", user!.id)
        .maybeSingle();

      if (participant) {
        const { data: logs } = await db
          .from("challenge_logs")
          .select("value")
          .eq("challenge_id", challengeId)
          .eq("user_id", user!.id);
        const total = (logs || []).reduce((sum: number, l: any) => sum + Number(l.value), 0);
        const best = Math.max(Number(participant.best_value), value);

        await db
          .from("challenge_participants")
          .update({ current_value: total, best_value: best })
          .eq("id", participant.id);
      }
    },
    onSuccess: (_: any, { challengeId }: { challengeId: string }) => {
      qc.invalidateQueries({ queryKey: ["challenge-participants", challengeId] });
      qc.invalidateQueries({ queryKey: ["challenges"] });
      toast.success("Entry logged!");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useCreateBadge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (badge: { name: string; icon: string; description?: string; category?: string }) => {
      const { data, error } = await db.from("badges").insert(badge).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["badges"] }),
    onError: (e: any) => toast.error(e.message),
  });
}

// ---- Helper: Insert default tiers & scoring rules for a challenge ----

export async function insertDefaultChallengeTiersAndRules(
  challengeId: string,
  scoringRules: { action_type: string; points: number; daily_cap: number; is_enabled: boolean }[],
  tiers: { name: string; min_points: number; color: string; icon: string; sort_order: number }[]
) {
  // Insert tiers
  if (tiers.length > 0) {
    const { error: tierError } = await db.from("challenge_tiers").insert(
      tiers.map((t) => ({ ...t, challenge_id: challengeId }))
    );
    if (tierError) throw tierError;
  }

  // Insert scoring rules
  const enabledRules = scoringRules.filter((r) => r.is_enabled);
  if (enabledRules.length > 0) {
    const { error: ruleError } = await db.from("challenge_scoring_rules").insert(
      enabledRules.map((r) => ({ ...r, challenge_id: challengeId }))
    );
    if (ruleError) throw ruleError;
  }
}

// XP helpers
export async function awardXP(userId: string, amount: number, sourceType: string, sourceId: string | null, description: string) {
  const { error } = await db.from("xp_ledger").insert({
    user_id: userId,
    amount,
    source_type: sourceType,
    source_id: sourceId,
    description,
  });
  if (error) throw error;

  const { data: ledger } = await db
    .from("xp_ledger")
    .select("amount")
    .eq("user_id", userId);
  const totalXP = (ledger || []).reduce((sum: number, l: any) => sum + l.amount, 0);

  const { data: tiers } = await db
    .from("tiers")
    .select("*")
    .order("min_xp", { ascending: false });
  const tier = (tiers || []).find((t: any) => totalXP >= t.min_xp) || tiers?.[tiers.length - 1];

  await db.from("user_xp_summary").upsert({
    user_id: userId,
    total_xp: totalXP,
    current_tier_id: tier?.id || null,
  }, { onConflict: "user_id" });
}

// Default tier presets
export const DEFAULT_CHALLENGE_TIERS = [
  { name: "1 Star", min_points: 0, color: "#FFD700", icon: "star1", sort_order: 0 },
  { name: "2 Stars", min_points: 26, color: "#FFA500", icon: "star2", sort_order: 1 },
  { name: "3 Stars", min_points: 51, color: "#FF6347", icon: "star3", sort_order: 2 },
  { name: "4 Stars", min_points: 76, color: "#DA70D6", icon: "star4", sort_order: 3 },
  { name: "5 Stars", min_points: 101, color: "#00CED1", icon: "star5", sort_order: 4 },
];

export const DEFAULT_SCORING_RULES = [
  { action_type: "workout_completed", points: 1, daily_cap: 1, is_enabled: true },
  { action_type: "personal_best", points: 5, daily_cap: 1, is_enabled: true },
  { action_type: "daily_logging", points: 1, daily_cap: 1, is_enabled: true },
  { action_type: "streak_bonus", points: 3, daily_cap: 1, is_enabled: true },
];

// Auto-score is in src/utils/challengeAutoScore.ts to avoid circular React imports
export { autoScoreChallengePoints } from "@/utils/challengeAutoScore";
