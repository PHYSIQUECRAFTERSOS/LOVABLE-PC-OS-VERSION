import { useState, useEffect } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

const EVENT_TYPES = [
  { value: "workout", label: "Workout" },
  { value: "cardio", label: "Cardio Session" },
  { value: "checkin", label: "Check-in Deadline" },
  { value: "rest", label: "Rest Day" },
  { value: "reminder", label: "Reminder" },
  { value: "auto_message", label: "Auto Message" },
  { value: "custom", label: "Custom Event" },
];

const RECURRENCE_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 Weeks" },
  { value: "monthly", label: "Monthly" },
];

interface ScheduleEventFormProps {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  selectedDate: Date | null;
  isCoach: boolean;
}

const ScheduleEventForm = ({ open, onClose, onSave, selectedDate, isCoach }: ScheduleEventFormProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState<{ id: string; full_name: string }[]>([]);
  const [workouts, setWorkouts] = useState<{ id: string; name: string; dayNumber?: number }[]>([]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [eventType, setEventType] = useState("custom");
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrencePattern, setRecurrencePattern] = useState("weekly");
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>([]);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState("");
  const [targetClientId, setTargetClientId] = useState("");
  const [linkedWorkoutId, setLinkedWorkoutId] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (selectedDate) {
      setEventDate(format(selectedDate, "yyyy-MM-dd"));
    }
  }, [selectedDate]);

  useEffect(() => {
    if (!isCoach || !user) return;
    const loadCoachData = async () => {
      const { data: cc } = await supabase
        .from("coach_clients")
        .select("client_id")
        .eq("coach_id", user.id)
        .eq("status", "active");

      if (cc && cc.length > 0) {
        const clientIds = cc.map((c) => c.client_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", clientIds);
        setClients(profiles?.map((p) => ({ id: p.user_id, full_name: p.full_name || "Unnamed" })) || []);
      }

      // Load workouts with sort_order-based day numbering
      const { data: wk } = await supabase
        .from("workouts")
        .select("id, name")
        .eq("coach_id", user.id);

      // Load program_workouts to get sort_order for day numbering
      const workoutIds = (wk || []).map(w => w.id);
      let dayNumberMap: Record<string, number> = {};
      if (workoutIds.length > 0) {
        const { data: pwRows } = await supabase
          .from("program_workouts")
          .select("workout_id, phase_id, sort_order")
          .in("workout_id", workoutIds)
          .order("sort_order");
        
        // Group by phase_id, sort by sort_order, assign sequential day numbers
        const phaseGroups: Record<string, { workout_id: string; sort_order: number }[]> = {};
        (pwRows || []).forEach(pw => {
          const key = pw.phase_id || "none";
          if (!phaseGroups[key]) phaseGroups[key] = [];
          phaseGroups[key].push({ workout_id: pw.workout_id, sort_order: pw.sort_order ?? 999 });
        });
        Object.values(phaseGroups).forEach(group => {
          group.sort((a, b) => a.sort_order - b.sort_order);
          group.forEach((item, idx) => {
            dayNumberMap[item.workout_id] = idx + 1;
          });
        });
      }

      setWorkouts((wk || []).map(w => ({
        ...w,
        dayNumber: dayNumberMap[w.id],
      })));
    };
    loadCoachData();
  }, [isCoach, user]);

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setEventType("custom");
    setEventTime("");
    setEndTime("");
    setIsRecurring(false);
    setRecurrencePattern("weekly");
    setRecurrenceDays([]);
    setRecurrenceEndDate("");
    setTargetClientId("");
    setLinkedWorkoutId("");
    setNotes("");
  };

  const handleSave = async () => {
    if (!user || !title.trim() || !eventDate) return;
    setSaving(true);

    try {
      const eventData: any = {
        user_id: user.id,
        title: title.trim(),
        description: description.trim() || null,
        event_type: eventType,
        event_date: eventDate,
        event_time: eventTime || null,
        end_time: endTime || null,
        is_recurring: isRecurring,
        recurrence_pattern: isRecurring ? recurrencePattern : null,
        recurrence_days: isRecurring && recurrenceDays.length > 0 ? recurrenceDays : null,
        recurrence_end_date: isRecurring && recurrenceEndDate ? recurrenceEndDate : null,
        target_client_id: targetClientId || null,
        linked_workout_id: linkedWorkoutId || null,
        notes: notes.trim() || null,
      };

      const { error } = await supabase.from("calendar_events").insert(eventData);
      if (error) throw error;

      // If recurring, generate occurrences for the next 12 weeks
      if (isRecurring && recurrencePattern) {
        const occurrences: any[] = [];
        const startDate = new Date(eventDate);
        const endDate = recurrenceEndDate ? new Date(recurrenceEndDate) : new Date(startDate);
        if (!recurrenceEndDate) endDate.setDate(endDate.getDate() + 84); // 12 weeks

        let current = new Date(startDate);
        const increment = recurrencePattern === "daily" ? 1 : recurrencePattern === "weekly" ? 7 : recurrencePattern === "biweekly" ? 14 : 30;
        current.setDate(current.getDate() + increment);

        while (current <= endDate) {
          if (recurrencePattern === "weekly" && recurrenceDays.length > 0) {
            // For weekly with specific days
            const dayOfWeek = current.getDay();
            const adjustedDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Convert to Mon=0
            if (!recurrenceDays.includes(adjustedDay)) {
              current.setDate(current.getDate() + 1);
              continue;
            }
          }

          occurrences.push({
            ...eventData,
            event_date: format(current, "yyyy-MM-dd"),
          });
          current.setDate(current.getDate() + (recurrencePattern === "weekly" && recurrenceDays.length > 0 ? 1 : increment));
        }

        if (occurrences.length > 0) {
          await supabase.from("calendar_events").insert(occurrences);
        }
      }

      toast({ title: "Event scheduled" });
      resetForm();
      onSave();
      onClose();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const toggleDay = (day: number) => {
    setRecurrenceDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]);
  };

  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Schedule Event</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Event Type */}
          <div className="space-y-1.5">
            <Label>Event Type</Label>
            <Select value={eventType} onValueChange={setEventType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EVENT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Event title" />
          </div>

          {/* Client (coach only) */}
          {isCoach && clients.length > 0 && (
            <div className="space-y-1.5">
              <Label>Assign to Client</Label>
              <Select value={targetClientId} onValueChange={setTargetClientId}>
                <SelectTrigger><SelectValue placeholder="Optional — select client" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (Personal)</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Linked Workout */}
          {isCoach && eventType === "workout" && workouts.length > 0 && (
            <div className="space-y-1.5">
              <Label>Link Workout</Label>
              <Select value={linkedWorkoutId} onValueChange={setLinkedWorkoutId}>
                <SelectTrigger><SelectValue placeholder="Select workout" /></SelectTrigger>
                <SelectContent>
                  {workouts.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.dayNumber ? `Day ${w.dayNumber} – ` : ""}{w.name}
                    </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Date & Time */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Start Time</Label>
              <Input type="time" value={eventTime} onChange={(e) => setEventTime(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>End Time</Label>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" rows={2} />
          </div>

          {/* Recurring */}
          <div className="flex items-center gap-3 pt-1">
            <Switch checked={isRecurring} onCheckedChange={setIsRecurring} id="recurring" />
            <Label htmlFor="recurring">Recurring Event</Label>
          </div>

          {isRecurring && (
            <div className="space-y-3 pl-4 border-l-2 border-primary/20">
              <div className="space-y-1.5">
                <Label>Pattern</Label>
                <Select value={recurrencePattern} onValueChange={setRecurrencePattern}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RECURRENCE_OPTIONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {recurrencePattern === "weekly" && (
                <div className="space-y-1.5">
                  <Label>Repeat on days</Label>
                  <div className="flex gap-1">
                    {dayLabels.map((d, i) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggleDay(i)}
                        className={`h-8 w-8 rounded text-xs font-medium transition-colors ${
                          recurrenceDays.includes(i)
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {d[0]}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label>End Date (optional)</Label>
                <Input type="date" value={recurrenceEndDate} onChange={(e) => setRecurrenceEndDate(e.target.value)} />
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Additional notes" rows={2} />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !title.trim() || !eventDate} className="flex-1">
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Schedule
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ScheduleEventForm;
