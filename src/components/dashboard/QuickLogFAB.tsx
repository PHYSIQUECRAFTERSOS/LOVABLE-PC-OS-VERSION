import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Scale, Footprints, Camera, Dumbbell, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { invalidateCache } from "@/hooks/useDataFetch";
import { cn } from "@/lib/utils";

type QuickAction = "weight" | "steps" | null;

const QuickLogFAB = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [activeAction, setActiveAction] = useState<QuickAction>(null);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const today = format(new Date(), "yyyy-MM-dd");

  const handleSave = async () => {
    if (!user || !value) return;
    setSaving(true);

    try {
      if (activeAction === "weight") {
        const weight = parseFloat(value);
        if (isNaN(weight) || weight <= 0) throw new Error("Invalid weight");

        await supabase.from("weight_logs").insert({
          client_id: user.id,
          weight,
          logged_at: today,
        });
        toast({ title: "Weight logged!", description: `${weight} lbs recorded` });
        invalidateCache(`progress-momentum-${user.id}-${today}`);
      } else if (activeAction === "steps") {
        const steps = parseInt(value);
        if (isNaN(steps) || steps < 0) throw new Error("Invalid steps");

        await supabase.from("daily_health_metrics").upsert(
          { user_id: user.id, metric_date: today, steps, source: "manual" },
          { onConflict: "user_id,metric_date" }
        );
        toast({ title: "Steps logged!", description: `${steps.toLocaleString()} steps recorded` });
      }

      setActiveAction(null);
      setValue("");
      setExpanded(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const actions = [
    { key: "weight" as const, icon: <Scale className="h-4 w-4" />, label: "Weight" },
    { key: "steps" as const, icon: <Footprints className="h-4 w-4" />, label: "Steps" },
  ];

  return (
    <>
      {/* FAB */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col-reverse items-center gap-2">
        {expanded && (
          <div className="flex flex-col gap-2 animate-fade-in">
            {actions.map((action) => (
              <Button
                key={action.key}
                size="sm"
                variant="secondary"
                className="rounded-full shadow-lg gap-2 px-4"
                onClick={() => {
                  setActiveAction(action.key);
                  setExpanded(false);
                }}
              >
                {action.icon}
                {action.label}
              </Button>
            ))}
          </div>
        )}
        <Button
          size="icon"
          className={cn(
            "h-14 w-14 rounded-full shadow-xl transition-transform",
            expanded && "rotate-45"
          )}
          onClick={() => setExpanded(!expanded)}
        >
          <Plus className="h-6 w-6" />
        </Button>
      </div>

      {/* Quick log dialog */}
      <Dialog open={!!activeAction} onOpenChange={(open) => { if (!open) { setActiveAction(null); setValue(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Log {activeAction === "weight" ? "Body Weight" : "Steps"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>
                {activeAction === "weight" ? "Weight (lbs)" : "Step Count"}
              </Label>
              <Input
                type="number"
                placeholder={activeAction === "weight" ? "185.5" : "10000"}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                autoFocus
                className="mt-1.5"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setActiveAction(null); setValue(""); }}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={!value || saving}>
                {saving ? "Saving..." : "Log"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default QuickLogFAB;
