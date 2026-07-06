/**
 * DuplicatePhaseDialog — Trainerize-style "Save Training Phase As" modal.
 *
 * Fields: Name, Start date, and End (either explicit end date OR N weeks).
 * On confirm: closes instantly and fires the caller's onConfirm callback
 * with { name, startDate, durationWeeks }. Caller runs the deep clone in
 * the background with a sonner promise toast.
 */
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { format, addWeeks, differenceInCalendarDays } from "date-fns";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceName: string;
  sourceDurationWeeks: number;
  onConfirm: (args: { name: string; startDate: string; durationWeeks: number }) => void;
}

const toYMD = (d: Date) => format(d, "yyyy-MM-dd");

export default function DuplicatePhaseDialog({
  open, onOpenChange, sourceName, sourceDurationWeeks, onConfirm,
}: Props) {
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [mode, setMode] = useState<"weeks" | "date">("weeks");
  const [weeks, setWeeks] = useState(sourceDurationWeeks || 4);
  const [endDate, setEndDate] = useState<Date>(addWeeks(new Date(), sourceDurationWeeks || 4));

  useEffect(() => {
    if (!open) return;
    setName(`${sourceName} (Copy)`);
    setStartDate(new Date());
    setMode("weeks");
    setWeeks(sourceDurationWeeks || 4);
    setEndDate(addWeeks(new Date(), sourceDurationWeeks || 4));
  }, [open, sourceName, sourceDurationWeeks]);

  // Keep the "other" field in sync so both stay meaningful.
  useEffect(() => {
    if (mode === "weeks") setEndDate(addWeeks(startDate, Math.max(1, weeks)));
  }, [mode, weeks, startDate]);
  useEffect(() => {
    if (mode === "date") {
      const days = differenceInCalendarDays(endDate, startDate);
      setWeeks(Math.max(1, Math.round(days / 7)));
    }
  }, [mode, endDate, startDate]);

  const handleSave = () => {
    const finalWeeks = Math.max(1, mode === "weeks" ? weeks : Math.round(differenceInCalendarDays(endDate, startDate) / 7));
    onConfirm({
      name: name.trim() || `${sourceName} (Copy)`,
      startDate: toYMD(startDate),
      durationWeeks: finalWeeks,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Save Training Phase As</DialogTitle>
          <DialogDescription>
            Duplicate <span className="font-medium text-foreground">{sourceName}</span> with all workouts, exercises and notes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="dup-name" className="text-xs">Phase name</Label>
            <Input id="dup-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Start on</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(startDate, "PPP")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={startDate} onSelect={(d) => d && setStartDate(d)} initialFocus />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">End</Label>
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as "weeks" | "date")} className="space-y-2">
              <div className="flex items-center gap-3">
                <RadioGroupItem value="weeks" id="mode-weeks" />
                <Label htmlFor="mode-weeks" className="text-sm font-normal">End after</Label>
                <Input
                  type="number"
                  min={1}
                  max={52}
                  value={weeks}
                  onChange={(e) => setWeeks(Math.max(1, parseInt(e.target.value) || 1))}
                  onFocus={() => setMode("weeks")}
                  className="h-8 w-20"
                />
                <span className="text-sm text-muted-foreground">weeks</span>
              </div>
              <div className="flex items-center gap-3">
                <RadioGroupItem value="date" id="mode-date" />
                <Label htmlFor="mode-date" className="text-sm font-normal">End on date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 font-normal" onFocus={() => setMode("date")}>
                      <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                      {format(endDate, "MMM d, yyyy")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={endDate}
                      onSelect={(d) => { if (d) { setEndDate(d); setMode("date"); } }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </RadioGroup>
            <p className="text-[11px] text-muted-foreground">
              This phase will run for <span className="text-foreground font-medium">{Math.max(1, mode === "weeks" ? weeks : Math.round(differenceInCalendarDays(endDate, startDate) / 7))}</span> week(s).
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
