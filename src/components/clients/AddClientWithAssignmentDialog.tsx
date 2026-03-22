import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useTimedLoader } from "@/hooks/useTimedLoader";
import { withTimeout, TIMEOUTS } from "@/lib/performance";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Send, RefreshCw } from "lucide-react";

interface Tier {
  id: string;
  name: string;
  requires_contract: boolean;
}

interface StaffOption {
  user_id: string;
  full_name: string;
  role: string;
}

interface AddClientWithAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInviteSent: () => void;
}

const AddClientWithAssignmentDialog = ({ open, onOpenChange, onInviteSent }: AddClientWithAssignmentDialogProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [form, setForm] = useState({
    email: "",
    first_name: "",
    last_name: "",
    phone: "",
    tier_id: "",
    tier_name: "",
    client_type: "full_access",
    tags: "",
    assigned_coach_id: "",
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

  // Load tiers and staff on open
  useEffect(() => {
    if (!open) return;

    supabase
      .from("client_tiers")
      .select("id, name, requires_contract")
      .order("name")
      .then(({ data }) => {
        if (data) setTiers(data as Tier[]);
      });

    // Fetch all staff members (admin, manager, coach)
    (async () => {
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["admin", "manager", "coach"] as any);

      if (!roleRows || roleRows.length === 0) return;

      const userIds = [...new Set(roleRows.map((r) => r.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);

      const roleLabels: Record<string, string> = { admin: "Owner", manager: "Manager", coach: "Coach" };
      const rolePriority: Record<string, number> = { admin: 0, manager: 1, coach: 2 };

      // Build staff options — pick highest-priority role per user
      const userRoleMap = new Map<string, string>();
      for (const r of roleRows) {
        const existing = userRoleMap.get(r.user_id);
        if (!existing || (rolePriority[r.role] ?? 10) < (rolePriority[existing] ?? 10)) {
          userRoleMap.set(r.user_id, r.role);
        }
      }

      const options: StaffOption[] = userIds.map((uid) => {
        const profile = (profiles || []).find((p) => p.user_id === uid);
        const role = userRoleMap.get(uid) || "coach";
        return {
          user_id: uid,
          full_name: profile?.full_name || "Unknown",
          role: roleLabels[role] || role,
        };
      });

      // Sort by priority
      options.sort((a, b) => {
        const aPri = rolePriority[Object.entries(roleLabels).find(([, v]) => v === a.role)?.[0] || "coach"] ?? 10;
        const bPri = rolePriority[Object.entries(roleLabels).find(([, v]) => v === b.role)?.[0] || "coach"] ?? 10;
        return aPri - bPri;
      });

      setStaffOptions(options);

      // Default to current user
      if (user) {
        setForm((prev) => ({ ...prev, assigned_coach_id: prev.assigned_coach_id || user.id }));
      }
    })();
  }, [open, user]);

  const handleTierChange = (tierId: string) => {
    const tier = tiers.find((t) => t.id === tierId);
    setForm({ ...form, tier_id: tierId, tier_name: tier?.name || "" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!form.tier_id) {
      toast({ title: "Please select a tier", variant: "destructive" });
      return;
    }
    if (!form.assigned_coach_id) {
      toast({ title: "Please select who to assign this client to", variant: "destructive" });
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
            assigned_coach_id: form.assigned_coach_id,
            tags: form.tags
              ? form.tags.split(",").map((t) => t.trim()).filter(Boolean)
              : [],
          },
        }),
        TIMEOUTS.AI_PROCESS,
        "send-client-invite"
      );

      if (res.error) throw new Error(res.error.message || "Failed to send invite");

      stop();

      const emailSent = res.data?.email_sent !== false;
      const setupUrl = res.data?.invite?.setup_url;

      if (emailSent) {
        toast({
          title: "Invite Sent",
          description: `Invitation email sent to ${form.email}.`,
        });
      } else if (setupUrl) {
        await navigator.clipboard.writeText(setupUrl).catch(() => {});
        toast({
          title: "Invite Created — Link Copied",
          description: "Email delivery failed. Setup link copied to clipboard.",
        });
      }

      setForm({
        email: "",
        first_name: "",
        last_name: "",
        phone: "",
        tier_id: "",
        tier_name: "",
        client_type: "full_access",
        tags: "",
        assigned_coach_id: user.id,
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

  const selectedTier = tiers.find((t) => t.id === form.tier_id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Add Client</DialogTitle>
          <DialogDescription>
            Send a secure invite and assign the client to a team member.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="ac_first_name">First Name *</Label>
              <Input
                id="ac_first_name"
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                placeholder="John"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ac_last_name">Last Name *</Label>
              <Input
                id="ac_last_name"
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                placeholder="Doe"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ac_email">Email *</Label>
            <Input
              id="ac_email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="client@example.com"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ac_phone">Phone (optional)</Label>
            <Input
              id="ac_phone"
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+1 555 0123"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ac_tier">Client Tier *</Label>
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
                  ? "Transfer client — ToS acceptance only."
                  : selectedTier.requires_contract
                    ? "Contract required — client will sign during onboarding."
                    : "No contract — ToS acceptance only."}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="ac_assign">Assign To *</Label>
            <Select value={form.assigned_coach_id} onValueChange={(v) => setForm({ ...form, assigned_coach_id: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Select a team member…" />
              </SelectTrigger>
              <SelectContent>
                {staffOptions.map((s) => (
                  <SelectItem key={s.user_id} value={s.user_id}>
                    {s.full_name} ({s.role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ac_tags">Tags (comma separated, optional)</Label>
            <Input
              id="ac_tags"
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
            <Button type="submit" className="w-full" disabled={isLoading || !form.tier_id || !form.assigned_coach_id}>
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

export default AddClientWithAssignmentDialog;
