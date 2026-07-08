import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { MessageSquare, Users, Megaphone } from "lucide-react";

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
  const [conversations, setConversations] = useState<
    (Conversation & { otherName?: string; lastMessage?: string; unread?: number })[]
  >([]);
  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchConversations = useCallback(async () => {
    if (!user) return;

    const { data: participations } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", user.id);

    if (!participations || participations.length === 0) {
      setConversations([]);
      return;
    }

    const convIds = participations.map((p) => p.conversation_id);
    const { data: convos } = await supabase
      .from("conversations")
      .select("id, type, name, updated_at")
      .in("id", convIds)
      .order("updated_at", { ascending: false });

    if (!convos) {
      setConversations([]);
      return;
    }

    // ── Batch all secondary reads. Was doing 3-4 queries per convo. ──
    const directConvIds = convos.filter((c) => c.type === "direct").map((c) => c.id);

    const [otherPartsRes, allMsgsRes, readsRes] = await Promise.all([
      directConvIds.length
        ? supabase
            .from("conversation_participants")
            .select("conversation_id, user_id")
            .in("conversation_id", directConvIds)
            .neq("user_id", user.id)
        : Promise.resolve({ data: [] as any[] }),
      supabase
        .from("messages")
        .select("id, conversation_id, content, sender_id, created_at")
        .in("conversation_id", convIds)
        .order("created_at", { ascending: false })
        .limit(Math.max(convIds.length * 6, 200)),
      supabase
        .from("message_reads")
        .select("message_id")
        .eq("user_id", user.id),
    ]);

    const otherUserIdByConv: Record<string, string> = {};
    (otherPartsRes.data || []).forEach((p: any) => {
      if (!otherUserIdByConv[p.conversation_id]) {
        otherUserIdByConv[p.conversation_id] = p.user_id;
      }
    });

    const otherUserIds = [...new Set(Object.values(otherUserIdByConv))];
    const { data: profiles } = otherUserIds.length
      ? await supabase.from("profiles").select("user_id, full_name").in("user_id", otherUserIds)
      : { data: [] as any[] };

    const nameById: Record<string, string> = {};
    (profiles || []).forEach((p: any) => {
      nameById[p.user_id] = p.full_name || "Unnamed";
    });

    // Latest message per conversation + all non-me message ids for unread calc.
    const latestByConv: Record<string, { content: string; created_at: string }> = {};
    const nonMeMsgsByConv: Record<string, string[]> = {};
    (allMsgsRes.data || []).forEach((m: any) => {
      if (!latestByConv[m.conversation_id]) {
        latestByConv[m.conversation_id] = { content: m.content, created_at: m.created_at };
      }
      if (m.sender_id !== user.id) {
        (nonMeMsgsByConv[m.conversation_id] ||= []).push(m.id);
      }
    });

    const readSet = new Set((readsRes.data || []).map((r: any) => r.message_id));

    const enriched = convos.map((conv) => {
      const otherId = otherUserIdByConv[conv.id];
      const otherName = conv.type === "direct" ? nameById[otherId] || conv.name : conv.name;
      const nonMe = nonMeMsgsByConv[conv.id] || [];
      const unread = nonMe.filter((id) => !readSet.has(id)).length;
      return {
        ...conv,
        otherName: otherName ?? undefined,
        lastMessage: latestByConv[conv.id]?.content,
        unread,
      };
    });

    setConversations(enriched);
  }, [user]);

  const scheduleRefetch = useCallback(() => {
    if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
    refetchTimerRef.current = setTimeout(fetchConversations, 400);
  }, [fetchConversations]);

  useEffect(() => {
    fetchConversations();

    const channel = supabase
      .channel("conv-list-updates")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
        scheduleRefetch();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
    };
  }, [fetchConversations, scheduleRefetch]);

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
