import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Copy,
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
}

interface InviteListProps {
  refreshKey: number;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ElementType }> = {
  pending: { label: "Pending", variant: "secondary", icon: Clock },
  accepted: { label: "Active", variant: "default", icon: CheckCircle2 },
  expired: { label: "Expired", variant: "destructive", icon: AlertTriangle },
  invalidated: { label: "Invalidated", variant: "outline", icon: XCircle },
};

const InviteList = ({ refreshKey }: InviteListProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [resending, setResending] = useState<string | null>(null);

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

  const handleResend = async (invite: Invite) => {
    if (resending) return; // Prevent multiple simultaneous resends
    setResending(invite.id);
    console.log("[InviteList] Resend clicked for:", invite.id, invite.email);

    try {
      const { data, error } = await supabase.functions.invoke("resend-client-invite", {
        body: { invite_id: invite.id },
      });

      console.log("[InviteList] Resend response:", data, "Error:", error);

      if (error) throw new Error(error.message || "Failed to resend invite");

      if (!data?.success) {
        throw new Error(data?.error || "Failed to resend invite");
      }

      if (data.email_sent) {
        toast({
          title: "Invite Resent",
          description: `New invite email sent to ${invite.email}. Expires in 7 days.`,
        });
      } else if (data.setup_url) {
        // Email couldn't be sent automatically — show URL for manual sharing
        await navigator.clipboard.writeText(data.setup_url).catch(() => {});
        toast({
          title: "Invite Updated — Link Copied",
          description: `New invite link generated and copied to clipboard. Share it with ${invite.first_name} manually.`,
        });
      }

      fetchInvites();
    } catch (err: any) {
      console.error("[InviteList] Resend error:", err);
      toast({
        title: "Resend Failed",
        description: err.message || "Failed to resend invite. Check logs for details.",
        variant: "destructive",
      });
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
    <div className="space-y-3">
      {invites.map((invite) => {
        const config = statusConfig[invite.invite_status] || statusConfig.pending;
        const StatusIcon = config.icon;
        const isExpired = invite.invite_status === "expired";
        const isPending = invite.invite_status === "pending";
        const isInvalidated = invite.invite_status === "invalidated";
        const canResend = isExpired || isPending || isInvalidated;

        return (
          <Card key={invite.id} className="hover:border-primary/20 transition-colors">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between">
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

                {canResend && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleResend(invite)}
                    disabled={resending === invite.id}
                    className="ml-3 shrink-0"
                  >
                    {resending === invite.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                    Resend
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default InviteList;