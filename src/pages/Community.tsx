import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useCommunityPosts, useCommunityRealtime } from "@/hooks/useCommunity";
import PostComposer from "@/components/community/PostComposer";
import PostCard from "@/components/community/PostCard";
import Leaderboard from "@/components/community/Leaderboard";
import { Skeleton } from "@/components/ui/skeleton";
import { UsersRound, Megaphone, Trophy } from "lucide-react";

const Community = () => {
  const { role } = useAuth();
  const isCoach = role === "coach" || role === "admin";

  // Real-time sync
  useCommunityRealtime();

  const { data: feedPosts, isLoading: feedLoading } = useCommunityPosts("feed");
  const { data: announcements, isLoading: annLoading } = useCommunityPosts("announcement");

  // Pinned announcements preview for main feed
  const pinnedAnnouncements = (announcements || []).filter((a) => a.is_pinned).slice(0, 3);

  return (
    <AppLayout>
      <div className="animate-fade-in max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Community</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The Physique Crafters community
          </p>
        </div>

        <Tabs defaultValue="feed" className="w-full">
          <TabsList className="w-full bg-secondary/50">
            <TabsTrigger value="feed" className="flex-1 gap-1.5 text-xs">
              <UsersRound className="h-3.5 w-3.5" /> Feed
            </TabsTrigger>
            <TabsTrigger value="announcements" className="flex-1 gap-1.5 text-xs">
              <Megaphone className="h-3.5 w-3.5" /> Announcements
            </TabsTrigger>
            <TabsTrigger value="leaderboard" className="flex-1 gap-1.5 text-xs">
              <Trophy className="h-3.5 w-3.5" /> Leaderboard
            </TabsTrigger>
          </TabsList>

          {/* MAIN FEED */}
          <TabsContent value="feed" className="space-y-4 mt-4">
            {/* Pinned Announcements Strip */}
            {pinnedAnnouncements.length > 0 && (
              <div className="space-y-2">
                {pinnedAnnouncements.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3"
                  >
                    <Megaphone className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-primary">
                        {a.author_name} — Announcement
                      </p>
                      <p className="text-xs text-foreground/80 mt-0.5 line-clamp-2">
                        {a.content}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <PostComposer postType="feed" />

            {feedLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-40 w-full rounded-lg" />
                ))}
              </div>
            ) : (feedPosts || []).length === 0 ? (
              <div className="text-center py-16">
                <UsersRound className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">No posts yet. Be the first to share!</p>
              </div>
            ) : (
              <div className="space-y-4">
                {(feedPosts || []).map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>
            )}
          </TabsContent>

          {/* ANNOUNCEMENTS */}
          <TabsContent value="announcements" className="space-y-4 mt-4">
            {isCoach && <PostComposer postType="announcement" />}

            {annLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 2 }).map((_, i) => (
                  <Skeleton key={i} className="h-40 w-full rounded-lg" />
                ))}
              </div>
            ) : (announcements || []).length === 0 ? (
              <div className="text-center py-16">
                <Megaphone className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">No announcements yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {(announcements || []).map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>
            )}
          </TabsContent>

          {/* LEADERBOARD */}
          <TabsContent value="leaderboard" className="mt-4">
            <Leaderboard />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
};

export default Community;
