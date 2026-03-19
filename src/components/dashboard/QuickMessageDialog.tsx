import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import UserAvatar from "@/components/profile/UserAvatar";
import { Send, X, CheckCheck, Check } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
  read_at: string | null;
}

interface QuickMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientName: string;
  clientAvatar?: string | null;
  prefillMessage?: string;
}

const QuickMessageDialog = ({
  open,
  onOpenChange,
  clientId,
  clientName,
  clientAvatar,
  prefillMessage,
}: QuickMessageDialogProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [threadId, setThreadId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && prefillMessage) {
      setNewMessage(prefillMessage);
    }
  }, [open, prefillMessage]);

  useEffect(() => {
    if (open && user && clientId) {
      loadThread();
    }
    return () => {
      setMessages([]);
      setThreadId(null);
      setLoading(true);
    };
  }, [open, clientId, user]);

  // Realtime subscription
  useEffect(() => {
    if (!threadId || !open) return;
    const channel = supabase
      .channel(`quick-msg-${threadId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "thread_messages",
        filter: `thread_id=eq.${threadId}`,
      }, (payload) => {
        const msg = payload.new as Message;
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "thread_messages",
        filter: `thread_id=eq.${threadId}`,
      }, (payload) => {
        const updated = payload.new as Message;
        setMessages((prev) => prev.map((m) => m.id === updated.id ? updated : m));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [threadId, open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadThread = async () => {
    if (!user) return;
    setLoading(true);

    const { data: existingThread } = await supabase
      .from("message_threads")
      .select("id")
      .eq("coach_id", user.id)
      .eq("client_id", clientId)
      .maybeSingle();

    if (existingThread) {
      setThreadId(existingThread.id);
      const { data } = await supabase
        .from("thread_messages")
        .select("*")
        .eq("thread_id", existingThread.id)
        .order("created_at", { ascending: true })
        .limit(30);
      setMessages((data as Message[]) || []);

      // Mark as seen
      await supabase
        .from("message_threads")
        .update({ coach_last_seen_at: new Date().toISOString(), coach_marked_unread: false } as any)
        .eq("id", existingThread.id)
        .eq("coach_id", user.id);
    } else {
      setThreadId(null);
      setMessages([]);
    }
    setLoading(false);
  };

  const handleSend = async () => {
    if (!newMessage.trim() || !user) return;
    setSending(true);

    let tId = threadId;
    if (!tId) {
      const { data: newThread, error } = await supabase
        .from("message_threads")
        .insert({ coach_id: user.id, client_id: clientId })
        .select("id")
        .single();
      if (error || !newThread) {
        toast({ title: "Error", description: error?.message || "Could not create thread", variant: "destructive" });
        setSending(false);
        return;
      }
      tId = newThread.id;
      setThreadId(tId);
    }

    const { error } = await supabase.from("thread_messages").insert({
      thread_id: tId,
      sender_id: user.id,
      content: newMessage.trim(),
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setNewMessage("");
    }
    setSending(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[80vh] flex flex-col p-0 gap-0">
        {/* Header */}
        <DialogHeader className="px-4 py-3 border-b border-border flex-row items-center gap-3 space-y-0">
          <UserAvatar src={clientAvatar} name={clientName} className="h-8 w-8" />
          <DialogTitle className="text-sm font-semibold flex-1">{clientName}</DialogTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-[200px] max-h-[400px]">
          {loading ? (
            <p className="text-xs text-muted-foreground text-center py-8">Loading...</p>
          ) : messages.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">No messages yet. Send one below.</p>
          ) : (
            messages.map((msg) => {
              const isMe = msg.sender_id === user?.id;
              return (
                <div key={msg.id} className={cn("flex", isMe ? "justify-end" : "justify-start")}>
                  <div className={cn(
                    "max-w-[75%] rounded-2xl px-3 py-2 text-sm",
                    isMe ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted rounded-bl-md"
                  )}>
                    <p>{msg.content}</p>
                    <div className={cn("flex items-center gap-1 text-[10px] mt-1 opacity-60", isMe ? "justify-end" : "justify-start")}>
                      <span>{format(new Date(msg.created_at), "h:mm a")}</span>
                      {isMe && (msg.read_at ? <CheckCheck className="h-3 w-3" /> : <Check className="h-3 w-3" />)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-border px-4 py-3 flex gap-2">
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            className="flex-1"
            autoFocus
          />
          <Button size="icon" onClick={handleSend} disabled={sending || !newMessage.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default QuickMessageDialog;
