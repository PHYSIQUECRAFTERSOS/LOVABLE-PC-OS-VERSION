import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useXPAward } from "@/hooks/useXPAward";
import { XP_VALUES } from "@/utils/rankedXP";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, HeartPulse, Timer, Footprints, Flame, Activity, Clock } from "lucide-react";
import { format } from "date-fns";

const CARDIO_TYPES = [
  { value: "steady_state", label: "Steady State", icon: Timer },
  { value: "distance", label: "Distance Based", icon: Footprints },
  { value: "interval", label: "Interval", icon: Activity },
  { value: "hr_zone", label: "Heart Rate Zone", icon: HeartPulse },
  { value: "step_goal", label: "Step Goal", icon: Footprints },
  { value: "calorie_goal", label: "Calorie Goal", icon: Flame },
  { value: "custom", label: "Custom", icon: Clock },
];

const CardioManager = () => {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isCoach = role === "coach" || role === "admin";

  // Coach: assignment form state
  const [showForm, setShowForm] = useState(false);
  const [selectedClient, setSelectedClient] = useState("");
  const [cardioType, setCardioType] = useState("steady_state");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetDuration, setTargetDuration] = useState("");
  const [targetDistance, setTargetDistance] = useState("");
  const [targetSteps, setTargetSteps] = useState("");
  const [targetCalories, setTargetCalories] = useState("");
  const [targetHrZone, setTargetHrZone] = useState("");
  const [notes, setNotes] = useState("");
  const [assignedDate, setAssignedDate] = useState(format(new Date(), "yyyy-MM-dd"));

  // Client: log form state
  const [showLogForm, setShowLogForm] = useState(false);
  const [logAssignment, setLogAssignment] = useState<any>(null);
  const [logDuration, setLogDuration] = useState("");
  const [logDistance, setLogDistance] = useState("");
  const [logSteps, setLogSteps] = useState("");
  const [logCalories, setLogCalories] = useState("");
  const [logAvgHr, setLogAvgHr] = useState("");
  const [logMaxHr, setLogMaxHr] = useState("");
  const [logDifficulty, setLogDifficulty] = useState([5]);
  const [logNotes, setLogNotes] = useState("");

  const { data: clients } = useQuery({
    queryKey: ["coach-clients-cardio", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("coach_clients")
        .select("client_id")
        .eq("coach_id", user!.id)
        .eq("status", "active");
      if (!data) return [];
      const ids = data.map((c) => c.client_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", ids);
      return ids.map((id) => ({
        client_id: id,
        full_name: profiles?.find((p) => p.user_id === id)?.full_name || "Client",
      }));
    },
    enabled: !!user && isCoach,
  });

  const { data: assignments } = useQuery({
    queryKey: ["cardio-assignments", user?.id, role],
    queryFn: async () => {
      const query = supabase
        .from("cardio_assignments")
        .select("*")
        .eq("is_active", true)
        .order("assigned_date", { ascending: false });

      if (isCoach) {
        query.eq("coach_id", user!.id);
      } else {
        query.eq("client_id", user!.id);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: cardioLogs } = useQuery({
    queryKey: ["cardio-logs", user?.id],
    queryFn: async () => {
      const query = supabase
        .from("cardio_logs")
        .select("*")
        .order("logged_at", { ascending: false })
        .limit(20);

      if (!isCoach) query.eq("client_id", user!.id);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const assignMutation = useMutation({
    mutationFn: async () => {
      if (!user || !selectedClient || !title) throw new Error("Missing required fields");
      const { error } = await supabase.from("cardio_assignments").insert({
        coach_id: user.id,
        client_id: selectedClient,
        cardio_type: cardioType,
        title,
        description: description || null,
        target_duration_min: targetDuration ? parseInt(targetDuration) : null,
        target_distance_km: targetDistance ? parseFloat(targetDistance) : null,
        target_steps: targetSteps ? parseInt(targetSteps) : null,
        target_calories: targetCalories ? parseInt(targetCalories) : null,
        target_hr_zone: targetHrZone || null,
        notes: notes || null,
        assigned_date: assignedDate,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cardio-assignments"] });
      toast({ title: "Cardio assigned" });
      setShowForm(false);
      resetForm();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const logMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("cardio_logs").insert({
        client_id: user.id,
        assignment_id: logAssignment?.id || null,
        cardio_type: logAssignment?.cardio_type || "custom",
        title: logAssignment?.title || "Cardio Session",
        duration_min: logDuration ? parseFloat(logDuration) : null,
        distance_km: logDistance ? parseFloat(logDistance) : null,
        steps: logSteps ? parseInt(logSteps) : null,
        calories_burned: logCalories ? parseInt(logCalories) : null,
        avg_hr: logAvgHr ? parseInt(logAvgHr) : null,
        max_hr: logMaxHr ? parseInt(logMaxHr) : null,
        difficulty_rating: logDifficulty[0],
        notes: logNotes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cardio-logs"] });
      toast({ title: "Cardio logged 💪" });
      setShowLogForm(false);
      resetLogForm();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setSelectedClient("");
    setCardioType("steady_state");
    setTitle("");
    setDescription("");
    setTargetDuration("");
    setTargetDistance("");
    setTargetSteps("");
    setTargetCalories("");
    setTargetHrZone("");
    setNotes("");
  };

  const resetLogForm = () => {
    setLogAssignment(null);
    setLogDuration("");
    setLogDistance("");
    setLogSteps("");
    setLogCalories("");
    setLogAvgHr("");
    setLogMaxHr("");
    setLogDifficulty([5]);
    setLogNotes("");
  };

  const getTypeIcon = (type: string) => {
    const found = CARDIO_TYPES.find((t) => t.value === type);
    return found ? found.icon : Activity;
  };

  const getTypeLabel = (type: string) => {
    return CARDIO_TYPES.find((t) => t.value === type)?.label || type;
  };

  return (
    <div className="space-y-4">
      {/* Coach: Assign Cardio */}
      {isCoach && (
        <>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Cardio Assignments</h3>
            <Button size="sm" onClick={() => setShowForm(!showForm)}>
              <Plus className="h-4 w-4 mr-1" /> Assign Cardio
            </Button>
          </div>

          {showForm && (
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Client</Label>
                    <Select value={selectedClient} onValueChange={setSelectedClient}>
                      <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                      <SelectContent>
                        {clients?.map((c) => (
                          <SelectItem key={c.client_id} value={c.client_id}>{c.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Cardio Type</Label>
                    <Select value={cardioType} onValueChange={setCardioType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CARDIO_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Title</Label>
                    <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Morning LISS Walk" />
                  </div>
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input type="date" value={assignedDate} onChange={(e) => setAssignedDate(e.target.value)} />
                  </div>
                </div>

                {/* Conditional target fields */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {(cardioType === "steady_state" || cardioType === "interval" || cardioType === "custom") && (
                    <div className="space-y-2">
                      <Label className="text-xs">Duration (min)</Label>
                      <Input type="number" value={targetDuration} onChange={(e) => setTargetDuration(e.target.value)} />
                    </div>
                  )}
                  {(cardioType === "distance") && (
                    <div className="space-y-2">
                      <Label className="text-xs">Distance (km)</Label>
                      <Input type="number" step="0.1" value={targetDistance} onChange={(e) => setTargetDistance(e.target.value)} />
                    </div>
                  )}
                  {(cardioType === "step_goal") && (
                    <div className="space-y-2">
                      <Label className="text-xs">Target Steps</Label>
                      <Input type="number" value={targetSteps} onChange={(e) => setTargetSteps(e.target.value)} />
                    </div>
                  )}
                  {(cardioType === "calorie_goal") && (
                    <div className="space-y-2">
                      <Label className="text-xs">Target Calories</Label>
                      <Input type="number" value={targetCalories} onChange={(e) => setTargetCalories(e.target.value)} />
                    </div>
                  )}
                  {(cardioType === "hr_zone") && (
                    <div className="space-y-2">
                      <Label className="text-xs">HR Zone</Label>
                      <Select value={targetHrZone} onValueChange={setTargetHrZone}>
                        <SelectTrigger><SelectValue placeholder="Zone" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="zone1">Zone 1 (50-60%)</SelectItem>
                          <SelectItem value="zone2">Zone 2 (60-70%)</SelectItem>
                          <SelectItem value="zone3">Zone 3 (70-80%)</SelectItem>
                          <SelectItem value="zone4">Zone 4 (80-90%)</SelectItem>
                          <SelectItem value="zone5">Zone 5 (90-100%)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Instructions..." rows={2} />
                </div>

                <Button onClick={() => assignMutation.mutate()} disabled={!selectedClient || !title}>
                  Assign Cardio
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Client: Log Cardio */}
      {!isCoach && (
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">My Cardio</h3>
          <Button size="sm" onClick={() => { setLogAssignment(null); setShowLogForm(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Log Cardio
          </Button>
        </div>
      )}

      {/* Assigned Cardio Cards */}
      {assignments && assignments.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {assignments.map((a: any) => {
            const Icon = getTypeIcon(a.cardio_type);
            return (
              <Card key={a.id}>
                <CardContent className="pt-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-primary" />
                      <span className="font-medium text-sm">{a.title}</span>
                    </div>
                    <Badge variant="outline" className="text-xs">{getTypeLabel(a.cardio_type)}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {a.target_duration_min && <span>{a.target_duration_min} min</span>}
                    {a.target_distance_km && <span>{a.target_distance_km} km</span>}
                    {a.target_steps && <span>{a.target_steps.toLocaleString()} steps</span>}
                    {a.target_calories && <span>{a.target_calories} kcal</span>}
                    {a.target_hr_zone && <span>{a.target_hr_zone.replace("zone", "Zone ")}</span>}
                  </div>
                  {a.notes && <p className="text-xs text-muted-foreground">{a.notes}</p>}
                  {!isCoach && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full mt-2"
                      onClick={() => {
                        setLogAssignment(a);
                        setShowLogForm(true);
                      }}
                    >
                      Log Completion
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Log Form Modal */}
      {showLogForm && !isCoach && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Log Cardio Session</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {logAssignment && (
              <p className="text-sm text-muted-foreground">Logging: {logAssignment.title}</p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">Duration (min)</Label>
                <Input type="number" value={logDuration} onChange={(e) => setLogDuration(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Distance (km)</Label>
                <Input type="number" step="0.1" value={logDistance} onChange={(e) => setLogDistance(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Steps</Label>
                <Input type="number" value={logSteps} onChange={(e) => setLogSteps(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Calories Burned</Label>
                <Input type="number" value={logCalories} onChange={(e) => setLogCalories(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Avg HR</Label>
                <Input type="number" value={logAvgHr} onChange={(e) => setLogAvgHr(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Max HR</Label>
                <Input type="number" value={logMaxHr} onChange={(e) => setLogMaxHr(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Difficulty Rating: {logDifficulty[0]}/10</Label>
              <Slider value={logDifficulty} onValueChange={setLogDifficulty} min={1} max={10} step={1} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Notes</Label>
              <Textarea value={logNotes} onChange={(e) => setLogNotes(e.target.value)} rows={2} />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => logMutation.mutate()} className="flex-1">Save Log</Button>
              <Button variant="outline" onClick={() => setShowLogForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Cardio Logs */}
      {cardioLogs && cardioLogs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Recent Cardio</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {cardioLogs.map((log: any) => (
                <div key={log.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                  <div>
                    <p className="text-sm font-medium">{log.title}</p>
                    <div className="flex gap-2 text-xs text-muted-foreground">
                      {log.duration_min && <span>{log.duration_min} min</span>}
                      {log.distance_km && <span>{log.distance_km} km</span>}
                      {log.calories_burned && <span>{log.calories_burned} kcal</span>}
                      {log.difficulty_rating && <span>RPE {log.difficulty_rating}/10</span>}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(log.logged_at), "MMM d")}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default CardioManager;
