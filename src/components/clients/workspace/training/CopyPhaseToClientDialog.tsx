/**
 * CopyPhaseToClientDialog — picker that lists the coach's other active clients
 * and triggers a deep copy of the source phase into that client's active program.
 */
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import SearchableClientSelect from "@/components/ui/searchable-client-select";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coachId: string;
  excludeClientId: string;
  phaseName: string;
  onConfirm: (targetClientId: string) => Promise<void>;
}

export const CopyPhaseToClientDialog = ({
  open, onOpenChange, coachId, excludeClientId, phaseName, onConfirm,
}: Props) => {
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState<{ id: string; name: string; status?: string }[]>([]);
  const [selected, setSelected] = useState("");
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected("");
    setLoading(true);
    (async () => {
      const { data: cc } = await supabase
        .from("coach_clients")
        .select("client_id, status")
        .eq("coach_id", coachId)
        .in("status", ["active", "pending"]);
      const rows = (cc || []).filter((r: any) => r.client_id !== excludeClientId);
      const ids = rows.map((r: any) => r.client_id);
      if (ids.length === 0) { setClients([]); setLoading(false); return; }
      const statusById = new Map(rows.map((r: any) => [r.client_id, r.status]));
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", ids);
      const list = (profiles || []).map((p: any) => ({
        id: p.user_id,
        name: p.full_name || "Client",
        status: statusById.get(p.user_id) || "active",
      }));
      // Active first, then pending; alphabetical within each group.
      list.sort((a, b) => {
        if (a.status !== b.status) return a.status === "active" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      setClients(list);
      setLoading(false);
    })();
  }, [open, coachId, excludeClientId]);

  const handleConfirm = async () => {
    if (!selected) return;
    setCopying(true);
    try {
      await onConfirm(selected);
      onOpenChange(false);
    } finally {
      setCopying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Copy Phase to Another Client</DialogTitle>
          <DialogDescription>
            Append "{phaseName}" (and all its workouts) to another client's active program.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Label className="text-xs">Client</Label>
          {loading ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <SearchableClientSelect
              clients={clients}
              value={selected}
              onValueChange={setSelected}
              placeholder="Search clients…"
            />
          )}
          {selected && clients.find(c => c.id === selected)?.status === "pending" && (
            <p className="text-xs text-primary/80 leading-snug">
              This client hasn't signed up yet — a fresh program will be created so the phase is waiting for them on first login.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={!selected || copying}>
            {copying ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Users className="h-3.5 w-3.5 mr-1" />}
            Copy to Client
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CopyPhaseToClientDialog;
