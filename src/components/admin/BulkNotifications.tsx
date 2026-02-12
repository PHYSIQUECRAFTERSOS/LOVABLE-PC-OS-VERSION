import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Megaphone, Send, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BulkNotifications = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState<"all" | "coaches" | "clients">("all");
  const [sending, setSending] = useState(false);
  const [sentCount, setSentCount] = useState(0);

  const sendBulkNotification = async () => {
    if (!user || !message.trim()) return;
    setSending(true);

    try {
      // Get target user IDs based on audience
      let targetIds: string[] = [];

      if (audience === "all" || audience === "clients") {
        const { data: clientRoles } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "client");
        targetIds.push(...(clientRoles || []).map(r => r.user_id));
      }

      if (audience === "all" || audience === "coaches") {
        const { data: coachRoles } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "coach");
        targetIds.push(...(coachRoles || []).map(r => r.user_id));
      }

      // Deduplicate
      targetIds = [...new Set(targetIds)];

      if (targetIds.length === 0) {
        toast({ title: "No recipients found", variant: "destructive" });
        setSending(false);
        return;
      }

      // Create a broadcast conversation
      const { data: convo, error: convoErr } = await supabase
        .from("conversations")
        .insert({
          created_by: user.id,
          type: "broadcast",
          name: `Announcement — ${new Date().toLocaleDateString()}`,
        })
        .select()
        .single();

      if (convoErr) throw convoErr;

      // Add all participants
      const participants = [user.id, ...targetIds].map(uid => ({
        conversation_id: convo.id,
        user_id: uid,
      }));

      const { error: partErr } = await supabase
        .from("conversation_participants")
        .insert(participants);

      if (partErr) throw partErr;

      // Send message
      const { error: msgErr } = await supabase.from("messages").insert({
        conversation_id: convo.id,
        sender_id: user.id,
        content: message,
      });

      if (msgErr) throw msgErr;

      setSentCount(targetIds.length);
      setMessage("");
      toast({ title: `Announcement sent to ${targetIds.length} users! 📢` });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Megaphone className="h-5 w-5" /> Bulk Notifications
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Audience</Label>
          <Select value={audience} onValueChange={(v: "all" | "coaches" | "clients") => setAudience(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Users</SelectItem>
              <SelectItem value="coaches">Coaches Only</SelectItem>
              <SelectItem value="clients">Clients Only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Message</Label>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Write your announcement..."
            rows={4}
          />
        </div>

        <div className="flex items-center justify-between">
          <Button onClick={sendBulkNotification} disabled={sending || !message.trim()} className="gap-2">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? "Sending..." : "Send Announcement"}
          </Button>
          {sentCount > 0 && (
            <span className="text-xs text-muted-foreground">Last sent to {sentCount} users</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default BulkNotifications;
