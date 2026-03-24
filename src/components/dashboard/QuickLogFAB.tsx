import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Dumbbell, HeartPulse, Camera, Activity, CalendarIcon, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, isToday } from "date-fns";
import { invalidateCache } from "@/hooks/useDataFetch";
import { cn } from "@/lib/utils";
import { getLocalDateString } from "@/utils/localDate";

type ActionType = "workout" | "cardio" | "photos" | "bodystats" | null;

interface QuickLogFABProps {
  clientId?: string; // if provided, schedule for this client (coach view)
}

const CARDIO_TYPES = [
  "Running", "Walking", "Cycling", "Rowing", "Elliptical",
  "Stair Climbing", "Swimming", "HIIT", "Jump Rope", "Hiking",
];

const actions = [
  {
    key: "workout" as const,
    icon: Dumbbell,
    label: "Workout",
    color: "bg-blue-600",
    ring: "ring-blue-600/30",
  },
  {
    key: "cardio" as const,
    icon: HeartPulse,
    label: "Cardio",
    color: "bg-emerald-600",
    ring: "ring-emerald-600/30",
  },
  {
    key: "photos" as const,
    icon: Camera,
    label: "Photos",
    color: "bg-primary",
    ring: "ring-primary/30",
  },
  {
    key: "bodystats" as const,
    icon: Activity,
    label: "Body Stats",
    color: "bg-teal-600",
    ring: "ring-teal-600/30",
  },
];

const QuickLogFAB = ({ clientId }: QuickLogFABProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [activeAction, setActiveAction] = useState<ActionType>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [saving, setSaving] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Workout-specific
  const [workouts, setWorkouts] = useState<{ id: string; name: string }[]>([]);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState("");

  // Cardio-specific
  const [cardioType, setCardioType] = useState("");
  const [cardioNotes, setCardioNotes] = useState("");

  const targetUserId = clientId || user?.id;

  // Load assigned workouts when workout action opens
  useEffect(() => {
    if (activeAction !== "workout" || !targetUserId) return;
    const load = async () => {
      const { data: assignments } = await supabase
        .from("client_program_assignments")
        .select("program_id")
        .eq("client_id", targetUserId)
        .eq("status", "active");

      if (!assignments?.length) return;

      const programIds = assignments.map((a) => a.program_id);
      const { data: phases } = await supabase
        .from("program_phases")
        .select("id")
        .in("program_id", programIds);

      if (!phases?.length) return;

      const phaseIds = phases.map((p) => p.id);
      const { data: pw } = await supabase
        .from("program_workouts")
        .select("workout_id, sort_order")
        .in("phase_id", phaseIds)
        .order("sort_order", { ascending: true });

      if (!pw?.length) return;

      const workoutIds = [...new Set(pw.map((p) => p.workout_id))];
      const { data: wData } = await supabase
        .from("workouts")
        .select("id, name")
        .in("id", workoutIds);

      if (wData) {
        // Maintain program order
        const ordered = workoutIds
          .map((id) => wData.find((w) => w.id === id))
          .filter(Boolean) as { id: string; name: string }[];
        setWorkouts(ordered);
      }
    };
    load();
  }, [activeAction, targetUserId]);

  const resetDrawer = () => {
    setActiveAction(null);
    setSelectedDate(new Date());
    setSelectedWorkoutId("");
    setCardioType("");
    setCardioNotes("");
    setCalendarOpen(false);
  };

  const handleSchedule = async () => {
    if (!targetUserId || !user) return;
    setSaving(true);

    try {
      const dateStr = selectedDate.toLocaleDateString('en-CA');
      let title = "";
      let eventType = "custom";
      let linkedWorkoutId: string | null = null;

      switch (activeAction) {
        case "workout": {
          if (!selectedWorkoutId) {
            toast({ title: "Select a workout", variant: "destructive" });
            setSaving(false);
            return;
          }
          const w = workouts.find((w) => w.id === selectedWorkoutId);
          title = w?.name || "Workout";
          eventType = "workout";
          linkedWorkoutId = selectedWorkoutId;
          break;
        }
        case "cardio": {
          if (!cardioType) {
            toast({ title: "Select a cardio type", variant: "destructive" });
            setSaving(false);
            return;
          }
          title = cardioType;
          eventType = "cardio";
          break;
        }
        case "photos":
          title = "Take Progress Photos";
          eventType = "custom";
          break;
        case "bodystats":
          title = "Track Body Stats";
          eventType = "custom";
          break;
      }

      const insertData: any = {
        user_id: clientId ? user.id : targetUserId,
        event_date: dateStr,
        title,
        event_type: eventType,
        is_completed: false,
        ...(clientId && { target_client_id: clientId }),
        ...(linkedWorkoutId && { linked_workout_id: linkedWorkoutId }),
        ...(activeAction === "cardio" && cardioNotes && { notes: cardioNotes }),
      };

      const { error } = await supabase.from("calendar_events").insert(insertData);
      if (error) throw error;

      const dateLabel = isToday(selectedDate) ? "today" : format(selectedDate, "MMM d");
      toast({ title: `${title} scheduled for ${dateLabel}` });
      invalidateCache(`today-actions-${targetUserId}-${dateStr}`);
      window.dispatchEvent(new CustomEvent("calendar-event-added"));

      resetDrawer();
      setExpanded(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const dateLabel = isToday(selectedDate) ? "Today" : format(selectedDate, "MMM d, yyyy");

  return (
    <>
      {/* Backdrop */}
      {expanded && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm animate-fade-in"
          onClick={() => setExpanded(false)}
        />
      )}

      {/* FAB + Action Buttons */}
      <div className="fixed bottom-20 right-5 z-50 flex flex-col-reverse items-center gap-3 md:bottom-6 md:right-6">
        {expanded && (
          <div className="flex flex-col gap-2.5 animate-fade-in">
            {actions.map((action, i) => (
              <button
                key={action.key}
                className={cn(
                  "flex items-center gap-3 rounded-full px-4 py-2.5 shadow-lg transition-all",
                  "bg-card border border-border hover:border-primary/40",
                  "animate-fade-in"
                )}
                style={{ animationDelay: `${i * 50}ms` }}
                onClick={() => {
                  setActiveAction(action.key);
                  setExpanded(false);
                }}
              >
                <div className={cn("flex h-9 w-9 items-center justify-center rounded-full", action.color)}>
                  <action.icon className="h-4.5 w-4.5 text-white" />
                </div>
                <span className="text-sm font-medium text-foreground pr-1">{action.label}</span>
              </button>
            ))}
          </div>
        )}
        <Button
          size="icon"
          className={cn(
            "h-14 w-14 rounded-full shadow-xl transition-all duration-200",
            expanded ? "bg-muted rotate-45" : "bg-primary hover:bg-primary/90"
          )}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
        </Button>
      </div>

      {/* Scheduling Drawer */}
      <Drawer open={!!activeAction} onOpenChange={(open) => { if (!open) resetDrawer(); }}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader className="flex flex-row items-center justify-between pb-2">
            <DrawerTitle className="text-lg">
              Schedule {activeAction === "workout" ? "Workout" : activeAction === "cardio" ? "Cardio" : activeAction === "photos" ? "Photos" : "Body Stats"}
            </DrawerTitle>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <CalendarIcon className="h-4 w-4 text-primary" />
                  <span className="text-sm">{dateLabel}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 z-[60]" align="end">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(d) => { if (d) { setSelectedDate(d); setCalendarOpen(false); } }}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </DrawerHeader>

          <div className="px-4 pb-6 space-y-4">
            {/* Workout: select from assigned workouts */}
            {activeAction === "workout" && (
              <div>
                <Label className="text-sm text-muted-foreground">Select Workout</Label>
                <Select value={selectedWorkoutId} onValueChange={setSelectedWorkoutId}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder={workouts.length ? "Choose a workout..." : "No workouts assigned"} />
                  </SelectTrigger>
                  <SelectContent>
                    {workouts.map((w) => (
                      <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Cardio: type selector + optional notes */}
            {activeAction === "cardio" && (
              <>
                <div>
                  <Label className="text-sm text-muted-foreground">Cardio Type</Label>
                  <Select value={cardioType} onValueChange={setCardioType}>
                    <SelectTrigger className="mt-1.5">
                      <SelectValue placeholder="Choose cardio type..." />
                    </SelectTrigger>
                    <SelectContent>
                      {CARDIO_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground">Notes (optional)</Label>
                  <Input
                    placeholder="e.g. 30 min, 6.0 incline, 3.5 speed"
                    value={cardioNotes}
                    onChange={(e) => setCardioNotes(e.target.value)}
                    className="mt-1.5"
                  />
                </div>
              </>
            )}

            {/* Photos: simple confirmation */}
            {activeAction === "photos" && (
              <p className="text-sm text-muted-foreground">
                This will add a "Take Progress Photos" reminder to your calendar for {dateLabel.toLowerCase()}.
              </p>
            )}

            {/* Body Stats: simple confirmation */}
            {activeAction === "bodystats" && (
              <p className="text-sm text-muted-foreground">
                This will add a "Track Body Stats" reminder to your calendar for {dateLabel.toLowerCase()}.
              </p>
            )}

            {/* Action buttons */}
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={resetDrawer}>
                Cancel
              </Button>
              <Button
                className="flex-1 bg-primary hover:bg-primary/90"
                onClick={handleSchedule}
                disabled={saving}
              >
                {saving ? "Scheduling..." : "Schedule"}
              </Button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
};

export default QuickLogFAB;
