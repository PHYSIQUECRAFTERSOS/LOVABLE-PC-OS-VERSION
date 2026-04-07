import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  MoreVertical,
  ExternalLink,
  UserX,
  Trash2,
  Dumbbell,
  Utensils,
  Scale,
  Clock,
  MessageSquare,
  Target,
  Loader2,
  Ruler,
  User,
  ChevronDown,
  ClipboardList,
  ArrowRightLeft,
} from "lucide-react";
import TransferClientDialog from "./TransferClientDialog";
import { format, subDays, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const GOAL_OPTIONS = [
  { value: "lose_fat", label: "Lose Fat" },
  { value: "build_muscle", label: "Build Muscle" },
  { value: "recomposition", label: "Recomposition" },
  { value: "maintenance", label: "Maintenance" },
];

const PROGRAM_TYPES = [
  "Weekly Progress Updates",
  "Bi-Weekly Progress Updates",
  "6 Week Program",
  "Training Only Program",
  "Training Only With Weekly Progress Updates",
  "Nutrition Only With Weekly Progress Updates",
  "Other",
];

interface ClientPreviewDialogProps {
  clientId: string | null;
  clientName: string;
  clientAvatar?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClientDeactivated?: () => void;
  onClientDeleted?: () => void;
  onClientTransferred?: () => void;
}

interface PreviewData {
  weight: number | null;
  age: number | null;
  heightFeet: number | null;
  heightInches: number | null;
  gender: string | null;
  bodyFat: number | null;
  primaryGoal: string | null;
  programName: string | null;
  phaseName: string | null;
  weekNumber: number | null;
  exerciseCompliance: number;
  nutritionCompliance: number;
  lastActivity: string | null;
  lastMessage: string | null;
  macrosToday: { calories: number; protein: number; carbs: number; fat: number };
  macroTargets: { calories: number; protein: number; carbs: number; fat: number } | null;
  programType: string | null;
}

const StatBox = ({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub?: string }) => (
  <div className="flex flex-col items-center gap-1 rounded-lg bg-card border border-border/50 p-3 min-w-0">
    <Icon className="h-4 w-4 text-primary shrink-0" />
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className="text-sm font-semibold text-foreground truncate">{value}</span>
    {sub && <span className="text-[10px] text-muted-foreground">{sub}</span>}
  </div>
);

const MacroBar = ({ label, current, target, color }: { label: string; current: number; target: number; color: string }) => {
  const pct = target > 0 ? Math.min(Math.round((current / target) * 100), 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-foreground font-medium">{current} / {target}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

const ComplianceRing = ({ label, value, icon: Icon }: { label: string; value: number; icon: any }) => (
  <div className="flex items-center gap-3 rounded-lg bg-card border border-border/50 p-3">
    <div className="relative h-12 w-12 shrink-0">
      <svg viewBox="0 0 36 36" className="h-12 w-12 -rotate-90">
        <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="hsl(var(--secondary))" strokeWidth="3" />
        <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="hsl(var(--primary))" strokeWidth="3" strokeDasharray={`${value}, 100`} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[10px] font-bold text-foreground">{value}%</span>
      </div>
    </div>
    <div className="flex flex-col min-w-0">
      <div className="flex items-center gap-1">
        <Icon className="h-3 w-3 text-primary" />
        <span className="text-xs font-medium text-foreground">{label}</span>
      </div>
      <span className="text-[10px] text-muted-foreground">Last 7 days</span>
    </div>
  </div>
);

const ClientPreviewDialog = ({
  clientId,
  clientName,
  clientAvatar,
  open,
  onOpenChange,
  onClientDeactivated,
  onClientDeleted,
  onClientTransferred,
}: ClientPreviewDialogProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  useEffect(() => {
    if (!clientId || !open) return;
    setLoading(true);
    setData(null);

    const today = new Date().toLocaleDateString("en-CA");
    const sevenDaysAgo = format(subDays(new Date(), 7), "yyyy-MM-dd");

    const fetchAll = async () => {
      const [
        weightRes,
        onboardingRes,
        assignmentRes,
        sessionsRes,
        logsRes,
        targetsRes,
        profileRes,
        threadRes,
        goalRes,
        coachClientRes,
      ] = await Promise.all([
        supabase.from("weight_logs").select("weight").eq("client_id", clientId).order("logged_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("onboarding_profiles").select("age, height_feet, height_inches, gender, bodyfat_final_confirmed, primary_goal").eq("user_id", clientId).maybeSingle(),
        supabase.from("client_program_assignments").select("current_week_number, program_id, current_phase_id").eq("client_id", clientId).eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("workout_sessions").select("completed_at").eq("client_id", clientId).gte("session_date", sevenDaysAgo),
        supabase.from("nutrition_logs").select("calories, protein, carbs, fat, logged_at").eq("client_id", clientId).gte("logged_at", sevenDaysAgo),
        supabase.from("nutrition_targets").select("calories, protein, carbs, fat").eq("client_id", clientId).order("effective_date", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("profiles").select("updated_at").eq("user_id", clientId).maybeSingle(),
        supabase.from("message_threads").select("id, updated_at").eq("client_id", clientId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("client_goals").select("goal").eq("client_id", clientId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("coach_clients").select("program_type").eq("client_id", clientId).eq("coach_id", user!.id).maybeSingle(),
      ]);

      // Program + phase names
      let programName: string | null = null;
      let phaseName: string | null = null;
      if (assignmentRes.data?.program_id) {
        const [progRes, phaseRes] = await Promise.all([
          supabase.from("programs").select("name").eq("id", assignmentRes.data.program_id).maybeSingle(),
          assignmentRes.data.current_phase_id
            ? supabase.from("program_phases").select("name").eq("id", assignmentRes.data.current_phase_id).maybeSingle()
            : Promise.resolve({ data: null }),
        ]);
        programName = progRes.data?.name || null;
        phaseName = phaseRes.data?.name || null;
      }

      // Exercise compliance
      const totalSessions = sessionsRes.data?.length || 0;
      const completedSessions = (sessionsRes.data || []).filter((s) => s.completed_at).length;
      const exerciseCompliance = totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0;

      // Nutrition compliance
      const logDays = new Set((logsRes.data || []).map((l) => l.logged_at));
      const nutritionCompliance = Math.round((logDays.size / 7) * 100);

      // Today's macros
      const todayLogs = (logsRes.data || []).filter((l) => l.logged_at === today);
      const macrosToday = todayLogs.reduce(
        (acc, l) => ({
          calories: acc.calories + Number(l.calories || 0),
          protein: acc.protein + Number(l.protein || 0),
          carbs: acc.carbs + Number(l.carbs || 0),
          fat: acc.fat + Number(l.fat || 0),
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 }
      );

      // Last message
      let lastMessage: string | null = null;
      if (threadRes.data?.updated_at) {
        lastMessage = threadRes.data.updated_at;
      }

      setData({
        weight: weightRes.data?.weight || null,
        age: onboardingRes.data?.age || null,
        heightFeet: onboardingRes.data?.height_feet || null,
        heightInches: onboardingRes.data?.height_inches || null,
        gender: onboardingRes.data?.gender || null,
        bodyFat: onboardingRes.data?.bodyfat_final_confirmed || null,
        primaryGoal: goalRes.data?.goal || onboardingRes.data?.primary_goal || null,
        programName,
        phaseName,
        weekNumber: assignmentRes.data?.current_week_number || null,
        exerciseCompliance,
        nutritionCompliance,
        lastActivity: profileRes.data?.updated_at || null,
        lastMessage,
        macrosToday,
        macroTargets: targetsRes.data
          ? { calories: targetsRes.data.calories, protein: targetsRes.data.protein, carbs: targetsRes.data.carbs, fat: targetsRes.data.fat }
          : null,
        programType: (coachClientRes.data as any)?.program_type || null,
      });
      setLoading(false);
    };

    fetchAll();
  }, [clientId, open]);

  const handleGoalChange = async (newGoal: string) => {
    if (!clientId || !user) return;
    const { error } = await supabase.from("client_goals").upsert(
      { client_id: clientId, goal: newGoal, target_rate: 0 },
      { onConflict: "client_id" }
    );
    if (error) {
      toast.error("Failed to update goal");
      return;
    }
    setData((prev) => prev ? { ...prev, primaryGoal: newGoal } : prev);
    setGoalOpen(false);
    toast.success("Goal updated");
  };

  const handleProgramTypeChange = async (newType: string) => {
    if (!clientId || !user) return;
    const { error } = await supabase
      .from("coach_clients")
      .update({ program_type: newType } as any)
      .eq("client_id", clientId)
      .eq("coach_id", user.id);
    if (error) {
      toast.error("Failed to update program type");
      return;
    }
    setData((prev) => prev ? { ...prev, programType: newType } : prev);
    toast.success("Program type updated");
  };

  const handleAction = async (action: "deactivate" | "delete") => {
    if (!clientId || !user) return;
    setActionLoading(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("manage-client-status", {
        body: { action, clientId },
      });
      if (error) throw error;
      if (res?.error) throw new Error(res.error);

      toast.success(action === "deactivate" ? `${clientName} has been deactivated.` : `${clientName}'s account has been permanently deleted.`);
      onOpenChange(false);
      if (action === "deactivate") onClientDeactivated?.();
      else onClientDeleted?.();
    } catch (err: any) {
      toast.error(err.message || `Failed to ${action} client`);
    } finally {
      setActionLoading(false);
      setDeactivateOpen(false);
      setDeleteOpen(false);
      setDeleteConfirmText("");
    }
  };

  const heightStr = data?.heightFeet ? `${data.heightFeet}'${data.heightInches || 0}"` : "—";
  const goalLabel = GOAL_OPTIONS.find((g) => g.value === data?.primaryGoal)?.label || data?.primaryGoal?.replace(/_/g, " ") || "Set Goal";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto p-0">
          {/* Header */}
          <div className="flex items-center gap-3 p-5 pb-3">
            <Avatar className="h-14 w-14 shrink-0 border-2 border-primary/30">
              <AvatarImage src={clientAvatar} alt={clientName} />
              <AvatarFallback className="text-lg bg-primary/10 text-primary">{clientName.charAt(0)}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <DialogHeader className="text-left space-y-0">
                <DialogTitle className="text-lg font-bold text-foreground truncate">{clientName}</DialogTitle>
              </DialogHeader>
              {/* Editable Goal */}
              <Popover open={goalOpen} onOpenChange={setGoalOpen}>
                <PopoverTrigger asChild>
                  <button className="flex items-center gap-1 text-xs text-primary font-medium capitalize hover:underline cursor-pointer">
                    {goalLabel}
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-1" align="start">
                  {GOAL_OPTIONS.map((g) => (
                    <button
                      key={g.value}
                      onClick={() => handleGoalChange(g.value)}
                      className={cn(
                        "w-full text-left px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors",
                        data?.primaryGoal === g.value && "bg-primary/10 text-primary font-medium"
                      )}
                    >
                      {g.label}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
              {/* Program Type Badge */}
              <div className="mt-1">
                <Select
                  value={data?.programType || ""}
                  onValueChange={handleProgramTypeChange}
                >
                  <SelectTrigger className="h-6 w-auto border-dashed text-[10px] px-2 gap-1 inline-flex">
                    <ClipboardList className="h-3 w-3 text-muted-foreground" />
                    <SelectValue placeholder="Assign Program Type" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROGRAM_TYPES.map((pt) => (
                      <SelectItem key={pt} value={pt} className="text-xs">{pt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setDeactivateOpen(true)} className="text-orange-400">
                  <UserX className="h-4 w-4 mr-2" />
                  Deactivate Client
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setDeleteOpen(true)} className="text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Client
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Open Button */}
          <div className="px-5 pb-2">
            <Button
              className="w-full gap-2"
              onClick={() => {
                onOpenChange(false);
                navigate(`/clients/${clientId}`);
              }}
            >
              <ExternalLink className="h-4 w-4" />
              Open Full Profile
            </Button>
          </div>

          <Separator />

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : data ? (
            <div className="px-5 pb-5 space-y-4">
              {/* Stats Row */}
              <div className="grid grid-cols-4 gap-2">
                <StatBox icon={Scale} label="Weight" value={data.weight ? `${Math.round(data.weight)} lbs` : "—"} />
                <StatBox icon={Ruler} label="Height" value={heightStr} />
                <StatBox icon={User} label="Age" value={data.age ? `${data.age}` : "—"} sub={data.gender ? data.gender.charAt(0).toUpperCase() : undefined} />
                <StatBox icon={Target} label="Body Fat" value={data.bodyFat ? `${data.bodyFat}%` : "—"} />
              </div>

              {/* Program Info */}
              {data.programName && (
                <div className="rounded-lg bg-card border border-border/50 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Current Program</p>
                  <p className="text-sm font-semibold text-foreground">{data.programName}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {data.phaseName && <span className="text-xs text-primary">{data.phaseName}</span>}
                    {data.weekNumber && <span className="text-[10px] text-muted-foreground">Week {data.weekNumber}</span>}
                  </div>
                </div>
              )}

              {/* Compliance Rings */}
              <div className="grid grid-cols-2 gap-2">
                <ComplianceRing label="Training" value={data.exerciseCompliance} icon={Dumbbell} />
                <ComplianceRing label="Nutrition" value={data.nutritionCompliance} icon={Utensils} />
              </div>

              {/* Today's Macros */}
              {data.macroTargets && (
                <div className="rounded-lg bg-card border border-border/50 p-3 space-y-2">
                  <p className="text-xs text-muted-foreground font-medium">Today's Macros</p>
                  <MacroBar label="Calories" current={Math.round(data.macrosToday.calories)} target={data.macroTargets.calories} color="bg-primary" />
                  <MacroBar label="Protein" current={Math.round(data.macrosToday.protein)} target={data.macroTargets.protein} color="bg-blue-500" />
                  <MacroBar label="Carbs" current={Math.round(data.macrosToday.carbs)} target={data.macroTargets.carbs} color="bg-amber-500" />
                  <MacroBar label="Fat" current={Math.round(data.macrosToday.fat)} target={data.macroTargets.fat} color="bg-rose-500" />
                </div>
              )}

              {/* Activity */}
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2 rounded-lg bg-card border border-border/50 p-3">
                  <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground">Last Active</p>
                    <p className="text-xs font-medium text-foreground truncate">
                      {data.lastActivity ? formatDistanceToNow(new Date(data.lastActivity), { addSuffix: true }) : "—"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-card border border-border/50 p-3">
                  <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground">Last Message</p>
                    <p className="text-xs font-medium text-foreground truncate">
                      {data.lastMessage ? formatDistanceToNow(new Date(data.lastMessage), { addSuffix: true }) : "—"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">Failed to load client data</div>
          )}
        </DialogContent>
      </Dialog>

      {/* Deactivate Confirmation */}
      <AlertDialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate {clientName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will prevent the client from logging in. Their data will be preserved and you can reactivate them later from the Deactivated tab.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleAction("deactivate")}
              disabled={actionLoading}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <UserX className="h-4 w-4 mr-2" />}
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={(v) => { setDeleteOpen(v); if (!v) setDeleteConfirmText(""); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Permanently Delete {clientName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the client's account, all their data, and remove them from authentication. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <p className="text-sm text-muted-foreground mb-2">Type <strong>DELETE</strong> to confirm:</p>
            <Input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              className="font-mono"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleAction("delete")}
              disabled={actionLoading || deleteConfirmText !== "DELETE"}
              className="bg-destructive hover:bg-destructive/90"
            >
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default ClientPreviewDialog;
