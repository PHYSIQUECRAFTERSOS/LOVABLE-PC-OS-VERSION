import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface CultureProfile {
  user_id: string;
  tier: string;
  total_elite_weeks: number;
  most_improved_count: number;
  comeback_count: number;
  reset_count: number;
  current_streak: number;
  longest_streak: number;
  lifetime_avg: number;
  consistency_active: boolean;
  reset_week_active: boolean;
  reset_week_eligible: boolean;
  // joined
  full_name?: string;
  avatar_url?: string;
  role?: string;
}

export interface WeeklyScore {
  user_id: string;
  week_start: string;
  workout_pct: number;
  nutrition_pct: number;
  checkin_completed: boolean;
  total_score: number;
  // joined
  full_name?: string;
  avatar_url?: string;
  role?: string;
  tier?: string;
  consistency_active?: boolean;
}

export interface CultureBadge {
  id: string;
  user_id: string;
  badge_type: string;
  week_start: string;
  metadata: any;
  created_at: string;
}

export interface Spotlight {
  id: string;
  coach_id: string;
  user_id: string;
  spotlight_type: string;
  week_start: string;
  message: string | null;
  is_active: boolean;
  // joined
  full_name?: string;
  avatar_url?: string;
}

// Get current week start (Monday)
export function getCurrentWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 6 : day - 1;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - diff);
  weekStart.setHours(0, 0, 0, 0);
  return weekStart.toISOString().split("T")[0];
}

export function useCultureLeaderboard() {
  const weekStart = getCurrentWeekStart();
  // Also check previous week since current might not be calculated yet
  const prev = new Date(weekStart);
  prev.setDate(prev.getDate() - 7);
  const prevWeek = prev.toISOString().split("T")[0];

  return useQuery({
    queryKey: ["culture-leaderboard", weekStart],
    queryFn: async () => {
      // Try current week first, fall back to previous
      let { data: scores } = await supabase
        .from("weekly_compliance_scores")
        .select("*")
        .eq("week_start", weekStart)
        .order("total_score", { ascending: false })
        .limit(25);

      if (!scores?.length) {
        const { data: prevScores } = await supabase
          .from("weekly_compliance_scores")
          .select("*")
          .eq("week_start", prevWeek)
          .order("total_score", { ascending: false })
          .limit(25);
        scores = prevScores;
      }

      if (!scores?.length) return [];

      const userIds = scores.map((s) => s.user_id);
      const [profilesRes, rolesRes, cultureRes] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name, avatar_url").in("user_id", userIds),
        supabase.from("user_roles").select("user_id, role").in("user_id", userIds),
        supabase.from("culture_profiles").select("user_id, tier, consistency_active").in("user_id", userIds),
      ]);

      const profileMap = Object.fromEntries((profilesRes.data || []).map((p) => [p.user_id, p]));
      const roleMap = Object.fromEntries((rolesRes.data || []).map((r) => [r.user_id, r.role]));
      const cultureMap = Object.fromEntries((cultureRes.data || []).map((c) => [c.user_id, c]));

      return scores.map((s) => ({
        ...s,
        full_name: profileMap[s.user_id]?.full_name || "Unknown",
        avatar_url: profileMap[s.user_id]?.avatar_url || null,
        role: roleMap[s.user_id] || "client",
        tier: cultureMap[s.user_id]?.tier || "bronze",
        consistency_active: cultureMap[s.user_id]?.consistency_active || false,
      })) as WeeklyScore[];
    },
  });
}

export function useMyCultureProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-culture-profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("culture_profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      return data as CultureProfile | null;
    },
    enabled: !!user,
  });
}

export function useUserCultureProfile(userId: string | null) {
  return useQuery({
    queryKey: ["culture-profile", userId],
    queryFn: async () => {
      if (!userId) return null;
      const [profileRes, badgesRes, nameRes] = await Promise.all([
        supabase.from("culture_profiles").select("*").eq("user_id", userId).maybeSingle(),
        supabase.from("culture_badges").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
        supabase.from("profiles").select("full_name, avatar_url").eq("user_id", userId).maybeSingle(),
      ]);
      return {
        profile: profileRes.data,
        badges: badgesRes.data || [],
        name: nameRes.data?.full_name || "Unknown",
        avatar: nameRes.data?.avatar_url || null,
      };
    },
    enabled: !!userId,
  });
}

export function useMyBadges() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-badges", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("culture_badges")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      return (data || []) as CultureBadge[];
    },
    enabled: !!user,
  });
}

export function useActiveSpotlights() {
  const weekStart = getCurrentWeekStart();
  const prev = new Date(weekStart);
  prev.setDate(prev.getDate() - 7);
  const prevWeek = prev.toISOString().split("T")[0];

  return useQuery({
    queryKey: ["culture-spotlights", weekStart],
    queryFn: async () => {
      let { data } = await supabase
        .from("culture_spotlights")
        .select("*")
        .eq("is_active", true)
        .in("week_start", [weekStart, prevWeek]);

      if (!data?.length) return [];

      const userIds = data.map((s) => s.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, avatar_url")
        .in("user_id", userIds);

      const profileMap = Object.fromEntries((profiles || []).map((p) => [p.user_id, p]));

      return data.map((s) => ({
        ...s,
        full_name: profileMap[s.user_id]?.full_name || "Unknown",
        avatar_url: profileMap[s.user_id]?.avatar_url || null,
      })) as Spotlight[];
    },
  });
}

export function useSetSpotlight() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ userId, spotlightType, message }: { userId: string; spotlightType: string; message?: string }) => {
      const weekStart = getCurrentWeekStart();
      const { error } = await supabase.from("culture_spotlights").upsert({
        coach_id: user!.id,
        user_id: userId,
        spotlight_type: spotlightType,
        week_start: weekStart,
        message: message || null,
        is_active: true,
      }, { onConflict: "spotlight_type,week_start" });
      if (error) throw error;

      // Also give featured_performer badge
      if (spotlightType === "high_performer") {
        await supabase.from("culture_badges").upsert({
          user_id: userId,
          badge_type: "featured_performer",
          week_start: weekStart,
        }, { onConflict: "user_id,badge_type,week_start" });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["culture-spotlights"] });
      qc.invalidateQueries({ queryKey: ["culture-leaderboard"] });
    },
  });
}

export function useActivateResetWeek() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("culture_profiles")
        .update({ reset_week_active: true })
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-culture-profile"] }),
  });
}

export function useCultureMessages() {
  const weekStart = getCurrentWeekStart();
  return useQuery({
    queryKey: ["culture-messages", weekStart],
    queryFn: async () => {
      const { data } = await supabase
        .from("culture_messages")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5);
      return data || [];
    },
  });
}

export function useCreateCultureMessage() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ content, isPinned }: { content: string; isPinned: boolean }) => {
      const weekStart = getCurrentWeekStart();
      const { error } = await supabase.from("culture_messages").insert({
        coach_id: user!.id,
        content,
        week_start: weekStart,
        is_pinned: isPinned,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["culture-messages"] }),
  });
}

export function useAllClients() {
  return useQuery({
    queryKey: ["all-clients-for-spotlight"],
    queryFn: async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id, role");
      const clientIds = (roles || []).filter((r) => r.role === "client").map((r) => r.user_id);
      if (!clientIds.length) return [];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, avatar_url")
        .in("user_id", clientIds);

      return (profiles || []).map((p) => ({
        user_id: p.user_id,
        full_name: p.full_name || "Unknown",
        avatar_url: p.avatar_url,
      }));
    },
  });
}
