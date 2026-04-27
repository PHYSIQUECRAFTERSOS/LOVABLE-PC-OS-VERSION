import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Copy,
  Check,
  Ban,
  Trash2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Invite {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  client_type: string;
  invite_status: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
  tags: string[];
  invite_token?: string;
  created_client_id?: string | null;
}

interface InviteListProps {
  refreshKey: number;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ElementType }> = {
  pending: { label: "Pending", variant: "secondary", icon: Clock },
  accepted: { label: "Active", variant: "default", icon: CheckCircle2 },
  expired: { label: "Expired", variant: "destructive", icon: AlertTriangle },
  invalidated: { label: "Cancelled", variant: "outline", icon: XCircle },
};

const InviteList = ({ refreshKey }: InviteListProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [resending, setResending] = useState<string | null>(null);
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Invite | null>(null);
  const [cancelTarget, setCancelTarget] = useState<{ invite: Invite; preBuiltCount: number } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const setCopiedState = (inviteId: string) => {
    setCopiedInviteId(inviteId);
    window.setTimeout(() => {
      setCopiedInviteId((current) => (current === inviteId ? null : current));
    }, 2000);
  };

  const buildSetupUrl = (inviteToken?: string) => {
    if (!inviteToken) return null;
    return `${window.location.origin}/setup?token=${inviteToken}`;
  };

  const handleCopySetupLink = async (invite: Invite) => {
    const setupUrl = buildSetupUrl(invite.invite_token);
    if (!setupUrl) {
      toast({ title: "Setup Link Unavailable", description: "Resend the invite to generate a fresh setup link.", variant: "destructive" });
      return;
    }
    await navigator.clipboard.writeText(setupUrl).catch(() => { throw new Error("Failed to copy setup link"); });
    setCopiedState(invite.id);
    toast({ title: "Setup Link Copied", description: `Share the setup link directly with ${invite.first_name}.` });
  };

  const fetchInvites = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("client_invites")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) {
      const now = new Date();
      const updated = data.map((inv: any) => {
        if (inv.invite_status === "pending" && new Date(inv.expires_at) < now) {
          return { ...inv, invite_status: "expired" };
        }
        return inv;
      });
      setInvites(updated as Invite[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchInvites();
  }, [user, refreshKey]);

  // Count pre-built data the coach has staged for this pending client.
  // Used to warn before revoking an invite that would orphan that work.
  const countPreBuiltData = async (clientId: string): Promise<number> => {
    const [progRes, mealRes, calRes, suppRes, notesRes] = await Promise.all([
      supabase.from("client_program_assignments").select("id", { count: "exact", head: true }).eq("client_id", clientId),
      supabase.from("coach_meal_plan_uploads").select("id", { count: "exact", head: true }).eq("client_id", clientId),
      supabase.from("calendar_events").select("id", { count: "exact", head: true }).eq("target_client_id", clientId),
      supabase.from("client_supplement_assignments").select("id", { count: "exact", head: true }).eq("client_id", clientId),
      supabase.from("client_notes").select("id", { count: "exact", head: true }).eq("client_id", clientId),
    ]);
    return (progRes.count || 0) + (mealRes.count || 0) + (calRes.count || 0) + (suppRes.count || 0) + (notesRes.count || 0);
  };

  const performCancel = async (invite: Invite) => {
    setCancelling(invite.id);
    try {
      const { error } = await supabase
        .from("client_invites")
        .update({ invite_status: "invalidated", updated_at: new Date().toISOString() })
        .eq("id", invite.id);

      if (error) throw error;

      // Remove the pending coach_clients row so the pending card disappears
      // from Active Clients. Only touches PENDING rows — never an active client.
      if (invite.created_client_id) {
        await supabase
          .from("coach_clients")
          .delete()
          .eq("client_id", invite.created_client_id)
          .eq("status", "pending");
      }

      toast({ title: "Invite Cancelled", description: `The invite for ${invite.first_name} ${invite.last_name} has been voided.` });
      fetchInvites();
    } catch (err: any) {
      toast({ title: "Cancel Failed", description: err.message || "Could not cancel invite.", variant: "destructive" });
    } finally {
      setCancelling(null);
      setCancelTarget(null);
    }
  };

  const handleCancel = async (invite: Invite) => {
    // If pre-built data exists, warn before revoking
    if (invite.created_client_id) {
      const count = await countPreBuiltData(invite.created_client_id);
      if (count > 0) {
        setCancelTarget({ invite, preBuiltCount: count });
        return;
      }
    }
    await performCancel(invite);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      // Also remove the pending coach_clients row (active rows are protected by status filter)
      if (deleteTarget.created_client_id) {
        await supabase
          .from("coach_clients")
          .delete()
          .eq("client_id", deleteTarget.created_client_id)
          .eq("status", "pending");
      }

      const { error } = await supabase
        .from("client_invites")
        .delete()
        .eq("id", deleteTarget.id);

      if (error) throw error;

      toast({ title: "Invite Deleted", description: `Invite for ${deleteTarget.first_name} ${deleteTarget.last_name} has been permanently removed.` });
      setDeleteTarget(null);
      fetchInvites();
    } catch (err: any) {
      toast({ title: "Delete Failed", description: err.message || "Could not delete invite.", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const handleResend = async (invite: Invite) => {
    if (resending) return;
    setResending(invite.id);
    try {
      const { data, error } = await supabase.functions.invoke("resend-client-invite", {
        body: { invite_id: invite.id },
      });
      if (error) throw new Error(error.message || "Failed to resend invite");
      if (!data?.success) throw new Error(data?.error || "Failed to resend invite");

      if (data.setup_url) {
        await navigator.clipboard.writeText(data.setup_url).catch(() => {});
        setCopiedState(invite.id);
      }

      if (data.email_sent) {
        toast({ title: "Invite Resent", description: `New invite email sent to ${invite.email}. The setup link was copied too.` });
      } else if (data.setup_url) {
        toast({ title: "Invite Updated — Link Copied", description: `New invite link generated and copied to clipboard. Share it with ${invite.first_name} manually.` });
      }
      fetchInvites();
    } catch (err: any) {
      toast({ title: "Resend Failed", description: err.message || "Failed to resend invite.", variant: "destructive" });
    } finally {
      setResending(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (invites.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        No invites sent yet. Click "+ Add Client" to invite your first client.
      </p>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {invites.map((invite) => {
          const config = statusConfig[invite.invite_status] || statusConfig.pending;
          const StatusIcon = config.icon;
          const isExpired = invite.invite_status === "expired";
          const isPending = invite.invite_status === "pending";
          const isInvalidated = invite.invite_status === "invalidated";
          const isAccepted = invite.invite_status === "accepted";
          const canResend = isExpired || isPending || isInvalidated;
          const canCancel = isPending;
          const canDelete = isInvalidated || isExpired;
          const canCopySetupLink = isPending && Boolean(invite.invite_token);
          const isCopied = copiedInviteId === invite.id;

          return (
            <Card key={invite.id} className="hover:border-primary/20 transition-colors">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground text-sm truncate">
                        {invite.first_name} {invite.last_name}
                      </p>
                      <Badge variant={config.variant} className="text-[10px] gap-1">
                        <StatusIcon className="h-3 w-3" />
                        {config.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{invite.email}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Invited {formatDistanceToNow(new Date(invite.created_at), { addSuffix: true })}
                      {isPending && (
                        <> · Expires {formatDistanceToNow(new Date(invite.expires_at), { addSuffix: true })}</>
                      )}
                    </p>
                    {invite.tags && invite.tags.length > 0 && (
                      <div className="flex gap-1 mt-1.5 flex-wrap">
                        {invite.tags.map((tag) => (
                          <Badge key={tag} variant="outline" className="text-[9px] px-1.5 py-0">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="ml-3 flex shrink-0 items-center gap-1.5 flex-wrap justify-end">
                    {canCopySetupLink && (
                      <Button size="sm" variant="outline" onClick={() => handleCopySetupLink(invite)} className="gap-1.5 text-xs">
                        {isCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        {isCopied ? "Copied" : "Copy Link"}
                      </Button>
                    )}

                    {canCancel && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCancel(invite)}
                        disabled={cancelling === invite.id}
                        className="gap-1.5 text-xs text-destructive hover:text-destructive"
                      >
                        {cancelling === invite.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Ban className="h-3 w-3" />}
                        Cancel
                      </Button>
                    )}

                    {canResend && (
                      <Button size="sm" variant="outline" onClick={() => handleResend(invite)} disabled={resending === invite.id} className="gap-1.5 text-xs">
                        {resending === invite.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                        Resend
                      </Button>
                    )}

                    {canDelete && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeleteTarget(invite)}
                        className="gap-1.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Invite</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently remove the invite for <strong>{deleteTarget?.first_name} {deleteTarget?.last_name}</strong> ({deleteTarget?.email})? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Keep</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>This client has pre-built data. Delete anyway?</AlertDialogTitle>
            <AlertDialogDescription>
              You've already built {cancelTarget?.preBuiltCount} item{cancelTarget?.preBuiltCount === 1 ? "" : "s"} (programs, meal plans, calendar events, supps, or notes) for <strong>{cancelTarget?.invite.first_name} {cancelTarget?.invite.last_name}</strong>. Cancelling the invite will remove their pending profile and that work will be orphaned.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!cancelling}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cancelTarget && performCancel(cancelTarget.invite)}
              disabled={!!cancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelling ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Delete anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default InviteList;
