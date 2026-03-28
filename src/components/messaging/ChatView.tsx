import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, CheckCheck, Check, ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

interface ChatViewProps {
  conversationId: string;
  onBack?: () => void;
}

const ChatView = ({ conversationId, onBack }: ChatViewProps) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [senderNames, setSenderNames] = useState<Record<string, string>>({});
  const [readReceipts, setReadReceipts] = useState<Record<string, number>>({});
  const [sending, setSending] = useState(false);
  const [convName, setConvName] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const fetchMessages = async () => {
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    setMessages((data as Message[]) || []);

    // Fetch sender names
    const senderIds = [...new Set((data || []).map(m => m.sender_id))];
    if (senderIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", senderIds);
      const names: Record<string, string> = {};
      (profiles || []).forEach(p => { names[p.user_id] = p.full_name || "Unnamed"; });
      setSenderNames(names);
    }

    // Mark unread messages as read
    if (user && data) {
      const unreadIds = data
        .filter(m => m.sender_id !== user.id)
        .map(m => m.id);

      if (unreadIds.length > 0) {
        const { data: existing } = await supabase
          .from("message_reads")
          .select("message_id")
          .eq("user_id", user.id)
          .in("message_id", unreadIds);

        const existingIds = new Set((existing || []).map(r => r.message_id));
        const toMark = unreadIds.filter(id => !existingIds.has(id));

        if (toMark.length > 0) {
          await supabase.from("message_reads").insert(
            toMark.map(mid => ({ message_id: mid, user_id: user.id }))
          );
        }
      }
    }

    // Fetch read receipts for own messages
    if (user && data) {
      const ownMsgIds = data.filter(m => m.sender_id === user.id).map(m => m.id);
      if (ownMsgIds.length > 0) {
        const { data: reads } = await supabase
          .from("message_reads")
          .select("message_id")
          .in("message_id", ownMsgIds);
        const counts: Record<string, number> = {};
        (reads || []).forEach(r => {
          counts[r.message_id] = (counts[r.message_id] || 0) + 1;
        });
        setReadReceipts(counts);
      }
    }
  };

  const fetchConvName = async () => {
    if (!user) return;
    const { data: conv } = await supabase
      .from("conversations")
      .select("name, type")
      .eq("id", conversationId)
      .single();

    if (conv?.type === "direct") {
      const { data: parts } = await supabase
        .from("conversation_participants")
        .select("user_id")
        .eq("conversation_id", conversationId)
        .neq("user_id", user.id);
      if (parts && parts.length > 0) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("user_id", parts[0].user_id)
          .single();
        setConvName(profile?.full_name || "Chat");
      }
    } else {
      setConvName(conv?.name || "Chat");
    }
  };

  useEffect(() => {
    fetchMessages();
    fetchConvName();

    const channel = supabase
      .channel(`chat-${conversationId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        const newMsg = payload.new as Message;
        setMessages(prev => [...prev, newMsg]);
        // Fetch sender name if missing
        if (!senderNames[newMsg.sender_id]) {
          supabase.from("profiles").select("user_id, full_name").eq("user_id", newMsg.sender_id).single()
            .then(({ data }) => {
              if (data) setSenderNames(prev => ({ ...prev, [data.user_id]: data.full_name || "Unnamed" }));
            });
        }
        // Mark as read if not own message
        if (user && newMsg.sender_id !== user.id) {
          supabase.from("message_reads").insert({ message_id: newMsg.id, user_id: user.id });
        }
      })
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "message_reads",
      }, () => {
        // Refresh read receipts
        fetchMessages();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversationId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!user || !newMessage.trim()) return;
    setSending(true);

    await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: user.id,
      content: newMessage.trim(),
    });

    // Update conversation timestamp
    await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);

    setNewMessage("");
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        {onBack && (
          <Button variant="ghost" size="icon" className="h-8 w-8 md:hidden" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <h2 className="font-medium text-foreground truncate">{convName}</h2>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg) => {
          const isOwn = msg.sender_id === user?.id;
          const readCount = readReceipts[msg.id] || 0;

          return (
            <div key={msg.id} className={cn("flex", isOwn ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[75%] space-y-1")}>
                {!isOwn && (
                  <span className="text-[10px] text-muted-foreground ml-1">
                    {senderNames[msg.sender_id] || "..."}
                  </span>
                )}
                <div
                  className={cn(
                    "rounded-2xl px-4 py-2 text-sm",
                    isOwn
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-muted text-foreground rounded-bl-md"
                  )}
                >
                  {msg.content && <p className="whitespace-pre-wrap break-words">{msg.content}</p>}
                </div>
                <div className={cn("flex items-center gap-1 text-[10px] text-muted-foreground", isOwn ? "justify-end" : "justify-start")}>
                  <span>{format(new Date(msg.created_at), "HH:mm")}</span>
                  {isOwn && (
                    readCount > 0
                      ? <CheckCheck className="h-3 w-3 text-primary" />
                      : <Check className="h-3 w-3" />
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border p-3">
        <div className="flex gap-2">
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="flex-1"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={sending || !newMessage.trim()}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ChatView;
