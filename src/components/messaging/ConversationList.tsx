import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { MessageSquare, Users, Megaphone } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Conversation {
  id: string;
  type: string;
  name: string | null;
  updated_at: string;
}

interface ConversationListProps {
  activeId: string | null;
  onSelect: (id: string) => void;
}

const ConversationList = ({ activeId, onSelect }: ConversationListProps) => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<(Conversation & { otherName?: string; lastMessage?: string; unread?: number })[]>([]);

  const fetchConversations = async () => {
    if (!user) return;

    const { data: participations } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", user.id);

    if (!participations || participations.length === 0) {
      setConversations([]);
      return;
    }

    const convIds = participations.map(p => p.conversation_id);
    const { data: convos } = await supabase
      .from("conversations")
      .select("*")
      .in("id", convIds)
      .order("updated_at", { ascending: false });

    if (!convos) { setConversations([]); return; }

    // Enrich with other participant names for direct chats and last messages
    const enriched = await Promise.all(convos.map(async (conv) => {
      let otherName = conv.name;

      if (conv.type === "direct") {
        const { data: parts } = await supabase
          .from("conversation_participants")
          .select("user_id")
          .eq("conversation_id", conv.id)
          .neq("user_id", user.id);
        if (parts && parts.length > 0) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("user_id", parts[0].user_id)
            .single();
          otherName = profile?.full_name || "Unnamed";
        }
      }

      // Last message
      const { data: lastMsg } = await supabase
        .from("messages")
        .select("content, created_at")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: false })
        .limit(1);

      // Unread count
      const { data: allMsgs } = await supabase
        .from("messages")
        .select("id")
        .eq("conversation_id", conv.id)
        .neq("sender_id", user.id);

      const msgIds = (allMsgs || []).map(m => m.id);
      let unread = 0;
      if (msgIds.length > 0) {
        const { data: reads } = await supabase
          .from("message_reads")
          .select("message_id")
          .eq("user_id", user.id)
          .in("message_id", msgIds);
        unread = msgIds.length - (reads?.length || 0);
      }

      return {
        ...conv,
        otherName,
        lastMessage: lastMsg?.[0]?.content,
        unread,
      };
    }));

    setConversations(enriched);
  };

  useEffect(() => {
    fetchConversations();

    // Subscribe to new messages to refresh list
    const channel = supabase
      .channel("conv-list-updates")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
        fetchConversations();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const getIcon = (type: string) => {
    if (type === "group") return Users;
    if (type === "broadcast") return Megaphone;
    return MessageSquare;
  };

  return (
    <div className="space-y-0.5">
      {conversations.length === 0 && (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No conversations yet. Start one!
        </p>
      )}
      {conversations.map((conv) => {
        const Icon = getIcon(conv.type);
        return (
          <button
            key={conv.id}
            onClick={() => onSelect(conv.id)}
            className={cn(
              "flex w-full items-start gap-3 rounded-md px-3 py-3 text-left transition-colors",
              activeId === conv.id ? "bg-primary/10" : "hover:bg-secondary"
            )}
          >
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground truncate">
                  {conv.otherName || conv.name || "Chat"}
                </span>
                {(conv.unread ?? 0) > 0 && (
                  <span className="ml-2 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                    {conv.unread}
                  </span>
                )}
              </div>
              {conv.lastMessage && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {conv.lastMessage}
                </p>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default ConversationList;
