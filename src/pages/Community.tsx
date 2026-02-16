import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Heart, MessageCircle, Pin, Megaphone, Hash, ImagePlus } from "lucide-react";
import { useState } from "react";

const samplePosts = [
  {
    id: "1",
    author: "Coach Mike",
    initials: "CM",
    content: "💪 New challenge dropping this Monday! Who's ready to commit to 30 days of consistency?",
    isPinned: true,
    isCoach: true,
    likes: 24,
    comments: 8,
    timeAgo: "2h ago",
  },
  {
    id: "2",
    author: "Sarah K.",
    initials: "SK",
    content: "Hit a new PR on deadlifts today — 275lbs! This program is absolutely working. Thank you team 🔥",
    isPinned: false,
    isCoach: false,
    likes: 31,
    comments: 12,
    timeAgo: "4h ago",
  },
  {
    id: "3",
    author: "Coach Alex",
    initials: "CA",
    content: "📢 Reminder: Weekly check-ins are due by Sunday 9pm. Don't forget your progress photos and biofeedback scores.",
    isPinned: true,
    isCoach: true,
    likes: 15,
    comments: 3,
    timeAgo: "1d ago",
  },
];

const Community = () => {
  const { role } = useAuth();
  const isCoach = role === "coach" || role === "admin";
  const [newPost, setNewPost] = useState("");

  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6 max-w-3xl mx-auto">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Community</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The Physique Crafters community feed
          </p>
        </div>

        {/* Post Composer */}
        <Card className="border-border bg-card">
          <CardContent className="pt-4 space-y-3">
            <Textarea
              placeholder="Share an update with the community..."
              value={newPost}
              onChange={(e) => setNewPost(e.target.value)}
              className="min-h-[80px] resize-none bg-background"
            />
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="text-muted-foreground">
                  <ImagePlus className="h-4 w-4 mr-1" /> Media
                </Button>
                <Button variant="ghost" size="sm" className="text-muted-foreground">
                  <Hash className="h-4 w-4 mr-1" /> Tag
                </Button>
              </div>
              <Button size="sm" disabled={!newPost.trim()}>Post</Button>
            </div>
          </CardContent>
        </Card>

        {/* Feed */}
        <div className="space-y-4">
          {samplePosts.map((post) => (
            <Card key={post.id} className={`border-border bg-card ${post.isPinned ? "ring-1 ring-primary/30" : ""}`}>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-start gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className={post.isCoach ? "bg-primary/20 text-primary" : "bg-secondary text-foreground"}>
                      {post.initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{post.author}</span>
                      {post.isCoach && (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/10 text-primary">Coach</span>
                      )}
                      {post.isPinned && <Pin className="h-3 w-3 text-primary" />}
                      <span className="text-xs text-muted-foreground ml-auto">{post.timeAgo}</span>
                    </div>
                    <p className="mt-1.5 text-sm text-foreground/90 leading-relaxed">{post.content}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 pl-12">
                  <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">
                    <Heart className="h-3.5 w-3.5" /> {post.likes}
                  </button>
                  <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">
                    <MessageCircle className="h-3.5 w-3.5" /> {post.comments}
                  </button>
                  {isCoach && (
                    <button className="text-xs text-muted-foreground hover:text-destructive transition-colors ml-auto">
                      Moderate
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AppLayout>
  );
};

export default Community;
