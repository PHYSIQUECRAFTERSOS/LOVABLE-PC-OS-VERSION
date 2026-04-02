import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";

export interface CommunityPost {
  id: string;
  author_id: string;
  content: string;
  post_type: "feed" | "announcement";
  media_url: string | null;
  media_type: string | null;
  is_pinned: boolean;
  is_spotlight: boolean;
  comments_locked: boolean;
  created_at: string;
  updated_at: string;
  // joined
  author_name?: string;
  author_avatar?: string;
  author_role?: string;
  like_count?: number;
  comment_count?: number;
  user_liked?: boolean;
  user_saved?: boolean;
}

export interface CommunityComment {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author_name?: string;
  author_avatar?: string;
  author_role?: string;
}

export interface EngagementStats {
  user_id: string;
  total_posts: number;
  total_comments: number;
  total_likes_received: number;
  engagement_score: number;
  current_streak: number;
  longest_streak: number;
  badges: any[];
  posting_restricted: boolean;
  // joined
  full_name?: string;
  avatar_url?: string;
  role?: string;
}

export function useCommunityPosts(postType: "feed" | "announcement" | "all" = "all") {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["community-posts", postType],
    queryFn: async () => {
      let query = supabase
        .from("community_posts")
        .select("*")
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });

      if (postType !== "all") {
        query = query.eq("post_type", postType);
      }

      const { data: posts, error } = await query;
      if (error) throw error;

      // Enrich with profiles, likes, comments
      const authorIds = [...new Set((posts || []).map((p) => p.author_id))];
      const postIds = (posts || []).map((p) => p.id);

      const [profilesRes, rolesRes, likesRes, commentsRes, savedRes, userLikesRes] =
        await Promise.all([
          supabase.from("profiles").select("user_id, full_name, avatar_url").in("user_id", authorIds.length ? authorIds : [""]),
          supabase.from("user_roles").select("user_id, role").in("user_id", authorIds.length ? authorIds : [""]),
          supabase.from("community_likes").select("post_id").in("post_id", postIds.length ? postIds : [""]),
          supabase.from("community_comments").select("post_id").in("post_id", postIds.length ? postIds : [""]),
          user ? supabase.from("community_saved_posts").select("post_id").eq("user_id", user.id).in("post_id", postIds.length ? postIds : [""]) : Promise.resolve({ data: [] }),
          user ? supabase.from("community_likes").select("post_id").eq("user_id", user.id).in("post_id", postIds.length ? postIds : [""]) : Promise.resolve({ data: [] }),
        ]);

      const profileMap = Object.fromEntries((profilesRes.data || []).map((p) => [p.user_id, p]));
      const roleMap = Object.fromEntries((rolesRes.data || []).map((r) => [r.user_id, r.role]));

      // Count likes and comments per post
      const likeCounts: Record<string, number> = {};
      (likesRes.data || []).forEach((l) => { likeCounts[l.post_id] = (likeCounts[l.post_id] || 0) + 1; });
      const commentCounts: Record<string, number> = {};
      (commentsRes.data || []).forEach((c) => { commentCounts[c.post_id] = (commentCounts[c.post_id] || 0) + 1; });

      const savedSet = new Set((savedRes.data || []).map((s: any) => s.post_id));
      const likedSet = new Set((userLikesRes.data || []).map((l: any) => l.post_id));

      return (posts || []).map((p) => ({
        ...p,
        author_name: profileMap[p.author_id]?.full_name || "Unknown",
        author_avatar: profileMap[p.author_id]?.avatar_url || null,
        author_role: roleMap[p.author_id] || "client",
        like_count: likeCounts[p.id] || 0,
        comment_count: commentCounts[p.id] || 0,
        user_liked: likedSet.has(p.id),
        user_saved: savedSet.has(p.id),
      })) as CommunityPost[];
    },
    enabled: !!user,
  });
}

export function useCommunityComments(postId: string | null) {
  return useQuery({
    queryKey: ["community-comments", postId],
    queryFn: async () => {
      if (!postId) return [];
      const { data: comments, error } = await supabase
        .from("community_comments")
        .select("*")
        .eq("post_id", postId)
        .order("created_at", { ascending: true });
      if (error) throw error;

      const authorIds = [...new Set((comments || []).map((c) => c.author_id))];
      const [profilesRes, rolesRes] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name, avatar_url").in("user_id", authorIds.length ? authorIds : [""]),
        supabase.from("user_roles").select("user_id, role").in("user_id", authorIds.length ? authorIds : [""]),
      ]);

      const profileMap = Object.fromEntries((profilesRes.data || []).map((p) => [p.user_id, p]));
      const roleMap = Object.fromEntries((rolesRes.data || []).map((r) => [r.user_id, r.role]));

      return (comments || []).map((c) => ({
        ...c,
        author_name: profileMap[c.author_id]?.full_name || "Unknown",
        author_avatar: profileMap[c.author_id]?.avatar_url || null,
        author_role: roleMap[c.author_id] || "client",
      })) as CommunityComment[];
    },
    enabled: !!postId,
  });
}

export function useLeaderboard() {
  return useQuery({
    queryKey: ["community-leaderboard"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_user_stats")
        .select("*")
        .order("engagement_score", { ascending: false })
        .limit(30);
      if (error) throw error;

      const userIds = (data || []).map((s) => s.user_id);
      const [profilesRes, rolesRes, activeClientsRes] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name, avatar_url").in("user_id", userIds.length ? userIds : [""]),
        supabase.from("user_roles").select("user_id, role").in("user_id", userIds.length ? userIds : [""]),
        (supabase as any).from("coach_clients").select("client_id").eq("status", "active"),
      ]);

      const profileMap = Object.fromEntries((profilesRes.data || []).map((p) => [p.user_id, p]));
      const roleMap = Object.fromEntries((rolesRes.data || []).map((r) => [r.user_id, r.role]));
      const activeClientIds = new Set((activeClientsRes.data || []).map((c: any) => c.client_id));
      const coachRoles = new Set(["admin", "coach", "manager"]);

      // Only include active clients and coaches/admins (staff always visible)
      const filtered = (data || []).filter((s) => {
        const role = roleMap[s.user_id];
        if (coachRoles.has(role)) return true;
        return activeClientIds.has(s.user_id);
      });

      return filtered.slice(0, 10).map((s) => ({
        ...s,
        full_name: profileMap[s.user_id]?.full_name || "Unknown",
        avatar_url: profileMap[s.user_id]?.avatar_url || null,
        role: roleMap[s.user_id] || "client",
      })) as EngagementStats[];
    },
  });
}

export function useCreatePost() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ content, postType, mediaUrl, mediaType }: { content: string; postType: "feed" | "announcement"; mediaUrl?: string; mediaType?: string }) => {
      const { error } = await supabase.from("community_posts").insert({
        author_id: user!.id,
        content,
        post_type: postType,
        media_url: mediaUrl || null,
        media_type: mediaType || null,
      });
      if (error) throw error;
      // Update engagement
      await supabase.rpc("recalc_engagement_score", { _user_id: user!.id });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["community-posts"] });
      qc.invalidateQueries({ queryKey: ["community-leaderboard"] });
    },
  });
}

export function useToggleLike() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ postId, liked }: { postId: string; liked: boolean }) => {
      if (liked) {
        await supabase.from("community_likes").delete().eq("post_id", postId).eq("user_id", user!.id);
      } else {
        await supabase.from("community_likes").insert({ post_id: postId, user_id: user!.id });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["community-posts"] });
    },
  });
}

export function useAddComment() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ postId, content }: { postId: string; content: string }) => {
      const { error } = await supabase.from("community_comments").insert({
        post_id: postId,
        author_id: user!.id,
        content,
      });
      if (error) throw error;
      await supabase.rpc("recalc_engagement_score", { _user_id: user!.id });
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["community-comments", vars.postId] });
      qc.invalidateQueries({ queryKey: ["community-posts"] });
    },
  });
}

export function useDeletePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (postId: string) => {
      const { error } = await supabase.from("community_posts").delete().eq("id", postId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["community-posts"] }),
  });
}

export function useDeleteComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ commentId, postId }: { commentId: string; postId: string }) => {
      const { error } = await supabase.from("community_comments").delete().eq("id", commentId);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["community-comments", vars.postId] });
      qc.invalidateQueries({ queryKey: ["community-posts"] });
    },
  });
}

export function useToggleSave() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ postId, saved }: { postId: string; saved: boolean }) => {
      if (saved) {
        await supabase.from("community_saved_posts").delete().eq("post_id", postId).eq("user_id", user!.id);
      } else {
        await supabase.from("community_saved_posts").insert({ post_id: postId, user_id: user!.id });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["community-posts"] }),
  });
}

export function useTogglePin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ postId, pinned }: { postId: string; pinned: boolean }) => {
      const { error } = await supabase.from("community_posts").update({ is_pinned: !pinned }).eq("id", postId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["community-posts"] }),
  });
}

export function useToggleLockComments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ postId, locked }: { postId: string; locked: boolean }) => {
      const { error } = await supabase.from("community_posts").update({ comments_locked: !locked }).eq("id", postId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["community-posts"] }),
  });
}

export function useReportPost() {
  return useMutation({
    mutationFn: async ({ postId, reason }: { postId: string; reason: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("community_reports").insert({
        post_id: postId,
        reporter_id: user!.id,
        reason,
      });
      if (error) throw error;
    },
  });
}

export function useSpotlightPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ postId, spotlight }: { postId: string; spotlight: boolean }) => {
      const { error } = await supabase.from("community_posts").update({ is_spotlight: !spotlight }).eq("id", postId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["community-posts"] }),
  });
}

export function useCommunityRealtime() {
  const qc = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("community-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "community_posts" }, () => {
        qc.invalidateQueries({ queryKey: ["community-posts"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "community_comments" }, () => {
        qc.invalidateQueries({ queryKey: ["community-comments"] });
        qc.invalidateQueries({ queryKey: ["community-posts"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "community_likes" }, () => {
        qc.invalidateQueries({ queryKey: ["community-posts"] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [qc]);
}
