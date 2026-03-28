import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { subDays, format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Flame } from "lucide-react";

const ClientNutritionDashboard = () => {
  const { user } = useAuth();
  const [avg7, setAvg7] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const today = new Date();
      const start = format(subDays(today, 6), "yyyy-MM-dd");
      const end = format(today, "yyyy-MM-dd");

      const { data } = await supabase
        .from("nutrition_logs")
        .select("logged_at, calories")
        .eq("client_id", user.id)
        .gte("logged_at", start)
        .lte("logged_at", end);

      if (!data || data.length === 0) {
        setAvg7(0);
        return;
      }

      // Group by day and sum calories
      const dayMap: Record<string, number> = {};
      data.forEach((log: any) => {
        const d = log.logged_at;
        dayMap[d] = (dayMap[d] || 0) + (log.calories || 0);
      });

      const days = Object.values(dayMap);
      const total = days.reduce((s, v) => s + v, 0);
      setAvg7(Math.round(total / days.length));
    };
    load();
  }, [user]);

  if (avg7 === null) return null;

  return (
    <div className="grid grid-cols-1 gap-3">
      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Flame className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-xl font-bold text-foreground tabular-nums">{avg7.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Avg Intake · Past 7 Days</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ClientNutritionDashboard;
