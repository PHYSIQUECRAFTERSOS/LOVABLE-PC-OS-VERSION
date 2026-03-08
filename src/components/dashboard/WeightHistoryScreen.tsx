import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Scale, Plus, CalendarIcon, Trash2 } from "lucide-react";
import { format, subMonths } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
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

interface WeightEntry {
  id: string;
  weight: number;
  logged_at: string;
  source?: string | null;
  notes?: string | null;
}

interface WeightHistoryScreenProps {
  open: boolean;
  onClose: () => void;
  clientId?: string;
  clientName?: string;
  readOnly?: boolean;
}

const SOURCE_LABELS: Record<string, string> = {
  onboarding: "Onboarding",
  manual: "Manual",
  check_in: "Check-In",
};

const RANGE_FILTERS = [
  { label: "7D", months: 0, days: 7 },
  { label: "30D", months: 1, days: 0 },
  { label: "3M", months: 3, days: 0 },
  { label: "6M", months: 6, days: 0 },
  { label: "1Y", months: 12, days: 0 },
  { label: "All", months: 0, days: 0 },
];

function rollingAverage(data: { date: string; weight: number }[], window = 7) {
  return data.map((point, i) => {
    const slice = data.slice(Math.max(0, i - window + 1), i + 1);
    const avg = slice.reduce((sum, p) => sum + p.weight, 0) / slice.length;
    return { ...point, smoothed: Number(avg.toFixed(1)) };
  });
}

const WeightHistoryScreen = ({ open, onClose, clientId, clientName, readOnly = false }: WeightHistoryScreenProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const targetId = clientId || user?.id;

  const [entries, setEntries] = useState<WeightEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [rangeIdx, setRangeIdx] = useState(2); // default 3M
  const [showLogSheet, setShowLogSheet] = useState(false);
  const [logWeight, setLogWeight] = useState("");
  const [logDate, setLogDate] = useState<Date>(new Date());
  const [logNotes, setLogNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchEntries = useCallback(async () => {
    if (!targetId) return;
    setLoading(true);
    let query = supabase
      .from("weight_logs")
      .select("id, weight, logged_at, source, notes")
      .eq("client_id", targetId)
      .order("logged_at", { ascending: true });

    const range = RANGE_FILTERS[rangeIdx];
    if (range.months > 0) {
      const since = format(subMonths(new Date(), range.months), "yyyy-MM-dd");
      query = query.gte("logged_at", since);
    } else if (range.days > 0) {
      const since = format(new Date(Date.now() - range.days * 86400000), "yyyy-MM-dd");
      query = query.gte("logged_at", since);
    }

    const { data } = await query.limit(500);
    setEntries(
      (data || []).map((d: any) => ({
        id: d.id,
        weight: Number(d.weight),
        logged_at: d.logged_at,
        source: d.source,
        notes: d.notes,
      }))
    );
    setLoading(false);
  }, [targetId, rangeIdx]);

  useEffect(() => {
    if (open) fetchEntries();
  }, [open, fetchEntries]);

  const handleSave = async () => {
    if (!targetId || !logWeight) return;
    setSaving(true);
    const dateStr = format(logDate, "yyyy-MM-dd");
    const { error } = await supabase.from("weight_logs").upsert(
      {
        client_id: targetId,
        weight: parseFloat(logWeight),
        logged_at: dateStr,
        source: "manual",
        notes: logNotes || null,
      },
      { onConflict: "client_id,logged_at" }
    );
    setSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Weight logged!" });
      setLogWeight("");
      setLogNotes("");
      setLogDate(new Date());
      setShowLogSheet(false);
      fetchEntries();
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await supabase.from("weight_logs").delete().eq("id", deleteId);
    setDeleteId(null);
    fetchEntries();
    toast({ title: "Entry deleted" });
  };

  // Chart data with 7-day rolling average
  const rawChartData = entries.map((e) => ({
    date: format(new Date(e.logged_at + "T00:00:00"), "MMM d"),
    weight: e.weight,
  }));
  const chartData = entries.length >= 7 ? rollingAverage(rawChartData) : rawChartData.map(d => ({ ...d, smoothed: d.weight }));

  // Summary bar
  const startingWeight = entries.length > 0 ? entries[0].weight : null;
  const currentWeight = entries.length > 0 ? entries[entries.length - 1].weight : null;
  const totalChange = startingWeight && currentWeight ? Number((currentWeight - startingWeight).toFixed(1)) : null;

  const title = clientName ? `${clientName}'s Weight` : "My Weight";
  const reversedEntries = [...entries].reverse();

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-0">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-primary" />
              {title}
            </DialogTitle>
          </DialogHeader>

          <div className="p-6 pt-2 space-y-5">
            {/* Range Filters */}
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
                >
                  {r.label}
                </button>
              ))}
            </div>

            {/* Summary Bar */}
            {startingWeight && currentWeight && (
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Starting</p>
                  <p className="text-lg font-bold text-foreground tabular-nums">{startingWeight} lbs</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Current</p>
                  <p className="text-lg font-bold text-foreground tabular-nums">{currentWeight} lbs</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Change</p>
                  <p className={cn(
                    "text-lg font-bold tabular-nums",
                    totalChange && totalChange < 0 ? "text-green-400" : totalChange && totalChange > 0 ? "text-red-400" : "text-foreground"
                  )}>
                    {totalChange !== null ? (totalChange > 0 ? "+" : "") + totalChange + " lbs" : "—"}
                    {totalChange !== null && totalChange !== 0 && (
                      <span className="text-xs ml-1">{totalChange < 0 ? "↓" : "↑"}</span>
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* Chart — smooth line with area fill */}
            {loading ? (
              <Skeleton className="h-52 rounded-lg" />
            ) : chartData.length >= 2 ? (
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      tickLine={false}
                      axisLine={false}
                      interval={Math.max(0, Math.floor(chartData.length / 6) - 1)}
                    />
                    <YAxis
                      domain={["dataMin - 2", "dataMax + 2"]}
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      tickLine={false}
                      axisLine={false}
                      width={40}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={(value: number) => [value + " lbs", entries.length >= 7 ? "7d Avg" : "Weight"]}
                    />
                    <Area
                      type="monotone"
                      dataKey="smoothed"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2.5}
                      fill="url(#weightGrad)"
                      dot={false}
                      activeDot={{ r: 4, fill: "hsl(var(--primary))" }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="text-center py-8 text-sm text-muted-foreground">
                <Scale className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                Log your weight regularly to see your trend here
              </div>
            )}

            {/* Log List */}
            <div className="space-y-1">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                All Entries
              </h3>
              {reversedEntries.length === 0 && !loading && (
                <p className="text-sm text-muted-foreground text-center py-4">No entries yet.</p>
              )}
              {reversedEntries.map((entry, idx) => {
                const prevEntry = idx < reversedEntries.length - 1 ? reversedEntries[idx + 1] : null;
                const diff = prevEntry ? Number((entry.weight - prevEntry.weight).toFixed(1)) : null;
                return (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2.5 group"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-foreground">
                        {format(new Date(entry.logged_at + "T00:00:00"), "MMM d, yyyy")}
                      </span>
                      {entry.source && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                          {SOURCE_LABELS[entry.source] || entry.source}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="text-sm font-bold text-foreground tabular-nums">
                          {entry.weight} lbs
                        </span>
                        {diff !== null && diff !== 0 && (
                          <span
                            className={cn(
                              "text-[10px] ml-1.5 font-medium",
                              diff > 0 ? "text-red-400" : "text-green-400"
                            )}
                          >
                            {diff > 0 ? "+" : ""}{diff}
                          </span>
                        )}
                      </div>
                      {!readOnly && (
                        <button
                          onClick={() => setDeleteId(entry.id)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Log Button */}
            {!readOnly && !showLogSheet && (
              <Button onClick={() => setShowLogSheet(true)} className="w-full gap-2">
                <Plus className="h-4 w-4" /> Log Weight
              </Button>
            )}

            {/* Inline Log Form */}
            {!readOnly && showLogSheet && (
              <div className="space-y-4 border border-border rounded-lg p-4 bg-secondary/20">
                <div className="space-y-2">
                  <Label>Weight (lbs)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={logWeight}
                    onChange={(e) => setLogWeight(e.target.value)}
                    placeholder="e.g. 185"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {format(logDate, "PPP")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={logDate}
                        onSelect={(d) => d && setLogDate(d)}
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label>Notes (optional)</Label>
                  <Textarea
                    value={logNotes}
                    onChange={(e) => setLogNotes(e.target.value)}
                    placeholder="Any notes..."
                    rows={2}
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleSave} disabled={saving || !logWeight} className="flex-1">
                    {saving ? "Saving..." : "Save"}
                  </Button>
                  <Button variant="outline" onClick={() => setShowLogSheet(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete weight entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this weight log entry.
            </AlertDialogDescription>
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

export default WeightHistoryScreen;
