import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Scale, ArrowDown, ArrowUp, Minus } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";

interface BodyStatsEventPanelProps {
  clientId: string;
  eventDate: string; // YYYY-MM-DD
}

interface WeightEntry {
  weight: number;
  logged_at: string;
  notes: string | null;
}

interface BodyStatsEntry {
  body_weight_lbs: number | null;
  log_date: string;
  neck_in: number | null;
  shoulders_in: number | null;
  chest_in: number | null;
  bicep_in: number | null;
  forearm_in: number | null;
  waist_in: number | null;
  hips_in: number | null;
  thigh_in: number | null;
  calf_in: number | null;
}

const BodyStatsEventPanel = ({ clientId, eventDate }: BodyStatsEventPanelProps) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [weightEntry, setWeightEntry] = useState<WeightEntry | null>(null);
  const [bodyStats, setBodyStats] = useState<BodyStatsEntry | null>(null);
  const [prevWeight, setPrevWeight] = useState<{ weight: number; logged_at: string } | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const results = await Promise.allSettled([
        supabase
          .from("weight_logs")
          .select("weight, logged_at, notes")
          .eq("client_id", clientId)
          .eq("logged_at", eventDate)
          .limit(1)
          .maybeSingle(),
        supabase
          .from("body_stats")
          .select("body_weight_lbs, log_date, neck_in, shoulders_in, chest_in, bicep_in, forearm_in, waist_in, hips_in, thigh_in, calf_in")
          .eq("client_id", clientId)
          .eq("log_date", eventDate)
          .limit(1)
          .maybeSingle(),
        supabase
          .from("weight_logs")
          .select("weight, logged_at")
          .eq("client_id", clientId)
          .lt("logged_at", eventDate)
          .order("logged_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (results[0].status === "fulfilled" && results[0].value.data) {
        setWeightEntry(results[0].value.data as WeightEntry);
      }
      if (results[1].status === "fulfilled" && results[1].value.data) {
        setBodyStats(results[1].value.data as BodyStatsEntry);
      }
      if (results[2].status === "fulfilled" && results[2].value.data) {
        setPrevWeight(results[2].value.data as { weight: number; logged_at: string });
      }
      setLoading(false);
    };
    fetchData();
  }, [clientId, eventDate]);

  if (loading) {
    return (
      <div className="space-y-2 my-3">
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    );
  }

  const weight = weightEntry?.weight ?? bodyStats?.body_weight_lbs;

  if (!weight) {
    return (
      <div className="my-3 rounded-xl border border-dashed border-[#333333] p-4 text-center">
        <Scale className="h-8 w-8 text-[#555555] mx-auto mb-2" />
        <p className="text-sm text-[#555555] font-medium">No body stats submitted for this date</p>
        <p className="text-xs text-[#555555] mt-1">Client has not logged their weight for this check-in</p>
      </div>
    );
  }

  const change = prevWeight ? weight - prevWeight.weight : null;

  const measurements = bodyStats ? [
    { label: "Neck", val: bodyStats.neck_in },
    { label: "Shoulders", val: bodyStats.shoulders_in },
    { label: "Chest", val: bodyStats.chest_in },
    { label: "Bicep", val: bodyStats.bicep_in },
    { label: "Forearm", val: bodyStats.forearm_in },
    { label: "Waist", val: bodyStats.waist_in },
    { label: "Hips", val: bodyStats.hips_in },
    { label: "Thigh", val: bodyStats.thigh_in },
    { label: "Calf", val: bodyStats.calf_in },
  ].filter(m => m.val != null) : [];

  return (
    <div className="my-3 space-y-3">
      <h4 className="text-sm font-semibold text-foreground">Body Stats</h4>
      <div className="rounded-xl bg-[#1a1a1a] p-4 text-center">
        <p className="text-[32px] font-bold text-primary tabular-nums">{Math.round(weight * 10) / 10} lbs</p>
        <p className="text-xs text-[#888888] mt-1">
          {format(new Date(eventDate + "T12:00:00"), "MMMM d, yyyy")}
        </p>

        {change !== null && (
          <div className="flex items-center justify-center gap-1.5 mt-2">
            {change < 0 ? (
              <>
                <ArrowDown className="h-3.5 w-3.5 text-green-400" />
                <span className="text-xs text-green-400 font-medium">
                  {Math.abs(Math.round(change * 10) / 10)} lbs since {format(new Date(prevWeight!.logged_at + "T12:00:00"), "MMM d")}
                </span>
              </>
            ) : change > 0 ? (
              <>
                <ArrowUp className="h-3.5 w-3.5 text-red-400" />
                <span className="text-xs text-red-400 font-medium">
                  +{Math.round(change * 10) / 10} lbs since {format(new Date(prevWeight!.logged_at + "T12:00:00"), "MMM d")}
                </span>
              </>
            ) : (
              <>
                <Minus className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  No change since {format(new Date(prevWeight!.logged_at + "T12:00:00"), "MMM d")}
                </span>
              </>
            )}
          </div>
        )}

        {measurements.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border/30 grid grid-cols-3 gap-2 text-left">
            {measurements.map(m => (
              <div key={m.label}>
                <p className="text-[11px] text-[#888888]">{m.label}</p>
                <p className="text-sm text-foreground font-medium">{m.val}" </p>
              </div>
            ))}
          </div>
        )}

        {weightEntry?.notes && (
          <p className="text-xs text-[#888888] mt-2 text-left">{weightEntry.notes}</p>
        )}
      </div>

      <button
        onClick={() => navigate("/progress")}
        className="text-xs text-primary hover:underline"
      >
        View full weight history →
      </button>
    </div>
  );
};

export default BodyStatsEventPanel;
