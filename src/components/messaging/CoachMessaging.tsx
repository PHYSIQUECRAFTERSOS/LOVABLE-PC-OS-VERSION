import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import CoachThreadList from "./CoachThreadList";
import ThreadChatView from "./ThreadChatView";

const CoachMessaging = () => {
  const { user } = useAuth();
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [activeClientName, setActiveClientName] = useState("");
  const [activeClientAvatar, setActiveClientAvatar] = useState<string | null>(null);

  const handleSelectThread = async (threadId: string) => {
    setActiveThreadId(threadId);

    // Fetch client name for header
    const { data: thread } = await supabase
      .from("message_threads")
      .select("client_id")
      .eq("id", threadId)
      .single();

    if (thread) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("user_id", thread.client_id)
        .single();
      setActiveClientName(profile?.full_name || "Client");
      setActiveClientAvatar(profile?.avatar_url || null);
    }
  };

  const handleBack = () => {
    setActiveThreadId(null);
    // Refresh thread list when going back
    (window as any).__refetchCoachThreads?.();
  };

  return (
    <div className="flex h-full rounded-lg border border-border bg-card overflow-hidden">
      {/* Thread List Sidebar */}
      <div
        className={cn(
          "w-full md:w-80 flex-shrink-0 border-r border-border flex flex-col",
          activeThreadId ? "hidden md:flex" : "flex"
        )}
      >
        <div className="border-b border-border px-4 py-3">
          <h1 className="font-display text-lg font-bold text-foreground">Messages</h1>
        </div>
        <div className="flex-1 overflow-hidden">
          <CoachThreadList activeThreadId={activeThreadId} onSelect={handleSelectThread} />
        </div>
      </div>

      {/* Chat Area */}
      <div
        className={cn(
          "flex-1 flex flex-col",
          !activeThreadId ? "hidden md:flex" : "flex"
        )}
      >
        {activeThreadId ? (
          <ThreadChatView
            threadId={activeThreadId}
            otherUserName={activeClientName}
            otherUserAvatar={activeClientAvatar}
            onBack={handleBack}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
            <MessageSquare className="h-12 w-12 opacity-30" />
            <p className="text-sm">Select a client to start messaging</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default CoachMessaging;
