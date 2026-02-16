import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Trash2, Send } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCommunityComments, useAddComment, useDeleteComment } from "@/hooks/useCommunity";
import { formatDistanceToNow } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

interface CommentThreadProps {
  postId: string;
  locked: boolean;
}

const CommentThread = ({ postId, locked }: CommentThreadProps) => {
  const { user, role } = useAuth();
  const isCoach = role === "coach" || role === "admin";
  const { data: comments, isLoading } = useCommunityComments(postId);
  const addComment = useAddComment();
  const deleteComment = useDeleteComment();
  const [text, setText] = useState("");

  const handleSubmit = () => {
    if (!text.trim()) return;
    addComment.mutate({ postId, content: text.trim() });
    setText("");
  };

  return (
    <div className="border-t border-border pt-3 space-y-3">
      {isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-3/4" />
        </div>
      )}

      {(comments || []).map((c) => {
        const initials = (c.author_name || "U").split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
        const isCommentCoach = c.author_role === "coach" || c.author_role === "admin";
        const canDelete = user?.id === c.author_id || isCoach;

        return (
          <div key={c.id} className="flex items-start gap-2.5 group">
            <Avatar className="h-7 w-7">
              {c.author_avatar && <AvatarImage src={c.author_avatar} />}
              <AvatarFallback className={`text-[10px] ${isCommentCoach ? "bg-primary/20 text-primary" : "bg-secondary text-foreground"}`}>
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-foreground">{c.author_name}</span>
                {isCommentCoach && (
                  <Badge variant="outline" className="border-primary/30 text-primary text-[8px] px-1 py-0 leading-tight">
                    Coach
                  </Badge>
                )}
                <span className="text-[10px] text-muted-foreground">
                  {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                </span>
              </div>
              <p className="text-xs text-foreground/80 mt-0.5">{c.content}</p>
            </div>
            {canDelete && (
              <button
                onClick={() => deleteComment.mutate({ commentId: c.id, postId })}
                className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-all"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
        );
      })}

      {!locked ? (
        <div className="flex gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="Write a comment..."
            className="h-8 text-xs bg-secondary/50"
          />
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0 text-primary"
            onClick={handleSubmit}
            disabled={!text.trim() || addComment.isPending}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">Comments are locked on this post.</p>
      )}
    </div>
  );
};

export default CommentThread;
