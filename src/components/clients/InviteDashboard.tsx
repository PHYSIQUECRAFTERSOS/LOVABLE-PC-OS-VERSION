import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Send,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Eye,
  Users,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

interface Invite {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  tier_name: string | null;
  invite_status: string;
  expires_at: string;
  created_at: string;
  assigned_coach_id: string;
}

interface TierBreakdown {
  tier: string;
  sent: number;
  signed: number;
  pending: number;
  expired: number;
}

interface Props {
  isAdmin?: boolean;
  coachNames?: Map<string, string>;
}

const InviteDashboard = ({ isAdmin = false }: Props) => {
  const { user } = useAuth();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [resending, setResending] = useState<string | null>(null);
  const [coachMap, setCoachMap] = useState<Map<string, string>>(new Map());

  const fetchInvites = useCallback(async () => {
    if (!user) return;

    let query = supabase
      .from("client_invites")
      .select("id, email, first_name, last_name, tier_name, invite_status, expires_at, created_at, assigned_coach_id")
      .order("created_at", { ascending: false });

    if (!isAdmin) {
      query = query.eq("assigned_coach_id", user.id);
    }

    const { data } = await query;
    if (data) {
      const now = new Date();
      const processed = data.map((inv: any) => {
        if (inv.invite_status === "pending" && new Date(inv.expires_at) < now) {
          return { ...inv, invite_status: "expired" };
        }
        return inv;
      });
      setInvites(processed);

      // Fetch coach names for admin view
      if (isAdmin) {
        const coachIds = [...new Set(processed.map((i: any) => i.assigned_coach_id))];
        if (coachIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("user_id, full_name")
            .in("user_id", coachIds);
          if (profiles) {
            const map = new Map<string, string>();
            profiles.forEach((p: any) => map.set(p.user_id, p.full_name || "Unknown"));
            setCoachMap(map);
          }
        }
      }
    }
    setLoading(false);
  }, [user, isAdmin]);

  useEffect(() => {
    fetchInvites();
    const interval = setInterval(fetchInvites, 60000);
    return () => clearInterval(interval);
  }, [fetchInvites]);

  const handleResend = async (invite: Invite) => {
    if (resending) return;
    setResending(invite.id);
    try {
      const { data, error } = await supabase.functions.invoke("resend-client-invite", {
        body: { invite_id: invite.id },
      });
      if (error) {
        console.error("Resend error:", error);
        const { toast } = await import("sonner");
        toast.error("Failed to resend invite");
        return;
      }
      const result = typeof data === "string" ? JSON.parse(data) : data;
      if (result?.email_sent) {
        const { toast } = await import("sonner");
        toast.success("Invite resent successfully");
      } else if (result?.setup_url) {
        await navigator.clipboard.writeText(result.setup_url);
        const { toast } = await import("sonner");
        toast.info("Email queueing failed — setup link copied to clipboard");
      }
      fetchInvites();
    } catch {
      const { toast } = await import("sonner");
      toast.error("Failed to resend invite");
    } finally {
      setResending(null);
    }
  };

  // Summary counts
  const totalSent = invites.length;
  const pending = invites.filter((i) => i.invite_status === "pending").length;
  const completed = invites.filter((i) => i.invite_status === "accepted").length;
  const expired = invites.filter((i) => i.invite_status === "expired").length;

  // Per-tier breakdown
  const allTiers = [
    "1-Year Program — Paid in Full",
    "1-Year Program — Monthly Payments",
    "6-Month Program — Paid in Full",
    "6-Month Program — Monthly Payments",
    "Monthly",
    "6-Week Program",
    "Transfer Client — No New Agreement Required",
  ];

  const tierBreakdowns: TierBreakdown[] = allTiers.map((tier) => {
    const tierInvites = invites.filter((i) => i.tier_name === tier);
    return {
      tier,
      sent: tierInvites.length,
      signed: tierInvites.filter((i) => i.invite_status === "accepted").length,
      pending: tierInvites.filter((i) => i.invite_status === "pending").length,
      expired: tierInvites.filter((i) => i.invite_status === "expired").length,
    };
  });

  const statusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary" className="gap-1 text-[10px]"><Clock className="h-3 w-3" />Pending</Badge>;
      case "accepted":
        return <Badge variant="default" className="gap-1 text-[10px]"><CheckCircle2 className="h-3 w-3" />Signed</Badge>;
      case "expired":
        return <Badge variant="destructive" className="gap-1 text-[10px]"><AlertTriangle className="h-3 w-3" />Expired</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <Send className="h-5 w-5 text-primary" />
            <div>
              <p className="text-2xl font-bold text-foreground">{totalSent}</p>
              <p className="text-xs text-muted-foreground">Total Sent</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <Clock className="h-5 w-5 text-primary/70" />
            <div>
              <p className="text-2xl font-bold text-foreground">{pending}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            <div>
              <p className="text-2xl font-bold text-foreground">{completed}</p>
              <p className="text-xs text-muted-foreground">Completed</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <div>
              <p className="text-2xl font-bold text-foreground">{expired}</p>
              <p className="text-xs text-muted-foreground">Expired</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Per-tier breakdown */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-display flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Per-Tier Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Tier</TableHead>
                  <TableHead className="text-xs text-center">Sent</TableHead>
                  <TableHead className="text-xs text-center">Signed</TableHead>
                  <TableHead className="text-xs text-center">Pending</TableHead>
                  <TableHead className="text-xs text-center">Expired</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tierBreakdowns.map((tb) => (
                  <TableRow key={tb.tier}>
                    <TableCell className="text-xs font-medium max-w-[180px] truncate">{tb.tier}</TableCell>
                    <TableCell className="text-xs text-center">{tb.sent}</TableCell>
                    <TableCell className="text-xs text-center">{tb.signed}</TableCell>
                    <TableCell className="text-xs text-center">{tb.pending}</TableCell>
                    <TableCell className="text-xs text-center">{tb.expired}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-semibold">
                  <TableCell className="text-xs">Total</TableCell>
                  <TableCell className="text-xs text-center">{totalSent}</TableCell>
                  <TableCell className="text-xs text-center">{completed}</TableCell>
                  <TableCell className="text-xs text-center">{pending}</TableCell>
                  <TableCell className="text-xs text-center">{expired}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Per-invite list */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-display">All Invites</CardTitle>
          <Button variant="ghost" size="sm" onClick={fetchInvites} className="gap-1">
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Client</TableHead>
                  <TableHead className="text-xs">Tier</TableHead>
                  <TableHead className="text-xs">Sent</TableHead>
                  {isAdmin && <TableHead className="text-xs">Sent By</TableHead>}
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invites.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 6 : 5} className="text-center text-sm text-muted-foreground py-8">
                      No invites sent yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  invites.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell>
                        <div>
                          <p className="text-xs font-medium">{inv.first_name} {inv.last_name}</p>
                          <p className="text-[10px] text-muted-foreground">{inv.email}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-[10px] max-w-[120px] truncate">
                        {inv.tier_name || "—"}
                      </TableCell>
                      <TableCell className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {format(new Date(inv.created_at), "MMM d, yyyy")}
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-[10px]">
                          {coachMap.get(inv.assigned_coach_id) || "—"}
                        </TableCell>
                      )}
                      <TableCell>{statusBadge(inv.invite_status)}</TableCell>
                      <TableCell className="text-right">
                        {(inv.invite_status === "pending" || inv.invite_status === "expired") && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleResend(inv)}
                            disabled={resending === inv.id}
                            className="h-7 text-[10px] gap-1"
                          >
                            {resending === inv.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3 w-3" />
                            )}
                            Resend
                          </Button>
                        )}
                        {inv.invite_status === "accepted" && (
                          <Button size="sm" variant="ghost" className="h-7 text-[10px] gap-1">
                            <Eye className="h-3 w-3" />
                            View
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default InviteDashboard;
