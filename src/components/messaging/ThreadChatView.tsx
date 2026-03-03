import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, CheckCheck, Check, ArrowLeft, MoreVertical, EyeOff } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import UserAvatar from "@/components/profile/UserAvatar";
import { useToast } from "@/hooks/use-toast";

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
  otherUserAvatar?: string | null;
  onBack?: () => void;
}

const ThreadChatView = ({ threadId, otherUserName, otherUserAvatar, onBack }: ThreadChatViewProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [myAvatarUrl, setMyAvatarUrl] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Update coach_last_seen_at and clear manual unread when opening thread
  const markThreadSeen = async () => {
    if (!user) return;
    await supabase
      .from("message_threads")
      .update({
        coach_last_seen_at: new Date().toISOString(),
        coach_marked_unread: false,
      } as any)
      .eq("id", threadId)
      .eq("coach_id", user.id);

    // Trigger thread list refresh
    (window as any).__refetchCoachThreads?.();
  };

  const fetchMessages = async () => {
    const { data } = await supabase
      .from("thread_messages")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });
    setMessages((data as Message[]) || []);
  };

  useEffect(() => {
    fetchMessages();
    markThreadSeen();

    // Fetch my avatar
    if (user) {
      supabase.from("profiles").select("avatar_url").eq("user_id", user.id).single()
        .then(({ data }) => setMyAvatarUrl(data?.avatar_url || null));
    }

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
        // Auto-update last_seen when viewing thread
        if (user && newMsg.sender_id !== user.id) {
          markThreadSeen();
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

    // Update last_seen immediately after sending (coach sent = 0 unread)
    await markThreadSeen();

    setNewMessage("");
    setSending(false);
  };

  const handleMarkUnread = async () => {
    if (!user) return;
    await supabase
      .from("message_threads")
      .update({ coach_marked_unread: true } as any)
      .eq("id", threadId)
      .eq("coach_id", user.id);

    toast({ title: "Marked as unread" });
    (window as any).__refetchCoachThreads?.();

    // Go back to list on mobile
    onBack?.();
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
        <UserAvatar src={otherUserAvatar} name={otherUserName} className="h-8 w-8 text-xs" />
        <h2 className="font-medium text-foreground truncate flex-1">{otherUserName}</h2>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleMarkUnread}>
              <EyeOff className="h-4 w-4 mr-2" />
              Mark as Unread
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
            <div key={msg.id} className={cn("flex gap-2", isOwn ? "justify-end" : "justify-start")}>
              {!isOwn && (
                <UserAvatar src={otherUserAvatar} name={otherUserName} className="h-7 w-7 text-[10px] mt-1 ring-1" />
              )}
              <div className={cn("max-w-[70%] space-y-1")}>
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
              {isOwn && (
                <UserAvatar src={myAvatarUrl} name="Me" className="h-7 w-7 text-[10px] mt-1 ring-1" />
              )}
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
