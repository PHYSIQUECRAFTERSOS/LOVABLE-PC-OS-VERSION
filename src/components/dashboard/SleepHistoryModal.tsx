import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Moon, Plus, CalendarIcon, Trash2 } from "lucide-react";
import { format, subMonths } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SleepEntry, formatSleepDuration, SOURCE_PRIORITY } from "@/hooks/useSleep";

interface Props {
  open: boolean;
  onClose: () => void;
  clientId?: string;
  clientName?: string;
  readOnly?: boolean;
}

const RANGE_FILTERS = [
  { label: "7D", months: 0, days: 7 },
  { label: "30D", months: 1, days: 0 },
  { label: "3M", months: 3, days: 0 },
  { label: "6M", months: 6, days: 0 },
  { label: "1Y", months: 12, days: 0 },
  { label: "All", months: 0, days: 0 },
];

const SOURCE_LABELS: Record<string, string> = {
  apple_health: "Apple Health",
  fitbit: "Fitbit",
  google_fit: "Google Fit",
  manual: "Manual",
};

const SleepHistoryModal = ({ open, onClose, clientId, clientName, readOnly = false }: Props) => {
  const { user } = useAuth();
  const targetId = clientId || user?.id;

  const [entries, setEntries] = useState<SleepEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [rangeIdx, setRangeIdx] = useState(2);
  const [showLogSheet, setShowLogSheet] = useState(false);
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [logDate, setLogDate] = useState<Date>(new Date());
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchEntries = useCallback(async () => {
    if (!targetId) return;
    setLoading(true);
    let query = supabase
      .from("sleep_logs" as any)
      .select("*")
      .eq("client_id", targetId)
      .order("sleep_date", { ascending: true });

    const range = RANGE_FILTERS[rangeIdx];
    if (range.months > 0) {
      query = query.gte("sleep_date", format(subMonths(new Date(), range.months), "yyyy-MM-dd"));
    } else if (range.days > 0) {
      query = query.gte("sleep_date", format(new Date(Date.now() - range.days * 86400000), "yyyy-MM-dd"));
    }

    const { data } = await query.limit(1000);
    setEntries((data as unknown as SleepEntry[]) || []);
    setLoading(false);
  }, [targetId, rangeIdx]);

  useEffect(() => {
    if (open) fetchEntries();
  }, [open, fetchEntries]);

  const handleSave = async () => {
    if (!targetId) return;
    const h = parseFloat(hours || "0");
    const m = parseFloat(minutes || "0");
    const total = Math.round(h * 60 + m);
    if (total <= 0) {
      toast.error("Enter sleep duration");
      return;
    }
    setSaving(true);
    const dateStr = format(logDate, "yyyy-MM-dd");
    const { error } = await supabase.from("sleep_logs" as any).upsert(
      {
        client_id: targetId,
        sleep_date: dateStr,
        total_minutes: total,
        asleep_minutes: total,
        source: "manual",
        source_priority: SOURCE_PRIORITY.manual,
        synced_at: new Date().toISOString(),
      },
      { onConflict: "client_id,sleep_date" }
    );
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Sleep logged");
      setHours(""); setMinutes(""); setLogDate(new Date()); setShowLogSheet(false);
      fetchEntries();
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await supabase.from("sleep_logs" as any).delete().eq("id", deleteId);
    setDeleteId(null);
    fetchEntries();
    toast.success("Entry deleted");
  };

  const chartData = entries.map((e) => ({
    date: format(new Date(e.sleep_date + "T00:00:00"), "MMM d"),
    hours: e.total_minutes ? Number((e.total_minutes / 60).toFixed(2)) : 0,
  }));

  const recentEntries = [...entries].reverse().slice(0, 7);

  const avgMin =
    entries.length > 0
      ? Math.round(entries.reduce((s, e) => s + (e.total_minutes ?? 0), 0) / entries.length)
      : 0;
  const bestMin = entries.reduce((max, e) => Math.max(max, e.total_minutes ?? 0), 0);
  const consistencyDays = entries.length;

  const title = clientName ? `${clientName}'s Sleep` : "Sleep";

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.[0]) return null;
    const { date, hours } = payload[0].payload;
    return (
      <div className="rounded-lg border border-primary/50 bg-[#1a1a1a] px-3 py-1.5 text-xs text-foreground shadow-lg">
        {date} &nbsp; <span className="font-bold">{hours}h</span>
      </div>
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-0">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle className="flex items-center gap-2">
              <Moon className="h-5 w-5 text-primary" />
              {title}
            </DialogTitle>
          </DialogHeader>

          <div className="p-6 pt-2 space-y-5">
            <div className="flex gap-1 justify-center">
              {RANGE_FILTERS.map((r, i) => (
                <button
                  key={r.label}
                  onClick={() => setRangeIdx(i)}
                  className={cn(
                    "px-3 py-1 text-xs rounded-full font-medium transition-colors",
                    i === rangeIdx
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                  )}
                >{r.label}</button>
              ))}
            </div>

            {entries.length > 0 && (
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg</p>
                  <p className="text-lg font-bold text-foreground tabular-nums">{formatSleepDuration(avgMin)}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Best</p>
                  <p className="text-lg font-bold text-foreground tabular-nums">{formatSleepDuration(bestMin)}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Nights</p>
                  <p className="text-lg font-bold text-foreground tabular-nums">{consistencyDays}</p>
                </div>
              </div>
            )}

            {loading ? (
              <Skeleton className="h-[280px] rounded-lg" />
            ) : chartData.length >= 2 ? (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="sleepGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.18} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      tickLine={false} axisLine={false}
                      interval={Math.max(0, Math.floor(chartData.length / 6) - 1)}
                    />
                    <YAxis
                      domain={[0, "dataMax + 1"]}
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      tickLine={false} axisLine={false} width={30}
                      tickFormatter={(v) => `${v}h`}
                    />
                    <Tooltip content={<CustomTooltip />} cursor={false} />
                    <Area
                      type="monotone" dataKey="hours"
                      stroke="hsl(var(--primary))" strokeWidth={2.5}
                      fill="url(#sleepGrad)" dot={false}
                      activeDot={{ r: 4, fill: "hsl(var(--primary))" }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="text-center py-8 text-sm text-muted-foreground">
                <Moon className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                Connect a wearable or log sleep to see your trend
              </div>
            )}

            <div className="space-y-1">
              <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Recent Nights
              </h3>
              {recentEntries.length === 0 && !loading && (
                <p className="text-sm text-muted-foreground text-center py-4">No entries yet.</p>
              )}
              {recentEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between py-2 border-b border-border/50 last:border-0 group"
                >
                  <div className="flex flex-col">
                    <span className="text-sm text-foreground">
                      {format(new Date(entry.sleep_date + "T00:00:00"), "MMM d, yyyy")}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {SOURCE_LABELS[entry.source] || entry.source}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-foreground tabular-nums">
                      {formatSleepDuration(entry.total_minutes)}
                    </span>
                    {!readOnly && entry.source === "manual" && (
                      <button
                        onClick={() => setDeleteId(entry.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {!readOnly && !showLogSheet && (
              <Button onClick={() => setShowLogSheet(true)} className="w-full gap-2">
                <Plus className="h-4 w-4" /> Log Sleep
              </Button>
            )}

            {!readOnly && showLogSheet && (
              <div className="space-y-4 border border-border rounded-lg p-4 bg-secondary/20">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Hours</Label>
                    <Input type="number" min="0" max="24" step="1" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="7" />
                  </div>
                  <div className="space-y-2">
                    <Label>Minutes</Label>
                    <Input type="number" min="0" max="59" step="1" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="30" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {format(logDate, "PPP")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={logDate} onSelect={(d) => d && setLogDate(d)} className="p-3 pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleSave} disabled={saving} className="flex-1">
                    {saving ? "Saving..." : "Save"}
                  </Button>
                  <Button variant="outline" onClick={() => setShowLogSheet(false)}>Cancel</Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete sleep entry?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove this entry.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default SleepHistoryModal;
