/**
 * ChangeDurationDialog — Trainerize-style phase editor.
 * Coach edits Start date, End date, and Weeks. All three fields stay in sync:
 *  - Change Start → keep weeks, recompute End.
 *  - Change End   → recompute Weeks (clamped 1–52).
 *  - Change Weeks → keep Start, recompute End.
 *
 * onSave passes back { startDate, weeks }. Cascade of later phases is handled
 * by the caller (TrainingTab.savePhaseDates).
 */
import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialWeeks: number;
  /** Resolved current start date (YYYY-MM-DD). May come from explicit phase.start_date or derived. */
  initialStartDate: string | null;
  phaseName: string;
  onSave: (payload: { startDate: string; weeks: number }) => Promise<void> | void;
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
  return `${d.getDate()} ${d.toLocaleDateString("en-US", { month: "short" })} ${d.getFullYear()}`;
}
function weekdayName(ymd: string): string {
  return parseLocal(ymd).toLocaleDateString("en-US", { weekday: "long" });
}
function daysBetweenInclusive(startYmd: string, endYmd: string): number {
  const start = parseLocal(startYmd);
  const end = parseLocal(endYmd);
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
}

export const ChangeDurationDialog = ({ open, onOpenChange, initialWeeks, initialStartDate, phaseName, onSave }: Props) => {
  const today = toLocalYMD(new Date());
  const [startDate, setStartDate] = useState<string>(initialStartDate || today);
  const [weeks, setWeeks] = useState<string>(String(initialWeeks));
  const [endDate, setEndDate] = useState<string>(addDays(initialStartDate || today, initialWeeks * 7 - 1));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);

  useEffect(() => {
    if (open) {
      const s = initialStartDate || today;
      setStartDate(s);
      setWeeks(String(initialWeeks));
      setEndDate(addDays(s, initialWeeks * 7 - 1));
      setError("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialStartDate, initialWeeks]);

  // Handlers: edit one field, recompute the others.
  const onStartChange = (ymd: string) => {
    setStartDate(ymd);
    const n = parseInt(weeks, 10);
    if (Number.isFinite(n) && n >= 1) {
      setEndDate(addDays(ymd, n * 7 - 1));
    }
    setError("");
  };
  const onEndChange = (ymd: string) => {
    setEndDate(ymd);
    if (ymd < startDate) {
      setError("End date must be on or after the start date.");
      return;
    }
    const days = daysBetweenInclusive(startDate, ymd);
    const w = Math.max(1, Math.min(52, Math.ceil(days / 7)));
    setWeeks(String(w));
    setError("");
  };
  const onWeeksChange = (v: string) => {
    setWeeks(v);
    const n = parseInt(v, 10);
    if (Number.isFinite(n) && n >= 1) {
      setEndDate(addDays(startDate, n * 7 - 1));
      setError("");
    }
  };

  const endHelper = useMemo(() => {
    if (!endDate) return "";
    return `This phase will end on ${formatPretty(endDate)} (${weekdayName(endDate)}).`;
  }, [endDate]);

  const handleSave = async () => {
    const n = parseInt(weeks, 10);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > 52) {
      setError("Duration must be between 1 and 52 weeks.");
      return;
    }
    if (endDate < startDate) {
      setError("End date must be on or after the start date.");
      return;
    }
    setSaving(true);
    try {
      await onSave({ startDate, weeks: n });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Training Phase</DialogTitle>
          <DialogDescription>Update the start, end, or duration of "{phaseName}".</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Start + End side by side */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Start on</Label>
              <Popover open={startOpen} onOpenChange={setStartOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal h-9",
                      !startDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? formatPretty(startDate) : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 z-[90]" align="start">
                  <Calendar
                    mode="single"
                    selected={parseLocal(startDate)}
                    onSelect={(d) => {
                      if (d) {
                        onStartChange(toLocalYMD(d));
                        setStartOpen(false);
                      }
                    }}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Until</Label>
              <Popover open={endOpen} onOpenChange={setEndOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal h-9",
                      !endDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? formatPretty(endDate) : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 z-[90]" align="start">
                  <Calendar
                    mode="single"
                    selected={parseLocal(endDate)}
                    onSelect={(d) => {
                      if (d) {
                        onEndChange(toLocalYMD(d));
                        setEndOpen(false);
                      }
                    }}
                    disabled={(d) => toLocalYMD(d) < startDate}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Weeks */}
          <div className="space-y-1.5">
            <Label htmlFor="duration-weeks" className="text-xs">Duration (weeks)</Label>
            <Input
              id="duration-weeks"
              type="number"
              min={1}
              max={52}
              value={weeks}
              onChange={(e) => onWeeksChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
            />
          </div>

          {endHelper && <p className="text-[11px] text-muted-foreground">{endHelper}</p>}
          <p className="text-[11px] text-muted-foreground">
            Later phases will shift to stay sequential. Scheduled workouts on the calendar are not moved automatically.
          </p>
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
