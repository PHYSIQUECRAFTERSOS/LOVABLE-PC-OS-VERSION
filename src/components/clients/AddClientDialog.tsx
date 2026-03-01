import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useTimedLoader } from "@/hooks/useTimedLoader";
import { withTimeout, TIMEOUTS } from "@/lib/performance";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Send, AlertTriangle, RefreshCw } from "lucide-react";

interface AddClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInviteSent: () => void;
}

const AddClientDialog = ({ open, onOpenChange, onInviteSent }: AddClientDialogProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState({
    email: "",
    first_name: "",
    last_name: "",
    phone: "",
    client_type: "full_access",
    tags: "",
  });

  const { phase, start, stop, fail } = useTimedLoader({
    onTimeout: () => {
      toast({
        title: "Request Timed Out",
        description: "The invite took too long. Please try again.",
        variant: "destructive",
      });
    },
  });

  const isLoading = phase === "loading" || phase === "slow";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    start();

    try {
      const res = await withTimeout(
        supabase.functions.invoke("send-client-invite", {
          body: {
            email: form.email.trim(),
            first_name: form.first_name.trim(),
            last_name: form.last_name.trim(),
            phone: form.phone.trim() || undefined,
            client_type: form.client_type,
            tags: form.tags
              ? form.tags.split(",").map((t) => t.trim()).filter(Boolean)
              : [],
          },
        }),
        TIMEOUTS.AI_PROCESS,
        "send-client-invite"
      );

      if (res.error) {
        throw new Error(res.error.message || "Failed to send invite");
      }

      stop();

      const emailSent = res.data?.email_sent !== false;
      const setupUrl = res.data?.invite?.setup_url;

      if (emailSent) {
        toast({
          title: "Invite Sent",
          description: `Invitation email sent to ${form.email}. They have 7 days to set up their account.`,
        });
      } else if (setupUrl) {
        await navigator.clipboard.writeText(setupUrl).catch(() => {});
        toast({
          title: "Invite Created — Link Copied",
          description: `Email delivery failed. The setup link has been copied to your clipboard. Share it with ${form.first_name} manually.`,
        });
      }

      setForm({
        email: "",
        first_name: "",
        last_name: "",
        phone: "",
        client_type: "full_access",
        tags: "",
      });
      onOpenChange(false);
      onInviteSent();
    } catch (err: any) {
      fail();
      toast({
        title: "Error",
        description: err.message || "Failed to send invite",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Add Client</DialogTitle>
          <DialogDescription>
            Send a secure invite link. The client will have 7 days to set up their account.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="first_name">First Name *</Label>
              <Input
                id="first_name"
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                placeholder="John"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last_name">Last Name *</Label>
              <Input
                id="last_name"
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                placeholder="Doe"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="invite_email">Email *</Label>
            <Input
              id="invite_email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="client@example.com"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone (optional)</Label>
            <Input
              id="phone"
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+1 555 0123"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="client_type">Client Type</Label>
            <Select
              value={form.client_type}
              onValueChange={(v) => setForm({ ...form, client_type: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="full_access">Full Access</SelectItem>
                <SelectItem value="read_only">Read-Only</SelectItem>
                <SelectItem value="program_only">Program Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tags">Tags (comma separated, optional)</Label>
            <Input
              id="tags"
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              placeholder="Fat Loss Phase 1, High Stress"
            />
          </div>

          {phase === "failed" ? (
            <Button type="button" variant="destructive" className="w-full" onClick={handleSubmit as any}>
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
          ) : (
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {phase === "slow" ? "Still working..." : "Send Invite"}
            </Button>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddClientDialog;
