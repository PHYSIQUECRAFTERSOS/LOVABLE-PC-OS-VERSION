/**
 * ChangeDurationDialog — small modal with numeric input for phase duration_weeks.
 */
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialWeeks: number;
  phaseName: string;
  onSave: (weeks: number) => Promise<void> | void;
}

export const ChangeDurationDialog = ({ open, onOpenChange, initialWeeks, phaseName, onSave }: Props) => {
  const [value, setValue] = useState(String(initialWeeks));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setValue(String(initialWeeks)); setError(""); }
  }, [open, initialWeeks]);

  const handleSave = async () => {
    const n = parseInt(value, 10);
    if (!Number.isInteger(n) || n < 1 || n > 52) {
      setError("Enter a whole number between 1 and 52.");
      return;
    }
    setSaving(true);
    try {
      await onSave(n);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Change Duration</DialogTitle>
          <DialogDescription>Update the duration of "{phaseName}".</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="duration-weeks" className="text-xs">Duration (weeks)</Label>
          <Input
            id="duration-weeks"
            type="number"
            min={1}
            max={52}
            value={value}
            onChange={(e) => { setValue(e.target.value); setError(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
            autoFocus
          />
          {error && <p className="text-[11px] text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ChangeDurationDialog;
