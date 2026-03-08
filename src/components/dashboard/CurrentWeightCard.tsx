import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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
  const targetId = clientId || user?.id;

  useEffect(() => {
    if (!targetId) return;
    const fetch = async () => {
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
    fetch();
  }, [targetId]);

  const diff = latest && previous ? Number((latest.weight - previous.weight).toFixed(1)) : null;

  return (
    <button
      onClick={onClick}
      className="rounded-xl bg-card border border-border p-4 text-left transition-colors hover:bg-secondary/30 w-full"
    >
      <div className="flex items-center gap-1.5 mb-1">
        <Scale className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Current Weight</span>
      </div>
      {loading ? (
        <div className="h-7 w-20 bg-muted animate-pulse rounded" />
      ) : latest ? (
        <>
          <div className="text-xl font-bold text-foreground tabular-nums">
            {latest.weight} lbs
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] text-muted-foreground">
              As of {format(new Date(latest.logged_at + "T00:00:00"), "MMM d")}
            </span>
            {diff !== null && diff !== 0 ? (
              <span className={`text-[10px] font-medium flex items-center gap-0.5 ${diff > 0 ? "text-red-400" : "text-green-400"}`}>
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
