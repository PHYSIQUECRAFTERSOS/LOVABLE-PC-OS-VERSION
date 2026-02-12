import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Droplets, Plus, Minus } from "lucide-react";
import { format } from "date-fns";

const GLASS_ML = 250;
const DAILY_GOAL = 3000; // 3L

const WaterTracker = () => {
  const { user } = useAuth();
  const [total, setTotal] = useState(0);
  const today = format(new Date(), "yyyy-MM-dd");

  const fetchWater = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("water_logs")
      .select("amount_ml")
      .eq("client_id", user.id)
      .eq("logged_at", today);
    const sum = (data || []).reduce((acc, d) => acc + d.amount_ml, 0);
    setTotal(sum);
  };

  useEffect(() => { fetchWater(); }, [user]);

  const addWater = async () => {
    if (!user) return;
    await supabase.from("water_logs").insert({
      client_id: user.id,
      amount_ml: GLASS_ML,
      logged_at: today,
    });
    setTotal((prev) => prev + GLASS_ML);
  };

  const removeWater = async () => {
    if (!user || total <= 0) return;
    // Delete one entry
    const { data } = await supabase
      .from("water_logs")
      .select("id")
      .eq("client_id", user.id)
      .eq("logged_at", today)
      .limit(1);
    if (data && data.length > 0) {
      await supabase.from("water_logs").delete().eq("id", data[0].id);
      setTotal((prev) => Math.max(0, prev - GLASS_ML));
    }
  };

  const glasses = Math.round(total / GLASS_ML);
  const percentage = Math.min((total / DAILY_GOAL) * 100, 100);

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Droplets className="h-4 w-4 text-blue-400" />
          <span className="text-sm font-medium text-foreground">Water Intake</span>
        </div>
        <span className="text-xs text-muted-foreground">{total}ml / {DAILY_GOAL}ml</span>
      </div>

      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-blue-400 transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{glasses} glasses</span>
        <div className="flex gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={removeWater} disabled={total <= 0}>
            <Minus className="h-3 w-3" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={addWater}>
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default WaterTracker;
