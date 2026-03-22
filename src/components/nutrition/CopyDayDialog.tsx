import { useState } from "react";
import { format, addDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Copy, CalendarPlus, Loader2 } from "lucide-react";

interface CopyDayDialogProps {
  sourceDate: Date;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCopied: () => void;
}

const CopyDayDialog = ({ sourceDate, open, onOpenChange, onCopied }: CopyDayDialogProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);
  const [copying, setCopying] = useState(false);
  const [conflictDates, setConflictDates] = useState<string[]>([]);
  const [showConflict, setShowConflict] = useState(false);
  const [pendingInserts, setPendingInserts] = useState<any[]>([]);

  const sourceDateStr = format(sourceDate, "yyyy-MM-dd");
  const tomorrow = addDays(sourceDate, 1);

  const handleQuickTomorrow = () => {
    setSelectedDates([tomorrow]);
  };

  const toggleDate = (date: Date | undefined) => {
    if (!date) return;
    const ds = format(date, "yyyy-MM-dd");
    if (ds === sourceDateStr) return; // can't copy to same day
    setSelectedDates(prev => {
      const exists = prev.some(d => format(d, "yyyy-MM-dd") === ds);
      if (exists) return prev.filter(d => format(d, "yyyy-MM-dd") !== ds);
      return [...prev, date];
    });
  };

  const executeCopy = async (mode: "replace" | "append") => {
    if (!user || selectedDates.length === 0) return;
    setCopying(true);

    try {
      // Fetch source day logs
      const { data: sourceLogs } = await supabase
        .from("nutrition_logs")
        .select("*")
        .eq("client_id", user.id)
        .eq("logged_at", sourceDateStr)
        .order("created_at", { ascending: true });

      if (!sourceLogs || sourceLogs.length === 0) {
        toast({ title: "Nothing to copy", description: "No meals logged on this day.", variant: "destructive" });
        setCopying(false);
        return;
      }

      const microKeys = [
        "vitamin_a_mcg", "vitamin_c_mg", "vitamin_d_mcg", "vitamin_e_mg", "vitamin_k_mcg",
        "vitamin_b1_mg", "vitamin_b2_mg", "vitamin_b3_mg", "vitamin_b5_mg", "vitamin_b6_mg",
        "vitamin_b7_mcg", "vitamin_b9_mcg", "vitamin_b12_mcg",
        "calcium_mg", "iron_mg", "magnesium_mg", "phosphorus_mg", "potassium_mg",
        "zinc_mg", "copper_mg", "manganese_mg", "selenium_mcg", "chromium_mcg",
        "molybdenum_mcg", "iodine_mcg", "omega_3", "omega_6",
        "cholesterol", "saturated_fat", "trans_fat", "monounsaturated_fat", "polyunsaturated_fat",
        "added_sugars", "net_carbs",
      ];

      const targetDateStrs = selectedDates.map(d => format(d, "yyyy-MM-dd"));

      // Delete existing if replace mode
      if (mode === "replace") {
        for (const targetDate of targetDateStrs) {
          await supabase
            .from("nutrition_logs")
            .delete()
            .eq("client_id", user.id)
            .eq("logged_at", targetDate);
        }
      }

      // Create inserts for all target dates, including micro data
      const inserts = targetDateStrs.flatMap(targetDate =>
        sourceLogs.map(log => {
          const entry: Record<string, any> = {
            client_id: user.id,
            food_item_id: log.food_item_id,
            custom_name: log.custom_name,
            meal_type: log.meal_type,
            calories: log.calories,
            protein: log.protein,
            carbs: log.carbs,
            fat: log.fat,
            sugar: log.sugar || 0,
            sodium: log.sodium || 0,
            servings: log.servings,
            logged_at: targetDate,
            tz_corrected: true,
          };
          // Copy micro values from source log
          for (const key of microKeys) {
            if (log[key] != null && typeof log[key] === "number" && log[key] > 0) {
              entry[key] = log[key];
            }
          }
          return entry;
        })
      );

      const { error } = await supabase.from("nutrition_logs").insert(inserts as any);

      if (error) {
        toast({ title: "Error copying", description: error.message, variant: "destructive" });
      } else {
        const count = selectedDates.length;
        toast({ title: `Copied to ${count} day${count > 1 ? "s" : ""}` });
        onOpenChange(false);
        setSelectedDates([]);
        onCopied();
      }
    } finally {
      setCopying(false);
      setShowConflict(false);
    }
  };

  const handleCopy = async () => {
    if (!user || selectedDates.length === 0) return;

    // Check for conflicts
    const targetDateStrs = selectedDates.map(d => format(d, "yyyy-MM-dd"));
    const { data: existing } = await supabase
      .from("nutrition_logs")
      .select("logged_at")
      .eq("client_id", user.id)
      .in("logged_at", targetDateStrs)
      .limit(1);

    if (existing && existing.length > 0) {
      const dates = [...new Set(existing.map(e => e.logged_at))];
      setConflictDates(dates);
      setShowConflict(true);
    } else {
      executeCopy("append");
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Copy className="h-4 w-4 text-primary" />
              Copy Day — {format(sourceDate, "MMM d")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {/* Quick action */}
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2 text-sm"
              onClick={handleQuickTomorrow}
            >
              <CalendarPlus className="h-3.5 w-3.5" />
              Copy to Tomorrow ({format(tomorrow, "EEE, MMM d")})
            </Button>

            <div className="text-xs text-muted-foreground text-center">or select multiple dates</div>

            {/* Calendar for multi-select */}
            <div className="flex justify-center">
              <Calendar
                mode="multiple"
                selected={selectedDates}
                onSelect={(dates) => setSelectedDates(dates || [])}
                disabled={(date) => format(date, "yyyy-MM-dd") === sourceDateStr}
                className="rounded-md border"
              />
            </div>

            {selectedDates.length > 0 && (
              <div className="text-xs text-muted-foreground text-center">
                {selectedDates.length} date{selectedDates.length > 1 ? "s" : ""} selected
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              onClick={handleCopy}
              disabled={selectedDates.length === 0 || copying}
              className="w-full gap-2"
            >
              {copying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
              Copy to {selectedDates.length || 0} Date{selectedDates.length !== 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Conflict dialog */}
      <AlertDialog open={showConflict} onOpenChange={setShowConflict}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Meals already exist</AlertDialogTitle>
            <AlertDialogDescription>
              Some target dates already have logged meals. How would you like to proceed?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="outline" onClick={() => executeCopy("append")} disabled={copying}>
              Append
            </Button>
            <AlertDialogAction onClick={() => executeCopy("replace")} disabled={copying}>
              {copying ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Replace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default CopyDayDialog;
