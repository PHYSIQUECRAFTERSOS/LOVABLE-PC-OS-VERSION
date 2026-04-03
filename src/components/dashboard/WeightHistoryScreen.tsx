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
import { useUnitPreferences } from "@/hooks/useUnitPreferences";
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
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

const LBS_TO_KG = 0.453592;

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
  const { convertWeight, parseWeightInput, weightLabel, weightUnit } = useUnitPreferences();
  const targetId = clientId || user?.id;

  const [entries, setEntries] = useState<WeightEntry[]>([]);
  const [recentEntries, setRecentEntries] = useState<WeightEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [rangeIdx, setRangeIdx] = useState(2);
  const [showLogSheet, setShowLogSheet] = useState(false);
  const [logWeight, setLogWeight] = useState("");
  const [logDate, setLogDate] = useState<Date>(new Date());
  const [logNotes, setLogNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const convert = (lbs: number) => convertWeight(lbs);
  const unitLabel = weightLabel;

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
      query = query.gte("logged_at", format(subMonths(new Date(), range.months), "yyyy-MM-dd"));
    } else if (range.days > 0) {
      query = query.gte("logged_at", format(new Date(Date.now() - range.days * 86400000), "yyyy-MM-dd"));
    }

    const { data } = await query.limit(500);
    setEntries(
      (data || []).map((d: any) => ({
        id: d.id, weight: Number(d.weight), logged_at: d.logged_at, source: d.source, notes: d.notes,
      }))
    );
    setLoading(false);
  }, [targetId, rangeIdx]);

  // Fetch recent 5 entries (unfiltered by range)
  const fetchRecent = useCallback(async () => {
    if (!targetId) return;
    const { data } = await supabase
      .from("weight_logs")
      .select("id, weight, logged_at, source, notes")
      .eq("client_id", targetId)
      .order("logged_at", { ascending: false })
      .limit(5);
    setRecentEntries(
      (data || []).map((d: any) => ({
        id: d.id, weight: Number(d.weight), logged_at: d.logged_at, source: d.source, notes: d.notes,
      }))
    );
  }, [targetId]);

  useEffect(() => {
    if (open) {
      fetchEntries();
      fetchRecent();
    }
  }, [open, fetchEntries, fetchRecent]);

  const handleSave = async () => {
    if (!targetId || !logWeight) return;
    setSaving(true);
    const dateStr = format(logDate, "yyyy-MM-dd");
    const weightVal = unit === "kg" ? parseFloat(logWeight) / LBS_TO_KG : parseFloat(logWeight);
    const { error } = await supabase.from("weight_logs").upsert(
      { client_id: targetId, weight: Number(weightVal.toFixed(1)), logged_at: dateStr, source: "manual", notes: logNotes || null },
      { onConflict: "client_id,logged_at" }
    );
    setSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Weight logged!" });
      setLogWeight(""); setLogNotes(""); setLogDate(new Date()); setShowLogSheet(false);
      fetchEntries(); fetchRecent();
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await supabase.from("weight_logs").delete().eq("id", deleteId);
    setDeleteId(null);
    fetchEntries(); fetchRecent();
    toast({ title: "Entry deleted" });
  };

  // Chart data
  const rawChartData = entries.map((e) => ({
    date: format(new Date(e.logged_at + "T00:00:00"), "MMM d"),
    weight: convert(e.weight),
  }));
  const chartData = entries.length >= 7
    ? rollingAverage(rawChartData)
    : rawChartData.map(d => ({ ...d, smoothed: d.weight }));

  // Summary bar
  const startingWeight = entries.length > 0 ? convert(entries[0].weight) : null;
  const currentWeight = entries.length > 0 ? convert(entries[entries.length - 1].weight) : null;
  const totalChange = startingWeight && currentWeight ? Number((currentWeight - startingWeight).toFixed(1)) : null;

  const title = clientName ? `${clientName}'s Weight` : "My Weight";

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.[0]) return null;
    const { date, smoothed } = payload[0].payload;
    return (
      <div className="rounded-lg border border-primary/50 bg-[#1a1a1a] px-3 py-1.5 text-xs text-foreground shadow-lg">
        {date} &nbsp; <span className="font-bold">{smoothed} {unitLabel}</span>
      </div>
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-0">
          <DialogHeader className="p-6 pb-0">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <Scale className="h-5 w-5 text-primary" />
                {title}
              </DialogTitle>
              {/* Unit toggle */}
              <div className="flex rounded-full border border-border overflow-hidden text-xs">
                <button
                  onClick={() => setUnit("lbs")}
                  className={cn("px-3 py-1 transition-colors", unit === "lbs" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary")}
                >lbs</button>
                <button
                  onClick={() => setUnit("kg")}
                  className={cn("px-3 py-1 transition-colors", unit === "kg" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary")}
                >kg</button>
              </div>
            </div>
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
                >{r.label}</button>
              ))}
            </div>

            {/* Summary Bar */}
            {startingWeight !== null && currentWeight !== null && (
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Starting</p>
                  <p className="text-lg font-bold text-foreground tabular-nums">{startingWeight} {unitLabel}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Current</p>
                  <p className="text-lg font-bold text-foreground tabular-nums">{currentWeight} {unitLabel}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Change</p>
                  <p className={cn(
                    "text-lg font-bold tabular-nums",
                    totalChange && totalChange < 0 ? "text-green-400" : totalChange && totalChange > 0 ? "text-red-400" : "text-foreground"
                  )}>
                    {totalChange !== null ? (totalChange > 0 ? "+" : "") + totalChange + " " + unitLabel : "—"}
                    {totalChange !== null && totalChange !== 0 && (
                      <span className="text-xs ml-1">{totalChange < 0 ? "↓" : "↑"}</span>
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* Chart */}
            {loading ? (
              <Skeleton className="h-[280px] rounded-lg" />
            ) : chartData.length >= 2 ? (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1">
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
                      domain={["dataMin - 2", "dataMax + 2"]}
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      tickLine={false} axisLine={false} width={40}
                    />
                    <Tooltip content={<CustomTooltip />} cursor={false} />
                    <Area
                      type="monotone" dataKey="smoothed"
                      stroke="hsl(var(--primary))" strokeWidth={2.5}
                      fill="url(#weightGrad)" dot={false}
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

            {/* Recent Entries (always last 5, unfiltered) */}
            <div className="space-y-1">
              <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Recent Entries
              </h3>
              {recentEntries.length === 0 && !loading && (
                <p className="text-sm text-muted-foreground text-center py-4">No entries yet.</p>
              )}
              {recentEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between py-2 border-b border-border/50 last:border-0 group"
                >
                  <span className="text-sm text-foreground">
                    {format(new Date(entry.logged_at + "T00:00:00"), "MMM d, yyyy")}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-foreground tabular-nums">
                      {convert(entry.weight)} {unitLabel}
                    </span>
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
              ))}
            </div>

            {/* Log Button */}
            {!readOnly && !showLogSheet && (
              <Button onClick={() => setShowLogSheet(true)} className="w-full gap-2">
                <Plus className="h-4 w-4" /> Log Weight
              </Button>
            )}

            {/* Inline Log Form */}
            {!readOnly && showLogSheet && (
              <div
                ref={(el) => {
                  if (el) {
                    requestAnimationFrame(() => {
                      setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
                    });
                  }
                }}
                className="space-y-4 border border-border rounded-lg p-4 bg-secondary/20"
              >
                <div className="space-y-2">
                  <Label>Weight ({unitLabel})</Label>
                  <Input type="number" step="0.1" value={logWeight} onChange={(e) => setLogWeight(e.target.value)} placeholder="e.g. 185" />
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
                <div className="space-y-2">
                  <Label>Notes (optional)</Label>
                  <Textarea value={logNotes} onChange={(e) => setLogNotes(e.target.value)} placeholder="Any notes..." rows={2} />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleSave} disabled={saving || !logWeight} className="flex-1">
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
            <AlertDialogTitle>Delete weight entry?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove this weight log entry.</AlertDialogDescription>
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
