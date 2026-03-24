import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UsersRound, MessageSquare, Heart, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useDataFetch } from "@/hooks/useDataFetch";
import { formatDistanceToNow } from "date-fns";

interface CommunityPost {
  id: string;
  content: string;
  created_at: string;
  author_id: string;
  author_name: string;
  author_avatar: string | null;
  like_count: number;
  comment_count: number;
}

const CommunityQuickAccess = () => {
  const navigate = useNavigate();

  const { data: posts, loading } = useDataFetch<CommunityPost[]>({
    queryKey: "community-quick-access",
    staleTime: 2 * 60 * 1000,
    timeout: 5000,
    fallback: [],
    queryFn: async (signal) => {
      const { data: rawPosts, error } = await supabase
        .from("community_posts")
        .select("id, content, created_at, author_id")
        .order("created_at", { ascending: false })
        .limit(3)
        .abortSignal(signal);

      if (error || !rawPosts?.length) return [];

      const authorIds = [...new Set(rawPosts.map((p) => p.author_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, avatar_url")
        .in("user_id", authorIds)
        .abortSignal(signal);

      const profileMap = new Map(
        (profiles || []).map((p) => [p.user_id, p])
      );

      // Get like + comment counts
      const postIds = rawPosts.map((p) => p.id);
      const [likesRes, commentsRes] = await Promise.all([
        supabase
          .from("community_likes")
          .select("post_id")
          .in("post_id", postIds)
          .abortSignal(signal),
        supabase
          .from("community_comments")
          .select("post_id")
          .in("post_id", postIds)
          .abortSignal(signal),
      ]);

      const likeCounts = new Map<string, number>();
      const commentCounts = new Map<string, number>();
      (likesRes.data || []).forEach((l) =>
        likeCounts.set(l.post_id, (likeCounts.get(l.post_id) || 0) + 1)
      );
      (commentsRes.data || []).forEach((c) =>
        commentCounts.set(c.post_id, (commentCounts.get(c.post_id) || 0) + 1)
      );

      return rawPosts.map((p) => {
        const profile = profileMap.get(p.author_id);
        return {
          id: p.id,
          content: p.content,
          created_at: p.created_at,
          author_id: p.author_id,
          author_name: profile?.full_name || "Member",
          author_avatar: profile?.avatar_url || null,
          like_count: likeCounts.get(p.id) || 0,
          comment_count: commentCounts.get(p.id) || 0,
        };
      });
    },
  });

  if (loading) return null;

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <UsersRound className="h-4 w-4 shrink-0" />
            Community
          </CardTitle>
          <button
            onClick={() => navigate("/community")}
            className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            View All <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {(!posts || posts.length === 0) ? (
          <button
            onClick={() => navigate("/community")}
            className="w-full text-center py-4"
          >
            <p className="text-sm text-muted-foreground">
              No posts yet — be the first to share
            </p>
          </button>
        ) : (
          posts.map((post) => (
            <button
              key={post.id}
              onClick={() => navigate("/community")}
              className="flex items-start gap-3 w-full text-left rounded-lg p-2 -mx-2 hover:bg-secondary/50 transition-colors"
            >
              {/* Avatar */}
              <div className="h-8 w-8 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
                {post.author_avatar ? (
                  <img
                    src={post.author_avatar}
                    alt=""
                    className="h-8 w-8 rounded-full object-cover"
                  />
                ) : (
                  <span className="text-[10px] font-bold text-primary">
                    {getInitials(post.author_name)}
                  </span>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground truncate">
                    {post.author_name}
                  </span>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                  {post.content}
                </p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Heart className="h-3 w-3" /> {post.like_count}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <MessageSquare className="h-3 w-3" /> {post.comment_count}
                  </span>
                </div>
              </div>
            </button>
          ))
        )}
      </CardContent>
    </Card>
  );
};

export default CommunityQuickAccess;
