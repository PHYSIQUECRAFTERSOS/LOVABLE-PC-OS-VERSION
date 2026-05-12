import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Plus, Search, FolderOpen, Layers, Trash2, Copy, MoreHorizontal,
  Users, Link2, Unlink, RefreshCw, History, Dumbbell, UtensilsCrossed,
  Target, ClipboardCheck, Pill, BookOpen, ChevronRight, Share2, Lock,
  Menu, ArrowLeft,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { cloneWorkoutWithExercises, buildImportSummary, formatImportSummary } from "@/lib/cloneWorkoutHelpers";
import { useAuth } from "@/hooks/useAuth";
import ProgramDetailView from "@/components/training/ProgramDetailView";
import ProgramOverviewPane from "@/components/training/ProgramOverviewPane";
import ProgramBuilder from "@/components/training/ProgramBuilder";
import ExerciseLibrary from "@/components/libraries/ExerciseLibrary";
import { format } from "date-fns";
import MealPlanTemplateLibrary from "@/components/nutrition/MealPlanTemplateLibrary";
import PCRecipeLibrary from "@/components/nutrition/PCRecipeLibrary";
import StandaloneFormBuilder from "@/components/checkin/StandaloneFormBuilder";
import SupplementLibrary from "@/components/libraries/SupplementLibrary";
import CoachNutritionGuides from "@/components/nutrition/CoachNutritionGuides";
import AIImportButton from "@/components/import/AIImportButton";
import MobileTwoPane from "@/components/libraries/MobileTwoPane";

const GOAL_LABELS: Record<string, string> = {
  hypertrophy: "Hypertrophy", strength: "Strength", fat_loss: "Fat Loss",
  powerbuilding: "Powerbuilding", athletic: "Athletic", general: "General Fitness",
  recomp: "Recomp", prep: "Contest Prep",
};

const TAB_CONFIG = [
  { value: "programs", label: "Programs", Icon: Layers },
  { value: "exercises", label: "Exercises", Icon: Dumbbell },
  { value: "meals", label: "Meals", Icon: UtensilsCrossed },
  { value: "pc-recipes", label: "PC Recipes", Icon: UtensilsCrossed },
  { value: "supplements", label: "Supplements", Icon: Pill },
  { value: "guides", label: "Guides", Icon: BookOpen },
  { value: "checkin-forms", label: "Check-In Forms", Icon: ClipboardCheck },
] as const;

const MasterLibraries = () => {
  const { user, role } = useAuth();
  const userId = user?.id;
  const isAdmin = role === "admin";
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "programs");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [programs, setPrograms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);
  const [selectedProgramName, setSelectedProgramName] = useState("");
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);
  const [expandedProgramId, setExpandedProgramId] = useState<string | null>(null);
  const [phasesByProgram, setPhasesByProgram] = useState<Record<string, { id: string; name: string; phase_order: number; duration_weeks: number }[]>>({});
  const [overviewRefreshKey, setOverviewRefreshKey] = useState(0);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [phaseCounts, setPhaseCounts] = useState<Record<string, number>>({});
  const [linkedCounts, setLinkedCounts] = useState<Record<string, number>>({});
  const [creatorNames, setCreatorNames] = useState<Record<string, string>>({});
  const [sharedExpanded, setSharedExpanded] = useState(true);
  const [personalExpanded, setPersonalExpanded] = useState(true);

  /** Fetch and cache the phases for a given program (for the inline accordion). */
  const ensurePhasesLoaded = async (programId: string) => {
    if (phasesByProgram[programId]) return;
    const { data } = await supabase
      .from("program_phases")
      .select("id, name, phase_order, duration_weeks")
      .eq("program_id", programId)
      .order("phase_order");
    setPhasesByProgram(prev => ({ ...prev, [programId]: (data || []) as any }));
  };

  /** Toggle the inline left-list accordion for a program. Selects program too. */
  const handleProgramRowClick = async (program: any) => {
    const isSame = expandedProgramId === program.id;
    if (isSame) {
      // Collapse — but keep program selected (overview state)
      setExpandedProgramId(null);
      setSelectedPhaseId(null);
      return;
    }
    // Expand this program; collapse any other; switch right pane to overview
    setExpandedProgramId(program.id);
    setSelectedProgramId(program.id);
    setSelectedProgramName(program.name);
    setSelectedPhaseId(null);
    await ensurePhasesLoaded(program.id);
  };

  const handleSelectPhase = async (programId: string, phaseId: string, programName?: string) => {
    setSelectedProgramId(programId);
    if (programName) setSelectedProgramName(programName);
    setExpandedProgramId(programId);
    setSelectedPhaseId(phaseId);
    await ensurePhasesLoaded(programId);
  };


  const activeTabMeta = TAB_CONFIG.find(t => t.value === activeTab) ?? TAB_CONFIG[0];

  // Assign dialog
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [assignProgramId, setAssignProgramId] = useState<string | null>(null);
  /** When set, the Assign dialog clones only this single phase. */
  const [assignPhaseId, setAssignPhaseId] = useState<string | null>(null);
  const [assignMode, setAssignMode] = useState<"subscribe" | "import">("subscribe");
  const [clients, setClients] = useState<any[]>([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [assigning, setAssigning] = useState(false);

  // Push update
  const [showPushDialog, setShowPushDialog] = useState(false);
  const [pushProgramId, setPushProgramId] = useState<string | null>(null);
  const [linkedClients, setLinkedClients] = useState<any[]>([]);
  const [selectedPushClients, setSelectedPushClients] = useState<string[]>([]);
  const [pushing, setPushing] = useState(false);
  const [changeLog, setChangeLog] = useState("");

  // Version history
  const [showVersions, setShowVersions] = useState(false);
  const [versions, setVersions] = useState<any[]>([]);

  const loadPrograms = async () => {
    if (!userId) return;
    setLoading(true);
    // Fetch own templates + shared master templates (RLS handles cross-coach visibility)
    const { data: ownData } = await supabase
      .from("programs")
      .select("id, name, description, goal_type, is_master, created_at, duration_weeks, tags, version_number, coach_id")
      .eq("coach_id", userId)
      .eq("is_template", true)
      .order("created_at", { ascending: false });

    const { data: sharedData } = await supabase
      .from("programs")
      .select("id, name, description, goal_type, is_master, created_at, duration_weeks, tags, version_number, coach_id")
      .eq("is_master", true)
      .eq("is_template", true)
      .neq("coach_id", userId)
      .order("created_at", { ascending: false });

    // Merge, deduplicate by id
    const merged = [...(ownData || []), ...(sharedData || [])];
    const seen = new Set<string>();
    const unique = merged.filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true; });
    setPrograms(unique);

    if (unique.length > 0) {
      const ids = unique.map((p: any) => p.id);
      const { data: phases } = await supabase.from("program_phases").select("program_id").in("program_id", ids);
      const pc: Record<string, number> = {};
      (phases || []).forEach((p: any) => { pc[p.program_id] = (pc[p.program_id] || 0) + 1; });
      setPhaseCounts(pc);

      const { data: assignments } = await supabase
        .from("client_program_assignments")
        .select("forked_from_program_id")
        .in("forked_from_program_id", ids)
        .eq("is_linked_to_master", true)
        .eq("status", "active");
      const lc: Record<string, number> = {};
      (assignments || []).forEach((a: any) => { lc[a.forked_from_program_id] = (lc[a.forked_from_program_id] || 0) + 1; });
      setLinkedCounts(lc);

      // Fetch creator names for shared programs
      const otherCoachIds = [...new Set(unique.filter(p => p.coach_id !== userId).map(p => p.coach_id))];
      if (otherCoachIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", otherCoachIds);
        const cn: Record<string, string> = {};
        (profiles || []).forEach((p: any) => { cn[p.user_id] = p.full_name || "Coach"; });
        setCreatorNames(cn);
      }
    }
    setLoading(false);
  };

  const loadClients = async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from("coach_clients")
      .select("client_id")
      .eq("coach_id", userId)
      .eq("status", "active");
    if (error || !data) return;
    const clientIds = data.map((d: any) => d.client_id);
    if (clientIds.length === 0) { setClients([]); return; }
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name")
      .in("user_id", clientIds);
    const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p.full_name]));
    setClients(clientIds.map((id: string) => ({ id, name: profileMap.get(id) || id.slice(0, 8) })));
  };

  useEffect(() => { loadPrograms(); loadClients(); }, [userId]);

  const filteredPrograms = programs.filter(p =>
    !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const sharedPrograms = filteredPrograms.filter(p => p.is_master === true);
  const personalPrograms = filteredPrograms.filter(p => p.is_master !== true && p.coach_id === userId);

  const canEditProgram = (program: any) => program.coach_id === userId || isAdmin;
  const canDeleteProgram = (program: any) => program.coach_id === userId || isAdmin;

  const duplicateProgram = async (programId: string) => {
    if (!user) return;
    try {
      const source = programs.find(p => p.id === programId);
      if (!source) return;
      const { data: newProg, error } = await supabase.from("programs").insert({
        coach_id: user.id, name: `${source.name} (Copy)`, description: source.description,
        goal_type: source.goal_type, is_template: true, is_master: source.is_master,
        duration_weeks: source.duration_weeks, tags: source.tags, version_number: 1,
      } as any).select().single();
      if (error) throw error;

      const { data: phaseRows } = await supabase.from("program_phases").select("*").eq("program_id", programId).order("phase_order");
      for (const phase of (phaseRows || [])) {
        const { data: newPhase } = await supabase.from("program_phases").insert({
          program_id: newProg.id, name: phase.name, description: phase.description,
          phase_order: phase.phase_order, duration_weeks: phase.duration_weeks,
          training_style: phase.training_style, intensity_system: phase.intensity_system,
          progression_rule: phase.progression_rule, custom_intensity: (phase as any).custom_intensity,
        }).select().single();

        if (newPhase) {
          const { data: pws } = await supabase.from("program_workouts")
            .select("workout_id, day_of_week, day_label, sort_order")
            .eq("phase_id", phase.id);
          if (pws && pws.length > 0) {
            await supabase.from("program_workouts").insert(pws.map((w: any) => ({ ...w, phase_id: newPhase.id, week_id: null as any })));
          }
        }
      }
      toast({ title: "Program duplicated" });
      loadPrograms();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const deleteProgram = async (programId: string) => {
    const { error } = await supabase.from("programs").delete().eq("id", programId);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Program deleted" });
      if (selectedProgramId === programId) setSelectedProgramId(null);
      loadPrograms();
    }
  };

  const markAsMaster = async (programId: string, isMaster: boolean) => {
    const program = programs.find(p => p.id === programId);
    if (program && program.coach_id !== userId && !isAdmin) {
      toast({ title: "Permission denied", description: "Only the creator can change sharing status.", variant: "destructive" });
      return;
    }
    await supabase.from("programs").update({ is_master: isMaster } as any).eq("id", programId);
    toast({ title: isMaster ? "Shared with Team" : "Made Private" });
    loadPrograms();
  };

  const openPushDialog = async (programId: string) => {
    setPushProgramId(programId);
    const { data } = await supabase
      .from("client_program_assignments")
      .select("id, client_id, program_id, master_version_number, profiles:client_id(full_name)")
      .eq("forked_from_program_id", programId)
      .eq("is_linked_to_master", true)
      .eq("status", "active");
    const list = (data || []).map((a: any) => ({
      assignmentId: a.id, clientId: a.client_id, clientProgramId: a.program_id,
      name: (a as any).profiles?.full_name || a.client_id.slice(0, 8),
      currentVersion: a.master_version_number,
    }));
    setLinkedClients(list);
    setSelectedPushClients(list.map((c: any) => c.assignmentId));
    setChangeLog("");
    setShowPushDialog(true);
  };

  const pushUpdate = async () => {
    if (!pushProgramId || !user) return;
    setPushing(true);
    try {
      const master = programs.find(p => p.id === pushProgramId);
      if (!master) throw new Error("Master not found");
      const newVersion = (master.version_number || 1) + 1;
      await supabase.from("programs").update({ version_number: newVersion } as any).eq("id", pushProgramId);
      await supabase.from("master_program_versions").insert({
        program_id: pushProgramId, version_number: newVersion,
        change_log: changeLog || "Structure updated", updated_by: user.id,
      });
      toast({ title: "Update pushed", description: `v${newVersion} synced.` });
      setShowPushDialog(false);
      loadPrograms();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setPushing(false);
    }
  };

  const openVersionHistory = async (programId: string) => {
    const { data } = await supabase
      .from("master_program_versions")
      .select("*")
      .eq("program_id", programId)
      .order("version_number", { ascending: false });
    setVersions(data || []);
    setShowVersions(true);
  };

  const assignToClient = async () => {
    if (!assignProgramId || !selectedClientId || !user) return;
    setAssigning(true);
    try {
      const source = programs.find(p => p.id === assignProgramId);
      if (!source) throw new Error("Program not found");
      const isLinked = assignMode === "subscribe";

      const { data: newProg, error } = await supabase.from("programs").insert({
        coach_id: user.id, client_id: selectedClientId, name: source.name, description: source.description,
        goal_type: source.goal_type, start_date: startDate, is_template: false, is_master: false,
        duration_weeks: source.duration_weeks, tags: source.tags, version_number: source.version_number,
      } as any).select().single();
      if (error) throw error;

      const { data: phaseRows } = await supabase.from("program_phases").select("*").eq("program_id", assignProgramId).order("phase_order");
      let firstPhaseId: string | null = null;
      const allCloneResults: import("@/lib/cloneWorkoutHelpers").CloneWorkoutResult[] = [];

      for (const phase of (phaseRows || [])) {
        const { data: newPhase } = await supabase.from("program_phases").insert({
          program_id: newProg.id, name: phase.name, description: phase.description,
          phase_order: phase.phase_order, duration_weeks: phase.duration_weeks,
          training_style: phase.training_style, intensity_system: phase.intensity_system,
          progression_rule: phase.progression_rule,
        }).select().single();
        if (!firstPhaseId) firstPhaseId = newPhase?.id || null;

        const { data: pws } = await supabase.from("program_workouts")
          .select("workout_id, day_of_week, day_label, sort_order, exclude_from_numbering, custom_tag")
          .eq("phase_id", phase.id);

        for (const w of (pws || [])) {
          const { workout: clientW, result } = await cloneWorkoutWithExercises(
            w.workout_id, user.id, selectedClientId, false
          );
          allCloneResults.push(result);
          if (!clientW) {
            console.error(`[Import] Failed to clone workout for phase "${phase.name}":`, result.errors);
            continue;
          }

          await supabase.from("program_workouts").insert({
            phase_id: newPhase!.id, workout_id: clientW.id, week_id: null as any,
            day_of_week: w.day_of_week, day_label: w.day_label, sort_order: w.sort_order,
            exclude_from_numbering: (w as any).exclude_from_numbering || false,
            custom_tag: (w as any).custom_tag || null,
          });
        }
      }

      await supabase.from("client_program_assignments").update({ status: "completed" })
        .eq("client_id", selectedClientId).eq("status", "active");

      await supabase.from("client_program_assignments").insert({
        client_id: selectedClientId, program_id: newProg.id, coach_id: user.id, start_date: startDate,
        current_phase_id: firstPhaseId, current_week_number: 1, status: "active", auto_advance: autoAdvance,
        forked_from_program_id: assignProgramId, is_linked_to_master: isLinked,
        master_version_number: source.version_number, last_synced_at: new Date().toISOString(),
      });

      // Show post-import summary
      const summary = buildImportSummary(allCloneResults);
      const msg = formatImportSummary(summary);
      toast({
        title: isLinked ? "Client subscribed" : msg.title,
        description: isLinked ? "Future updates will sync." : msg.description,
        variant: msg.isWarning ? "destructive" : undefined,
      });
      setShowAssignDialog(false);
      setSelectedClientId("");
      loadPrograms();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setAssigning(false);
    }
  };

  if (showBuilder) {
    return (
      <AppLayout>
        <div className="animate-fade-in space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground">{editingId ? "Edit Program" : "Create Program"}</h3>
            <Button variant="outline" size="sm" onClick={() => { setShowBuilder(false); setEditingId(undefined); }}>Back</Button>
          </div>
          <ProgramBuilder editProgramId={editingId} onSave={() => { setShowBuilder(false); setEditingId(undefined); loadPrograms(); }} />
        </div>
      </AppLayout>
    );
  }

  const ComingSoon = ({ label }: { label: string }) => (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
        <Target className="h-6 w-6 text-muted-foreground/40" />
      </div>
      <h3 className="text-base font-semibold text-muted-foreground">{label}</h3>
      <p className="text-xs text-muted-foreground/70 mt-1">Coming soon.</p>
    </div>
  );

  const renderProgramItem = (program: any) => (
    <button
      key={program.id}
      onClick={() => { setSelectedProgramId(program.id); setSelectedProgramName(program.name); }}
      className={`w-full text-left p-3 rounded-lg border transition-colors group ${
        selectedProgramId === program.id
          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
          : "border-transparent hover:bg-muted/50"
      }`}
    >
      <div className="flex items-start gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div
              role="button"
              className="h-7 w-7 flex items-center justify-center rounded hover:bg-muted transition-all shrink-0 mt-0.5"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-4 w-4" />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => { setAssignProgramId(program.id); setShowAssignDialog(true); }}>
              <Users className="h-3.5 w-3.5 mr-2" /> Assign to Client
            </DropdownMenuItem>
            {canEditProgram(program) && linkedCounts[program.id] > 0 && (
              <DropdownMenuItem onClick={() => openPushDialog(program.id)}>
                <RefreshCw className="h-3.5 w-3.5 mr-2" /> Push Update
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => openVersionHistory(program.id)}>
              <History className="h-3.5 w-3.5 mr-2" /> Versions
            </DropdownMenuItem>
            {canEditProgram(program) && (
              <DropdownMenuItem onClick={() => markAsMaster(program.id, !program.is_master)}>
                {program.is_master ? <Lock className="h-3.5 w-3.5 mr-2" /> : <Share2 className="h-3.5 w-3.5 mr-2" />}
                {program.is_master ? "Make Private" : "Share with Team"}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => duplicateProgram(program.id)}>
              <Copy className="h-3.5 w-3.5 mr-2" /> Duplicate
            </DropdownMenuItem>
            {canDeleteProgram(program) && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive" onClick={() => deleteProgram(program.id)}>
                  <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{program.name}</p>
          {program.coach_id !== userId && creatorNames[program.coach_id] && (
            <p className="text-[10px] text-muted-foreground mt-0.5">by {creatorNames[program.coach_id]}</p>
          )}
          <div className="flex flex-wrap gap-1 mt-1">
            {phaseCounts[program.id] > 0 && (
              <Badge variant="outline" className="text-[9px] px-1 py-0 gap-0.5">
                <Layers className="h-2 w-2" /> {phaseCounts[program.id]} phases
              </Badge>
            )}
            {program.duration_weeks && (
              <Badge variant="outline" className="text-[9px] px-1 py-0">{program.duration_weeks}w</Badge>
            )}
            {linkedCounts[program.id] > 0 && (
              <Badge className="text-[9px] px-1 py-0 bg-accent/50 text-accent-foreground gap-0.5">
                <Users className="h-2 w-2" /> {linkedCounts[program.id]}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </button>
  );

  return (
    <AppLayout>
      <div className="animate-fade-in space-y-4 pb-[env(safe-area-inset-bottom)]">
        {/* Page header — hamburger on mobile, plain title on desktop */}
        <div className="flex items-center gap-2">
          {/* Mobile hamburger → left Sheet listing all 7 tabs */}
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden h-10 w-10 -ml-2 shrink-0"
                aria-label="Open library menu"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-72 p-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
            >
              <SheetHeader className="px-4 pt-4 pb-2 border-b border-border/50">
                <SheetTitle className="text-base font-display">Master Libraries</SheetTitle>
              </SheetHeader>
              <nav className="p-2 space-y-1" aria-label="Library sections">
                {TAB_CONFIG.map(({ value, label, Icon }) => {
                  const isActive = activeTab === value;
                  return (
                    <button
                      key={value}
                      onClick={() => { setActiveTab(value); setMobileMenuOpen(false); }}
                      className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-primary/10 text-primary ring-1 ring-primary/30"
                          : "text-foreground hover:bg-muted/50"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1 text-left">{label}</span>
                      {isActive && <ChevronRight className="h-4 w-4 text-primary shrink-0" />}
                    </button>
                  );
                })}
              </nav>
            </SheetContent>
          </Sheet>

          <div className="flex-1 min-w-0">
            <h1 className="font-display text-xl md:text-2xl font-bold text-foreground truncate">
              <span className="md:hidden">{activeTabMeta.label}</span>
              <span className="hidden md:inline">Master Libraries</span>
            </h1>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          {/* Desktop tab bar — hidden on mobile (replaced by hamburger Sheet above) */}
          <TabsList className="hidden md:grid w-full grid-cols-7">
            <TabsTrigger value="programs" className="gap-1.5 text-xs"><Layers className="h-3.5 w-3.5" /> Programs</TabsTrigger>
            <TabsTrigger value="exercises" className="gap-1.5 text-xs"><Dumbbell className="h-3.5 w-3.5" /> Exercises</TabsTrigger>
            <TabsTrigger value="meals" className="gap-1.5 text-xs"><UtensilsCrossed className="h-3.5 w-3.5" /> Meals</TabsTrigger>
            <TabsTrigger value="pc-recipes" className="gap-1.5 text-xs"><UtensilsCrossed className="h-3.5 w-3.5" /> PC Recipes</TabsTrigger>
            <TabsTrigger value="supplements" className="gap-1.5 text-xs"><Pill className="h-3.5 w-3.5" /> Supplements</TabsTrigger>
            <TabsTrigger value="guides" className="gap-1.5 text-xs"><BookOpen className="h-3.5 w-3.5" /> Guides</TabsTrigger>
            <TabsTrigger value="checkin-forms" className="gap-1.5 text-xs"><ClipboardCheck className="h-3.5 w-3.5" /> Check-In Forms</TabsTrigger>
          </TabsList>

          {/* Programs Tab */}
          <TabsContent value="programs" className="mt-4">
            <MobileTwoPane
              selected={!!selectedProgramId}
              onClose={() => { setSelectedProgramId(null); loadPrograms(); }}
              detailTitle={selectedProgramName || "Program"}
              listWidthClass="w-80"
              list={
                <>
                  <div className="p-4 border-b space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="font-semibold text-sm text-foreground">Programs</h2>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <AIImportButton entryPoint="library" importType="workout" onImportComplete={loadPrograms} />
                        <Button size="sm" onClick={() => setShowBuilder(true)}>
                          <Plus className="h-3.5 w-3.5 mr-1" /> New
                        </Button>
                      </div>
                    </div>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input placeholder="Search programs..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-8 h-9 text-sm" />
                    </div>
                  </div>

                  <ScrollArea className="flex-1">
                    <div className="p-2 space-y-1">
                      {loading ? (
                        Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)
                      ) : filteredPrograms.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                          <FolderOpen className="h-12 w-12 text-muted-foreground/30 mb-3" />
                          <p className="text-base font-semibold text-foreground">No programs yet</p>
                          <p className="text-sm text-muted-foreground/70 mt-1 mb-4">Create your first program to get started.</p>
                          <Button size="sm" onClick={() => setShowBuilder(true)}>
                            <Plus className="h-3.5 w-3.5 mr-1" /> Create Program
                          </Button>
                        </div>
                      ) : (
                        <>
                          {/* Shared Section */}
                          <Collapsible open={sharedExpanded} onOpenChange={setSharedExpanded}>
                            <CollapsibleTrigger className="flex items-center justify-between w-full px-2 py-1.5 rounded hover:bg-muted/50 transition-colors">
                              <div className="flex items-center gap-1.5">
                                <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${sharedExpanded ? "rotate-90" : ""}`} />
                                <Share2 className="h-3.5 w-3.5 text-primary" />
                                <span className="text-xs font-semibold text-foreground">Shared</span>
                              </div>
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{sharedPrograms.length}</Badge>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="space-y-1 mt-1">
                              {sharedPrograms.length === 0 ? (
                                <p className="text-[11px] text-muted-foreground px-2 py-3 text-center">No shared programs yet.</p>
                              ) : sharedPrograms.map((program) => renderProgramItem(program))}
                            </CollapsibleContent>
                          </Collapsible>

                          {/* Personal Section */}
                          <Collapsible open={personalExpanded} onOpenChange={setPersonalExpanded}>
                            <CollapsibleTrigger className="flex items-center justify-between w-full px-2 py-1.5 rounded hover:bg-muted/50 transition-colors mt-2">
                              <div className="flex items-center gap-1.5">
                                <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${personalExpanded ? "rotate-90" : ""}`} />
                                <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-xs font-semibold text-foreground">Personal</span>
                              </div>
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{personalPrograms.length}</Badge>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="space-y-1 mt-1">
                              {personalPrograms.length === 0 ? (
                                <p className="text-[11px] text-muted-foreground px-2 py-3 text-center">No personal programs.</p>
                              ) : personalPrograms.map((program) => renderProgramItem(program))}
                            </CollapsibleContent>
                          </Collapsible>
                        </>
                      )}
                    </div>
                  </ScrollArea>
                </>
              }
              detail={
                selectedProgramId ? (
                  <div className="p-4 md:p-6">
                    <ProgramDetailView
                      programId={selectedProgramId}
                      programName={selectedProgramName}
                      onBack={() => { setSelectedProgramId(null); loadPrograms(); }}
                    />
                  </div>
                ) : null
              }
              emptyState={
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <Dumbbell className="h-16 w-16 text-muted-foreground/20 mb-4" />
                  <h3 className="text-lg font-semibold text-muted-foreground">Select a Program</h3>
                  <p className="text-sm text-muted-foreground/70 mt-1">Choose a program from the sidebar or create a new one.</p>
                </div>
              }
            />
          </TabsContent>

          {/* Exercises Tab */}
          <TabsContent value="exercises" className="mt-4">
            <ExerciseLibrary />
          </TabsContent>

          {/* Placeholder Tabs */}
          <TabsContent value="meals" className="mt-4"><MealPlanTemplateLibrary /></TabsContent>
          <TabsContent value="pc-recipes" className="mt-4"><PCRecipeLibrary /></TabsContent>
          <TabsContent value="supplements" className="mt-4"><SupplementLibrary /></TabsContent>
          <TabsContent value="guides" className="mt-4"><CoachNutritionGuides /></TabsContent>
          <TabsContent value="checkin-forms" className="mt-4"><StandaloneFormBuilder /></TabsContent>
        </Tabs>
      </div>

      {/* Assign Dialog */}
      <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Program to Client</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setAssignMode("subscribe")} className={`p-3 rounded-lg border text-left transition-colors ${assignMode === "subscribe" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted/50"}`}>
                <div className="flex items-center gap-2 mb-1"><Link2 className="h-4 w-4 text-primary" /><span className="text-sm font-semibold">Subscribe</span></div>
                <p className="text-[11px] text-muted-foreground">Stays linked. Future updates sync.</p>
              </button>
              <button onClick={() => setAssignMode("import")} className={`p-3 rounded-lg border text-left transition-colors ${assignMode === "import" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted/50"}`}>
                <div className="flex items-center gap-2 mb-1"><Unlink className="h-4 w-4 text-muted-foreground" /><span className="text-sm font-semibold">Import</span></div>
                <p className="text-[11px] text-muted-foreground">Independent copy. No sync.</p>
              </button>
            </div>
            <div className="space-y-2">
              <Label>Select Client</Label>
              <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                <SelectTrigger><SelectValue placeholder="Choose a client..." /></SelectTrigger>
                <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="flex items-center justify-between">
              <div><Label className="text-sm">Auto-Advance Phases</Label><p className="text-[11px] text-muted-foreground">Move to next phase when complete</p></div>
              <Switch checked={autoAdvance} onCheckedChange={setAutoAdvance} />
            </div>
            <Button onClick={assignToClient} disabled={assigning || !selectedClientId} className="w-full">
              {assigning && <Loader2 className="animate-spin mr-2 h-4 w-4" />}
              {assignMode === "subscribe" ? "Subscribe Client" : "Import to Client"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Push Dialog */}
      <Dialog open={showPushDialog} onOpenChange={setShowPushDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Push Master Update</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Change Log (optional)</Label>
              <Textarea value={changeLog} onChange={e => setChangeLog(e.target.value)} placeholder="What changed..." className="h-20" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">{linkedClients.length} linked client(s)</Label>
              {linkedClients.map(c => (
                <label key={c.assignmentId} className="flex items-center gap-2 p-2 rounded border hover:bg-muted/30 cursor-pointer">
                  <input type="checkbox" checked={selectedPushClients.includes(c.assignmentId)} onChange={(e) => setSelectedPushClients(prev => e.target.checked ? [...prev, c.assignmentId] : prev.filter((id: string) => id !== c.assignmentId))} className="rounded" />
                  <span className="text-sm flex-1">{c.name}</span>
                  <Badge variant="outline" className="text-[10px]">v{c.currentVersion}</Badge>
                </label>
              ))}
            </div>
            <Button onClick={pushUpdate} disabled={pushing || selectedPushClients.length === 0} className="w-full">
              {pushing && <Loader2 className="animate-spin mr-2 h-4 w-4" />}
              Push to {selectedPushClients.length} Client(s)
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Version History */}
      <Dialog open={showVersions} onOpenChange={setShowVersions}>
        <DialogContent>
          <DialogHeader><DialogTitle>Version History</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {versions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No version history yet.</p>
            ) : versions.map(v => (
              <div key={v.id} className="p-3 rounded-lg border space-y-1">
                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className="text-[10px]">v{v.version_number}</Badge>
                  <span className="text-[10px] text-muted-foreground">{format(new Date(v.created_at), "MMM d, yyyy h:mm a")}</span>
                </div>
                <p className="text-sm">{v.change_log || "No description"}</p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default MasterLibraries;
