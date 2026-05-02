import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Scale } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useUnitPreferences } from "@/hooks/useUnitPreferences";

interface WeightEntry {
  logged_at: string;
  weight: number;
}

const WeightTracker = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { convertWeight, parseWeightInput, weightLabel } = useUnitPreferences();
  const [weight, setWeight] = useState("");
  const [history, setHistory] = useState<WeightEntry[]>([]);
  const [loading, setLoading] = useState(false);

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

  const handleLog = async () => {
    if (!user || !weight) return;
    setLoading(true);
    // Convert from user's display unit to lbs for canonical storage
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

  // Convert stored lbs values to display unit for chart
  const chartData = history.map(h => ({
    date: format(new Date(h.logged_at), "MM/dd"),
    weight: convertWeight(Number(h.weight)),
  }));

  const latestWeight = history.length > 0 ? convertWeight(Number(history[history.length - 1].weight)) : null;
  const startWeight = history.length > 1 ? convertWeight(Number(history[0].weight)) : null;
  const change = latestWeight && startWeight ? (latestWeight - startWeight).toFixed(1) : null;

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
                <span className={`font-bold ${parseFloat(change) < 0 ? "text-green-400" : "text-red-400"}`}>
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
      </CardContent>
    </Card>
  );
};

export default WeightTracker;
