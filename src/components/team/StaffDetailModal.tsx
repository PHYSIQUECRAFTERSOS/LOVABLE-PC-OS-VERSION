import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Users, Crown, Ban, Trash2, Loader2 } from "lucide-react";

interface StaffMember {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  roles: string[];
  client_count: number;
}

interface StaffClient {
  client_id: string;
  name: string;
  avatar_url: string | null;
}

const roleLabels: Record<string, string> = { admin: "Owner", manager: "Manager", coach: "Coach" };

interface StaffDetailModalProps {
  member: StaffMember | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStaffUpdated: () => void;
}

const StaffDetailModal = ({ member, open, onOpenChange, onStaffUpdated }: StaffDetailModalProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [clients, setClients] = useState<StaffClient[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!member || !open) return;
    const fetchClients = async () => {
      setLoadingClients(true);
      const { data: assignments } = await supabase
        .from("coach_clients")
        .select("client_id")
        .eq("coach_id", member.user_id)
        .eq("status", "active");

      if (!assignments?.length) {
        setClients([]);
        setLoadingClients(false);
        return;
      }

      const ids = assignments.map((a) => a.client_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, avatar_url")
        .in("user_id", ids);

      setClients(
        (profiles || []).map((p) => ({
          client_id: p.user_id,
          name: p.full_name || "Client",
          avatar_url: p.avatar_url,
        }))
      );
      setLoadingClients(false);
    };
    fetchClients();
  }, [member, open]);

  const initials = (name: string) =>
    name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

  const primaryRole = (roles: string[]) => {
    if (roles.includes("admin")) return "admin";
    if (roles.includes("manager")) return "manager";
    return roles[0] || "coach";
  };

  const handleDeactivate = async () => {
    if (!member) return;
    setActionLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("staff-invite", {
        body: { action: "deactivate_staff", staff_user_id: member.user_id },
      });
      if (error || data?.error) throw new Error(data?.error || "Failed to deactivate");
      toast({ title: "Staff Deactivated", description: `${member.full_name} has been deactivated.` });
      setDeactivateOpen(false);
      onOpenChange(false);
      onStaffUpdated();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!member) return;
    setActionLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("staff-invite", {
        body: { action: "delete_staff", staff_user_id: member.user_id },
      });
      if (error || data?.error) throw new Error(data?.error || "Failed to delete");
      toast({ title: "Staff Deleted", description: `${member.full_name} has been permanently deleted.` });
      setDeleteOpen(false);
      setDeleteConfirm("");
      onOpenChange(false);
      onStaffUpdated();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  if (!member) return null;

  const role = primaryRole(member.roles);
  const isSelf = member.user_id === user?.id;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Staff Details</DialogTitle>
            <DialogDescription>View and manage this team member.</DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="w-full">
              <TabsTrigger value="overview" className="flex-1">Overview</TabsTrigger>
              <TabsTrigger value="clients" className="flex-1">Clients</TabsTrigger>
              {!isSelf && <TabsTrigger value="actions" className="flex-1">Actions</TabsTrigger>}
            </TabsList>

            <TabsContent value="overview" className="mt-4 space-y-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  {member.avatar_url && <AvatarImage src={member.avatar_url} />}
                  <AvatarFallback className="bg-secondary text-foreground text-lg">
                    {initials(member.full_name)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="text-lg font-bold text-foreground">{member.full_name}</h3>
                  <Badge className={
                    role === "admin" ? "bg-primary/20 text-primary" :
                    role === "manager" ? "bg-primary/10 text-primary" :
                    "bg-accent/20 text-accent-foreground"
                  }>
                    {role === "admin" && <Crown className="h-3 w-3 mr-1" />}
                    {roleLabels[role] || role}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Card className="border-border bg-card">
                  <CardContent className="pt-4 text-center">
                    <p className="text-2xl font-bold text-foreground">{member.client_count}</p>
                    <p className="text-xs text-muted-foreground">Active Clients</p>
                  </CardContent>
                </Card>
                <Card className="border-border bg-card">
                  <CardContent className="pt-4 text-center">
                    <p className="text-2xl font-bold text-foreground">{member.roles.length}</p>
                    <p className="text-xs text-muted-foreground">Roles</p>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="clients" className="mt-4">
              {loadingClients ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : clients.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">No active clients assigned.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {clients.map((c) => (
                    <div key={c.client_id} className="flex items-center gap-3 p-2 rounded-lg border border-border">
                      <Avatar className="h-8 w-8">
                        {c.avatar_url && <AvatarImage src={c.avatar_url} />}
                        <AvatarFallback className="text-xs bg-secondary">{c.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium text-foreground">{c.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {!isSelf && (
              <TabsContent value="actions" className="mt-4 space-y-4">
                <Card className="border-border bg-card">
                  <CardContent className="pt-4 space-y-3">
                    <div>
                      <h4 className="text-sm font-semibold text-foreground mb-1">Deactivate Staff</h4>
                      <p className="text-xs text-muted-foreground mb-3">
                        Prevents login and removes access. Can be reversed by re-inviting.
                      </p>
                      <Button
                        variant="outline"
                        className="w-full gap-2 border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                        onClick={() => setDeactivateOpen(true)}
                      >
                        <Ban className="h-4 w-4" />
                        Deactivate {member.full_name}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-destructive/30 bg-card">
                  <CardContent className="pt-4 space-y-3">
                    <div>
                      <h4 className="text-sm font-semibold text-destructive mb-1">Delete Staff</h4>
                      <p className="text-xs text-muted-foreground mb-3">
                        Permanently removes this staff member and their auth account. Their clients will be unassigned. This cannot be undone.
                      </p>
                      <Button
                        variant="destructive"
                        className="w-full gap-2"
                        onClick={() => setDeleteOpen(true)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete {member.full_name}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            )}
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Deactivate Confirmation */}
      <AlertDialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate {member.full_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will prevent them from logging in and remove their access. Their client assignments will remain but become inactive.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeactivate} disabled={actionLoading} className="bg-amber-600 hover:bg-amber-700">
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Deactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={(o) => { setDeleteOpen(o); if (!o) setDeleteConfirm(""); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently Delete {member.full_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. All data associated with this staff member will be permanently removed. Type <strong>DELETE</strong> to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder='Type "DELETE" to confirm'
            className="mt-2"
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={actionLoading || deleteConfirm !== "DELETE"}
              className="bg-destructive hover:bg-destructive/90"
            >
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete Permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default StaffDetailModal;
