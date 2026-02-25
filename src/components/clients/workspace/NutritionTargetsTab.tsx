import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Target, Edit2, Save, UtensilsCrossed } from "lucide-react";
import { format } from "date-fns";

interface Targets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

const NutritionTargetsTab = ({ clientId }: { clientId: string }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [targets, setTargets] = useState<Targets | null>(null);
  const [todayTotals, setTodayTotals] = useState<Targets>({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Targets>({ calories: 2000, protein: 150, carbs: 200, fat: 70 });

  useEffect(() => {
    loadData();
  }, [clientId]);

  const loadData = async () => {
    setLoading(true);
    const today = format(new Date(), "yyyy-MM-dd");

    const [targetsRes, logsRes] = await Promise.all([
      supabase
        .from("nutrition_targets")
        .select("calories, protein, carbs, fat")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("nutrition_logs")
        .select("calories, protein, carbs, fat")
        .eq("client_id", clientId)
        .gte("logged_at", `${today}T00:00:00`)
        .lte("logged_at", `${today}T23:59:59`),
    ]);

    if (targetsRes.data) {
      const t = targetsRes.data as Targets;
      setTargets(t);
      setForm(t);
    }

    const logs = logsRes.data || [];
    setTodayTotals({
      calories: logs.reduce((s, l) => s + (l.calories || 0), 0),
      protein: logs.reduce((s, l) => s + (l.protein || 0), 0),
      carbs: logs.reduce((s, l) => s + (l.carbs || 0), 0),
      fat: logs.reduce((s, l) => s + (l.fat || 0), 0),
    });
    setLoading(false);
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("nutrition_targets").insert({
      client_id: clientId,
      coach_id: user.id,
      calories: form.calories,
      protein: form.protein,
      carbs: form.carbs,
      fat: form.fat,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setTargets({ ...form });
      setEditing(false);
      toast({ title: "Nutrition targets updated" });
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    );
  }

  const macros = [
    { key: "calories", label: "Calories", unit: "kcal", color: "bg-primary" },
    { key: "protein", label: "Protein", unit: "g", color: "bg-blue-500" },
    { key: "carbs", label: "Carbs", unit: "g", color: "bg-amber-500" },
    { key: "fat", label: "Fat", unit: "g", color: "bg-rose-500" },
  ] as const;

  const totalMacroCals = targets
    ? (targets.protein * 4) + (targets.carbs * 4) + (targets.fat * 9)
    : 0;

  return (
    <div className="space-y-4">
      {/* Targets Card */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Daily Macro Targets
          </CardTitle>
          {!editing && (
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
              <Edit2 className="h-3.5 w-3.5 mr-1" /> Edit
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {editing ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Calories</Label><Input type="number" value={form.calories} onChange={e => setForm({ ...form, calories: parseInt(e.target.value) || 0 })} /></div>
                <div><Label>Protein (g)</Label><Input type="number" value={form.protein} onChange={e => setForm({ ...form, protein: parseInt(e.target.value) || 0 })} /></div>
                <div><Label>Carbs (g)</Label><Input type="number" value={form.carbs} onChange={e => setForm({ ...form, carbs: parseInt(e.target.value) || 0 })} /></div>
                <div><Label>Fat (g)</Label><Input type="number" value={form.fat} onChange={e => setForm({ ...form, fat: parseInt(e.target.value) || 0 })} /></div>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={saving} className="flex-1">
                  <Save className="h-3.5 w-3.5 mr-1" /> {saving ? "Saving..." : "Save Targets"}
                </Button>
                <Button variant="outline" onClick={() => { setEditing(false); if (targets) setForm(targets); }}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : targets ? (
            <div className="space-y-4">
              {macros.map(m => {
                const target = targets[m.key];
                const current = Math.round(todayTotals[m.key]);
                const remaining = Math.max(0, target - current);
                const pct = target > 0 ? Math.min(Math.round((current / target) * 100), 100) : 0;

                return (
                  <div key={m.key} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{m.label}</span>
                      <div className="text-right">
                        <span className="text-sm font-semibold">{current}</span>
                        <span className="text-xs text-muted-foreground"> / {target} {m.unit}</span>
                      </div>
                    </div>
                    <Progress value={pct} className="h-2" />
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>{pct}% consumed</span>
                      <span>{remaining} {m.unit} remaining</span>
                    </div>
                  </div>
                );
              })}

              {/* Macro Percentages */}
              {totalMacroCals > 0 && (
                <div className="pt-3 border-t border-border">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Macro Split</p>
                  <div className="flex gap-4">
                    <div className="text-center">
                      <p className="text-lg font-bold text-foreground">{Math.round((targets.protein * 4 / totalMacroCals) * 100)}%</p>
                      <p className="text-[10px] text-muted-foreground">Protein</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-foreground">{Math.round((targets.carbs * 4 / totalMacroCals) * 100)}%</p>
                      <p className="text-[10px] text-muted-foreground">Carbs</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-foreground">{Math.round((targets.fat * 9 / totalMacroCals) * 100)}%</p>
                      <p className="text-[10px] text-muted-foreground">Fat</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground mb-3">No nutrition targets set yet.</p>
              <Button size="sm" onClick={() => setEditing(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Set Targets
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const Plus = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
);

export default NutritionTargetsTab;
