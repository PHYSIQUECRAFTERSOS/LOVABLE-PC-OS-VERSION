import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, CheckCheck, Check, ArrowLeft, MoreVertical, EyeOff, Smile, Pencil, Trash2, UserX } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import EmojiPicker, { Theme, EmojiStyle } from "emoji-picker-react";
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
import AttachmentPreviewDialog from "./AttachmentPreviewDialog";
import VoiceMessageRecorder from "./VoiceMessageRecorder";
import MessageContextMenu from "./MessageContextMenu";
import MessageContent from "./MessageContent";
import { type LinkPreview } from "./LinkPreviewCard";
import { clearPushBadge, sendPushToUser } from "@/hooks/usePushNotifications";
import DeleteThreadDialog from "./DeleteThreadDialog";

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
  link_preview?: LinkPreview | null;
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<File | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [isCoachOfThread, setIsCoachOfThread] = useState(false);
  const [clientInactive, setClientInactive] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const dragDepthRef = useRef(0);
  const initialLoadRef = useRef(true);
  // Tracks the timestamp (ms) when initial scroll-to-bottom happened. We
  // continue to re-pin to bottom while attachments (images/video) load and
  // grow scrollHeight, but only within this grace window AND only if the
  // user has not manually scrolled away from the bottom.
  const initialPinUntilRef = useRef<number>(0);
  const userScrolledAwayRef = useRef(false);
  const lastScrollTopRef = useRef<number>(0);
  const lastResizeAtRef = useRef<number>(0);

  // Determine if current user is the coach in this thread and if the client is inactive
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) return;
      const { data: thread } = await supabase
        .from("message_threads")
        .select("coach_id, client_id")
        .eq("id", threadId)
        .maybeSingle();
      if (!thread || cancelled) return;
      const amCoach = thread.coach_id === user.id;
      setIsCoachOfThread(amCoach);
      if (!amCoach) {
        setClientInactive(false);
        return;
      }
      const { data: cc } = await supabase
        .from("coach_clients")
        .select("status")
        .eq("coach_id", thread.coach_id)
        .eq("client_id", thread.client_id)
        .maybeSingle();
      const { data: prof } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("user_id", thread.client_id)
        .maybeSingle();
      const inactive = !prof || !cc || cc.status !== "active";
      if (!cancelled) setClientInactive(inactive);
    })();
    return () => { cancelled = true; };
  }, [threadId, user]);


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
    setMessages((data as unknown as Message[]) || []);
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
      // Mark that an instant scroll-to-bottom is pending; the useLayoutEffect
      // below will execute it synchronously after React commits the message DOM,
      // before the browser paints — so the user never sees the list at top.
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

  /**
   * Scroll behavior, all in one place:
   * - On the FIRST messages render for a thread, jump synchronously to the
   *   bottom (useLayoutEffect → before paint → no flash).
   * - For ~2s after that, keep re-pinning to bottom whenever scrollHeight
   *   grows (covers async image/video/audio loading that would otherwise
   *   leave the user stranded above the real bottom). Stops the moment the
   *   user manually scrolls up.
   * - On subsequent message updates, smooth-scroll only if the user is
   *   already near the bottom; otherwise preserve their scroll position.
   */
  useLayoutEffect(() => {
    const c = scrollContainerRef.current;
    if (!c) return;

    if (initialLoadRef.current) {
      if (messages.length === 0) return; // wait for first batch
      c.scrollTop = c.scrollHeight;
      lastScrollTopRef.current = c.scrollTop;
      initialLoadRef.current = false;
      // Open a 4s window during which media loads / mobile-browser chrome
      // collapses can re-pin us to bottom.
      initialPinUntilRef.current = Date.now() + 4000;
      userScrolledAwayRef.current = false;
      return;
    }

    const distFromBottom = c.scrollHeight - c.scrollTop - c.clientHeight;
    if (distFromBottom < 120) {
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      });
    }
    // else: user scrolled up to read history → leave scroll position alone
  }, [messages]);

  /**
   * Watch for scrollHeight growth from late-loading attachments and re-pin
   * to the bottom during the initial grace window. Fixes the bug where
   * images load AFTER the initial scroll-to-bottom, growing the document
   * but leaving scrollTop stranded — especially noticeable on coach side
   * where recent threads tend to have more/larger media.
   *
   * Mobile Chrome quirk: the URL bar collapses on first touch, growing the
   * viewport by 60-100px. This fires a synthetic scroll event with the same
   * scrollTop but a larger clientHeight, which would falsely trip the
   * "user scrolled away" flag and disable re-pinning. We guard against this by:
   *   1. Only flipping the flag on an actual UPWARD scrollTop delta.
   *   2. Ignoring scroll events that fire within 200ms of a resize event.
   */
  useEffect(() => {
    const c = scrollContainerRef.current;
    if (!c) return;

    lastScrollTopRef.current = c.scrollTop;

    const onScroll = () => {
      const now = Date.now();
      const sinceResize = now - lastResizeAtRef.current;
      const prev = lastScrollTopRef.current;
      const curr = c.scrollTop;
      lastScrollTopRef.current = curr;

      // Ignore synthetic scroll events caused by viewport resize
      // (e.g. mobile Chrome URL bar collapsing).
      if (sinceResize < 200) return;

      const distFromBottom = c.scrollHeight - curr - c.clientHeight;
      // Only mark "scrolled away" on a real upward swipe.
      if (distFromBottom > 80 && curr < prev - 4 && !userScrolledAwayRef.current) {
        userScrolledAwayRef.current = true;
      }
    };
    c.addEventListener("scroll", onScroll, { passive: true });

    const ro = new ResizeObserver(() => {
      lastResizeAtRef.current = Date.now();
      const inWindow = Date.now() <= initialPinUntilRef.current;
      if (!inWindow) return;
      if (userScrolledAwayRef.current) return;
      c.scrollTop = c.scrollHeight;
      lastScrollTopRef.current = c.scrollTop;
    });
    if (c.firstElementChild) ro.observe(c.firstElementChild);
    ro.observe(c);

    return () => {
      ro.disconnect();
      c.removeEventListener("scroll", onScroll);
    };
  }, [threadId]);

  const handleSend = async () => {
    if (!user || !newMessage.trim()) return;
    if (isCoachOfThread && clientInactive) {
      toast({ title: "Client is inactive", description: "Reactivate them from Clients to resume messaging.", variant: "destructive" });
      return;
    }
    setSending(true);
    // Unhide thread if this coach previously deleted it — sending re-opens the conversation
    if (isCoachOfThread) {
      supabase
        .from("message_threads")
        .update({ coach_hidden_at: null } as any)
        .eq("id", threadId)
        .eq("coach_id", user.id)
        .then(() => {});
    }
    const messageContent = newMessage.trim();
    const { data: insertedMsg, error: insertError } = await supabase
      .from("thread_messages")
      .insert({
        thread_id: threadId,
        sender_id: user.id,
        content: messageContent,
      })
      .select("*")
      .single();

    if (insertError) {
      toast({
        title: "Failed to send",
        description: insertError.message,
        variant: "destructive",
      });
      setSending(false);
      return;
    }

    // Optimistically insert into local state so the message appears
    // immediately, without relying on a realtime round-trip. The realtime
    // INSERT handler dedupes by id, so this is safe.
    if (insertedMsg) {
      setMessages((prev) => {
        if (prev.some((m) => m.id === (insertedMsg as { id: string }).id)) return prev;
        return [...prev, insertedMsg as unknown as Message];
      });
    }

    await markThreadSeen();
    setNewMessage("");
    setSending(false);

    // Fire-and-forget: fetch link preview for single-URL messages
    if (insertedMsg?.id) {
      fetchAndStoreLinkPreview(insertedMsg.id, messageContent);
    }

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

  /** Extract URLs from content, fetch OG preview for the first one, store in DB */
  const fetchAndStoreLinkPreview = async (messageId: string, content: string) => {
    const urlRegex = /(?:https?:\/\/|www\.)[^\s<>"{}|\\^`[\]]+/gi;
    const urls = content.match(urlRegex);
    if (!urls || urls.length === 0) return;

    // Only generate preview for the first URL found
    let targetUrl = urls[0];
    if (!targetUrl.startsWith("http")) targetUrl = `https://${targetUrl}`;

    try {
      const { data, error } = await supabase.functions.invoke("fetch-link-preview", {
        body: { url: targetUrl },
      });

      if (error || !data?.success || !data?.preview) return;

      const preview = data.preview as LinkPreview;

      // Update the message row with the preview
      await supabase
        .from("thread_messages")
        .update({ link_preview: preview as any })
        .eq("id", messageId);

      // Update local state immediately
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, link_preview: preview } : m
        )
      );
    } catch (err) {
      console.warn("Link preview fetch failed:", err);
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

  const handleStartEdit = (messageId: string, content: string) => {
    setEditingMessageId(messageId);
    setEditingText(content);
    // Focus and place caret at end after render
    setTimeout(() => {
      const ta = editTextareaRef.current;
      if (ta) {
        ta.focus();
        const pos = ta.value.length;
        ta.setSelectionRange(pos, pos);
      }
    }, 0);
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditingText("");
  };

  const handleSaveEdit = async () => {
    if (!editingMessageId) return;
    const trimmed = editingText.trim();
    const original = messages.find((m) => m.id === editingMessageId)?.content ?? "";
    if (!trimmed || trimmed === original) {
      handleCancelEdit();
      return;
    }
    setSavingEdit(true);
    const { error } = await supabase
      .from("thread_messages")
      .update({ content: trimmed, edited_at: new Date().toISOString() } as any)
      .eq("id", editingMessageId);
    setSavingEdit(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    handleEditMessage(editingMessageId, trimmed);
    handleCancelEdit();
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

  // Drag-and-drop file upload (desktop). Mobile keeps existing buttons.
  const handleDragEnter = (e: React.DragEvent) => {
    if (!e.dataTransfer?.types?.includes("Files")) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setIsDraggingOver(true);
  };
  const handleDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer?.types?.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };
  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.dataTransfer?.types?.includes("Files")) return;
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDraggingOver(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    if (!e.dataTransfer?.types?.includes("Files")) return;
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsDraggingOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (e.dataTransfer.files.length > 1) {
      toast({
        title: "One file at a time",
        description: "Only the first file was used. Send others one by one.",
      });
    }
    setPendingAttachment(file);
  };

  return (
    <div
      className="flex h-full flex-col relative"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
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
            {isCoachOfThread && (
              <DropdownMenuItem
                onClick={() => setShowDeleteDialog(true)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete conversation
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* ── Messages ── */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
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
                onStartEdit={handleStartEdit}
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
                        "rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed transition-shadow",
                        isOwn
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : "bg-muted text-foreground rounded-bl-md",
                        editingMessageId === msg.id && "ring-2 ring-primary/70 ring-offset-2 ring-offset-background"
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
                      {msg.content && (
                        <MessageContent
                          content={msg.content}
                          isOwn={isOwn}
                          linkPreview={msg.link_preview}
                        />
                      )}
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

      {/* ── Input Bar / Edit Strip ── */}
      {editingMessageId ? (
        <div
          className="border-t border-border shrink-0 bg-muted/20"
          style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
        >
          <div className="flex items-center justify-between px-4 py-2 border-b border-border/60">
            <div className="flex items-center gap-2 text-xs font-medium text-foreground">
              <Pencil className="h-3.5 w-3.5 text-primary" />
              Editing message
            </div>
            <button
              type="button"
              onClick={handleCancelEdit}
              className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
          <div className="px-4 pt-3 pb-2">
            <Textarea
              ref={editTextareaRef}
              value={editingText}
              onChange={(e) => setEditingText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") { e.preventDefault(); handleCancelEdit(); }
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSaveEdit(); }
              }}
              disabled={savingEdit}
              inputMode="text"
              enterKeyHint="send"
              placeholder="Edit your message..."
              className="w-full min-h-[96px] max-h-[40vh] text-[15px] resize-none"
            />
            <div className="flex justify-end pt-2">
              <Button
                size="icon"
                onClick={handleSaveEdit}
                disabled={
                  savingEdit ||
                  !editingText.trim() ||
                  editingText.trim() === (messages.find((m) => m.id === editingMessageId)?.content ?? "")
                }
                aria-label="Save edit"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div
          className="border-t border-border px-4 py-3 shrink-0"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <div className="flex gap-2 items-center">
            {!isRecording && (
              <AttachmentUploadMenu threadId={threadId} onSent={fetchMessages} />
            )}
            {!isRecording && (
              <Textarea
                ref={textareaRef}
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                className="flex-1 min-h-[40px] max-h-[120px] text-[15px] resize-none py-2"
                rows={1}
              />
            )}
            {!isRecording && (
              <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="hidden sm:inline-flex shrink-0"
                    aria-label="Insert emoji"
                  >
                    <Smile className="h-5 w-5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  side="top"
                  align="end"
                  sideOffset={8}
                  className="p-0 w-auto border-none bg-transparent shadow-none"
                >
                  <EmojiPicker
                    theme={Theme.DARK}
                    emojiStyle={EmojiStyle.NATIVE}
                    lazyLoadEmojis
                    onEmojiClick={(data) => {
                      const ta = textareaRef.current;
                      const emoji = data.emoji;
                      if (ta && typeof ta.selectionStart === "number") {
                        const start = ta.selectionStart;
                        const end = ta.selectionEnd ?? start;
                        setNewMessage((prev) => prev.slice(0, start) + emoji + prev.slice(end));
                        requestAnimationFrame(() => {
                          ta.focus();
                          const pos = start + emoji.length;
                          ta.setSelectionRange(pos, pos);
                        });
                      } else {
                        setNewMessage((prev) => prev + emoji);
                      }
                    }}
                  />
                </PopoverContent>
              </Popover>
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
      )}


      {/* Drag-and-drop overlay */}
      {isDraggingOver && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-background/85 backdrop-blur-sm">
          <div className="rounded-2xl border-2 border-dashed border-primary bg-card/80 px-8 py-10 text-center shadow-xl">
            <p className="text-lg font-semibold text-foreground">Drop to send</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Photos, videos, or PDFs
            </p>
          </div>
        </div>
      )}

      {/* Preview dialog after drop */}
      <AttachmentPreviewDialog
        file={pendingAttachment}
        threadId={threadId}
        onClose={() => setPendingAttachment(null)}
        onSent={fetchMessages}
      />
    </div>
  );
};

export default ThreadChatView;
