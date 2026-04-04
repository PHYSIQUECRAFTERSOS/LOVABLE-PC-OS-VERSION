import { useState } from "react";
import PhotoLightbox from "@/components/ui/photo-lightbox";
import { Heart, MessageCircle, Bookmark, Pin, MoreHorizontal, Trash2, Lock, Flag, Star, Sparkles } from "lucide-react";
import UserAvatar from "@/components/profile/UserAvatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import {
  CommunityPost,
  useToggleLike,
  useToggleSave,
  useDeletePost,
  useTogglePin,
  useToggleLockComments,
  useReportPost,
  useSpotlightPost,
} from "@/hooks/useCommunity";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import CommentThread from "./CommentThread";
import CommunityPostContent from "./CommunityPostContent";

interface PostCardProps {
  post: CommunityPost;
}

const PostCard = ({ post }: PostCardProps) => {
  const { user, role } = useAuth();
  const isCoach = role === "coach" || role === "admin";
  const isOwner = user?.id === post.author_id;
  const [showComments, setShowComments] = useState(false);

  const toggleLike = useToggleLike();
  const toggleSave = useToggleSave();
  const deletePost = useDeletePost();
  const togglePin = useTogglePin();
  const toggleLock = useToggleLockComments();
  const reportPost = useReportPost();
  const spotlightPost = useSpotlightPost();

  const initials = (post.author_name || "U")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const roleBadge = post.author_role === "coach" || post.author_role === "admin";

  return (
    <div
      className={`rounded-lg border bg-card p-4 space-y-3 transition-all ${
        post.is_pinned ? "border-primary/40 ring-1 ring-primary/20" : "border-border"
      } ${post.is_spotlight ? "glow-gold" : ""}`}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <UserAvatar
          src={post.author_avatar}
          name={post.author_name}
          className="h-10 w-10"
          fallbackClassName={roleBadge ? "bg-primary/20 text-primary" : undefined}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground">{post.author_name}</span>
            {roleBadge && (
              <Badge variant="outline" className="border-primary/30 text-primary text-[10px] px-1.5 py-0">
                Coach
              </Badge>
            )}
            {post.is_pinned && <Pin className="h-3 w-3 text-primary" />}
            {post.is_spotlight && <Sparkles className="h-3 w-3 text-primary" />}
            {post.comments_locked && <Lock className="h-3 w-3 text-muted-foreground" />}
          </div>
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
          </span>
        </div>

        {/* Actions Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-card border-border">
            {(isOwner || isCoach) && (
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => {
                  deletePost.mutate(post.id);
                  toast.success("Post deleted");
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" /> Delete
              </DropdownMenuItem>
            )}
            {isCoach && (
              <>
                <DropdownMenuItem onClick={() => togglePin.mutate({ postId: post.id, pinned: post.is_pinned })}>
                  <Pin className="h-4 w-4 mr-2" /> {post.is_pinned ? "Unpin" : "Pin"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => toggleLock.mutate({ postId: post.id, locked: post.comments_locked })}>
                  <Lock className="h-4 w-4 mr-2" /> {post.comments_locked ? "Unlock Comments" : "Lock Comments"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => spotlightPost.mutate({ postId: post.id, spotlight: post.is_spotlight })}>
                  <Star className="h-4 w-4 mr-2" /> {post.is_spotlight ? "Remove Spotlight" : "Spotlight"}
                </DropdownMenuItem>
              </>
            )}
            {!isOwner && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    reportPost.mutate({ postId: post.id, reason: "Reported by user" });
                    toast.success("Post reported");
                  }}
                >
                  <Flag className="h-4 w-4 mr-2" /> Report
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Content */}
      <CommunityPostContent content={post.content} />

      {/* Media */}
      {post.media_url && post.media_type === "image" && (
        <CommunityImageWithLightbox src={post.media_url} />
      )}
      {post.media_url && post.media_type === "video" && (
        <div className="rounded-md overflow-hidden border border-border">
          <video src={post.media_url} controls className="w-full max-h-96" />
        </div>
      )}

      {/* Interaction Bar */}
      <div className="flex items-center gap-1 pt-1">
        <Button
          variant="ghost"
          size="sm"
          className={`gap-1.5 text-xs ${post.user_liked ? "text-primary" : "text-muted-foreground"}`}
          onClick={() => toggleLike.mutate({ postId: post.id, liked: !!post.user_liked })}
        >
          <Heart className={`h-4 w-4 ${post.user_liked ? "fill-primary" : ""}`} />
          {(post.like_count || 0) > 0 && post.like_count}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-xs text-muted-foreground"
          onClick={() => setShowComments(!showComments)}
        >
          <MessageCircle className="h-4 w-4" />
          {(post.comment_count || 0) > 0 && post.comment_count}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={`gap-1.5 text-xs ml-auto ${post.user_saved ? "text-primary" : "text-muted-foreground"}`}
          onClick={() => toggleSave.mutate({ postId: post.id, saved: !!post.user_saved })}
        >
          <Bookmark className={`h-4 w-4 ${post.user_saved ? "fill-primary" : ""}`} />
        </Button>
      </div>

      {/* Comments */}
      {showComments && <CommentThread postId={post.id} locked={post.comments_locked} />}
    </div>
  );
};

export default PostCard;
