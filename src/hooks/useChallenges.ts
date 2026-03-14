import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

// Cast supabase client for new tables not yet in auto-generated types
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
  // joined
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

// ---- Queries ----

export function useTiers() {
  return useQuery({
    queryKey: ["tiers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tiers")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data as Tier[];
    },
  });
}

export function useBadges() {
  return useQuery({
    queryKey: ["badges"],
    queryFn: async () => {
      const { data, error } = await supabase.from("badges").select("*").order("name");
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
      const { data: challenges, error } = await supabase
        .from("challenges")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (!challenges?.length) return [];

      const challengeIds = challenges.map((c) => c.id);
      const { data: participants } = await supabase
        .from("challenge_participants")
        .select("challenge_id, user_id")
        .in("challenge_id", challengeIds);

      return challenges.map((c) => {
        const pList = (participants || []).filter((p) => p.challenge_id === c.id);
        return {
          ...c,
          participant_count: pList.length,
          is_joined: user ? pList.some((p) => p.user_id === user.id) : false,
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
      const { data, error } = await supabase
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

export function useChallengeParticipants(challengeId: string | null) {
  return useQuery({
    queryKey: ["challenge-participants", challengeId],
    queryFn: async () => {
      if (!challengeId) return [];
      const { data, error } = await supabase
        .from("challenge_participants")
        .select("*")
        .eq("challenge_id", challengeId)
        .eq("status", "active")
        .order("best_value", { ascending: false });
      if (error) throw error;
      if (!data?.length) return [];

      const userIds = data.map((p) => p.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, avatar_url")
        .in("user_id", userIds);
      const profileMap = Object.fromEntries((profiles || []).map((p) => [p.user_id, p]));

      return data.map((p, i) => ({
        ...p,
        rank: i + 1,
        full_name: profileMap[p.user_id]?.full_name || "Unknown",
        avatar_url: profileMap[p.user_id]?.avatar_url || null,
      })) as ChallengeParticipant[];
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
      const { data } = await supabase
        .from("user_xp_summary")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!data) return null;

      let tier_name = "Bronze";
      let tier_color = "#CD7F32";
      if (data.current_tier_id) {
        const { data: tier } = await supabase
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
      const { data } = await supabase
        .from("user_badges")
        .select("*, badges:badge_id(name, icon, description, category)")
        .eq("user_id", user.id)
        .order("earned_at", { ascending: false });
      return data || [];
    },
    enabled: !!user,
  });
}

export function useGlobalXPLeaderboard() {
  return useQuery({
    queryKey: ["global-xp-leaderboard"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_xp_summary")
        .select("*")
        .order("total_xp", { ascending: false })
        .limit(50);
      if (error) throw error;
      if (!data?.length) return [];

      const userIds = data.map((d) => d.user_id);
      const [profilesRes, tiersRes] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name, avatar_url").in("user_id", userIds),
        supabase.from("tiers").select("*").order("sort_order"),
      ]);

      const profileMap = Object.fromEntries((profilesRes.data || []).map((p) => [p.user_id, p]));
      const tiers = tiersRes.data || [];

      return data.map((d) => {
        const tier = d.current_tier_id
          ? tiers.find((t) => t.id === d.current_tier_id)
          : tiers[0];
        return {
          ...d,
          full_name: profileMap[d.user_id]?.full_name || "Unknown",
          avatar_url: profileMap[d.user_id]?.avatar_url || null,
          tier_name: tier?.name || "Bronze",
          tier_color: tier?.color || "#CD7F32",
        } as UserXPSummary;
      });
    },
  });
}

// ---- Mutations ----

export function useCreateChallenge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (challenge: Partial<Challenge>) => {
      const { data, error } = await supabase
        .from("challenges")
        .insert(challenge as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["challenges"] });
      toast.success("Challenge created!");
    },
    onError: (e) => toast.error(e.message),
  });
}

export function useJoinChallenge() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (challengeId: string) => {
      const { error } = await supabase
        .from("challenge_participants")
        .insert({ challenge_id: challengeId, user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: (_, challengeId) => {
      qc.invalidateQueries({ queryKey: ["challenges"] });
      qc.invalidateQueries({ queryKey: ["challenge-participants", challengeId] });
      toast.success("Joined challenge!");
    },
    onError: (e) => toast.error(e.message),
  });
}

export function useLogChallengeEntry() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ challengeId, value, logDate }: { challengeId: string; value: number; logDate: string }) => {
      // Insert log
      const { error: logError } = await supabase
        .from("challenge_logs")
        .insert({ challenge_id: challengeId, user_id: user!.id, log_date: logDate, value, source: "manual" });
      if (logError) throw logError;

      // Update participant best_value and current_value
      const { data: participant } = await supabase
        .from("challenge_participants")
        .select("*")
        .eq("challenge_id", challengeId)
        .eq("user_id", user!.id)
        .maybeSingle();

      if (participant) {
        // For steps: aggregate total
        const { data: logs } = await supabase
          .from("challenge_logs")
          .select("value")
          .eq("challenge_id", challengeId)
          .eq("user_id", user!.id);
        const total = (logs || []).reduce((sum, l) => sum + Number(l.value), 0);
        const best = Math.max(Number(participant.best_value), value);

        await supabase
          .from("challenge_participants")
          .update({ current_value: total, best_value: best })
          .eq("id", participant.id);
      }
    },
    onSuccess: (_, { challengeId }) => {
      qc.invalidateQueries({ queryKey: ["challenge-participants", challengeId] });
      qc.invalidateQueries({ queryKey: ["challenges"] });
      toast.success("Entry logged!");
    },
    onError: (e) => toast.error(e.message),
  });
}

export function useCreateBadge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (badge: { name: string; icon: string; description?: string; category?: string }) => {
      const { data, error } = await supabase.from("badges").insert(badge).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["badges"] }),
    onError: (e) => toast.error(e.message),
  });
}

// XP helpers
export async function awardXP(userId: string, amount: number, sourceType: string, sourceId: string | null, description: string) {
  const { error } = await supabase.from("xp_ledger").insert({
    user_id: userId,
    amount,
    source_type: sourceType,
    source_id: sourceId,
    description,
  });
  if (error) throw error;

  // Recalculate total XP
  const { data: ledger } = await supabase
    .from("xp_ledger")
    .select("amount")
    .eq("user_id", userId);
  const totalXP = (ledger || []).reduce((sum, l) => sum + l.amount, 0);

  // Get correct tier
  const { data: tiers } = await supabase
    .from("tiers")
    .select("*")
    .order("min_xp", { ascending: false });
  const tier = (tiers || []).find((t) => totalXP >= t.min_xp) || tiers?.[tiers.length - 1];

  await supabase.from("user_xp_summary").upsert({
    user_id: userId,
    total_xp: totalXP,
    current_tier_id: tier?.id || null,
  }, { onConflict: "user_id" });
}
