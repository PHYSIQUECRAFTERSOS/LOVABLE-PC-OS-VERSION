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
import { withDisplayPositions } from "@/utils/displayPosition";
import { formatWorkoutDayLabel } from "@/utils/workoutLabel";

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

const normalizeWorkoutName = (name: string) =>
  name.replace(/^day\s*\d+\s*[:\-]\s*/i, "").trim();

const ScheduleEventForm = ({ open, onClose, onSave, selectedDate, isCoach }: ScheduleEventFormProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState<{ id: string; full_name: string }[]>([]);
  const [workouts, setWorkouts] = useState<{
    id: string;
    name: string;
    label: string;
    dayNumber?: number;
    excludeFromNumbering?: boolean;
    customTag?: string | null;
    sortOrder?: number | null;
  }[]>([]);

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

  // Load clients list
  useEffect(() => {
    if (!isCoach || !user) return;
    const loadClients = async () => {
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
    };
    loadClients();
  }, [isCoach, user]);

  // Load workouts scoped to selected client's assigned phase
  useEffect(() => {
    if (!isCoach || !user) return;

    const loadWorkouts = async () => {
      if (!targetClientId || targetClientId === "none") {
        setWorkouts([]);
        return;
      }

      const { data: assignment } = await supabase
        .from("client_program_assignments")
        .select("program_id, current_phase_id")
        .eq("client_id", targetClientId)
        .in("status", ["active", "subscribed"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!assignment?.program_id) {
        setWorkouts([]);
        return;
      }

      let phaseId = assignment.current_phase_id;
      if (!phaseId) {
        const { data: firstPhase } = await supabase
          .from("program_phases")
          .select("id")
          .eq("program_id", assignment.program_id)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        phaseId = firstPhase?.id ?? null;
      }

      if (!phaseId) {
        setWorkouts([]);
        return;
      }

      const { data: pwRows } = await supabase
        .from("program_workouts")
        .select("workout_id, sort_order, exclude_from_numbering, custom_tag, workouts(id, name)")
        .eq("phase_id", phaseId)
        .order("sort_order", { ascending: true });

      const normalized = (pwRows || []).map((pw: any) => ({
        id: pw.workout_id,
        name: (pw.workouts as any)?.name || "Workout",
        sort_order: pw.sort_order,
        exclude_from_numbering: pw.exclude_from_numbering || false,
        custom_tag: pw.custom_tag || null,
      }));

      const positioned = withDisplayPositions(normalized);

      // Root cause note:
      // `program_workouts.day_label` contained stale legacy values (e.g. Day 6/7) and was previously used for UI labels.
      // We now compute labels only from sorted position + workout name to eliminate phantom numbering.
      const mapped = positioned.map((w) => {
        const cleanName = normalizeWorkoutName(w.name);
        const label = w.exclude_from_numbering && w.custom_tag
          ? `${w.custom_tag}: ${cleanName}`
          : w.displayPosition != null
            ? formatWorkoutDayLabel(w.displayPosition, cleanName)
            : cleanName;

        return {
          id: w.id,
          name: cleanName,
          label,
          dayNumber: w.displayPosition ?? undefined,
          excludeFromNumbering: w.exclude_from_numbering,
          customTag: w.custom_tag,
          sortOrder: w.sort_order,
        };
      });

      mapped.sort((a, b) => {
        const aTagged = !!a.excludeFromNumbering;
        const bTagged = !!b.excludeFromNumbering;
        if (aTagged && !bTagged) return 1;
        if (!aTagged && bTagged) return -1;
        if (!aTagged && !bTagged) return (a.dayNumber ?? 999) - (b.dayNumber ?? 999);
        return (a.sortOrder ?? 999) - (b.sortOrder ?? 999);
      });

      setWorkouts(mapped);
    };

    loadWorkouts();
  }, [isCoach, user, targetClientId]);

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
      const assignedClientId = targetClientId && targetClientId !== "none" ? targetClientId : null;
      const eventData: any = {
        user_id: assignedClientId || user.id,
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
        target_client_id: assignedClientId,
        linked_workout_id: linkedWorkoutId || null,
        notes: notes.trim() || null,
      };

      const { error } = await supabase.from("calendar_events").insert(eventData);
      if (error) throw error;

      // If recurring, generate occurrences
      if (isRecurring && recurrencePattern) {
        const occurrences: any[] = [];
        const startDate = new Date(eventDate + "T12:00:00"); // noon to avoid TZ issues
        const totalWeeks = recurrenceEndDate
          ? Math.ceil((new Date(recurrenceEndDate).getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000))
          : 12;

        if (recurrencePattern === "daily") {
          const maxDays = recurrenceEndDate
            ? Math.ceil((new Date(recurrenceEndDate).getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000))
            : 84;
          for (let i = 1; i <= maxDays; i++) {
            occurrences.push({ ...eventData, event_date: format(addDays(startDate, i), "yyyy-MM-dd") });
          }
        } else if (recurrencePattern === "weekly" || recurrencePattern === "biweekly") {
          const step = recurrencePattern === "biweekly" ? 2 : 1;
          // Find Monday of base week
          const jsDay = startDate.getDay();
          const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay;
          const baseMonday = addDays(startDate, mondayOffset);

          // Default to same weekday if no specific days chosen
          const daysToRepeat = recurrenceDays.length > 0
            ? recurrenceDays
            : [jsDay === 0 ? 6 : jsDay - 1]; // Mon=0 system

          for (let week = 1; week <= totalWeeks; week++) {
            const weekMonday = addWeeks(baseMonday, week * step);
            for (const dayNum of daysToRepeat) {
              const d = addDays(weekMonday, dayNum);
              if (recurrenceEndDate && d > new Date(recurrenceEndDate + "T23:59:59")) continue;
              occurrences.push({ ...eventData, event_date: format(d, "yyyy-MM-dd") });
            }
          }
        } else if (recurrencePattern === "monthly") {
          for (let i = 1; i <= totalWeeks; i++) {
            const d = addMonths(startDate, i);
            if (recurrenceEndDate && d > new Date(recurrenceEndDate + "T23:59:59")) continue;
            occurrences.push({ ...eventData, event_date: format(d, "yyyy-MM-dd") });
          }
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

          {/* Client (coach only) — before title so workouts load for selected client */}
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

          {/* Title */}
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Event title" />
          </div>


          {/* Linked Workout */}
          {isCoach && eventType === "workout" && workouts.length > 0 && (
            <div className="space-y-1.5">
              <Label>Link Workout</Label>
              <Select value={linkedWorkoutId} onValueChange={(val) => {
                setLinkedWorkoutId(val);
                const w = workouts.find((wk) => wk.id === val);
                if (w) setTitle(w.label);
              }}>
                <SelectTrigger><SelectValue placeholder="Select workout" /></SelectTrigger>
                <SelectContent>
                  {workouts.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.label}
                    </SelectItem>
                  ))}
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
