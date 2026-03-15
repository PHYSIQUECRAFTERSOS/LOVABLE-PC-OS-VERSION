import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { UserCheck, UserX, Loader2, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface DeactivatedClient {
  id: string;
  client_id: string;
  name: string;
  avatar_url?: string;
  assigned_at: string;
}

interface DeactivatedClientsListProps {
  refreshKey?: number;
}

const DeactivatedClientsList = ({ refreshKey }: DeactivatedClientsListProps) => {
  const { user } = useAuth();
  const [clients, setClients] = useState<DeactivatedClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [reactivateTarget, setReactivateTarget] = useState<DeactivatedClient | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeactivatedClient | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const fetchDeactivated = async () => {
    if (!user) return;
    setLoading(true);

    const { data: assignments } = await supabase
      .from("coach_clients")
      .select("id, client_id, assigned_at")
      .eq("coach_id", user.id)
      .eq("status", "deactivated");

    if (!assignments?.length) {
      setClients([]);
      setLoading(false);
      return;
    }

    const clientIds = assignments.map((a) => a.client_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name, avatar_url")
      .in("user_id", clientIds);

    const profileMap: Record<string, any> = {};
    (profiles || []).forEach((p) => (profileMap[p.user_id] = p));

    setClients(
      assignments.map((a) => ({
        id: a.id,
        client_id: a.client_id,
        name: profileMap[a.client_id]?.full_name || "Client",
        avatar_url: profileMap[a.client_id]?.avatar_url,
        assigned_at: a.assigned_at,
      }))
    );
    setLoading(false);
  };

  useEffect(() => {
    fetchDeactivated();
  }, [user, refreshKey]);

  const handleAction = async (action: "reactivate" | "delete", client: DeactivatedClient) => {
    setActionLoading(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("manage-client-status", {
        body: { action, clientId: client.client_id },
      });
      if (error) throw error;
      if (res?.error) throw new Error(res.error);

      toast.success(
        action === "reactivate"
          ? `${client.name} has been reactivated.`
          : `${client.name}'s account has been permanently deleted.`
      );
      fetchDeactivated();
    } catch (err: any) {
      toast.error(err.message || `Failed to ${action} client`);
    } finally {
      setActionLoading(false);
      setReactivateTarget(null);
      setDeleteTarget(null);
      setDeleteConfirmText("");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (clients.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <UserX className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No deactivated clients</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {clients.map((client) => (
          <Card key={client.id}>
            <CardContent className="py-3 flex items-center gap-3">
              <Avatar className="h-9 w-9 shrink-0 opacity-60">
                <AvatarImage src={client.avatar_url} alt={client.name} />
                <AvatarFallback className="text-xs">{client.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{client.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  Deactivated {formatDistanceToNow(new Date(client.assigned_at), { addSuffix: true })}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setReactivateTarget(client)}>
                  <UserCheck className="h-3.5 w-3.5" />
                  Reactivate
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive h-8 w-8 p-0" onClick={() => setDeleteTarget(client)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Reactivate Confirmation */}
      <AlertDialog open={!!reactivateTarget} onOpenChange={(v) => !v && setReactivateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reactivate {reactivateTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will restore the client's access. They will be able to log in and will appear in your Active Clients tab again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => reactivateTarget && handleAction("reactivate", reactivateTarget)} disabled={actionLoading}>
              {actionLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Reactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) { setDeleteTarget(null); setDeleteConfirmText(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Permanently Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the client's account and all their data. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <p className="text-sm text-muted-foreground mb-2">Type <strong>DELETE</strong> to confirm:</p>
            <Input value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} placeholder="DELETE" className="font-mono" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && handleAction("delete", deleteTarget)}
              disabled={actionLoading || deleteConfirmText !== "DELETE"}
              className="bg-destructive hover:bg-destructive/90"
            >
              {actionLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default DeactivatedClientsList;
