/**
 * CopyPhaseToMasterDialog — picker that lists the coach's master programs
 * and triggers a deep copy of the source phase into the chosen master program.
 */
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Library, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coachId: string;
  phaseName: string;
  onConfirm: (targetMasterProgramId: string) => Promise<void>;
}

export const CopyPhaseToMasterDialog = ({ open, onOpenChange, coachId, phaseName, onConfirm }: Props) => {
  const [loading, setLoading] = useState(false);
  const [programs, setPrograms] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState("");
  const [copying, setCopying] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    setSelected("");
    setLoading(true);
    supabase
      .from("programs")
      .select("id, name")
      .eq("coach_id", coachId)
      .eq("is_template", true)
      .eq("is_master", true)
      .order("name")
      .then(({ data }) => {
        setPrograms((data || []).map((p: any) => ({ id: p.id, name: p.name })));
        setLoading(false);
      });
  }, [open, coachId]);

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
          <DialogTitle>Copy Phase to Master Program</DialogTitle>
          <DialogDescription>
            Append "{phaseName}" (and all its workouts) to one of your master programs.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Label className="text-xs">Master Program</Label>
          {loading ? (
            <Skeleton className="h-9 w-full" />
          ) : programs.length === 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                You don't have any Master Programs yet. Create one first.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => { onOpenChange(false); navigate("/libraries?tab=programs"); }}
              >
                <ExternalLink className="h-3 w-3 mr-1" /> Open Master Libraries
              </Button>
            </div>
          ) : (
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger><SelectValue placeholder="Choose a master program…" /></SelectTrigger>
              <SelectContent>
                {programs.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={!selected || copying}>
            {copying ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Library className="h-3.5 w-3.5 mr-1" />}
            Copy to Master
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CopyPhaseToMasterDialog;
