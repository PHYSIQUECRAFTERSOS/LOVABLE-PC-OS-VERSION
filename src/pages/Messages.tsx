import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import ConversationList from "@/components/messaging/ConversationList";
import ChatView from "@/components/messaging/ChatView";
import NewConversationDialog from "@/components/messaging/NewConversationDialog";
import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

const Messages = () => {
  const [activeConversation, setActiveConversation] = useState<string | null>(null);

  return (
    <AppLayout>
      <div className="animate-fade-in h-[calc(100vh-6rem)] md:h-[calc(100vh-4rem)]">
        <div className="flex h-full rounded-lg border border-border bg-card overflow-hidden">
          {/* Sidebar */}
          <div
            className={cn(
              "w-full md:w-80 flex-shrink-0 border-r border-border flex flex-col",
              activeConversation ? "hidden md:flex" : "flex"
            )}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h1 className="font-display text-lg font-bold text-foreground">Messages</h1>
              <NewConversationDialog onCreated={(id) => setActiveConversation(id)} />
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              <ConversationList activeId={activeConversation} onSelect={setActiveConversation} />
            </div>
          </div>

          {/* Chat area */}
          <div
            className={cn(
              "flex-1 flex flex-col",
              !activeConversation ? "hidden md:flex" : "flex"
            )}
          >
            {activeConversation ? (
              <ChatView
                conversationId={activeConversation}
                onBack={() => setActiveConversation(null)}
              />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
                <MessageSquare className="h-12 w-12 opacity-30" />
                <p className="text-sm">Select a conversation to start messaging</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default Messages;
