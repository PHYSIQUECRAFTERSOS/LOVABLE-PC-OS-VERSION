import { useState, useEffect, useCallback } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import StaffDetailModal from "@/components/team/StaffDetailModal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { UserPlus, Shield, Users, Activity, Loader2, Send, Crown, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import AddClientWithAssignmentDialog from "@/components/clients/AddClientWithAssignmentDialog";

interface StaffMember {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  roles: string[];
  client_count: number;
}

interface PendingInvite {
  id: string;
  email: string;
  role: string;
  first_name: string | null;
  last_name: string | null;
  created_at: string;
  expires_at: string;
}

const rolePriority: Record<string, number> = { admin: 0, manager: 1, coach: 2 };
const roleLabels: Record<string, string> = { admin: "Owner", manager: "Manager", coach: "Coach" };
const roleColors: Record<string, string> = {
  admin: "bg-primary/20 text-primary",
  manager: "bg-primary/10 text-primary",
  coach: "bg-accent/20 text-accent-foreground",
};

const Team = () => {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [addClientOpen, setAddClientOpen] = useState(false);
  const [inviteFirstName, setInviteFirstName] = useState("");
  const [inviteLastName, setInviteLastName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("coach");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);

  const isAdmin = role === "admin";

  const fetchStaff = useCallback(async () => {
    setLoading(true);
    try {
      // Get all admin, manager, and coach users
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["admin", "manager", "coach"] as any);

      if (!roleRows || roleRows.length === 0) {
        setStaff([]);
        setLoading(false);
        return;
      }

      // Group roles by user
      const userRolesMap = new Map<string, string[]>();
      for (const r of roleRows) {
        const existing = userRolesMap.get(r.user_id) || [];
        existing.push(r.role);
        userRolesMap.set(r.user_id, existing);
      }

      const userIds = Array.from(userRolesMap.keys());

      // Fetch profiles
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, avatar_url")
        .in("user_id", userIds);

      // Fetch client counts
      const { data: coachClients } = await supabase
        .from("coach_clients")
        .select("coach_id")
        .in("coach_id", userIds)
        .eq("status", "active");

      const clientCountMap = new Map<string, number>();
      for (const cc of coachClients || []) {
        clientCountMap.set(cc.coach_id, (clientCountMap.get(cc.coach_id) || 0) + 1);
      }

      const members: StaffMember[] = userIds.map((uid) => {
        const profile = (profiles || []).find((p) => p.user_id === uid);
        const roles = userRolesMap.get(uid) || [];
        return {
          user_id: uid,
          full_name: profile?.full_name || "Unknown",
          avatar_url: profile?.avatar_url || null,
          roles,
          client_count: clientCountMap.get(uid) || 0,
        };
      });

      // Sort: admin first, then manager, then coaches
      members.sort((a, b) => {
        const aPri = Math.min(...a.roles.map((r) => rolePriority[r] ?? 10));
        const bPri = Math.min(...b.roles.map((r) => rolePriority[r] ?? 10));
        return aPri - bPri;
      });

      setStaff(members);

      // Fetch pending invites
      const { data: invites } = await supabase
        .from("staff_invites")
        .select("id, email, role, first_name, last_name, created_at, expires_at")
        .eq("used", false)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });

      setPendingInvites(invites || []);
    } catch (err) {
      console.error("[Team] Fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStaff(); }, [fetchStaff]);

  const handleInvite = async () => {
    if (!inviteFirstName.trim() || !inviteLastName.trim() || !inviteEmail.trim()) return;
    setInviteLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("staff-invite", {
        body: {
          action: "send",
          email: inviteEmail.trim(),
          role: inviteRole,
          first_name: inviteFirstName.trim(),
          last_name: inviteLastName.trim(),
        },
      });

      if (error) throw new Error("Failed to send invite");
      if (data?.error) throw new Error(data.error);

      const emailSent = data?.email_sent !== false;
      const setupUrl = data?.setup_url;

      if (emailSent) {
        toast({ title: "Invite Sent", description: `Invitation sent to ${inviteEmail}` });
      } else if (setupUrl) {
        await navigator.clipboard.writeText(setupUrl).catch(() => {});
        toast({
          title: "Invite Created — Link Copied",
          description: "Email delivery failed. Setup link copied to clipboard.",
        });
      }

      setInviteFirstName("");
      setInviteLastName("");
      setInviteEmail("");
      setInviteRole("coach");
      setInviteOpen(false);
      fetchStaff();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setInviteLoading(false);
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    await supabase.from("staff_invites").update({ used: true }).eq("id", inviteId);
    toast({ title: "Invite revoked" });
    fetchStaff();
  };

  const totalClients = staff.reduce((sum, s) => sum + s.client_count, 0);
  const initials = (name: string) =>
    name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

  const primaryRole = (roles: string[]) => {
    if (roles.includes("admin")) return "admin";
    if (roles.includes("manager")) return "manager";
    return roles[0] || "coach";
  };

  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Team</h1>
            <p className="mt-1 text-sm text-muted-foreground">Manage your coaching staff and permissions.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setAddClientOpen(true)}>
              <UserPlus className="h-4 w-4 mr-1" /> Add Client
            </Button>
            <Button onClick={() => setInviteOpen(true)}>
              <UserPlus className="h-4 w-4 mr-1" /> Invite Staff
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-border bg-card">
            <CardContent className="pt-4 flex items-center gap-3">
              <Users className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold text-foreground">{staff.length}</p>
                <p className="text-xs text-muted-foreground">Team Members</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border bg-card">
            <CardContent className="pt-4 flex items-center gap-3">
              <Shield className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold text-foreground">{totalClients}</p>
                <p className="text-xs text-muted-foreground">Total Clients</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border bg-card">
            <CardContent className="pt-4 flex items-center gap-3">
              <Activity className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold text-foreground">{pendingInvites.length}</p>
                <p className="text-xs text-muted-foreground">Pending Invites</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Staff List */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Staff</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : staff.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No staff members yet.</p>
            ) : (
              staff.map((member) => {
                const memberRole = primaryRole(member.roles);
                const isCurrentUser = member.user_id === user?.id;
                const canClick = isAdmin && !isCurrentUser;
                return (
                  <div
                    key={member.user_id}
                    className={`flex items-center gap-3 py-2 border-b border-border last:border-0 ${canClick ? "cursor-pointer hover:bg-secondary/30 rounded-lg px-2 -mx-2 transition-colors" : ""}`}
                    onClick={() => canClick && setSelectedStaff(member)}
                  >
                    <Avatar className="h-10 w-10">
                      {member.avatar_url && <AvatarImage src={member.avatar_url} />}
                      <AvatarFallback className="bg-secondary text-foreground">
                        {initials(member.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                        {member.full_name}
                        {isCurrentUser && <span className="text-xs text-muted-foreground">(You)</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">{member.client_count} clients assigned</p>
                    </div>
                    <Badge className={roleColors[memberRole] || "bg-secondary text-secondary-foreground"}>
                      {memberRole === "admin" && <Crown className="h-3 w-3 mr-1" />}
                      {roleLabels[memberRole] || memberRole}
                    </Badge>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Pending Invites */}
        {pendingInvites.length > 0 && (
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-base">Pending Invites</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {pendingInvites.map((inv) => {
                const displayName = [inv.first_name, inv.last_name].filter(Boolean).join(" ");
                return (
                <div key={inv.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-muted text-muted-foreground">
                      {displayName ? displayName.split(" ").map(w => w[0]).join("").toUpperCase().slice(0,2) : inv.email[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{displayName || inv.email}</p>
                    {displayName && <p className="text-xs text-muted-foreground">{inv.email}</p>}
                    <p className="text-xs text-muted-foreground">
                      Expires {new Date(inv.expires_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge variant="outline" className="bg-accent/10 text-accent-foreground border-accent/20">Pending</Badge>
                  <Badge variant="outline">{roleLabels[inv.role] || inv.role}</Badge>
                  <Button variant="ghost" size="icon" onClick={() => handleRevokeInvite(inv.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Invite Staff Modal */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Invite Staff Member</DialogTitle>
            <DialogDescription>Send a secure invite. They'll have 48 hours to accept.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="staff_first_name">First Name *</Label>
                <Input
                  id="staff_first_name"
                  value={inviteFirstName}
                  onChange={(e) => setInviteFirstName(e.target.value)}
                  placeholder="John"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="staff_last_name">Last Name *</Label>
                <Input
                  id="staff_last_name"
                  value={inviteLastName}
                  onChange={(e) => setInviteLastName(e.target.value)}
                  placeholder="Smith"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff_email">Email *</Label>
              <Input
                id="staff_email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="coach@example.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff_role">Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="coach">Coach</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="admin">Owner</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleInvite} className="w-full" disabled={inviteLoading || !inviteEmail || !inviteFirstName.trim() || !inviteLastName.trim()}>
              {inviteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send Invite
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Client with Assignment Dialog */}
      <AddClientWithAssignmentDialog
        open={addClientOpen}
        onOpenChange={setAddClientOpen}
        onInviteSent={fetchStaff}
      />
    </AppLayout>
  );
};

export default Team;
