import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MessageSquare, Lock } from "lucide-react";
import ThreadChatView from "./ThreadChatView";
import UserAvatar from "@/components/profile/UserAvatar";

const ClientMessaging = () => {
  const { user } = useAuth();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [coachName, setCoachName] = useState("");
  const [coachAvatar, setCoachAvatar] = useState<string | null>(null);
  const [noCoach, setNoCoach] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      if (!user) return;

      // Find assigned coach
      const { data: assignment } = await supabase
        .from("coach_clients")
        .select("coach_id")
        .eq("client_id", user.id)
        .eq("status", "active")
        .limit(1)
        .single();

      if (!assignment) {
        setNoCoach(true);
        setLoading(false);
        return;
      }

      const coachId = assignment.coach_id;

      // Get coach name
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("user_id", coachId)
        .single();
      setCoachName(profile?.full_name || "Physique Crafters Head Coach");
      setCoachAvatar(profile?.avatar_url || null);

      // Find or create thread
      const { data: existingThread } = await supabase
        .from("message_threads")
        .select("id")
        .eq("coach_id", coachId)
        .eq("client_id", user.id)
        .single();

      if (existingThread) {
        setThreadId(existingThread.id);
      } else {
        // Auto-create thread
        const { data: newThread } = await supabase
          .from("message_threads")
          .insert({ coach_id: coachId, client_id: user.id })
          .select("id")
          .single();
        if (newThread) {
          setThreadId(newThread.id);
        }
      }

      setLoading(false);
    };

    init();
  }, [user]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (noCoach) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground px-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <Lock className="h-8 w-8 opacity-40" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">No Coach Assigned</h2>
        <p className="text-sm text-center max-w-xs">
          You have not been assigned a coach yet. Once your coach sets up your account, messaging will be available here.
        </p>
      </div>
    );
  }

  if (!threadId) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p className="text-sm">Unable to initialize messaging. Please try again.</p>
      </div>
    );
  }

  return (
    <div className="h-full rounded-lg border border-border bg-card overflow-hidden">
      <ThreadChatView threadId={threadId} otherUserName={coachName} otherUserAvatar={coachAvatar} />
    </div>
  );
};

export default ClientMessaging;
