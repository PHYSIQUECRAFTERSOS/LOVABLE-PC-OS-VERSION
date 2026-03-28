import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { MessageSquare, Send, CheckCheck, Check } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import MessageAttachment from "@/components/messaging/MessageAttachment";
import EmojiReactions from "@/components/messaging/EmojiReactions";
import AttachmentUploadMenu from "@/components/messaging/AttachmentUploadMenu";
import VoiceMessageRecorder from "@/components/messaging/VoiceMessageRecorder";
import { sendPushToUser } from "@/hooks/usePushNotifications";

interface Message {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
  read_at: string | null;
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

const MessagingTab = ({ clientId }: { clientId: string }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reactions, setReactions] = useState<Record<string, Reaction[]>>({});
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadThread(); }, [clientId, user]);

  const loadThread = async () => {
    if (!user || !clientId) return;
    setLoading(true);

    const { data: profile } = await supabase
      .from("profiles").select("full_name").eq("user_id", clientId).single();
    setClientName(profile?.full_name || "Client");

    const { data: existingThread } = await supabase
      .from("message_threads").select("id")
      .eq("coach_id", user.id).eq("client_id", clientId).maybeSingle();

    if (existingThread) {
      setThreadId(existingThread.id);
      await loadMessages(existingThread.id);
    } else {
      setThreadId(null);
      setMessages([]);
    }
    setLoading(false);
  };

  const loadMessages = async (tId: string) => {
    const { data } = await supabase
      .from("thread_messages")
      .select("*")
      .eq("thread_id", tId)
      .order("created_at", { ascending: true })
      .limit(50);
    const msgs = (data as Message[]) || [];
    setMessages(msgs);

    // Fetch reactions
    if (msgs.length) {
      const { data: reactionData } = await supabase
        .from("message_reactions")
        .select("*")
        .in("message_id", msgs.map(m => m.id));
      const grouped: Record<string, Reaction[]> = {};
      (reactionData as Reaction[] || []).forEach(r => {
        if (!grouped[r.message_id]) grouped[r.message_id] = [];
        grouped[r.message_id].push(r);
      });
      setReactions(grouped);
    }

    if (user) {
      await supabase
        .from("message_threads")
        .update({ coach_last_seen_at: new Date().toISOString(), coach_marked_unread: false } as any)
        .eq("id", tId).eq("coach_id", user.id);
      // Also mark all unread messages from client as read
      await supabase
        .from("thread_messages")
        .update({ read_at: new Date().toISOString() } as any)
        .eq("thread_id", tId)
        .neq("sender_id", user.id)
        .is("read_at" as any, null);
      window.dispatchEvent(new Event("messages-read"));
    }
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  const handleSend = async () => {
    if (!newMessage.trim() || !user) return;
    setSending(true);
    let tId = threadId;
    if (!tId) {
      const { data: newThread, error } = await supabase
        .from("message_threads").insert({ coach_id: user.id, client_id: clientId }).select("id").single();
      if (error || !newThread) {
        toast({ title: "Error", description: error?.message || "Could not create thread", variant: "destructive" });
        setSending(false);
        return;
      }
      tId = newThread.id;
      setThreadId(tId);
    }
    const { error } = await supabase.from("thread_messages").insert({
      thread_id: tId, sender_id: user.id, content: newMessage.trim(),
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      const messageContent = newMessage.trim();
      setNewMessage("");
      await loadMessages(tId);

      // Send push notification to client
      const senderName = user.user_metadata?.full_name || user.email?.split("@")[0] || "Your Coach";
      sendPushToUser(
        clientId,
        `Message from ${senderName}`,
        messageContent.length > 100 ? messageContent.slice(0, 97) + "..." : messageContent,
        "message",
        { route: "/messages" }
      );
    }
    setSending(false);
  };

  const handleReactionsChange = (messageId: string, newReactions: Reaction[]) => {
    setReactions(prev => ({ ...prev, [messageId]: newReactions }));
  };

  // Realtime
  useEffect(() => {
    if (!threadId) return;
    const channel = supabase
      .channel(`workspace-chat-${threadId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "thread_messages", filter: `thread_id=eq.${threadId}` },
        (payload) => {
          const msg = payload.new as Message;
          setMessages(prev => [...prev, msg]);
          if (user && msg.sender_id !== user.id) {
            supabase.from("thread_messages").update({ read_at: new Date().toISOString() }).eq("id", msg.id);
          }
        })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "thread_messages", filter: `thread_id=eq.${threadId}` },
        (payload) => {
          const updated = payload.new as Message;
          setMessages(prev => prev.map(m => m.id === updated.id ? updated : m));
        })
      .subscribe();

    const reactChannel = supabase
      .channel(`workspace-reactions-${threadId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, () => {
        if (threadId) loadMessages(threadId);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(reactChannel);
    };
  }, [threadId, user]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
      </div>
    );
  }

  return (
    <Card className="flex flex-col" style={{ height: "500px" }}>
      <CardHeader className="pb-3 shrink-0">
        <CardTitle className="text-sm flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          Messages with {clientName}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col min-h-0 pb-3">
        <div className="flex-1 overflow-y-auto space-y-3 mb-3 pr-1">
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No messages yet. Start the conversation.</p>
          ) : (
            messages.map(msg => {
              const isMe = msg.sender_id === user?.id;
              const msgReactions = reactions[msg.id] || [];
              return (
                <div key={msg.id} className={cn("flex gap-2 group", isMe ? "justify-end" : "justify-start")}>
                  <div className={cn("max-w-[75%] space-y-1")}>
                    <div className={cn(
                      "rounded-2xl px-3 py-2 text-sm",
                      isMe ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted rounded-bl-md"
                    )}>
                      {msg.attachment_url && msg.attachment_type && (
                        <div className="mb-1">
                         <MessageAttachment
                            url={msg.attachment_url}
                            type={msg.attachment_type as "image" | "video" | "pdf" | "audio"}
                            name={msg.attachment_name || undefined}
                            isOwn={isMe}
                          />
                        </div>
                      )}
                      {msg.content && <p className="whitespace-pre-wrap break-words">{msg.content}</p>}
                    </div>
                    <EmojiReactions messageId={msg.id} reactions={msgReactions} onReactionsChange={handleReactionsChange} />
                    <div className={cn("flex items-center gap-1 text-[10px] text-muted-foreground", isMe ? "justify-end" : "justify-start")}>
                      <span>{format(new Date(msg.created_at), "h:mm a")}</span>
                      {isMe && (msg.read_at ? <CheckCheck className="h-3 w-3 text-primary" /> : <Check className="h-3 w-3" />)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        <div className="flex gap-2 shrink-0 items-center">
          {!isRecording && threadId && <AttachmentUploadMenu threadId={threadId} onSent={() => threadId && loadMessages(threadId)} />}
          {!isRecording && (
            <Input
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              className="flex-1"
            />
          )}
          {newMessage.trim() ? (
            <Button size="icon" onClick={handleSend} disabled={sending || !newMessage.trim()} className="shrink-0">
              <Send className="h-4 w-4" />
            </Button>
          ) : threadId ? (
            <VoiceMessageRecorder
              threadId={threadId}
              onSent={() => threadId && loadMessages(threadId)}
              onRecordingStateChange={setIsRecording}
            />
          ) : (
            <Button size="icon" disabled className="shrink-0">
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default MessagingTab;
