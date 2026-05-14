/**
 * ChangeDurationDialog — toggle between Weeks input and End Date picker.
 * Both modes ultimately call onSave(weeks) so business logic is unchanged.
 */
import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialWeeks: number;
  phaseName: string;
  /** Phase start date (YYYY-MM-DD). Required for End Date mode. */
  phaseStartDate?: string | null;
  onSave: (weeks: number) => Promise<void> | void;
}

function parseLocal(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, (m || 1) - 1, day || 1);
}
function toLocalYMD(d: Date): string {
  return d.toLocaleDateString("en-CA");
}
function addDays(ymd: string, days: number): string {
  const d = parseLocal(ymd);
  d.setDate(d.getDate() + days);
  return toLocalYMD(d);
}
function formatPretty(ymd: string): string {
  const d = parseLocal(ymd);
  return `${String(d.getDate()).padStart(2, "0")} ${d.toLocaleDateString("en-US", { month: "short" })} ${d.getFullYear()}`;
}

export const ChangeDurationDialog = ({ open, onOpenChange, initialWeeks, phaseName, phaseStartDate, onSave }: Props) => {
  const [mode, setMode] = useState<"weeks" | "endDate">("weeks");
  const [weeks, setWeeks] = useState(String(initialWeeks));
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setWeeks(String(initialWeeks));
      setError("");
      setMode("weeks");
      if (phaseStartDate) {
        setEndDate(addDays(phaseStartDate, initialWeeks * 7 - 1));
      }
    }
  }, [open, initialWeeks, phaseStartDate]);

  // Live conversion preview
  const computedFromEndDate = useMemo(() => {
    if (mode !== "endDate" || !phaseStartDate || !endDate) return null;
    if (endDate < phaseStartDate) return { weeks: null, error: "End date must be after the phase start." };
    const start = parseLocal(phaseStartDate);
    const end = parseLocal(endDate);
    const days = Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    const w = Math.max(1, Math.min(52, Math.ceil(days / 7)));
    return { weeks: w, error: "" };
  }, [mode, phaseStartDate, endDate]);

  const computedFromWeeks = useMemo(() => {
    if (mode !== "weeks" || !phaseStartDate) return null;
    const n = parseInt(weeks, 10);
    if (!Number.isFinite(n) || n < 1) return null;
    return addDays(phaseStartDate, n * 7 - 1);
  }, [mode, phaseStartDate, weeks]);

  const handleSave = async () => {
    let n: number | null = null;
    if (mode === "weeks") {
      n = parseInt(weeks, 10);
    } else if (computedFromEndDate) {
      if (computedFromEndDate.error) { setError(computedFromEndDate.error); return; }
      n = computedFromEndDate.weeks;
    }
    if (!n || !Number.isInteger(n) || n < 1 || n > 52) {
      setError("Duration must be between 1 and 52 weeks.");
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

  const canUseEndDate = !!phaseStartDate;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Change Duration</DialogTitle>
          <DialogDescription>Update the duration of "{phaseName}".</DialogDescription>
        </DialogHeader>

        {/* Mode toggle */}
        {canUseEndDate && (
          <div className="grid grid-cols-2 gap-1 p-1 rounded-md bg-muted">
            <button
              type="button"
              onClick={() => { setMode("weeks"); setError(""); }}
              className={`text-xs font-medium py-1.5 rounded transition-colors ${mode === "weeks" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >Weeks</button>
            <button
              type="button"
              onClick={() => { setMode("endDate"); setError(""); }}
              className={`text-xs font-medium py-1.5 rounded transition-colors ${mode === "endDate" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >End Date</button>
          </div>
        )}

        <div className="space-y-2">
          {mode === "weeks" ? (
            <>
              <Label htmlFor="duration-weeks" className="text-xs">Duration (weeks)</Label>
              <Input
                id="duration-weeks"
                type="number"
                min={1}
                max={52}
                value={weeks}
                onChange={(e) => { setWeeks(e.target.value); setError(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
                autoFocus
              />
              {phaseStartDate && computedFromWeeks && (
                <p className="text-[11px] text-muted-foreground">
                  Ends <span className="text-foreground font-medium">{formatPretty(computedFromWeeks)}</span>
                </p>
              )}
            </>
          ) : (
            <>
              <Label htmlFor="end-date" className="text-xs">End Date</Label>
              <Input
                id="end-date"
                type="date"
                min={phaseStartDate || undefined}
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setError(""); }}
                autoFocus
              />
              {computedFromEndDate?.weeks && (
                <p className="text-[11px] text-muted-foreground">
                  ≈ <span className="text-foreground font-medium">{computedFromEndDate.weeks} week{computedFromEndDate.weeks > 1 ? "s" : ""}</span>
                  {phaseStartDate && ` (${formatPretty(phaseStartDate)} – ${formatPretty(endDate)})`}
                </p>
              )}
            </>
          )}
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
