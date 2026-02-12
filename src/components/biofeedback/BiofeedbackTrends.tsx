import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { format } from "date-fns";

const METRIC_COLORS: Record<string, string> = {
  sleep_quality: "#60a5fa",
  stress_level: "#f87171",
  energy_level: "#facc15",
  digestion: "#4ade80",
  libido: "#f472b6",
  mood: "#a78bfa",
};

const METRIC_LABELS: Record<string, string> = {
  sleep_quality: "Sleep",
  stress_level: "Stress",
  energy_level: "Energy",
  digestion: "Digestion",
  libido: "Libido",
  mood: "Mood",
};

const BiofeedbackTrends = () => {
  const { user } = useAuth();
  const [data, setData] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const { data: checkins } = await supabase
        .from("weekly_checkins")
        .select("week_date, sleep_quality, stress_level, energy_level, digestion, libido, mood")
        .eq("client_id", user.id)
        .order("week_date", { ascending: true })
        .limit(20);

      if (checkins) {
        setData(checkins.map(c => ({
          date: format(new Date(c.week_date), "MM/dd"),
          sleep_quality: c.sleep_quality,
          stress_level: c.stress_level,
          energy_level: c.energy_level,
          digestion: c.digestion,
          libido: c.libido,
          mood: c.mood,
        })));
      }
    };
    fetch();
  }, [user]);

  if (data.length < 2) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" /> Biofeedback Trends
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-6">
            Submit at least 2 weekly check-ins to see trends.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" /> Biofeedback Trends
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis domain={[0, 10]} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip
                contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {Object.entries(METRIC_COLORS).map(([key, color]) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  name={METRIC_LABELS[key]}
                  stroke={color}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

export default BiofeedbackTrends;
