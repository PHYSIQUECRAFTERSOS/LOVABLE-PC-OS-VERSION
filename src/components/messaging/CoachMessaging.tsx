import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { MessageSquare, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import CoachThreadList from "./CoachThreadList";
import ThreadChatView from "./ThreadChatView";

const CoachMessaging = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [activeClientName, setActiveClientName] = useState("");
  const [activeClientAvatar, setActiveClientAvatar] = useState<string | null>(null);
  const [activeMetaReady, setActiveMetaReady] = useState(false);

  const handleSelectThread = async (threadId: string) => {
    setActiveThreadId(threadId);
    setActiveMetaReady(false);
    setActiveClientName("");
    setActiveClientAvatar(null);

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
    } else {
      setActiveClientName("Client");
    }
    setActiveMetaReady(true);
  };

  const handleBack = () => {
    setActiveThreadId(null);
    setActiveMetaReady(false);
    (window as any).__refetchCoachThreads?.();
  };

  // ── MOBILE: list → full-screen chat ──
  if (isMobile) {
    if (activeThreadId) {
      return (
        <div className="flex flex-col h-full">
          {activeMetaReady ? (
            <ThreadChatView
              threadId={activeThreadId}
              otherUserName={activeClientName}
              otherUserAvatar={activeClientAvatar}
              onBack={handleBack}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 border-b border-border px-4 min-h-[56px] shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => navigate("/dashboard")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="flex-1 text-center font-display text-lg font-bold text-foreground">
            Messages
          </h1>
          <div className="h-8 w-8 shrink-0" />
        </div>

        <div className="flex-1 min-h-0 overflow-hidden">
          <CoachThreadList activeThreadId={activeThreadId} onSelect={handleSelectThread} />
        </div>
      </div>
    );
  }

  // ── DESKTOP: split-panel layout ──
  return (
    <div className="flex h-full overflow-hidden">
      <div className="w-[320px] shrink-0 border-r border-border flex flex-col bg-card">
        <div className="flex items-center px-4 min-h-[56px] shrink-0 border-b border-border">
          <h1 className="font-display text-lg font-bold text-foreground">Messages</h1>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <CoachThreadList activeThreadId={activeThreadId} onSelect={handleSelectThread} />
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {activeThreadId ? (
          activeMetaReady ? (
            <ThreadChatView
              threadId={activeThreadId}
              otherUserName={activeClientName}
              otherUserAvatar={activeClientAvatar}
              onBack={handleBack}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          )
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <MessageSquare className="h-12 w-12 opacity-30" />
            <p className="text-sm">Select a conversation to start messaging</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default CoachMessaging;
