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
import MessageAttachment from "./MessageAttachment";
import EmojiReactions from "./EmojiReactions";
import AttachmentUploadMenu from "./AttachmentUploadMenu";
import VoiceMessageRecorder from "./VoiceMessageRecorder";
import MessageContextMenu from "./MessageContextMenu";
import { clearPushBadge, sendPushToUser } from "@/hooks/usePushNotifications";

interface Message {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
  read_at: string | null;
  edited_at?: string | null;
  attachment_url?: string | null;
  attachment_type?: string | null;
  attachment_name?: string | null;
}

interface Reaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
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
  const [reactions, setReactions] = useState<Record<string, Reaction[]>>({});
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [myAvatarUrl, setMyAvatarUrl] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

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
    (window as any).__refetchCoachThreads?.();
    clearPushBadge();
  };

  const fetchMessages = async () => {
    const { data } = await supabase
      .from("thread_messages")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });
    setMessages((data as Message[]) || []);
  };

  const fetchReactions = async () => {
    const { data: msgs } = await supabase
      .from("thread_messages")
      .select("id")
      .eq("thread_id", threadId);
    if (!msgs?.length) return;

    const msgIds = msgs.map(m => m.id);
    const { data: reactionData } = await supabase
      .from("message_reactions")
      .select("*")
      .in("message_id", msgIds);

    const grouped: Record<string, Reaction[]> = {};
    (reactionData as Reaction[] || []).forEach(r => {
      if (!grouped[r.message_id]) grouped[r.message_id] = [];
      grouped[r.message_id].push(r);
    });
    setReactions(grouped);
  };

  useEffect(() => {
    fetchMessages().then(() => fetchReactions());
    markThreadSeen();

    if (user) {
      supabase.from("profiles").select("avatar_url").eq("user_id", user.id).single()
        .then(({ data }) => setMyAvatarUrl(data?.avatar_url || null));
    }

    const msgChannel = supabase
      .channel(`thread-chat-${threadId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "thread_messages",
        filter: `thread_id=eq.${threadId}`,
      }, (payload) => {
        const newMsg = payload.new as Message;
        setMessages(prev => {
          if (prev.some(m => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
        if (user && newMsg.sender_id !== user.id) markThreadSeen();
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
      .on("postgres_changes", {
        event: "DELETE",
        schema: "public",
        table: "thread_messages",
        filter: `thread_id=eq.${threadId}`,
      }, (payload) => {
        const deleted = payload.old as { id: string };
        setMessages(prev => prev.filter(m => m.id !== deleted.id));
      })
      .subscribe();

    const reactChannel = supabase
      .channel(`reactions-${threadId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "message_reactions",
      }, () => {
        fetchReactions();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(reactChannel);
    };
  }, [threadId]);

  useEffect(() => { scrollToBottom(); }, [messages]);

  const handleSend = async () => {
    if (!user || !newMessage.trim()) return;
    setSending(true);
    const messageContent = newMessage.trim();
    await supabase.from("thread_messages").insert({
      thread_id: threadId,
      sender_id: user.id,
      content: messageContent,
    });
    await markThreadSeen();
    setNewMessage("");
    setSending(false);

    const { data: thread } = await supabase
      .from("message_threads")
      .select("coach_id, client_id")
      .eq("id", threadId)
      .single();
    if (thread) {
      const recipientId = thread.coach_id === user.id ? thread.client_id : thread.coach_id;
      const senderName = user.user_metadata?.full_name || user.email?.split("@")[0] || "Someone";
      sendPushToUser(
        recipientId,
        `Message from ${senderName}`,
        messageContent.length > 100 ? messageContent.slice(0, 97) + "..." : messageContent,
        "message",
        { route: "/messages" }
      );
    }
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
    onBack?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleReactionsChange = (messageId: string, newReactions: Reaction[]) => {
    setReactions(prev => ({ ...prev, [messageId]: newReactions }));
  };

  const handleEditMessage = (messageId: string, newContent: string) => {
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content: newContent, edited_at: new Date().toISOString() } : m));
    setEditingMessageId(null);
  };

  const handleDeleteMessage = (messageId: string) => {
    setMessages(prev => prev.filter(m => m.id !== messageId));
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
          const msgReactions = reactions[msg.id] || [];
          const isEditing = editingMessageId === msg.id;

          return (
            <div key={msg.id} className={cn("flex gap-2 group", isOwn ? "justify-end" : "justify-start")}>
              {!isOwn && (
                <UserAvatar src={otherUserAvatar} name={otherUserName} className="h-7 w-7 text-[10px] mt-1 ring-1" />
              )}
              <MessageContextMenu
                messageId={msg.id}
                content={msg.content}
                senderId={msg.sender_id}
                isOwn={isOwn}
                hasAttachment={!!msg.attachment_url}
                onEdit={handleEditMessage}
                onDelete={handleDeleteMessage}
              >
                <div className={cn("max-w-[70%] space-y-1")}>
                  <div
                    className={cn(
                      "rounded-2xl px-4 py-2 text-sm",
                      isOwn ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted text-foreground rounded-bl-md"
                    )}
                  >
                    {msg.attachment_url && msg.attachment_type && (
                      <div className="mb-1">
                        <MessageAttachment
                          url={msg.attachment_url}
                          type={msg.attachment_type as "image" | "video" | "pdf" | "audio"}
                          name={msg.attachment_name || undefined}
                          isOwn={isOwn}
                        />
                      </div>
                    )}
                    {msg.content && <p>{msg.content}</p>}
                  </div>
                  {/* Reactions */}
                  <EmojiReactions
                    messageId={msg.id}
                    reactions={msgReactions}
                    onReactionsChange={handleReactionsChange}
                  />
                  <div className={cn("flex items-center gap-1 text-[10px] text-muted-foreground", isOwn ? "justify-end" : "justify-start")}>
                    <span>{format(new Date(msg.created_at), "HH:mm")}</span>
                    {(msg as any).edited_at && (
                      <span className="italic">edited</span>
                    )}
                    {isOwn && (
                      msg.read_at
                        ? <CheckCheck className="h-3 w-3 text-primary" />
                        : <Check className="h-3 w-3" />
                    )}
                  </div>
                </div>
              </MessageContextMenu>
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
        <div className="flex gap-2 items-center">
          {!isRecording && <AttachmentUploadMenu threadId={threadId} onSent={fetchMessages} />}
          {!isRecording && (
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              className="flex-1"
            />
          )}
          {newMessage.trim() ? (
            <Button size="icon" onClick={handleSend} disabled={sending || !newMessage.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          ) : (
            <VoiceMessageRecorder
              threadId={threadId}
              onSent={fetchMessages}
              onRecordingStateChange={setIsRecording}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default ThreadChatView;
