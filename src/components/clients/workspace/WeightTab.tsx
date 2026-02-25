import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Weight } from "lucide-react";
import { format } from "date-fns";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const ClientWorkspaceWeight = ({ clientId }: { clientId: string }) => {
  const [weights, setWeights] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("weight_logs")
        .select("weight, logged_at")
        .eq("client_id", clientId)
        .order("logged_at", { ascending: true })
        .limit(90);
      setWeights(data || []);
      setLoading(false);
    };
    load();
  }, [clientId]);

  if (loading) return <Skeleton className="h-[300px] rounded-xl" />;

  if (weights.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Weight className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No weight data recorded yet.</p>
        </CardContent>
      </Card>
    );
  }

  const chartData = weights.map((w: any) => ({
    date: format(new Date(w.logged_at), "MMM d"),
    weight: Number(w.weight),
  }));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Weight className="h-4 w-4 text-primary" />
          Weight Trend
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="date" className="text-xs" tick={{ fontSize: 11 }} />
            <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Line
              type="monotone"
              dataKey="weight"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

export default ClientWorkspaceWeight;
