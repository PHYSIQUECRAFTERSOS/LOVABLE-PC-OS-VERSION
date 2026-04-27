import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Users, Search, CheckSquare, Square, MessageSquare, Zap, Loader2, ClipboardList } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { subDays, format, addDays, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import ClientPreviewDialog from "./ClientPreviewDialog";
import { toast } from "sonner";

export interface SelectableClient {
  id: string;
  name: string;
  avatar_url?: string;
  compliance: number;
  streak: number;
  tags: string[];
  isPending?: boolean;
}

interface NutritionCompliance {
  pct: number | null;
  status: "on_target" | "close" | "missed" | "no_data";
}

interface PhaseInfo {
  phaseName: string;
  endDate: string;
  daysLeft: number;
  totalDays: number;
}

interface SelectableClientCardsProps {
  onSelectionChange: (selected: SelectableClient[]) => void;
  onSendMessage: () => void;
  onClientStatusChanged?: () => void;
}

const PROGRAM_TYPES = [
  "Weekly Progress Updates",
  "Bi-Weekly Progress Updates",
  "6 Week Program",
  "Training Only Program",
  "Training Only With Weekly Progress Updates",
  "Nutrition Only With Weekly Progress Updates",
  "Other",
];

/* ─── Compliance Badge ─── */
const ComplianceBadge = ({ status, pct }: NutritionCompliance) => {
  const config = {
    on_target: { cls: "bg-green-500/15 text-green-400", text: `✓ ${pct}%` },
    close:     { cls: "bg-primary/15 text-primary", text: `${pct}%` },
    missed:    { cls: "bg-destructive/15 text-destructive", text: `${pct}%` },
    no_data:   { cls: "bg-muted text-muted-foreground", text: "—" },
  };
  const { cls, text } = config[status];
  return (
    <span className={cn("text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap", cls)}>
      {text}
    </span>
  );
};

const SelectableClientCards = ({ onSelectionChange, onSendMessage, onClientStatusChanged }: SelectableClientCardsProps) => {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const [previewClient, setPreviewClient] = useState<SelectableClient | null>(null);
  const [clients, setClients] = useState<SelectableClient[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [programTypeFilter, setProgramTypeFilter] = useState<string>("all");
  const [coachFilter, setCoachFilter] = useState<string>("mine");
  const [loading, setLoading] = useState(true);
  const [complianceMap, setComplianceMap] = useState<Record<string, NutritionCompliance>>({});
  const [phaseMap, setPhaseMap] = useState<Record<string, PhaseInfo>>({});
  const [programTypeMap, setProgramTypeMap] = useState<Record<string, string>>({});
  const [coaches, setCoaches] = useState<{ id: string; name: string }[]>([]);
  const [bulkProgramOpen, setBulkProgramOpen] = useState(false);

  const isAdmin = role === "admin";

  // Fetch coaches list for admin dropdown
  useEffect(() => {
    if (!isAdmin) return;
    const fetchCoaches = async () => {
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["admin", "coach"] as any);
      if (!roleRows?.length) return;
      const ids = [...new Set(roleRows.map((r) => r.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", ids);
      setCoaches(
        (profiles || []).map((p) => ({ id: p.user_id, name: p.full_name || "Unknown" }))
      );
    };
    fetchCoaches();
  }, [isAdmin]);

  useEffect(() => {
    if (!user) return;
    const fetchClients = async () => {
      setLoading(true);

      let coachId: string | null = null;
      if (coachFilter === "mine") coachId = user.id;
      else if (coachFilter !== "all_coaches") coachId = coachFilter;

      let query = supabase
        .from("coach_clients")
        .select("client_id, program_type, status")
        .in("status", ["active", "pending"]);
      if (coachId) query = query.eq("coach_id", coachId);

      const { data: assignments } = await query;

      if (!assignments?.length) {
        setClients([]);
        setProgramTypeMap({});
        setLoading(false);
        return;
      }

      // Build program type map + pending set
      const ptMap: Record<string, string> = {};
      const pendingSet = new Set<string>();
      assignments.forEach((a: any) => {
        if (a.program_type) ptMap[a.client_id] = a.program_type;
        if (a.status === "pending") pendingSet.add(a.client_id);
      });
      setProgramTypeMap(ptMap);

      const clientIds = assignments.map((a) => a.client_id);

      const [profilesRes, tagsRes] = await Promise.all([
        supabase.from("profiles").select("*").in("user_id", clientIds),
        supabase.from("client_tags").select("client_id, tag").in("client_id", clientIds),
      ]);

      const tagMap: Record<string, string[]> = {};
      (tagsRes.data || []).forEach((t) => {
        if (!tagMap[t.client_id]) tagMap[t.client_id] = [];
        tagMap[t.client_id].push(t.tag);
      });

      const last7Start = format(subDays(new Date(), 6), "yyyy-MM-dd");
      const last7Days = Array.from({ length: 7 }, (_, i) =>
        format(subDays(new Date(), 6 - i), "yyyy-MM-dd")
      );

      // Batch-fetch calendar events (workouts + cardio) and nutrition logs for all clients
      const [calEventsRes, nutritionLogsRes, nutritionTargetsRes] = await Promise.all([
        supabase
          .from("calendar_events")
          .select("target_client_id, user_id, event_date, event_type, is_completed")
          .or(`target_client_id.in.(${clientIds.join(",")}),user_id.in.(${clientIds.join(",")})`)
          .gte("event_date", last7Start)
          .lte("event_date", last7Days[6])
          .in("event_type", ["workout", "cardio"]),
        supabase
          .from("nutrition_logs")
          .select("client_id, calories, logged_at")
          .in("client_id", clientIds)
          .gte("logged_at", last7Start)
          .lte("logged_at", last7Days[6]),
        supabase
          .from("nutrition_targets")
          .select("client_id, calories")
          .in("client_id", clientIds),
      ]);

      const calEvents = calEventsRes.data || [];
      const nutritionLogs = nutritionLogsRes.data || [];
      const nutritionTargets = nutritionTargetsRes.data || [];

      // Build nutrition target set (clients who have a nutrition target)
      const hasNutritionTarget = new Set<string>();
      nutritionTargets.forEach((t) => {
        if (t.calories && t.calories > 0) hasNutritionTarget.add(t.client_id);
      });

      // Build nutrition days logged per client
      const nutritionDaysByClient: Record<string, Set<string>> = {};
      nutritionLogs.forEach((l) => {
        if (Number(l.calories || 0) > 0) {
          if (!nutritionDaysByClient[l.client_id]) nutritionDaysByClient[l.client_id] = new Set();
          nutritionDaysByClient[l.client_id].add(String(l.logged_at));
        }
      });

      const clientsData = (profilesRes.data || []).map((p) => {
        // Calendar events for this client (as target or creator)
        const clientEvents = calEvents.filter(
          (e) => e.target_client_id === p.user_id || e.user_id === p.user_id
        );
        const totalEvents = clientEvents.length;
        const completedEvents = clientEvents.filter((e) => e.is_completed).length;

        // Nutrition: count days with nutrition target where they logged
        const nutritionDaysExpected = hasNutritionTarget.has(p.user_id) ? 7 : 0;
        const nutritionDaysLogged = nutritionDaysByClient[p.user_id]?.size || 0;

        const totalPossible = totalEvents + nutritionDaysExpected;
        const totalAchieved = completedEvents + Math.min(nutritionDaysLogged, nutritionDaysExpected);
        const compliance = totalPossible > 0
          ? Math.round((totalAchieved / totalPossible) * 100)
          : 0;

        // Streak: consecutive days from today backwards where all scheduled events were completed + nutrition logged
        let streak = 0;
        for (let i = 6; i >= 0; i--) {
          const day = last7Days[i];
          const dayEvents = clientEvents.filter((e) => e.event_date === day);
          const dayAllComplete = dayEvents.length > 0 ? dayEvents.every((e) => e.is_completed) : true;
          const dayNutritionOk = !hasNutritionTarget.has(p.user_id) || (nutritionDaysByClient[p.user_id]?.has(day) ?? false);
          const hadAnything = dayEvents.length > 0 || hasNutritionTarget.has(p.user_id);

          if (hadAnything && dayAllComplete && dayNutritionOk) streak++;
          else if (hadAnything) break;
          // skip days with nothing scheduled
        }

        return {
          id: p.user_id,
          name: p.full_name || "Client",
          avatar_url: p.avatar_url,
          compliance,
          streak,
          tags: tagMap[p.user_id] || [],
          isPending: pendingSet.has(p.user_id),
        };
      });

      setClients(clientsData);
      setLoading(false);
    };
    fetchClients();
  }, [user, coachFilter]);

  /* ─── Batch load nutrition compliance for all clients ─── */
  useEffect(() => {
    if (clients.length === 0) return;
    const ids = clients.map((c) => c.id);
    const today = format(new Date(), "yyyy-MM-dd");

    const fetchCompliance = async () => {
      const [logsRes, targetsRes] = await Promise.all([
        supabase.from("nutrition_logs").select("client_id, calories").in("client_id", ids).eq("logged_at", today),
        supabase.from("nutrition_targets").select("client_id, calories").in("client_id", ids),
      ]);

      const dailyTotals: Record<string, number> = {};
      (logsRes.data || []).forEach((r) => {
        dailyTotals[r.client_id] = (dailyTotals[r.client_id] || 0) + Number(r.calories || 0);
      });

      const calTargets: Record<string, number> = {};
      (targetsRes.data || []).forEach((r) => {
        if (r.calories) calTargets[r.client_id] = r.calories;
      });

      const map: Record<string, NutritionCompliance> = {};
      ids.forEach((id) => {
        const logged = dailyTotals[id] || 0;
        const target = calTargets[id] || null;
        if (!target || logged === 0) {
          map[id] = { pct: null, status: "no_data" };
          return;
        }
        const pct = logged / target;
        map[id] = {
          pct: Math.round(pct * 100),
          status: pct >= 0.9 && pct <= 1.1 ? "on_target" : pct >= 0.7 && pct <= 1.3 ? "close" : "missed",
        };
      });

      setComplianceMap(map);
    };

    fetchCompliance();
    const interval = setInterval(fetchCompliance, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [clients]);

  /* ─── Batch load phase end dates for all clients ─── */
  useEffect(() => {
    if (clients.length === 0) return;
    const ids = clients.map((c) => c.id);

    const fetchPhases = async () => {
      const { data: assignments } = await supabase
        .from("client_program_assignments")
        .select("client_id, program_id, current_phase_id, start_date")
        .in("client_id", ids)
        .in("status", ["active", "subscribed"]);

      if (!assignments?.length) return;

      const programIds = [...new Set(assignments.map((a) => a.program_id))];
      const { data: allPhases } = await supabase
        .from("program_phases")
        .select("id, program_id, phase_order, duration_weeks, name")
        .in("program_id", programIds)
        .order("phase_order", { ascending: true });

      if (!allPhases?.length) return;

      const phasesByProgram = new Map<string, typeof allPhases>();
      allPhases.forEach((p) => {
        if (!phasesByProgram.has(p.program_id)) phasesByProgram.set(p.program_id, []);
        phasesByProgram.get(p.program_id)!.push(p);
      });

      const map: Record<string, PhaseInfo> = {};
      for (const a of assignments) {
        const phases = phasesByProgram.get(a.program_id);
        if (!phases?.length || !a.current_phase_id) continue;

        const currentPhase = phases.find((p) => p.id === a.current_phase_id);
        if (!currentPhase) continue;

        let totalWeeks = 0;
        for (const p of phases) {
          totalWeeks += p.duration_weeks;
          if (p.id === a.current_phase_id) break;
        }

        const endDate = addDays(new Date(a.start_date), totalWeeks * 7);
        const daysLeft = differenceInDays(endDate, new Date());
        const totalDays = differenceInDays(endDate, new Date(a.start_date));

        map[a.client_id] = {
          phaseName: currentPhase.name,
          endDate: format(endDate, "MMM d"),
          daysLeft,
          totalDays: Math.max(totalDays, 1),
        };
      }
      setPhaseMap(map);
    };

    fetchPhases();
  }, [clients]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    clients.forEach((c) => c.tags.forEach((t) => tags.add(t)));
    return Array.from(tags).sort();
  }, [clients]);

  const usedProgramTypes = useMemo(() => {
    const types = new Set<string>();
    Object.values(programTypeMap).forEach((t) => types.add(t));
    return Array.from(types).sort();
  }, [programTypeMap]);

  const filteredClients = useMemo(() => {
    return clients.filter((c) => {
      if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (tagFilter !== "all" && !c.tags.includes(tagFilter)) return false;
      if (statusFilter === "high_compliance" && c.compliance < 70) return false;
      if (statusFilter === "low_compliance" && c.compliance >= 70) return false;
      if (programTypeFilter !== "all") {
        const clientPT = programTypeMap[c.id];
        if (programTypeFilter === "unassigned") {
          if (clientPT) return false;
        } else {
          if (clientPT !== programTypeFilter) return false;
        }
      }
      return true;
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [clients, search, statusFilter, tagFilter, programTypeFilter, programTypeMap]);

  useEffect(() => {
    const selected = clients.filter((c) => selectedIds.has(c.id));
    onSelectionChange(selected);
  }, [selectedIds, clients]);

  const toggleAll = () => {
    const filteredIds = filteredClients.map((c) => c.id);
    const allSelected = filteredIds.every((id) => selectedIds.has(id));
    const next = new Set(selectedIds);
    if (allSelected) {
      filteredIds.forEach((id) => next.delete(id));
    } else {
      filteredIds.forEach((id) => next.add(id));
    }
    setSelectedIds(next);
  };

  const toggleOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleBulkProgramType = async (programType: string) => {
    if (!user || selectedIds.size === 0) return;
    const ids = [...selectedIds];
    const { error } = await supabase
      .from("coach_clients")
      .update({ program_type: programType } as any)
      .in("client_id", ids)
      .eq("coach_id", user.id);

    if (error) {
      toast.error("Failed to update program types");
      return;
    }

    // Update local state
    setProgramTypeMap((prev) => {
      const next = { ...prev };
      ids.forEach((id) => { next[id] = programType; });
      return next;
    });
    setBulkProgramOpen(false);
    toast.success(`Program type updated for ${ids.length} client${ids.length > 1 ? "s" : ""}`);
  };

  const allFilteredSelected =
    filteredClients.length > 0 &&
    filteredClients.every((c) => selectedIds.has(c.id));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (clients.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Users className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No active clients assigned</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center">
          <Button
            variant={allFilteredSelected ? "default" : "outline"}
            size="sm"
            onClick={toggleAll}
            className="gap-2"
          >
            {allFilteredSelected ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
            {allFilteredSelected ? "Deselect All" : "Select All"}
          </Button>
          {selectedIds.size > 0 && (
            <>
              <Button size="sm" onClick={onSendMessage} className="gap-2">
                <MessageSquare className="h-3.5 w-3.5" />
                Send Message ({selectedIds.size})
              </Button>
              <Popover open={bulkProgramOpen} onOpenChange={setBulkProgramOpen}>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="outline" className="gap-2">
                    <ClipboardList className="h-3.5 w-3.5" />
                    Assign Program Type ({selectedIds.size})
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-1" align="start">
                  <p className="px-3 py-2 text-xs text-muted-foreground font-medium">Select program type:</p>
                  {PROGRAM_TYPES.map((pt) => (
                    <button
                      key={pt}
                      onClick={() => handleBulkProgramType(pt)}
                      className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors"
                    >
                      {pt}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-2 items-center w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial sm:w-48">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search clients..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9 text-sm" />
          </div>
          {isAdmin && coaches.length > 0 && (
            <Select value={coachFilter} onValueChange={setCoachFilter}>
              <SelectTrigger className="h-9 w-[160px] text-sm"><SelectValue placeholder="Coach" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mine">My Clients</SelectItem>
                <SelectItem value="all_coaches">All Coaches</SelectItem>
                {coaches.filter((c) => c.id !== user?.id).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-[140px] text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Clients</SelectItem>
              <SelectItem value="high_compliance">High Compliance</SelectItem>
              <SelectItem value="low_compliance">Low Compliance</SelectItem>
            </SelectContent>
          </Select>
          {allTags.length > 0 && (
            <Select value={tagFilter} onValueChange={setTagFilter}>
              <SelectTrigger className="h-9 w-[140px] text-sm"><SelectValue placeholder="Tag" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tags</SelectItem>
                {allTags.map((tag) => <SelectItem key={tag} value={tag}>{tag}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={programTypeFilter} onValueChange={setProgramTypeFilter}>
            <SelectTrigger className="h-9 w-[160px] text-sm"><SelectValue placeholder="Program Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Program Types</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {usedProgramTypes.map((pt) => <SelectItem key={pt} value={pt}>{pt}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="text-xs text-muted-foreground">{selectedIds.size} of {clients.length} clients selected</div>
      )}

      {/* Column header */}
      <div className="hidden sm:flex items-center px-4 text-[10px] text-muted-foreground uppercase tracking-wider">
        <span className="flex-1">Client</span>
        <span className="w-20 text-right">Today's Cals</span>
      </div>

      {/* Client grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredClients.map((client) => {
          const isSelected = selectedIds.has(client.id);
          const comp = complianceMap[client.id];
          const phase = phaseMap[client.id];
          const clientProgramType = programTypeMap[client.id];
          return (
            <Card
              key={client.id}
              className={`cursor-pointer transition-all ${
                isSelected ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20" : "hover:border-primary/20"
              }`}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('[role="checkbox"]')) return;
                setPreviewClient(client);
              }}
            >
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <Checkbox checked={isSelected} onCheckedChange={() => toggleOne(client.id)} onClick={(e) => e.stopPropagation()} className="shrink-0" />
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarImage src={client.avatar_url} alt={client.name} />
                    <AvatarFallback className="text-xs">{client.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="font-medium text-foreground text-sm truncate">{client.name}</p>
                      {client.isPending && (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 h-4 border-muted-foreground/30 text-muted-foreground bg-muted/30 font-medium"
                        >
                          Pending
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-muted-foreground">{client.compliance}% compliance</span>
                      {client.streak > 0 && (
                        <span className="text-xs text-primary font-medium flex items-center gap-0.5">
                          <Zap className="h-2.5 w-2.5" />{client.streak}d
                        </span>
                      )}
                    </div>
                    {clientProgramType && (
                      <Badge variant="outline" className="text-[10px] mt-1 border-primary/30 text-primary">
                        <ClipboardList className="h-2.5 w-2.5 mr-1" />
                        {clientProgramType}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {comp && <ComplianceBadge {...comp} />}
                    {/* Tags removed from card for space — still filterable via Tags dropdown */}
                  </div>
                </div>
                {phase && (() => {
                  const elapsedPct = Math.min(100, Math.max(0, Math.round(((phase.totalDays - phase.daysLeft) / phase.totalDays) * 100)));
                  const barColor = phase.daysLeft <= 0 || elapsedPct > 90
                    ? "hsl(var(--destructive))"
                    : elapsedPct > 70
                      ? "hsl(38 92% 50%)"
                      : "hsl(152 69% 41%)";
                  return (
                    <div className="mt-2 pt-2 border-t border-border/50">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-muted-foreground truncate">
                          {phase.phaseName} · Ends {phase.endDate}
                        </span>
                        <span className={cn(
                          "text-[10px] font-bold whitespace-nowrap ml-2",
                          phase.daysLeft <= 0 ? "text-destructive" : phase.daysLeft <= 7 ? "text-amber-400" : "text-muted-foreground"
                        )}>
                          {phase.daysLeft <= 0 ? "Overdue" : `${phase.daysLeft}d left`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Progress
                          value={elapsedPct}
                          className="h-2 flex-1"
                          style={{ '--progress-color': barColor } as React.CSSProperties}
                        />
                        <span className="text-[10px] font-bold text-muted-foreground w-8 text-right">{elapsedPct}%</span>
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filteredClients.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">No clients match your filters.</p>
      )}

      <ClientPreviewDialog
        clientId={previewClient?.id || null}
        clientName={previewClient?.name || ""}
        clientAvatar={previewClient?.avatar_url}
        open={!!previewClient}
        onOpenChange={(open) => { if (!open) setPreviewClient(null); }}
        onClientDeactivated={() => {
          setPreviewClient(null);
          onClientStatusChanged?.();
          setClients((prev) => prev.filter((c) => c.id !== previewClient?.id));
        }}
        onClientDeleted={() => {
          setPreviewClient(null);
          onClientStatusChanged?.();
          setClients((prev) => prev.filter((c) => c.id !== previewClient?.id));
        }}
        onClientTransferred={() => {
          setPreviewClient(null);
          onClientStatusChanged?.();
          setClients((prev) => prev.filter((c) => c.id !== previewClient?.id));
        }}
      />
    </div>
  );
};

export default SelectableClientCards;
