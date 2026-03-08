import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Wrench, Loader2, CheckCircle2, XCircle } from "lucide-react";

interface RepairResult {
  repaired: number;
  already_correct: number;
  ran_at: string;
}

type Status = "idle" | "running" | "success" | "error";

const LabelRepairTool = () => {
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<RepairResult | null>(null);
  const [lastRun, setLastRun] = useState<{ ran_at: string; repaired_count: number; already_correct_count: number } | null>(null);

  useEffect(() => {
    supabase
      .from("admin_tool_runs")
      .select("ran_at, repaired_count, already_correct_count")
      .eq("tool_name", "repair_workout_labels")
      .order("ran_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setLastRun(data as any);
      });
  }, []);

  const runRepair = async () => {
    setStatus("running");
    setResult(null);

    const { data, error } = await supabase.rpc("admin_repair_workout_labels");

    if (error) {
      console.error("Label repair failed:", error);
      setStatus("error");
      return;
    }

    const res = data as unknown as RepairResult;
    setResult(res);
    setStatus("success");
    setLastRun({ ran_at: res.ran_at, repaired_count: res.repaired, already_correct_count: res.already_correct });
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString(undefined, {
        month: "short", day: "numeric", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg flex items-center gap-2">
          <Wrench className="h-5 w-5 text-muted-foreground" />
          Data Integrity Tools
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-border p-4 space-y-3">
          <div>
            <h4 className="text-sm font-semibold">Repair Workout Labels</h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              Fixes any calendar event labels that don't match their linked workout day name and position.
            </p>
          </div>

          <div className="text-xs text-muted-foreground space-y-0.5">
            <p>Last run: {lastRun ? formatDate(lastRun.ran_at) : "Never"}</p>
            {lastRun && (
              <p>Last result: {lastRun.repaired_count > 0
                ? `${lastRun.repaired_count} repaired, ${lastRun.already_correct_count} already correct`
                : `All ${lastRun.already_correct_count} labels correct`}
              </p>
            )}
          </div>

          {status === "success" && result && (
            <div className="flex items-center gap-1.5 text-xs text-green-600">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {result.repaired > 0
                ? `Repaired ${result.repaired} calendar event label${result.repaired !== 1 ? "s" : ""}`
                : `All ${result.already_correct} labels were already correct — nothing to fix`}
            </div>
          )}

          {status === "error" && (
            <div className="flex items-center gap-1.5 text-xs text-destructive">
              <XCircle className="h-3.5 w-3.5" />
              Repair failed — check console for details
            </div>
          )}

          <Button
            onClick={runRepair}
            disabled={status === "running"}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            {status === "running"
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Repairing…</>
              : "Run Repair"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default LabelRepairTool;
