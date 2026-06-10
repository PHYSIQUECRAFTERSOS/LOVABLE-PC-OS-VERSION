import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Scale, Ruler } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, subMonths } from "date-fns";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";
import { useUnitPreferences } from "@/hooks/useUnitPreferences";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface WeightEntry {
  logged_at: string;
  weight: number;
}

const MEASUREMENT_OPTIONS: { key: string; label: string }[] = [
  { key: "neck", label: "Neck" },
  { key: "shoulders", label: "Shoulders" },
  { key: "chest", label: "Chest" },
  { key: "left_arm", label: "Left Arm" },
  { key: "right_arm", label: "Right Arm" },
  { key: "forearm", label: "Forearm" },
  { key: "waist", label: "Waist" },
  { key: "hips", label: "Hips" },
  { key: "left_thigh", label: "Left Thigh" },
  { key: "right_thigh", label: "Right Thigh" },
  { key: "left_calf", label: "Left Calf" },
  { key: "right_calf", label: "Right Calf" },
  { key: "body_fat_pct", label: "Body Fat %" },
];

const RANGE_FILTERS = [
  { label: "7D", months: 0, days: 7 },
  { label: "30D", months: 1, days: 0 },
  { label: "3M", months: 3, days: 0 },
  { label: "6M", months: 6, days: 0 },
  { label: "1Y", months: 12, days: 0 },
  { label: "All", months: 0, days: 0 },
];

const WeightTracker = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { convertWeight, parseWeightInput, weightLabel, measurementLabel } = useUnitPreferences();
  const [weight, setWeight] = useState("");
  const [history, setHistory] = useState<WeightEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const [measurementsEnabled, setMeasurementsEnabled] = useState(false);
  const [selectedMeasurement, setSelectedMeasurement] = useState<string>("waist");
  const [measurementRows, setMeasurementRows] = useState<Array<Record<string, any>>>([]);
  const [rangeIdx, setRangeIdx] = useState(2);

  const fetchHistory = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("weight_logs")
      .select("logged_at, weight")
      .eq("client_id", user.id)
      .order("logged_at", { ascending: true })
      .limit(90);
    setHistory((data as WeightEntry[]) || []);
  };

  useEffect(() => { fetchHistory(); }, [user]);

  // Load measurements_enabled flag and measurement rows for chosen range
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data: prof } = await supabase
        .from("profiles")
        .select("measurements_enabled")
        .eq("user_id", user.id)
        .maybeSingle();
      setMeasurementsEnabled(prof?.measurements_enabled === true);

      let mq = supabase
        .from("body_measurements")
        .select(
          "measured_at, neck, shoulders, chest, left_arm, right_arm, forearm, waist, hips, left_thigh, right_thigh, left_calf, right_calf, body_fat_pct"
        )
        .eq("client_id", user.id)
        .order("measured_at", { ascending: true });

      const range = RANGE_FILTERS[rangeIdx];
      if (range.months > 0) {
        mq = mq.gte("measured_at", format(subMonths(new Date(), range.months), "yyyy-MM-dd"));
      } else if (range.days > 0) {
        mq = mq.gte("measured_at", format(new Date(Date.now() - range.days * 86400000), "yyyy-MM-dd"));
      }
      const { data } = await mq.limit(1000);
      setMeasurementRows(data || []);
    };
    load();
    const onLogged = () => load();
    window.addEventListener("measurements-logged", onLogged);
    return () => window.removeEventListener("measurements-logged", onLogged);
  }, [user, rangeIdx]);

  const handleLog = async () => {
    if (!user || !weight) return;
    setLoading(true);
    const storedWeight = parseWeightInput(parseFloat(weight));
    const { error } = await supabase.from("weight_logs").upsert({
      client_id: user.id,
      weight: storedWeight,
    }, { onConflict: "client_id,logged_at" });
    setLoading(false);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Weight logged!" });
      window.dispatchEvent(new Event("weight-logged"));
      setWeight("");
      fetchHistory();
    }
  };

  const chartData = history.map(h => ({
    date: format(new Date(h.logged_at), "MM/dd"),
    weight: convertWeight(Number(h.weight)),
  }));

  const latestWeight = history.length > 0 ? convertWeight(Number(history[history.length - 1].weight)) : null;
  const startWeight = history.length > 1 ? convertWeight(Number(history[0].weight)) : null;
  const change = latestWeight && startWeight ? (latestWeight - startWeight).toFixed(1) : null;

  // Measurement derived values
  const measRows = measurementRows
    .map((r) => ({ ...r, _v: (r as any)[selectedMeasurement] }))
    .filter((r) => r._v !== null && r._v !== undefined && !isNaN(Number(r._v)));
  const measStart = measRows.length > 0 ? Number(measRows[0]._v) : null;
  const measCurr = measRows.length > 0 ? Number(measRows[measRows.length - 1]._v) : null;
  const measChange = measStart !== null && measCurr !== null ? Number((measCurr - measStart).toFixed(1)) : null;
  const measUnit = selectedMeasurement === "body_fat_pct" ? "%" : measurementLabel;
  const measChartRows = measRows.map((r) => ({
    date: format(new Date(r.measured_at), "MMM d"),
    value: Number(r._v),
  }));
  const measLabel = MEASUREMENT_OPTIONS.find((o) => o.key === selectedMeasurement)?.label || "";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scale className="h-5 w-5" /> Weight Tracker
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            type="number"
            step="0.1"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder={`Today's weight (${weightLabel})`}
            className="flex-1"
          />
          <Button onClick={handleLog} disabled={loading || !weight}>
            {loading ? "..." : "Log"}
          </Button>
        </div>

        {latestWeight && (
          <div className="flex items-center gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Current: </span>
              <span className="font-bold text-foreground">{latestWeight} {weightLabel}</span>
            </div>
            {change && (
              <div>
                <span className="text-muted-foreground">Change: </span>
                <span className={`font-bold ${parseFloat(change) < 0 ? "text-success" : "text-destructive"}`}>
                  {parseFloat(change) > 0 ? "+" : ""}{change} {weightLabel}
                </span>
              </div>
            )}
          </div>
        )}

        {chartData.length > 1 && (
          <div className="h-48 overflow-hidden">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis domain={["dataMin - 2", "dataMax + 2"]} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} width={40} />
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                  wrapperStyle={{ zIndex: 10, maxWidth: "85vw" }}
                  formatter={(value: number) => [`${value} ${weightLabel}`, "Weight"]}
                />
                <Line type="monotone" dataKey="weight" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3, fill: "hsl(var(--primary))" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Measurements Tracker */}
        {measurementsEnabled && (
          <div className="space-y-3 pt-4 border-t border-border/40">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Ruler className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Measurements</h3>
              </div>
              <Select value={selectedMeasurement} onValueChange={setSelectedMeasurement}>
                <SelectTrigger className="h-8 w-[150px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEASUREMENT_OPTIONS.map((o) => (
                    <SelectItem key={o.key} value={o.key} className="text-xs">{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-1 justify-center flex-wrap">
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

            {measStart !== null && measCurr !== null && (
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Starting</p>
                  <p className="text-base font-bold text-foreground tabular-nums">{measStart} {measUnit}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Current</p>
                  <p className="text-base font-bold text-foreground tabular-nums">{measCurr} {measUnit}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Change</p>
                  <p className={cn(
                    "text-base font-bold tabular-nums",
                    measChange && measChange < 0 ? "text-success" : measChange && measChange > 0 ? "text-destructive" : "text-foreground"
                  )}>
                    {measChange !== null ? (measChange > 0 ? "+" : "") + measChange + " " + measUnit : "—"}
                  </p>
                </div>
              </div>
            )}

            {measChartRows.length >= 2 ? (
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={measChartRows}>
                    <defs>
                      <linearGradient id="measGradWT" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.18} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      tickLine={false} axisLine={false}
                      interval={Math.max(0, Math.floor(measChartRows.length / 6) - 1)}
                    />
                    <YAxis
                      domain={["dataMin - 1", "dataMax + 1"]}
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      tickLine={false} axisLine={false} width={40}
                    />
                    <Tooltip
                      cursor={false}
                      content={({ active, payload }: any) => {
                        if (!active || !payload?.[0]) return null;
                        const p = payload[0].payload;
                        return (
                          <div className="rounded-lg border border-primary/50 bg-card px-3 py-1.5 text-xs text-foreground shadow-lg">
                            {p.date} &nbsp; <span className="font-bold">{p.value} {measUnit}</span>
                          </div>
                        );
                      }}
                    />
                    <Area
                      type="monotone" dataKey="value"
                      stroke="hsl(var(--primary))" strokeWidth={2.5}
                      fill="url(#measGradWT)" dot={false}
                      activeDot={{ r: 4, fill: "hsl(var(--primary))" }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="text-center py-6 text-xs text-muted-foreground">
                <Ruler className="h-7 w-7 mx-auto mb-2 text-muted-foreground/40" />
                Log {measLabel.toLowerCase()} at least twice to see a trend.
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default WeightTracker;
