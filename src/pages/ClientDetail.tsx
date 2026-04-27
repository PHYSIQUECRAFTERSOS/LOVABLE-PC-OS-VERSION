import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from "@/components/ui/context-menu";
import TagAutomationDialog from "@/components/clients/TagAutomationDialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, MessageSquare, Dumbbell, UtensilsCrossed, CalendarDays,
  LayoutDashboard, Target, ClipboardList, BarChart3, BookOpen, Pill, Tag,
  ExternalLink, Hourglass, X,
} from "lucide-react";
import ClientWorkspaceSummary from "@/components/clients/workspace/SummaryTab";
import ClientWorkspaceTraining from "@/components/clients/workspace/TrainingTab";
import NutritionTargetsTab from "@/components/clients/workspace/NutritionTargetsTab";
import MealPlanTab from "@/components/clients/workspace/MealPlanTab";
import CalendarTab from "@/components/clients/workspace/CalendarTab";
import ClientWorkspaceProgress from "@/components/clients/workspace/ProgressTab";
import MessagesPopup from "@/components/clients/workspace/MessagesPopup";
import ClientCheckinHistory from "@/components/checkin/ClientCheckinHistory";
import OnboardingTab from "@/components/clients/workspace/OnboardingTab";
import ClientSupplementPlan from "@/components/nutrition/ClientSupplementPlan";
import PlanTab from "@/components/clients/workspace/PlanTab";
import QuickLogFAB from "@/components/dashboard/QuickLogFAB";
import AIImportButton from "@/components/import/AIImportButton";

interface ClientProfile {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  phone: string | null;
}

const VALID_TABS = new Set([
  "dash", "checkins", "onboarding", "calendar", "training",
  "nutrition", "mealplan", "supps", "plan", "progress", "messaging",
]);

const ClientDetail = () => {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id;
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (() => {
    const t = searchParams.get("tab");
    // Don't auto-activate the messaging tab — it now opens as a popup
    if (t === "messaging") return "dash";
    return t && VALID_TABS.has(t) ? t : "dash";
  })();
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [programName, setProgramName] = useState<string | null>(null);
  const [programType, setProgramType] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [pendingBannerDismissed, setPendingBannerDismissed] = useState(false);
  const previousTabRef = useRef<string>(initialTab);

  // Detect touch-only devices (skip context menu on mobile)
  const isTouchDevice = useMemo(() => {
    if (typeof window === "undefined") return false;
    return (
      "ontouchstart" in window &&
      (navigator.maxTouchPoints || 0) > 0 &&
      !window.matchMedia("(hover: hover)").matches
    );
  }, []);

  // Sync activeTab + messages popup when ?tab= or ?messages= changes
  useEffect(() => {
    const t = searchParams.get("tab");
    const messagesFlag = searchParams.get("messages");

    if (t === "messaging" || messagesFlag === "open") {
      setMessagesOpen(true);
    }

    if (t && VALID_TABS.has(t) && t !== "messaging" && t !== activeTab) {
      setActiveTab(t);
      previousTabRef.current = t;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleTabChange = (val: string) => {
    if (val === "messaging") {
      // Don't switch the active Tabs value; just open the popup and reflect in URL
      previousTabRef.current = activeTab;
      setMessagesOpen(true);
      const next = new URLSearchParams(searchParams);
      next.set("messages", "open");
      next.delete("tab"); // strip stale ?tab=messaging if present
      setSearchParams(next, { replace: true });
      return;
    }

    setActiveTab(val);
    previousTabRef.current = val;
    if (searchParams.get("tab") || searchParams.get("messages")) {
      const next = new URLSearchParams(searchParams);
      next.delete("tab");
      next.delete("messages");
      setSearchParams(next, { replace: true });
    }
  };

  const handleMessagesOpenChange = (open: boolean) => {
    setMessagesOpen(open);
    if (!open && searchParams.get("messages")) {
      const next = new URLSearchParams(searchParams);
      next.delete("messages");
      next.delete("tab");
      setSearchParams(next, { replace: true });
    }
  };

  const buildTabUrl = useCallback(
    (tabValue: string) => {
      const base = `/clients/${clientId}`;
      if (tabValue === "dash") return base;
      if (tabValue === "messaging") return `${base}?messages=open`;
      return `${base}?tab=${tabValue}`;
    },
    [clientId],
  );

  const loadClientData = useCallback(async () => {
    if (!clientId || !userId) return;
    setLoading(true);
    const [profileRes, tagsRes, programRes, coachClientRes] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name, avatar_url, phone").eq("user_id", clientId).single(),
      supabase.from("client_tags").select("tag").eq("client_id", clientId).eq("coach_id", userId),
      supabase
        .from("client_program_assignments")
        .select("program_id, programs(name)")
        .eq("client_id", clientId)
        .eq("status", "active")
        .limit(1)
        .maybeSingle(),
      supabase.from("coach_clients").select("program_type, status").eq("client_id", clientId).eq("coach_id", userId).maybeSingle(),
    ]);
    setProfile(profileRes.data as ClientProfile | null);
    setTags((tagsRes.data || []).map((t: any) => t.tag));
    setProgramName((programRes.data as any)?.programs?.name || null);
    setProgramType((coachClientRes.data as any)?.program_type || null);
    setIsPending((coachClientRes.data as any)?.status === "pending");
    setLoading(false);
  }, [clientId, userId]);

  useEffect(() => { loadClientData(); }, [loadClientData]);

  if (loading) {
    return (
      <AppLayout>
        <div className="space-y-6 animate-fade-in">
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
          <Skeleton className="h-[400px] w-full rounded-xl" />
        </div>
      </AppLayout>
    );
  }

  if (!profile) {
    return (
      <AppLayout>
        <div className="text-center py-20">
          <p className="text-muted-foreground">Client not found.</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate("/clients")}>
            Back to Clients
          </Button>
        </div>
      </AppLayout>
    );
  }

  const tabItems = [
    { value: "dash", label: "Dash", icon: LayoutDashboard },
    { value: "checkins", label: "Check-Ins", icon: ClipboardList },
    { value: "onboarding", label: "Onboarding", icon: BookOpen },
    { value: "calendar", label: "Calendar", icon: CalendarDays },
    { value: "training", label: "Training", icon: Dumbbell },
    { value: "nutrition", label: "Nutrition", icon: Target },
    { value: "mealplan", label: "Meal Plan", icon: ClipboardList },
    { value: "supps", label: "Supps", icon: Pill },
    { value: "plan", label: "Plan", icon: BookOpen },
    { value: "progress", label: "Progress", icon: BarChart3 },
    { value: "messaging", label: "Messages", icon: MessageSquare },
  ];

  const renderTrigger = (tab: typeof tabItems[number]) => {
    const trigger = (
      <TabsTrigger value={tab.value} className="gap-1.5 shrink-0">
        <tab.icon className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{tab.label}</span>
      </TabsTrigger>
    );

    if (isTouchDevice) return trigger;

    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>{trigger}</ContextMenuTrigger>
        <ContextMenuContent className="min-w-[180px]">
          <ContextMenuItem
            onSelect={() =>
              window.open(buildTabUrl(tab.value), "_blank", "noopener,noreferrer")
            }
            className="gap-2 cursor-pointer"
          >
            <ExternalLink className="h-4 w-4" />
            Open in new tab
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/clients")} className="shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Avatar className="h-12 w-12 border-2 border-primary/20">
            <AvatarImage src={profile.avatar_url || undefined} alt={profile.full_name || ""} />
            <AvatarFallback className="text-lg font-bold bg-primary/10 text-primary">
              {(profile.full_name || "C").charAt(0)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-display text-xl font-bold text-foreground truncate">
                {profile.full_name || "Client"}
              </h1>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5"
                onClick={() => setTagDialogOpen(true)}
              >
                <Tag className="h-3.5 w-3.5" />
                Tags
              </Button>
              <AIImportButton entryPoint="client" clientId={clientId} importType="any" />
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5"
                onClick={() => handleTabChange("messaging")}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Message
              </Button>
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {programName && (
                <Badge variant="secondary" className="text-[10px]">
                  <Dumbbell className="h-2.5 w-2.5 mr-1" />
                  {programName}
                </Badge>
              )}
              {programType && (
                <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
                  <ClipboardList className="h-2.5 w-2.5 mr-1" />
                  {programType}
                </Badge>
              )}
              {tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="outline" className="text-[10px]">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        {/* Workspace Tabs */}
        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
          <TabsList className="w-full justify-start overflow-x-auto flex-nowrap">
            {tabItems.map((tab) => (
              <div key={tab.value} className="contents">
                {renderTrigger(tab)}
              </div>
            ))}
          </TabsList>

          <TabsContent value="dash">
            <ClientWorkspaceSummary clientId={clientId!} />
          </TabsContent>
          <TabsContent value="checkins">
            <ClientCheckinHistory clientId={clientId!} />
          </TabsContent>
          <TabsContent value="onboarding">
            <OnboardingTab clientId={clientId!} />
          </TabsContent>
          <TabsContent value="calendar">
            <CalendarTab clientId={clientId!} />
          </TabsContent>
          <TabsContent value="training">
            <ClientWorkspaceTraining clientId={clientId!} />
          </TabsContent>
          <TabsContent value="nutrition">
            <NutritionTargetsTab clientId={clientId!} />
          </TabsContent>
          <TabsContent value="mealplan">
            <MealPlanTab clientId={clientId!} />
          </TabsContent>
          <TabsContent value="supps">
            <ClientSupplementPlan clientId={clientId!} />
          </TabsContent>
          <TabsContent value="plan">
            <PlanTab clientId={clientId!} />
          </TabsContent>
          <TabsContent value="progress">
            <ClientWorkspaceProgress clientId={clientId!} />
          </TabsContent>
          {/* Messages tab content intentionally omitted — opens in MessagesPopup */}
        </Tabs>
      </div>
      <QuickLogFAB clientId={clientId} />
      <TagAutomationDialog
        open={tagDialogOpen}
        onOpenChange={setTagDialogOpen}
        clientId={clientId!}
        clientName={profile.full_name || "Client"}
        onTagsChanged={loadClientData}
      />
      <MessagesPopup
        open={messagesOpen}
        onOpenChange={handleMessagesOpenChange}
        clientId={clientId!}
        clientName={profile.full_name || "Client"}
        clientAvatar={profile.avatar_url}
      />
    </AppLayout>
  );
};

export default ClientDetail;
