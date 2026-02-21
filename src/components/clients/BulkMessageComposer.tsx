import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Badge } from "@/components/ui/badge";
import {
  Send,
  Loader2,
  MessageSquare,
  Megaphone,
  Users,
  Eye,
} from "lucide-react";
import type { SelectableClient } from "./SelectableClientCards";

interface BulkMessageComposerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipients: SelectableClient[];
}

const MAX_CHARS = 2000;

const BulkMessageComposer = ({
  open,
  onOpenChange,
  recipients,
}: BulkMessageComposerProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [deliveryType, setDeliveryType] = useState<"direct" | "announcement">(
    "direct"
  );
  const [sending, setSending] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const charCount = message.length;
  const canSend = message.trim().length > 0 && recipients.length > 0;

  const handleSend = () => {
    if (!canSend) return;
    setShowConfirm(true);
  };

  const confirmSend = async () => {
    if (!user || !canSend) return;
    setShowConfirm(false);
    setSending(true);

    try {
      if (deliveryType === "announcement") {
        // Create a single broadcast conversation
        const { data: convo, error: convoErr } = await supabase
          .from("conversations")
          .insert({
            created_by: user.id,
            type: "broadcast",
            name: `Broadcast — ${new Date().toLocaleDateString()}`,
          })
          .select()
          .single();

        if (convoErr) throw convoErr;

        const participants = [
          { conversation_id: convo.id, user_id: user.id },
          ...recipients.map((r) => ({
            conversation_id: convo.id,
            user_id: r.id,
          })),
        ];

        const { error: partErr } = await supabase
          .from("conversation_participants")
          .insert(participants);
        if (partErr) throw partErr;

        const { error: msgErr } = await supabase.from("messages").insert({
          conversation_id: convo.id,
          sender_id: user.id,
          content: message,
        });
        if (msgErr) throw msgErr;
      } else {
        // Direct messages: send into each client's 1:1 thread
        for (const client of recipients) {
          // Find or create 1:1 conversation
          const { data: existing } = await supabase
            .from("conversations")
            .select(
              "id, conversation_participants!inner(user_id)"
            )
            .eq("type", "direct")
            .eq("conversation_participants.user_id", client.id);

          let convoId: string | null = null;

          if (existing && existing.length > 0) {
            // Check which ones include the coach
            for (const conv of existing) {
              const { data: parts } = await supabase
                .from("conversation_participants")
                .select("user_id")
                .eq("conversation_id", conv.id);
              const uids = (parts || []).map((p) => p.user_id);
              if (uids.includes(user.id) && uids.includes(client.id)) {
                convoId = conv.id;
                break;
              }
            }
          }

          if (!convoId) {
            const { data: newConvo, error: cErr } = await supabase
              .from("conversations")
              .insert({
                created_by: user.id,
                type: "direct",
                name: null,
              })
              .select()
              .single();
            if (cErr) throw cErr;
            convoId = newConvo.id;

            await supabase.from("conversation_participants").insert([
              { conversation_id: convoId, user_id: user.id },
              { conversation_id: convoId, user_id: client.id },
            ]);
          }

          await supabase.from("messages").insert({
            conversation_id: convoId,
            sender_id: user.id,
            content: message,
          });
        }
      }

      toast({
        title: "Messages sent! 📨",
        description: `Successfully sent to ${recipients.length} client${recipients.length !== 1 ? "s" : ""}.`,
      });

      setMessage("");
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Error sending messages",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              Bulk Message
            </DialogTitle>
            <DialogDescription>
              Compose a message to send to your selected clients.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Recipients badge */}
            <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary/50">
              <Users className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm text-foreground font-medium">
                Sending to:
              </span>
              <Badge variant="secondary" className="font-bold text-primary">
                {recipients.length} client{recipients.length !== 1 ? "s" : ""}
              </Badge>
            </div>

            {/* Delivery type */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Delivery Type
              </Label>
              <Select
                value={deliveryType}
                onValueChange={(v: "direct" | "announcement") =>
                  setDeliveryType(v)
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="direct">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-3.5 w-3.5" />
                      Direct Message (1:1 threads)
                    </div>
                  </SelectItem>
                  <SelectItem value="announcement">
                    <div className="flex items-center gap-2">
                      <Megaphone className="h-3.5 w-3.5" />
                      Announcement (broadcast)
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Message body */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Message</Label>
                <span
                  className={`text-[10px] tabular-nums ${
                    charCount > MAX_CHARS
                      ? "text-destructive"
                      : "text-muted-foreground"
                  }`}
                >
                  {charCount}/{MAX_CHARS}
                </span>
              </div>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, MAX_CHARS))}
                placeholder="Write your message..."
                rows={5}
                className="resize-none"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPreview(true)}
                disabled={!message.trim()}
                className="gap-1.5 text-muted-foreground"
              >
                <Eye className="h-3.5 w-3.5" />
                Preview
              </Button>

              <Button
                onClick={handleSend}
                disabled={!canSend || sending || charCount > MAX_CHARS}
                className="gap-2"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {sending ? "Sending..." : "Send Message"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Send</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to send this message to{" "}
              <span className="font-bold text-foreground">
                {recipients.length} client{recipients.length !== 1 ? "s" : ""}
              </span>{" "}
              as a{" "}
              <span className="font-bold text-foreground">
                {deliveryType === "direct"
                  ? "direct message"
                  : "broadcast announcement"}
              </span>
              . This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSend}>
              Confirm & Send
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Preview */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Message Preview</DialogTitle>
          </DialogHeader>
          <div className="p-4 rounded-lg bg-secondary/50 text-sm text-foreground whitespace-pre-wrap">
            {message}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default BulkMessageComposer;
