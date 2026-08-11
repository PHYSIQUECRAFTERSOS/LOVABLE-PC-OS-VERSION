import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { Lock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { withRetry } from "@/lib/resilientFetch";
import ThreadChatView from "./ThreadChatView";

const ClientMessaging = () => {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [coachName, setCoachName] = useState("");
  const [coachAvatar, setCoachAvatar] = useState<string | null>(null);
  const [noCoach, setNoCoach] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const init = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setFailed(false);
    setNoCoach(false);

    try {
      const assignment = await withRetry(async () => {
        const { data, error } = await supabase
          .from("coach_clients")
          .select("coach_id")
          .eq("client_id", user.id)
          .eq("status", "active")
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        return data;
      }, { label: "coach-assignment" });

      if (!assignment) {
        setNoCoach(true);
        setLoading(false);
        return;
      }

      const coachId = assignment.coach_id;

      const { data: coachProfile } = await supabase
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("user_id", coachId)
        .maybeSingle();

      setCoachName(coachProfile?.full_name?.trim() || "Your Coach");
      setCoachAvatar(coachProfile?.avatar_url || null);

      const existingThread = await withRetry(async () => {
        const { data, error } = await supabase
          .from("message_threads")
          .select("id")
          .eq("coach_id", coachId)
          .eq("client_id", user.id)
          .maybeSingle();
        if (error) throw error;
        return data;
      }, { label: "message-thread" });

      if (existingThread) {
        setThreadId(existingThread.id);
      } else {
        const { data: newThread, error } = await supabase
          .from("message_threads")
          .insert({ coach_id: coachId, client_id: user.id })
          .select("id")
          .single();
        if (error || !newThread) throw error || new Error("Could not create thread");
        setThreadId(newThread.id);
      }
    } catch (err: any) {
      console.error("[ClientMessaging] init failed:", err?.message || err);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void init();
  }, [init]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (failed) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-muted-foreground">
        <p className="text-sm text-center max-w-xs">
          Couldn't load your messages — connection hiccup.
        </p>
        <Button onClick={() => void init()} variant="outline" size="sm">
          <RefreshCw className="mr-2 h-4 w-4" /> Retry
        </Button>
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
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-muted-foreground">
        <p className="text-sm text-center">Unable to initialize messaging.</p>
        <Button onClick={() => void init()} variant="outline" size="sm">
          <RefreshCw className="mr-2 h-4 w-4" /> Retry
        </Button>
      </div>
    );
  }


  return (
    <div className="h-full flex flex-col overflow-hidden">
      <ThreadChatView
        threadId={threadId}
        otherUserName={coachName}
        otherUserAvatar={coachAvatar}
        showBackToDashboard={isMobile}
      />
    </div>
  );
};

export default ClientMessaging;
