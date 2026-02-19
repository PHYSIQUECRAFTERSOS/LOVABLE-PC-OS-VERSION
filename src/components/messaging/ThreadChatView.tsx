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
  read_at: string | null;
}

interface ThreadChatViewProps {
  threadId: string;
  otherUserName: string;
  onBack?: () => void;
}

const ThreadChatView = ({ threadId, otherUserName, onBack }: ThreadChatViewProps) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const fetchMessages = async () => {
    const { data } = await supabase
      .from("thread_messages")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });
    setMessages((data as Message[]) || []);

    // Mark unread messages from other person as read
    if (user && data) {
      const unread = data.filter(m => m.sender_id !== user.id && !m.read_at);
      if (unread.length > 0) {
        const ids = unread.map(m => m.id);
        await supabase
          .from("thread_messages")
          .update({ read_at: new Date().toISOString() })
          .in("id", ids);
      }
    }
  };

  useEffect(() => {
    fetchMessages();

    const channel = supabase
      .channel(`thread-chat-${threadId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "thread_messages",
        filter: `thread_id=eq.${threadId}`,
      }, (payload) => {
        const newMsg = payload.new as Message;
        setMessages(prev => [...prev, newMsg]);
        // Auto-mark as read if from other person
        if (user && newMsg.sender_id !== user.id) {
          supabase
            .from("thread_messages")
            .update({ read_at: new Date().toISOString() })
            .eq("id", newMsg.id);
        }
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "thread_messages",
        filter: `thread_id=eq.${threadId}`,
      }, (payload) => {
        const updated = payload.new as Message;
        setMessages(prev => prev.map(m => m.id === updated.id ? updated : m));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [threadId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!user || !newMessage.trim()) return;
    setSending(true);

    await supabase.from("thread_messages").insert({
      thread_id: threadId,
      sender_id: user.id,
      content: newMessage.trim(),
    });

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
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
          <span className="text-sm font-semibold text-muted-foreground">
            {otherUserName.charAt(0).toUpperCase()}
          </span>
        </div>
        <h2 className="font-medium text-foreground truncate">{otherUserName}</h2>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <p className="text-sm">No messages yet. Start the conversation!</p>
          </div>
        )}
        {messages.map((msg) => {
          const isOwn = msg.sender_id === user?.id;
          return (
            <div key={msg.id} className={cn("flex", isOwn ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[75%] space-y-1")}>
                <div
                  className={cn(
                    "rounded-2xl px-4 py-2 text-sm",
                    isOwn
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-muted text-foreground rounded-bl-md"
                  )}
                >
                  {msg.content}
                </div>
                <div className={cn("flex items-center gap-1 text-[10px] text-muted-foreground", isOwn ? "justify-end" : "justify-start")}>
                  <span>{format(new Date(msg.created_at), "HH:mm")}</span>
                  {isOwn && (
                    msg.read_at
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

export default ThreadChatView;
