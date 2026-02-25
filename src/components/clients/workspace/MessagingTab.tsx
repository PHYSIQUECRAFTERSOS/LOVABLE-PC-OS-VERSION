import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { MessageSquare, Send } from "lucide-react";
import { format } from "date-fns";

const MessagingTab = ({ clientId }: { clientId: string }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadConversation();
  }, [clientId, user]);

  const loadConversation = async () => {
    if (!user || !clientId) return;
    setLoading(true);

    // Find existing conversation between coach and client
    const { data: participants } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", user.id);

    const coachConvoIds = (participants || []).map(p => p.conversation_id);

    if (coachConvoIds.length > 0) {
      const { data: clientParticipant } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", clientId)
        .in("conversation_id", coachConvoIds)
        .limit(1)
        .maybeSingle();

      if (clientParticipant) {
        setConversationId(clientParticipant.conversation_id);
        await loadMessages(clientParticipant.conversation_id);
        setLoading(false);
        return;
      }
    }

    setConversationId(null);
    setMessages([]);
    setLoading(false);
  };

  const loadMessages = async (convoId: string) => {
    const { data } = await supabase
      .from("messages")
      .select("id, content, sender_id, created_at")
      .eq("conversation_id", convoId)
      .order("created_at", { ascending: true })
      .limit(50);
    setMessages(data || []);
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }), 100);
  };

  const handleSend = async () => {
    if (!newMessage.trim() || !user) return;
    setSending(true);

    let convoId = conversationId;

    // Create conversation if needed
    if (!convoId) {
      const { data: convo, error: convoErr } = await supabase
        .from("conversations")
        .insert({ created_by: user.id, type: "direct" })
        .select()
        .single();
      if (convoErr || !convo) {
        toast({ title: "Error", description: convoErr?.message, variant: "destructive" });
        setSending(false);
        return;
      }
      convoId = convo.id;
      await supabase.from("conversation_participants").insert([
        { conversation_id: convoId, user_id: user.id },
        { conversation_id: convoId, user_id: clientId },
      ]);
      setConversationId(convoId);
    }

    const { error } = await supabase.from("messages").insert({
      conversation_id: convoId,
      sender_id: user.id,
      content: newMessage.trim(),
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setNewMessage("");
      await loadMessages(convoId);
    }
    setSending(false);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <Card className="flex flex-col" style={{ height: "500px" }}>
      <CardHeader className="pb-3 shrink-0">
        <CardTitle className="text-sm flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          Messages
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col min-h-0 pb-3">
        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 mb-3 pr-1">
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No messages yet. Start the conversation.
            </p>
          ) : (
            messages.map(msg => {
              const isMe = msg.sender_id === user?.id;
              return (
                <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] rounded-lg px-3 py-2 ${
                    isMe ? "bg-primary text-primary-foreground" : "bg-muted"
                  }`}>
                    <p className="text-sm">{msg.content}</p>
                    <p className={`text-[10px] mt-1 ${isMe ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                      {format(new Date(msg.created_at), "h:mm a")}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Input */}
        <div className="flex gap-2 shrink-0">
          <Textarea
            value={newMessage}
            onChange={e => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            className="min-h-[40px] max-h-[80px] resize-none"
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          />
          <Button size="icon" onClick={handleSend} disabled={sending || !newMessage.trim()} className="shrink-0">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default MessagingTab;
