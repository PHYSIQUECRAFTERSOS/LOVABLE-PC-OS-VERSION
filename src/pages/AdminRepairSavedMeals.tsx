import { useState, useEffect } from "react";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Wrench, Trash2, CheckCircle2, Loader2, PlayCircle, FileX } from "lucide-react";

interface AuditRow {
  id: string;
  run_id: string;
  action: "repair" | "delete";
  status: string;
  meal_id: string;
  meal_item_id: string;
  food_name: string | null;
  original_amount: number | null;
  original_unit: string | null;
  original_calories: number | null;
  original_protein_g: number | null;
  original_carbs_g: number | null;
  original_fat_g: number | null;
  proposed_amount: number | null;
  proposed_unit: string | null;
  back_calc_agreement_pct: number | null;
  notes: string | null;
}

interface DryRunSummary {
  run_id: string;
  repairs_proposed: number;
  deletions_proposed: number;
  already_correct: number;
  ambiguous: number;
}

const AdminRepairSavedMeals = () => {
  const { role, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [running, setRunning] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [summary, setSummary] = useState<DryRunSummary | null>(null);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [mealNames, setMealNames] = useState<Record<string, string>>({});
  const [emptyMeals, setEmptyMeals] = useState<any[]>([]);
  const [loadingEmpty, setLoadingEmpty] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadEmptyMeals = async () => {
    setLoadingEmpty(true);
    const { data, error } = await supabase.rpc("list_empty_saved_meals" as any);
    if (error) {
      toast({ title: "Failed to load empty meals", description: error.message, variant: "destructive" });
    } else {
      setEmptyMeals((data || []) as any[]);
    }
    setLoadingEmpty(false);
  };

  const handleDeleteEmpty = async (mealId: string, name: string) => {
    if (!confirm(`Delete empty meal "${name}"? This cannot be undone.`)) return;
    setDeletingId(mealId);
    const { error } = await supabase.rpc("admin_delete_empty_saved_meal" as any, { p_meal_id: mealId });
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Empty meal deleted", description: name });
      setEmptyMeals(prev => prev.filter(m => m.id !== mealId));
    }
    setDeletingId(null);
  };

  useEffect(() => {
    // Auto-load latest dry-run if one exists
    const loadLatest = async () => {
      const { data } = await supabase
        .from("saved_meal_repair_audit" as any)
        .select("run_id")
        .order("run_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data && (data as any).run_id) {
        await loadRun((data as any).run_id);
      }
    };
    if (role === "admin") {
      loadLatest();
      loadEmptyMeals();
    }
  }, [role]);

  const loadRun = async (runId: string) => {
    const { data, error } = await supabase
      .from("saved_meal_repair_audit" as any)
      .select("*")
      .eq("run_id", runId)
      .order("action", { ascending: true });

    if (error) {
      toast({ title: "Failed to load audit rows", description: error.message, variant: "destructive" });
      return;
    }
    const auditRows = (data || []) as unknown as AuditRow[];
    setRows(auditRows);

    // Reconstruct summary from rows
    const repairs = auditRows.filter(r => r.action === "repair" && (r.status === "proposed" || r.status === "committed")).length;
    const deletions = auditRows.filter(r => r.action === "delete" && (r.status === "proposed_delete" || r.status === "committed")).length;
    const ambiguous = auditRows.filter(r => r.status === "skipped_ambiguous").length;
    const alreadyCorrect = auditRows.filter(r => r.status === "skipped_already_correct").length;
    setSummary({ run_id: runId, repairs_proposed: repairs, deletions_proposed: deletions, ambiguous, already_correct: alreadyCorrect });

    // Fetch parent meal names
    const mealIds = Array.from(new Set(auditRows.map(r => r.meal_id)));
    if (mealIds.length > 0) {
      const { data: meals } = await supabase
        .from("saved_meals")
        .select("id, name")
        .in("id", mealIds);
      const map: Record<string, string> = {};
      (meals || []).forEach((m: any) => { map[m.id] = m.name; });
      setMealNames(map);
    }
  };

  const handleDryRun = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.rpc("repair_saved_meals_dry_run" as any);
      if (error) throw error;
      const result = data as unknown as DryRunSummary;
      toast({ title: "Dry run complete", description: `${result.repairs_proposed} repairs, ${result.deletions_proposed} deletions staged.` });
      await loadRun(result.run_id);
    } catch (e: any) {
      toast({ title: "Dry run failed", description: e.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const handleCommit = async () => {
    if (!summary) return;
    if (!confirm(`Commit ${summary.repairs_proposed} repairs and ${summary.deletions_proposed} deletions? This cannot be auto-undone.`)) return;
    setCommitting(true);
    try {
      const { data, error } = await supabase.rpc("repair_saved_meals_commit" as any, { p_run_id: summary.run_id });
      if (error) throw error;
      const result = data as any;
      toast({ title: "Repairs committed", description: `${result.repaired} repaired, ${result.deleted} deleted, ${result.meals_recomputed} meals recomputed.` });
      await loadRun(summary.run_id);
    } catch (e: any) {
      toast({ title: "Commit failed", description: e.message, variant: "destructive" });
    } finally {
      setCommitting(false);
    }
  };

  if (authLoading) return null;
  if (role !== "admin") return <Navigate to="/dashboard" replace />;

  const repairRows = rows.filter(r => r.action === "repair" && (r.status === "proposed" || r.status === "committed"));
  const deleteRows = rows.filter(r => r.action === "delete" && (r.status === "proposed_delete" || r.status === "committed"));
  const ambiguousRows = rows.filter(r => r.status === "skipped_ambiguous");
  const alreadyCorrectRows = rows.filter(r => r.status === "skipped_already_correct");
  const allCommitted = rows.length > 0 && rows.every(r => r.status === "committed" || r.status.startsWith("skipped"));

  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Repair My Meals — Portion Corruption</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Detects saved-meal items that lost their original portion (stuck at "1g" with full-portion macros).
            Auto-repairs rows where back-calculation agreement ≥ 95%; auto-deletes rows that have no per-100g reference data.
          </p>
        </div>

        {/* Action bar */}
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 pt-6">
            <Button onClick={handleDryRun} disabled={running} variant="outline" className="gap-2">
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
              {running ? "Scanning…" : "Run Dry Run"}
            </Button>
            <Button
              onClick={handleCommit}
              disabled={!summary || committing || (summary.repairs_proposed === 0 && summary.deletions_proposed === 0) || allCommitted}
              className="gap-2"
            >
              {committing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {allCommitted ? "Already Committed" : "Commit Repairs + Deletions"}
            </Button>
            {summary && (
              <div className="ml-auto flex flex-wrap gap-2 text-xs">
                <Badge variant="outline">Repairs: {summary.repairs_proposed}</Badge>
                <Badge variant="outline">Deletions: {summary.deletions_proposed}</Badge>
                <Badge variant="secondary">Ambiguous: {summary.ambiguous}</Badge>
                <Badge variant="secondary">Already correct: {summary.already_correct}</Badge>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Empty Saved Meals — manual cleanup (no auto-delete) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileX className="h-4 w-4 text-destructive" />
              Empty Saved Meals ({emptyMeals.length})
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Parent meal rows with zero items. Likely created by a buggy save flow before the Phase 2 fix. Review and delete manually.
            </p>
          </CardHeader>
          <CardContent>
            {loadingEmpty ? (
              <p className="text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin mr-2" />Loading…</p>
            ) : emptyMeals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No empty saved meals found. ✅</p>
            ) : (
              <div className="space-y-2">
                {emptyMeals.map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground truncate">{m.name || "(unnamed)"}</p>
                      <p className="text-xs text-muted-foreground">
                        {m.client_name} · {m.meal_type || "—"} · header: {Math.round(m.calories || 0)} cal · created {new Date(m.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteEmpty(m.id, m.name)}
                      disabled={deletingId === m.id}
                      className="gap-1.5 shrink-0"
                    >
                      {deletingId === m.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                      Delete
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Repairs section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wrench className="h-4 w-4 text-primary" />
              Repairs ({repairRows.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {repairRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No repair rows in this run.</p>
            ) : (
              <div className="space-y-2">
                {repairRows.map(r => (
                  <div key={r.id} className="rounded-lg border border-border bg-card p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-foreground">{r.food_name}</p>
                        <p className="text-xs text-muted-foreground">in <span className="text-foreground/80">{mealNames[r.meal_id] || r.meal_id}</span></p>
                      </div>
                      {r.status === "committed" ? (
                        <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" />Committed</Badge>
                      ) : (
                        <Badge variant="outline">{r.back_calc_agreement_pct}% agreement</Badge>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded bg-muted px-2 py-1 line-through text-muted-foreground">
                        {r.original_amount}{r.original_unit} · {r.original_calories} cal
                      </span>
                      <span className="text-muted-foreground">→</span>
                      <span className="rounded bg-primary/10 px-2 py-1 text-primary font-medium">
                        {r.proposed_amount}{r.proposed_unit} · {r.original_calories} cal
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Deletions section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Trash2 className="h-4 w-4 text-destructive" />
              Deletions ({deleteRows.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {deleteRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No deletion rows in this run.</p>
            ) : (
              <div className="space-y-2">
                {deleteRows.map(r => (
                  <div key={r.id} className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-foreground">{r.food_name}</p>
                        <p className="text-xs text-muted-foreground">in <span className="text-foreground/80">{mealNames[r.meal_id] || r.meal_id}</span></p>
                      </div>
                      {r.status === "committed" ? (
                        <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" />Deleted</Badge>
                      ) : (
                        <Badge variant="destructive">Will delete</Badge>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Bad data: {r.original_amount}{r.original_unit} · {r.original_calories} cal · {r.original_protein_g}P · {r.original_carbs_g}C · {r.original_fat_g}F
                    </p>
                    {r.notes && <p className="mt-1 text-xs text-muted-foreground italic">{r.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Ambiguous (manual review) */}
        {ambiguousRows.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                Ambiguous — manual review ({ambiguousRows.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {ambiguousRows.map(r => (
                <div key={r.id} className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="font-medium text-foreground">{r.food_name}</p>
                  <p className="text-xs text-muted-foreground">in {mealNames[r.meal_id] || r.meal_id}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Back-calc agreement only {r.back_calc_agreement_pct}% — not auto-committed.
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Already correct */}
        {alreadyCorrectRows.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-muted-foreground">
                <CheckCircle2 className="h-4 w-4" />
                Skipped — coach intent preserved ({alreadyCorrectRows.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                These rows are 1g and the macros actually match 1g of the linked food, so they were left untouched.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
};

export default AdminRepairSavedMeals;
