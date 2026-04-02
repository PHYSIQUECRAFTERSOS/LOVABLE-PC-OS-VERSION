import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ensureRankedProfile, awardXP, COACH_PRESETS } from "@/utils/rankedXP";
import { toast } from "sonner";

const db = supabase as any;

export function useMyRank() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-rank", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const profile = await ensureRankedProfile(user.id);
      if (!profile) return null;
      const { count } = await db
        .from("ranked_profiles")
        .select("*", { count: "exact", head: true })
        .gt("total_xp", profile.total_xp);
      const { count: total } = await db
        .from("ranked_profiles")
        .select("*", { count: "exact", head: true });
      return {
        ...profile,
        position: (count || 0) + 1,
        totalPlayers: total || 0,
      };
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });
}

async function ensureAllClientsRanked() {
  // Fetch all active client IDs
  const { data: clients } = await db
    .from("coach_clients")
    .select("client_id")
    .eq("status", "active");
  if (!clients?.length) return;

  const clientIds = clients.map((c: any) => c.client_id);

  // Exclude any user who also has a coach/admin/manager role
  const { data: staffRoles } = await db
    .from("user_roles")
    .select("user_id")
    .in("role", ["admin", "coach", "manager"])
    .in("user_id", clientIds);
  const staffSet = new Set((staffRoles || []).map((r: any) => r.user_id));
  const pureClientIds = clientIds.filter((id: string) => !staffSet.has(id));

  // Fetch existing ranked profile user_ids
  const { data: existing } = await db
    .from("ranked_profiles")
    .select("user_id")
    .in("user_id", pureClientIds);

  const existingSet = new Set((existing || []).map((e: any) => e.user_id));
  const missing = pureClientIds.filter((id: string) => !existingSet.has(id));

  if (missing.length > 0) {
    const rows = missing.map((id: string) => ({
      user_id: id,
      placement_status: "pending",
      placement_days_completed: 0,
    }));
    await db.from("ranked_profiles").insert(rows);
  }
}

export function useRankedLeaderboard(tab: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["ranked-leaderboard", tab],
    queryFn: async () => {
      // Auto-populate all clients into ranked_profiles
      await ensureAllClientsRanked();

      // Fetch coach/admin user IDs to exclude from leaderboard
      const { data: coachRoles } = await db
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "coach", "manager"]);
      const coachIds = new Set((coachRoles || []).map((r: any) => r.user_id));

      // Fetch active client IDs to only show active clients
      const { data: activeClients } = await db
        .from("coach_clients")
        .select("client_id")
        .eq("status", "active");
      const activeClientIds = new Set((activeClients || []).map((c: any) => c.client_id));

      let q = db.from("ranked_profiles").select("*");
      if (tab === "all_time" || tab === "divisions") q = q.order("total_xp", { ascending: false });
      else if (tab === "this_week") q = q.order("weekly_xp", { ascending: false });
      else if (tab === "streak") q = q.order("current_streak", { ascending: false });
      else if (tab === "tier_climbers")
        q = q.order("last_rank_up_at", { ascending: false, nullsFirst: false });

      const { data: rankings } = await q.limit(200);
      if (!rankings?.length) return [];

      // Filter out coaches/admins AND inactive/deleted clients
      const clientRankings = rankings.filter((r: any) => !coachIds.has(r.user_id) && activeClientIds.has(r.user_id));

      const ids = clientRankings.map((r: any) => r.user_id);
      if (ids.length === 0) return [];
      const { data: profiles } = await db
        .from("profiles")
        .select("user_id, full_name, avatar_url")
        .in("user_id", ids);
      const profileMap = new Map(
        (profiles || []).map((p: any) => [p.user_id, p])
      );

      // Fetch invite names as fallback for users with empty full_name
      const { data: invites } = await db
        .from("client_invites")
        .select("created_client_id, first_name, last_name, email")
        .in("created_client_id", ids);
      const inviteMap = new Map(
        (invites || []).map((inv: any) => [inv.created_client_id, inv])
      );

      return clientRankings.map((r: any, i: number) => {
        const prof = profileMap.get(r.user_id) as any;
        const invite = inviteMap.get(r.user_id) as any;
        const profileName = prof?.full_name?.trim();
        const inviteName = invite
          ? `${invite.first_name || ""} ${invite.last_name || ""}`.trim()
          : "";
        const emailPrefix = invite?.email
          ? invite.email.split("@")[0]
          : "";
        const resolvedName = profileName || inviteName || emailPrefix || "Member";

        return {
          ...r,
          rank: i + 1,
          name: resolvedName,
          avatar_url: prof?.avatar_url || null,
          isMe: r.user_id === user?.id,
        };
      });
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });
}

export function useXPHistory(userId?: string, limit = 50) {
  const { user } = useAuth();
  const id = userId || user?.id;
  return useQuery({
    queryKey: ["xp-history", id, limit],
    queryFn: async () => {
      const { data } = await db
        .from("xp_transactions")
        .select("*")
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .limit(limit);
      return data || [];
    },
    enabled: !!id,
    staleTime: 15_000,
  });
}

export function useMyBadges(userId?: string) {
  const { user } = useAuth();
  const id = userId || user?.id;
  return useQuery({
    queryKey: ["ranked-badges", id],
    queryFn: async () => {
      const { data } = await db
        .from("ranked_user_badges")
        .select("*, ranked_badges(*)")
        .eq("user_id", id);
      return data || [];
    },
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useCoachAwardXP() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      clientId,
      preset,
      customAmount,
      customNote,
    }: {
      clientId: string;
      preset?: string;
      customAmount?: number;
      customNote?: string;
    }) => {
      const presetCfg = preset
        ? COACH_PRESETS[preset as keyof typeof COACH_PRESETS]
        : null;
      const amount = presetCfg ? presetCfg.xp : customAmount || 10;
      const desc = presetCfg
        ? `Coach Award: ${presetCfg.label}`
        : `Coach Award: ${customNote || "Custom"}`;
      const result = await awardXP(clientId, "coach_award", amount, desc, {
        coachId: user?.id,
        coachPreset: preset || "custom",
        coachNote: customNote || presetCfg?.label || "",
      });
      if (!result) throw new Error("Failed to award XP");
      return result;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["ranked-leaderboard"] });
      qc.invalidateQueries({ queryKey: ["my-rank"] });
      qc.invalidateQueries({ queryKey: ["xp-history", vars.clientId] });
      toast.success("XP awarded successfully");
    },
    onError: () => toast.error("Failed to award XP"),
  });
}

export function useAtRiskClients() {
  const { user, role } = useAuth();
  return useQuery({
    queryKey: ["ranked-at-risk"],
    queryFn: async () => {
      const { data: clients } = await db
        .from("coach_clients")
        .select("client_id")
        .eq("coach_id", user?.id)
        .eq("status", "active");
      if (!clients?.length) return [];
      const clientIds = clients.map((c: any) => c.client_id);

      const { data: profiles } = await db
        .from("ranked_profiles")
        .select("*")
        .in("user_id", clientIds);

      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const { data: losses } = await db
        .from("xp_transactions")
        .select("user_id, created_at")
        .in("user_id", clientIds)
        .lt("xp_amount", 0)
        .gte("created_at", weekAgo.toISOString());

      const lossDays: Record<string, Set<string>> = {};
      (losses || []).forEach((l: any) => {
        if (!lossDays[l.user_id]) lossDays[l.user_id] = new Set();
        lossDays[l.user_id].add(
          new Date(l.created_at).toLocaleDateString("en-CA")
        );
      });

      const { data: names } = await db
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", clientIds);
      const nameMap = new Map(
        (names || []).map((n: any) => [n.user_id, n.full_name])
      );

      return (profiles || [])
        .filter((p: any) => {
          const days = lossDays[p.user_id]?.size || 0;
          return days >= 3 || (p.current_streak === 0 && p.last_active_date);
        })
        .map((p: any) => ({
          ...p,
          name: nameMap.get(p.user_id) || "Unknown",
          lossDays: lossDays[p.user_id]?.size || 0,
        }))
        .sort((a: any, b: any) => b.lossDays - a.lossDays);
    },
    enabled: !!user?.id && (role === "coach" || role === "admin"),
    staleTime: 60_000,
  });
}

export function useTopMovers() {
  const { user, role } = useAuth();
  return useQuery({
    queryKey: ["ranked-top-movers"],
    queryFn: async () => {
      const { data: clients } = await db
        .from("coach_clients")
        .select("client_id")
        .eq("coach_id", user?.id)
        .eq("status", "active");
      if (!clients?.length) return [];
      const clientIds = clients.map((c: any) => c.client_id);

      const { data: profiles } = await db
        .from("ranked_profiles")
        .select("*")
        .in("user_id", clientIds)
        .order("weekly_xp", { ascending: false })
        .limit(20);

      const ids = (profiles || []).map((p: any) => p.user_id);
      const { data: names } = await db
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", ids);
      const nameMap = new Map(
        (names || []).map((n: any) => [n.user_id, n.full_name])
      );
      return (profiles || []).map((p: any) => ({
        ...p,
        name: nameMap.get(p.user_id) || "Unknown",
      }));
    },
    enabled: !!user?.id && (role === "coach" || role === "admin"),
    staleTime: 60_000,
  });
}

export function useStagnantClients() {
  const { user, role } = useAuth();
  return useQuery({
    queryKey: ["ranked-stagnant"],
    queryFn: async () => {
      const { data: clients } = await db
        .from("coach_clients")
        .select("client_id")
        .eq("coach_id", user?.id)
        .eq("status", "active");
      if (!clients?.length) return [];
      const clientIds = clients.map((c: any) => c.client_id);

      const { data: profiles } = await db
        .from("ranked_profiles")
        .select("*")
        .in("user_id", clientIds)
        .gte("inactive_days", 7)
        .order("inactive_days", { ascending: false });

      const ids = (profiles || []).map((p: any) => p.user_id);
      const { data: names } = await db
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", ids);
      const nameMap = new Map(
        (names || []).map((n: any) => [n.user_id, n.full_name])
      );
      return (profiles || []).map((p: any) => ({
        ...p,
        name: nameMap.get(p.user_id) || "Unknown",
      }));
    },
    enabled: !!user?.id && (role === "coach" || role === "admin"),
    staleTime: 60_000,
  });
}
