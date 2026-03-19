import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import UserAvatar from "@/components/profile/UserAvatar";
import { Plus, Trash2, Palette, CalendarDays } from "lucide-react";

const PRESET_COLORS = [
  "#FBBF24", "#06B6D4", "#10B981", "#F97316",
  "#8B5CF6", "#EF4444", "#EC4899", "#D4A017",
];

const DAY_NAMES = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
];

interface Reviewer {
  id: string;
  name: string;
  color: string;
  sort_order: number;
}

interface ClientAssignment {
  client_id: string;
  full_name: string;
  avatar_url: string | null;
  reviewer_id: string | null;
}

interface DayConfig {
  id: string;
  label: string;
  day_of_week: number;
  sort_order: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ReviewerSettingsDialog({ open, onOpenChange }: Props) {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [newDayLabel, setNewDayLabel] = useState("");
  const [newDayOfWeek, setNewDayOfWeek] = useState("3");
  const [coachFilter, setCoachFilter] = useState<string>("all");

  // Fetch reviewers
  const { data: reviewers = [] } = useQuery({
    queryKey: ["checkin-reviewers", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checkin_reviewers")
        .select("*")
        .eq("coach_id", user!.id)
        .order("sort_order");
      if (error) throw error;
      return data as Reviewer[];
    },
    enabled: !!user && open,
  });

  // Fetch day configs
  const { data: dayConfigs = [] } = useQuery({
    queryKey: ["checkin-day-config", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coach_checkin_day_config")
        .select("*")
        .eq("coach_id", user!.id)
        .order("sort_order");
      if (error) throw error;
      return data as DayConfig[];
    },
    enabled: !!user && open,
  });

  // Fetch all coaches (for admin filter)
  const { data: coaches = [] } = useQuery({
    queryKey: ["all-coaches-for-filter", user?.id],
    queryFn: async () => {
      // Get all coach_clients grouped by coach, then fetch coach profiles
      const { data: coachClientRows } = await supabase
        .from("coach_clients")
        .select("coach_id")
        .eq("status", "active");
      const uniqueCoachIds = [...new Set((coachClientRows || []).map(r => r.coach_id))];
      if (uniqueCoachIds.length === 0) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", uniqueCoachIds);
      return (profiles || []).map(p => ({ id: p.user_id, name: p.full_name || "Coach" }));
    },
    enabled: !!user && open && role === "admin",
  });

  // Fetch clients + their assignments (admin sees all, coach sees own)
  const { data: clientAssignments = [] } = useQuery({
    queryKey: ["client-reviewer-assignments", user?.id, role],
    queryFn: async () => {
      let clientRows: { client_id: string; coach_id: string }[] = [];

      if (role === "admin") {
        // Admin: fetch ALL active clients across all coaches
        const { data } = await supabase
          .from("coach_clients")
          .select("client_id, coach_id")
          .eq("status", "active");
        clientRows = data || [];
      } else {
        // Coach: fetch only own clients
        const { data } = await supabase
          .from("coach_clients")
          .select("client_id, coach_id")
          .eq("coach_id", user!.id)
          .eq("status", "active");
        clientRows = data || [];
      }

      if (!clientRows.length) return [];

      const clientIds = clientRows.map((c) => c.client_id);
      const clientCoachMap = new Map(clientRows.map(c => [c.client_id, c.coach_id]));

      const [profilesRes, assignmentsRes] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name, avatar_url").in("user_id", clientIds),
        supabase.from("client_reviewer_assignments").select("client_id, reviewer_id").eq("coach_id", user!.id),
      ]);

      const assignMap = new Map(
        (assignmentsRes.data || []).map((a) => [a.client_id, a.reviewer_id])
      );

      return (profilesRes.data || [])
        .map((p) => ({
          client_id: p.user_id,
          full_name: p.full_name || "Client",
          avatar_url: p.avatar_url,
          reviewer_id: assignMap.get(p.user_id) || null,
          coach_id: clientCoachMap.get(p.user_id) || null,
        }))
        .sort((a, b) => a.full_name.localeCompare(b.full_name)) as (ClientAssignment & { coach_id: string | null })[];
    },
    enabled: !!user && open,
  });

  // Add reviewer
  const addReviewer = useMutation({
    mutationFn: async () => {
      if (!newName.trim()) throw new Error("Name required");
      const { error } = await supabase.from("checkin_reviewers").insert({
        coach_id: user!.id,
        name: newName.trim(),
        color: newColor,
        sort_order: reviewers.length,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checkin-reviewers"] });
      setNewName("");
      toast({ title: "Reviewer added ✅" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Delete reviewer
  const deleteReviewer = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("checkin_reviewers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checkin-reviewers"] });
      queryClient.invalidateQueries({ queryKey: ["client-reviewer-assignments"] });
      toast({ title: "Reviewer removed" });
    },
  });

  // Assign client to reviewer
  const assignClient = useMutation({
    mutationFn: async ({ clientId, reviewerId }: { clientId: string; reviewerId: string | null }) => {
      if (!reviewerId || reviewerId === "none") {
        const { error } = await supabase
          .from("client_reviewer_assignments")
          .delete()
          .eq("client_id", clientId)
          .eq("coach_id", user!.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("client_reviewer_assignments")
          .upsert(
            { client_id: clientId, reviewer_id: reviewerId, coach_id: user!.id },
            { onConflict: "client_id" }
          );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-reviewer-assignments"] });
      queryClient.invalidateQueries({ queryKey: ["checkin-dashboard"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Add day config
  const addDayConfig = useMutation({
    mutationFn: async () => {
      const label = newDayLabel.trim() || DAY_NAMES.find(d => d.value === newDayOfWeek)?.label || "Day";
      if (dayConfigs.length >= 4) throw new Error("Maximum 4 submission day columns");
      const { error } = await supabase.from("coach_checkin_day_config").insert({
        coach_id: user!.id,
        label,
        day_of_week: parseInt(newDayOfWeek),
        sort_order: dayConfigs.length,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checkin-day-config"] });
      queryClient.invalidateQueries({ queryKey: ["checkin-dashboard"] });
      setNewDayLabel("");
      toast({ title: "Submission day added ✅" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Delete day config
  const deleteDayConfig = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("coach_checkin_day_config").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checkin-day-config"] });
      queryClient.invalidateQueries({ queryKey: ["checkin-dashboard"] });
      toast({ title: "Submission day removed" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" />
            Dashboard Settings
          </DialogTitle>
          <DialogDescription>
            Configure submission day columns, reviewers, and client assignments.
          </DialogDescription>
        </DialogHeader>

        {/* ── Submission Days ── */}
        <div className="space-y-3">
          <Label className="text-sm font-medium flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" />
            Submission Day Columns
          </Label>
          <p className="text-xs text-muted-foreground">
            Define which days appear as columns on your check-in dashboard (max 4). If none are set, defaults to Wednesday & Thursday.
          </p>

          {/* Existing day configs */}
          {dayConfigs.map((dc) => (
            <div key={dc.id} className="flex items-center gap-3 py-2 px-3 rounded-lg bg-secondary/30">
              <CalendarDays className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm flex-1">{dc.label}</span>
              <span className="text-xs text-muted-foreground">
                {DAY_NAMES.find(d => d.value === String(dc.day_of_week))?.label}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => deleteDayConfig.mutate(dc.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}

          {/* Add new day */}
          {dayConfigs.length < 4 && (
            <div className="flex gap-2">
              <Input
                placeholder="Label (e.g. Friday)"
                value={newDayLabel}
                onChange={(e) => setNewDayLabel(e.target.value)}
                className="flex-1"
              />
              <Select value={newDayOfWeek} onValueChange={setNewDayOfWeek}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAY_NAMES.map((d) => (
                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={() => addDayConfig.mutate()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        <Separator />

        {/* ── Add Reviewer ── */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Add Reviewer</Label>
          <div className="flex gap-2">
            <Input
              placeholder="Name (e.g. Nicko)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1"
              onKeyDown={(e) => e.key === "Enter" && addReviewer.mutate()}
            />
            <div className="flex gap-1">
              {PRESET_COLORS.slice(0, 4).map((c) => (
                <button
                  key={c}
                  onClick={() => setNewColor(c)}
                  className="w-7 h-7 rounded-full border-2 transition-all shrink-0"
                  style={{
                    backgroundColor: c,
                    borderColor: newColor === c ? "white" : "transparent",
                    transform: newColor === c ? "scale(1.15)" : "scale(1)",
                  }}
                />
              ))}
            </div>
            <Button size="sm" onClick={() => addReviewer.mutate()} disabled={!newName.trim()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex gap-1">
            {PRESET_COLORS.slice(4).map((c) => (
              <button
                key={c}
                onClick={() => setNewColor(c)}
                className="w-6 h-6 rounded-full border-2 transition-all"
                style={{
                  backgroundColor: c,
                  borderColor: newColor === c ? "white" : "transparent",
                  transform: newColor === c ? "scale(1.15)" : "scale(1)",
                }}
              />
            ))}
          </div>
        </div>

        {/* ── Existing Reviewers ── */}
        {reviewers.length > 0 && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">Current Reviewers</Label>
            {reviewers.map((r) => (
              <div key={r.id} className="flex items-center gap-3 py-2 px-3 rounded-lg bg-secondary/30">
                <div
                  className="w-4 h-4 rounded-full shrink-0"
                  style={{ backgroundColor: r.color }}
                />
                <span className="text-sm flex-1">{r.name}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => deleteReviewer.mutate(r.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <Separator />

        {/* ── Client Assignments ── */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Client Assignments</Label>
          <p className="text-xs text-muted-foreground">Assign each client to a reviewer for color coding.</p>

          {/* Coach filter for admins */}
          {role === "admin" && coaches.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              <button
                onClick={() => setCoachFilter("all")}
                className={`px-2.5 py-1 text-xs rounded-full font-medium transition-colors ${
                  coachFilter === "all"
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                }`}
              >
                All
              </button>
              {coaches.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCoachFilter(c.id)}
                  className={`px-2.5 py-1 text-xs rounded-full font-medium transition-colors ${
                    coachFilter === c.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                  }`}
                >
                  {c.name?.split(" ")[0] || "Coach"}
                </button>
              ))}
            </div>
          )}

          <div className="space-y-1.5 max-h-60 overflow-y-auto">
            {filteredAssignments.map((ca) => (
              <div key={ca.client_id} className="flex items-center gap-2 py-1.5">
                <UserAvatar src={ca.avatar_url} name={ca.full_name} className="h-6 w-6" />
                <span className="text-sm flex-1 truncate">{ca.full_name}</span>
                <Select
                  value={ca.reviewer_id || "none"}
                  onValueChange={(v) =>
                    assignClient.mutate({ clientId: ca.client_id, reviewerId: v === "none" ? null : v })
                  }
                >
                  <SelectTrigger className="w-28 h-8 text-xs">
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {reviewers.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: r.color }}
                          />
                          {r.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
            {filteredAssignments.length === 0 && (
              <p className="text-xs text-muted-foreground py-3 text-center">No clients found.</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
