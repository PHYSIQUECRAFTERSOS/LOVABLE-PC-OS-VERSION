import { useState, useEffect } from "react";
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
import { Loader2, Send, RefreshCw, Copy, Check } from "lucide-react";

interface Tier {
  id: string;
  name: string;
  requires_contract: boolean;
}

interface AddClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInviteSent: () => void;
}

const AddClientDialog = ({ open, onOpenChange, onInviteSent }: AddClientDialogProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [lastSetupUrl, setLastSetupUrl] = useState<string | null>(null);
  const [form, setForm] = useState({
    email: "",
    first_name: "",
    last_name: "",
    phone: "",
    tier_id: "",
    tier_name: "",
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

  // Load tiers on mount
  useEffect(() => {
    if (open) {
      supabase
        .from("client_tiers")
        .select("id, name, requires_contract")
        .order("name")
        .then(({ data }) => {
          if (data) setTiers(data as Tier[]);
        });
    }
  }, [open]);

  const handleTierChange = (tierId: string) => {
    const tier = tiers.find((t) => t.id === tierId);
    setForm({
      ...form,
      tier_id: tierId,
      tier_name: tier?.name || "",
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!form.tier_id) {
      toast({ title: "Please select a tier", variant: "destructive" });
      return;
    }

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
            tier_id: form.tier_id,
            tier_name: form.tier_name,
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

      if (emailSent && setupUrl) {
        toast({
          title: "Invite Sent",
          description: `Invitation email sent to ${form.email}. Setup link also available to copy.`,
        });
      } else if (emailSent) {
        toast({
          title: "Invite Sent",
          description: `Invitation email sent to ${form.email}. They have 7 days to set up their account.`,
        });
      } else if (setupUrl) {
        await navigator.clipboard.writeText(setupUrl).catch(() => {});
        toast({
          title: "Invite Created — Link Copied",
          description: `Email delivery failed. The setup link has been copied to your clipboard.`,
        });
      }

      // Show setup link dialog if available
      if (setupUrl) {
        setLastSetupUrl(setupUrl);
      } else {
        setForm({
          email: "",
          first_name: "",
          last_name: "",
          phone: "",
          tier_id: "",
          tier_name: "",
          client_type: "full_access",
          tags: "",
        });
        onOpenChange(false);
      }
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

  const selectedTier = tiers.find((t) => t.id === form.tier_id);

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
            <Label htmlFor="tier">Client Tier *</Label>
            <Select value={form.tier_id} onValueChange={handleTierChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select a tier…" />
              </SelectTrigger>
              <SelectContent>
                {tiers.map((tier) => (
                  <SelectItem key={tier.id} value={tier.id}>
                    {tier.name}
                    {tier.requires_contract && " (Contract)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedTier && (
              <p className="text-xs text-muted-foreground">
                {selectedTier.name.includes("Transfer Client")
                  ? "Transfer client — ToS acceptance only. Original agreement on file externally."
                  : selectedTier.requires_contract
                    ? "Contract required — client will sign during onboarding."
                    : "No contract — ToS acceptance only."}
              </p>
            )}
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
            <Button type="submit" className="w-full" disabled={isLoading || !form.tier_id}>
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
