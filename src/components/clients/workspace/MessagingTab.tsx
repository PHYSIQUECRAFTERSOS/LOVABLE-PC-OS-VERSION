import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { MessageSquare } from "lucide-react";
import ThreadChatView from "@/components/messaging/ThreadChatView";

const MessagingTab = ({ clientId }: { clientId: string }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [clientName, setClientName] = useState("Client");
  const [clientAvatar, setClientAvatar] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      if (!user || !clientId) return;
      setLoading(true);

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("user_id", clientId)
        .maybeSingle();
      setClientName(profile?.full_name?.trim() || "Client");
      setClientAvatar(profile?.avatar_url || null);

      const { data: existingThread } = await supabase
        .from("message_threads")
        .select("id")
        .eq("coach_id", user.id)
        .eq("client_id", clientId)
        .maybeSingle();

      if (existingThread) {
        setThreadId(existingThread.id);
      } else {
        const { data: newThread, error } = await supabase
          .from("message_threads")
          .insert({ coach_id: user.id, client_id: clientId })
          .select("id")
          .single();
        if (error || !newThread) {
          toast({
            title: "Error",
            description: error?.message || "Could not create thread",
            variant: "destructive",
          });
        } else {
          setThreadId(newThread.id);
        }
      }
      setLoading(false);
    };

    init();
  }, [clientId, user, toast]);

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
    <Card className="flex flex-col overflow-hidden" style={{ height: "500px" }}>
      <CardHeader className="pb-3 shrink-0 border-b">
        <CardTitle className="text-sm flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          Messages with {clientName}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 p-0">
        {threadId ? (
          <ThreadChatView
            threadId={threadId}
            otherUserName={clientName}
            otherUserAvatar={clientAvatar}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Unable to initialize messaging.
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MessagingTab;
