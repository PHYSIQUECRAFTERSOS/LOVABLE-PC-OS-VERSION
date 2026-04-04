import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUnitPreferences } from "@/hooks/useUnitPreferences";
import { Scale, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { format } from "date-fns";

interface CurrentWeightCardProps {
  onClick: () => void;
  clientId?: string;
}

const CurrentWeightCard = ({ onClick, clientId }: CurrentWeightCardProps) => {
  const { user } = useAuth();
  const [latest, setLatest] = useState<{ weight: number; logged_at: string } | null>(null);
  const [previous, setPrevious] = useState<{ weight: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const { convertWeight, weightLabel } = useUnitPreferences();
  const targetId = clientId || user?.id;

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!targetId) return;
    const fetchWeight = async () => {
      const { data } = await supabase
        .from("weight_logs")
        .select("weight, logged_at")
        .eq("client_id", targetId)
        .order("logged_at", { ascending: false })
        .limit(2);
      if (data && data.length > 0) {
        setLatest({ weight: Number(data[0].weight), logged_at: data[0].logged_at });
        if (data.length > 1) setPrevious({ weight: Number(data[1].weight) });
      }
      setLoading(false);
    };
    fetchWeight();
  }, [targetId, refreshKey]);

  // Listen for weight-logged events to refresh instantly
  useEffect(() => {
    const handler = () => setRefreshKey(k => k + 1);
    window.addEventListener("weight-logged", handler);
    return () => window.removeEventListener("weight-logged", handler);
  }, []);

  const displayWeight = latest ? convertWeight(latest.weight) : null;
  const displayPrev = previous ? convertWeight(previous.weight) : null;
  const diff = displayWeight !== null && displayPrev !== null ? Number((displayWeight - displayPrev).toFixed(1)) : null;

  return (
    <button
      onClick={onClick}
      className="rounded-xl bg-card border border-border p-3 sm:p-4 text-left transition-colors hover:bg-secondary/30 w-full overflow-hidden"
    >
      <div className="flex items-center gap-1.5 mb-1">
        <Scale className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs text-muted-foreground truncate">Current Weight</span>
      </div>
      {loading ? (
        <div className="h-7 w-20 bg-muted animate-pulse rounded" />
      ) : latest ? (
        <>
          <div className="text-lg sm:text-xl font-bold text-foreground tabular-nums">
            {latest.weight} lbs
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 mt-1 flex-wrap">
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
              As of {format(new Date(latest.logged_at + "T00:00:00"), "MMM d")}
            </span>
            {diff !== null && diff !== 0 ? (
              <span className={`text-[10px] font-medium flex items-center gap-0.5 whitespace-nowrap ${diff > 0 ? "text-red-400" : "text-green-400"}`}>
                {diff > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {diff > 0 ? "+" : ""}{diff} lbs
              </span>
            ) : (
              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                <Minus className="h-3 w-3" /> Stable
              </span>
            )}
          </div>
        </>
      ) : (
        <div className="text-xl font-bold text-foreground">–</div>
      )}
    </button>
  );
};

export default CurrentWeightCard;
