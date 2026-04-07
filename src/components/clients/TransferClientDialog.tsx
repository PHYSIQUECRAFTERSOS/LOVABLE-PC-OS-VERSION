import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";

interface TransferClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientName: string;
  currentCoachId: string;
  onTransferred: () => void;
}

interface CoachOption {
  id: string;
  name: string;
  avatar_url: string | null;
}

const TransferClientDialog = ({
  open,
  onOpenChange,
  clientId,
  clientName,
  currentCoachId,
  onTransferred,
}: TransferClientDialogProps) => {
  const { user } = useAuth();
  const [coaches, setCoaches] = useState<CoachOption[]>([]);
  const [selectedCoach, setSelectedCoach] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!open) return;
    setSelectedCoach("");
    fetchCoaches();
  }, [open]);

  const fetchCoaches = async () => {
    setFetching(true);
    try {
      // Get all coach/admin user IDs
      const { data: roles, error: rolesErr } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["coach", "admin"]);

      if (rolesErr) throw rolesErr;

      const coachUserIds = [...new Set((roles || []).map((r) => r.user_id))];
      // Exclude current coach
      const otherCoachIds = coachUserIds.filter((id) => id !== currentCoachId);

      if (otherCoachIds.length === 0) {
        setCoaches([]);
        setFetching(false);
        return;
      }

      const { data: profiles, error: profilesErr } = await supabase
        .from("profiles")
        .select("user_id, full_name, avatar_url")
        .in("user_id", otherCoachIds);

      if (profilesErr) throw profilesErr;

      setCoaches(
        (profiles || []).map((p) => ({
          id: p.user_id,
          name: p.full_name || "Unknown Coach",
          avatar_url: p.avatar_url,
        }))
      );
    } catch (err) {
      console.error("Failed to fetch coaches:", err);
    } finally {
      setFetching(false);
    }
  };

  const handleTransfer = async () => {
    if (!selectedCoach) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-client-status", {
        body: { action: "transfer", clientId, targetCoachId: selectedCoach },
      });

      if (error) throw new Error(error.message || "Transfer failed");
      if (data?.error) throw new Error(data.error);

      const targetCoach = coaches.find((c) => c.id === selectedCoach);
      toast.success(`${clientName} transferred to ${targetCoach?.name || "new coach"}`);
      onOpenChange(false);
      onTransferred();
    } catch (err: any) {
      toast.error(err.message || "Transfer failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-primary" />
            Transfer Client
          </DialogTitle>
          <DialogDescription>
            Transfer <strong>{clientName}</strong> to a different coach. All data, messages, and assignments will be moved.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {fetching ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : coaches.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No other coaches available to transfer to.
            </p>
          ) : (
            <div className="space-y-3">
              <label className="text-sm font-medium text-foreground">Select New Coach</label>
              <Select value={selectedCoach} onValueChange={setSelectedCoach}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a coach..." />
                </SelectTrigger>
                <SelectContent>
                  {coaches.map((coach) => (
                    <SelectItem key={coach.id} value={coach.id}>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-5 w-5">
                          <AvatarImage src={coach.avatar_url || undefined} />
                          <AvatarFallback className="text-[10px]">
                            {coach.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        {coach.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleTransfer} disabled={!selectedCoach || loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Transfer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TransferClientDialog;
