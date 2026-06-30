import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Users, UserPlus, Search } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAllClients } from "@/hooks/useCulture";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  challengeId: string;
  challengeTitle: string;
}

const AddClientsToChallengeDialog = ({ open, onOpenChange, challengeId, challengeTitle }: Props) => {
  const { data: allClients, isLoading } = useAllClients();
  const qc = useQueryClient();
  const [existingIds, setExistingIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !challengeId) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("challenge_participants")
        .select("user_id")
        .eq("challenge_id", challengeId);
      setExistingIds(new Set((data || []).map((r: any) => r.user_id)));
      setSelected(new Set());
      setSearch("");
    })();
  }, [open, challengeId]);

  const available = useMemo(() => {
    return (allClients || [])
      .filter((c: any) => !existingIds.has(c.user_id))
      .filter((c: any) =>
        !search.trim() || (c.full_name || "").toLowerCase().includes(search.toLowerCase())
      )
      .sort((a: any, b: any) => (a.full_name || "").localeCompare(b.full_name || ""));
  }, [allClients, existingIds, search]);

  const enroll = async (userIds: string[]) => {
    if (!userIds.length) {
      toast.info("No clients to add");
      return;
    }
    setSubmitting(true);
    const rows = userIds.map((uid) => ({ challenge_id: challengeId, user_id: uid }));
    const { error } = await (supabase as any).from("challenge_participants").insert(rows);
    setSubmitting(false);
    if (error) {
      toast.error(`Failed to add clients: ${error.message}`);
      return;
    }
    toast.success(`Added ${userIds.length} client${userIds.length === 1 ? "" : "s"} to ${challengeTitle}`);
    qc.invalidateQueries({ queryKey: ["challenge-participants", challengeId] });
    qc.invalidateQueries({ queryKey: ["challenges"] });
    onOpenChange(false);
  };

  const toggle = (uid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const allAvailableIds = available.map((c: any) => c.user_id);
  const allSelected = allAvailableIds.length > 0 && allAvailableIds.every((id) => selected.has(id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Add Clients
          </DialogTitle>
          <DialogDescription>
            Enroll clients in <span className="font-medium text-foreground">{challengeTitle}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 flex-1 min-h-0 flex flex-col">
          <Button
            onClick={() => enroll(allAvailableIds)}
            disabled={submitting || isLoading || allAvailableIds.length === 0}
            className="w-full"
          >
            <Users className="h-4 w-4 mr-2" />
            Add All Clients ({allAvailableIds.length})
          </Button>

          <div className="text-center text-xs text-muted-foreground">or pick specific clients</div>

          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search clients..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
            <span>{available.length} available · {existingIds.size} already in challenge</span>
            {allAvailableIds.length > 0 && (
              <button
                onClick={() =>
                  setSelected(allSelected ? new Set() : new Set(allAvailableIds))
                }
                className="text-primary hover:underline"
              >
                {allSelected ? "Clear" : "Select all shown"}
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto border border-border rounded-lg divide-y divide-border min-h-[200px]">
            {isLoading ? (
              <p className="text-xs text-muted-foreground text-center py-6">Loading clients...</p>
            ) : available.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">
                {existingIds.size > 0
                  ? "All clients are already enrolled."
                  : "No clients found."}
              </p>
            ) : (
              available.map((c: any) => {
                const initials = (c.full_name || "U").split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
                const isSel = selected.has(c.user_id);
                return (
                  <label
                    key={c.user_id}
                    className="flex items-center gap-3 p-2.5 hover:bg-secondary/40 cursor-pointer"
                  >
                    <Checkbox checked={isSel} onCheckedChange={() => toggle(c.user_id)} />
                    <Avatar className="h-7 w-7">
                      {c.avatar_url && <AvatarImage src={c.avatar_url} />}
                      <AvatarFallback className="text-[10px] bg-secondary">{initials}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm text-foreground truncate flex-1">{c.full_name}</span>
                  </label>
                );
              })
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={() => enroll(Array.from(selected))}
              disabled={submitting || selected.size === 0}
            >
              Add {selected.size > 0 ? `(${selected.size})` : ""}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddClientsToChallengeDialog;
