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
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Send,
  Loader2,
  MessageSquare,
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
  const [sending, setSending] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());

  const effectiveRecipients = recipients.filter((r) => !excludedIds.has(r.id));
  const charCount = message.length;
  const canSend = message.trim().length > 0 && effectiveRecipients.length > 0;

  const toggleExclude = (id: string) => {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSend = () => {
    if (!canSend) return;
    setShowConfirm(true);
  };

  const confirmSend = async () => {
    if (!user || !canSend) return;
    setShowConfirm(false);
    setSending(true);

    try {
      for (const client of effectiveRecipients) {
        // Find existing thread between coach and client
        const { data: existingThread } = await supabase
          .from("message_threads")
          .select("id")
          .eq("coach_id", user.id)
          .eq("client_id", client.id)
          .maybeSingle();

        let threadId: string;

        if (existingThread) {
          threadId = existingThread.id;
        } else {
          // Create new thread
          const { data: newThread, error: threadErr } = await supabase
            .from("message_threads")
            .insert({
              coach_id: user.id,
              client_id: client.id,
            })
            .select()
            .single();
          if (threadErr) throw threadErr;
          threadId = newThread.id;
        }

        // Send message
        const { error: msgErr } = await supabase
          .from("thread_messages")
          .insert({
            thread_id: threadId,
            sender_id: user.id,
            content: message,
          });
        if (msgErr) throw msgErr;
      }

      toast({
        title: "Messages sent! 📨",
        description: `Successfully sent to ${effectiveRecipients.length} client${effectiveRecipients.length !== 1 ? "s" : ""}.`,
      });

      setMessage("");
      setExcludedIds(new Set());
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
            {/* Recipients with checkboxes */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm text-foreground font-medium">
                  Recipients
                </span>
                <Badge variant="secondary" className="font-bold text-primary ml-auto">
                  {effectiveRecipients.length} selected
                </Badge>
              </div>
              <div className="max-h-40 overflow-y-auto rounded-lg border border-border bg-secondary/30 p-2 space-y-1">
                {recipients.map((r) => (
                  <label
                    key={r.id}
                    className="flex items-center gap-2 p-1.5 rounded hover:bg-secondary/50 cursor-pointer"
                  >
                    <Checkbox
                      checked={!excludedIds.has(r.id)}
                      onCheckedChange={() => toggleExclude(r.id)}
                    />
                    <span className="text-sm text-foreground">{r.full_name}</span>
                  </label>
                ))}
              </div>
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
                {effectiveRecipients.length} client{effectiveRecipients.length !== 1 ? "s" : ""}
              </span>{" "}
              as a direct message. This action cannot be undone.
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
