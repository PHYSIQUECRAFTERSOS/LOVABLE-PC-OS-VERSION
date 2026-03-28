import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, CheckCheck, Check, ArrowLeft, MoreVertical, EyeOff } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format, isToday, isYesterday, isSameDay } from "date-fns";
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
  /** When true, back arrow goes to /dashboard instead of calling onBack */
  showBackToDashboard?: boolean;
}

const ThreadChatView = ({
  threadId,
  otherUserName,
  otherUserAvatar,
  onBack,
  showBackToDashboard,
}: ThreadChatViewProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [reactions, setReactions] = useState<Record<string, Reaction[]>>({});
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [myAvatarUrl, setMyAvatarUrl] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const initialLoadRef = useRef(true);

  const scrollToBottom = (instant = false) => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({
          behavior: instant ? "auto" : "smooth",
        });
      }, 50);
    });
  };

  const handleBackAction = () => {
    if (showBackToDashboard) {
      navigate("/dashboard");
    } else if (onBack) {
      onBack();
    }
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

    await supabase
      .from("thread_messages")
      .update({ read_at: new Date().toISOString() } as any)
      .eq("thread_id", threadId)
      .neq("sender_id", user.id)
      .is("read_at" as any, null);

    (window as any).__refetchCoachThreads?.();
    window.dispatchEvent(new Event("messages-read"));
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

    const msgIds = msgs.map((m) => m.id);
    const { data: reactionData } = await supabase
      .from("message_reactions")
      .select("*")
      .in("message_id", msgIds);

    const grouped: Record<string, Reaction[]> = {};
    (reactionData as Reaction[] || []).forEach((r) => {
      if (!grouped[r.message_id]) grouped[r.message_id] = [];
      grouped[r.message_id].push(r);
    });
    setReactions(grouped);
  };

  useEffect(() => {
    fetchMessages().then(() => {
      scrollToBottom(true);
      initialLoadRef.current = false;
      fetchReactions();
    });
    markThreadSeen();

    if (user) {
      supabase
        .from("profiles")
        .select("avatar_url")
        .eq("user_id", user.id)
        .single()
        .then(({ data }) => setMyAvatarUrl(data?.avatar_url || null));
    }

    const msgChannel = supabase
      .channel(`thread-chat-${threadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "thread_messages",
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          if (user && newMsg.sender_id !== user.id) {
            supabase
              .from("thread_messages")
              .update({ read_at: new Date().toISOString() } as any)
              .eq("id", newMsg.id);
            markThreadSeen();
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "thread_messages",
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          const updated = payload.new as Message;
          setMessages((prev) =>
            prev.map((m) => (m.id === updated.id ? updated : m))
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "thread_messages",
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          const deleted = payload.old as { id: string };
          setMessages((prev) => prev.filter((m) => m.id !== deleted.id));
        }
      )
      .subscribe();

    const reactChannel = supabase
      .channel(`reactions-${threadId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_reactions" },
        () => {
          fetchReactions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(reactChannel);
    };
  }, [threadId]);

  useEffect(() => {
    if (!initialLoadRef.current) scrollToBottom(false);
  }, [messages]);

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
      const recipientId =
        thread.coach_id === user.id ? thread.client_id : thread.coach_id;
      const senderName =
        user.user_metadata?.full_name ||
        user.email?.split("@")[0] ||
        "Someone";
      sendPushToUser(
        recipientId,
        `Message from ${senderName}`,
        messageContent.length > 100
          ? messageContent.slice(0, 97) + "..."
          : messageContent,
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
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleReactionsChange = (
    messageId: string,
    newReactions: Reaction[]
  ) => {
    setReactions((prev) => ({ ...prev, [messageId]: newReactions }));
  };

  const handleEditMessage = (messageId: string, newContent: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? { ...m, content: newContent, edited_at: new Date().toISOString() }
          : m
      )
    );
  };

  const handleDeleteMessage = (messageId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  };

  /** Render a date separator like Trainerize ("Today", "Yesterday", "Mar 12") */
  const renderDateSeparator = (dateStr: string) => {
    const date = new Date(dateStr);
    let label = format(date, "MMM d, yyyy");
    if (isToday(date)) label = "Today";
    else if (isYesterday(date)) label = "Yesterday";

    return (
      <div className="flex items-center justify-center py-3">
        <span className="rounded-full bg-muted/60 px-4 py-1 text-[11px] font-medium text-muted-foreground">
          {label}
        </span>
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 border-b border-border px-4 min-h-[56px] shrink-0">
        {(onBack || showBackToDashboard) && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={handleBackAction}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        <UserAvatar
          src={otherUserAvatar}
          name={otherUserName}
          className="h-9 w-9 text-xs"
        />
        <h2 className="font-semibold text-foreground truncate flex-1 text-[15px]">
          {otherUserName}
        </h2>
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

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <p className="text-sm">No messages yet. Start the conversation!</p>
          </div>
        )}
        {messages.map((msg, idx) => {
          const isOwn = msg.sender_id === user?.id;
          const msgReactions = reactions[msg.id] || [];
          const msgDate = new Date(msg.created_at);
          const prevDate = idx > 0 ? new Date(messages[idx - 1].created_at) : null;
          const showDateSep = !prevDate || !isSameDay(msgDate, prevDate);

          return (
            <div key={msg.id}>
              {showDateSep && renderDateSeparator(msg.created_at)}

              <MessageContextMenu
                messageId={msg.id}
                content={msg.content}
                senderId={msg.sender_id}
                isOwn={isOwn}
                hasAttachment={!!msg.attachment_url}
                onEdit={handleEditMessage}
                onDelete={handleDeleteMessage}
              >
                <div
                  className={cn(
                    "flex gap-2.5 py-1.5",
                    isOwn ? "justify-end" : "justify-start"
                  )}
                >
                  {/* Other user avatar — left */}
                  {!isOwn && (
                    <UserAvatar
                      src={otherUserAvatar}
                      name={otherUserName}
                      className="h-8 w-8 text-[10px] mt-auto shrink-0"
                    />
                  )}

                  <div className={cn("max-w-[80%] space-y-0.5")}>
                    {/* Bubble */}
                    <div
                      className={cn(
                        "rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed",
                        isOwn
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : "bg-muted text-foreground rounded-bl-md"
                      )}
                    >
                      {msg.attachment_url && msg.attachment_type && (
                        <div className="mb-1.5">
                          <MessageAttachment
                            url={msg.attachment_url}
                            type={
                              msg.attachment_type as
                                | "image"
                                | "video"
                                | "pdf"
                                | "audio"
                            }
                            name={msg.attachment_name || undefined}
                            isOwn={isOwn}
                          />
                        </div>
                      )}
                      {msg.content && <p className="whitespace-pre-wrap break-words">{msg.content}</p>}
                    </div>

                    {/* Reactions */}
                    <EmojiReactions
                      messageId={msg.id}
                      reactions={msgReactions}
                      onReactionsChange={handleReactionsChange}
                    />

                    {/* Timestamp + read receipt */}
                    <div
                      className={cn(
                        "flex items-center gap-1.5 text-[11px] text-muted-foreground px-1",
                        isOwn ? "justify-end" : "justify-start"
                      )}
                    >
                      <span>{format(msgDate, "h:mm a")}</span>
                      {(msg as any).edited_at && (
                        <span className="italic opacity-70">edited</span>
                      )}
                      {isOwn &&
                        (msg.read_at ? (
                          <CheckCheck className="h-3.5 w-3.5 text-primary" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        ))}
                    </div>
                  </div>

                  {/* Own avatar — right */}
                  {isOwn && (
                    <UserAvatar
                      src={myAvatarUrl}
                      name="Me"
                      className="h-8 w-8 text-[10px] mt-auto shrink-0"
                    />
                  )}
                </div>
              </MessageContextMenu>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* ── Input Bar ── */}
      <div
        className="border-t border-border px-4 py-3 shrink-0"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex gap-2 items-center">
          {!isRecording && (
            <AttachmentUploadMenu threadId={threadId} onSent={fetchMessages} />
          )}
          {!isRecording && (
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              className="flex-1 h-10 text-[15px]"
            />
          )}
          {newMessage.trim() ? (
            <Button
              size="icon"
              onClick={handleSend}
              disabled={sending || !newMessage.trim()}
            >
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
