import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from "react";
import { useParams, useNavigate, useSearchParams, useLocation } from "react-router-dom";
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
import MessagesPopup from "@/components/clients/workspace/MessagesPopup";
import QuickLogFAB from "@/components/dashboard/QuickLogFAB";
import { getClientHeader, setClientHeader, type ClientHeaderData } from "@/lib/clientHeaderCache";

/* Lazy tab bundles — only the tab a coach actually opens is downloaded. */
const tabLoaders = {
  dash: () => import("@/components/clients/workspace/SummaryTab"),
  checkins: () => import("@/components/checkin/ClientCheckinHistory"),
  onboarding: () => import("@/components/clients/workspace/OnboardingTab"),
  calendar: () => import("@/components/clients/workspace/CalendarTab"),
  training: () => import("@/components/clients/workspace/TrainingTab"),
  nutrition: () => import("@/components/clients/workspace/NutritionTargetsTab"),
  mealplan: () => import("@/components/clients/workspace/MealPlanTab"),
  supps: () => import("@/components/nutrition/ClientSupplementPlan"),
  plan: () => import("@/components/clients/workspace/PlanTab"),
  progress: () => import("@/components/clients/workspace/ProgressTab"),
} as const;

const ClientWorkspaceSummary = lazy(tabLoaders.dash);
const ClientCheckinHistory = lazy(tabLoaders.checkins);
const OnboardingTab = lazy(tabLoaders.onboarding);
const CalendarTab = lazy(tabLoaders.calendar);
const ClientWorkspaceTraining = lazy(tabLoaders.training);
const NutritionTargetsTab = lazy(tabLoaders.nutrition);
const MealPlanTab = lazy(tabLoaders.mealplan);
const ClientSupplementPlan = lazy(tabLoaders.supps);
const PlanTab = lazy(tabLoaders.plan);
const ClientWorkspaceProgress = lazy(tabLoaders.progress);

const TabFallback = () => (
  <div className="space-y-3">
    <Skeleton className="h-24 w-full rounded-xl" />
    <Skeleton className="h-64 w-full rounded-xl" />
  </div>
);



interface ClientProfile {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  phone: string | null;
}

const LOOKAHEAD_OPTIONS: { value: number; label: string }[] = [
  { value: 7, label: "1 week ahead" },
  { value: 14, label: "2 weeks ahead" },
  { value: 21, label: "3 weeks ahead" },
  { value: 28, label: "4 weeks ahead" },
  { value: 42, label: "6 weeks ahead" },
  { value: 56, label: "8 weeks ahead" },
];

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
  const location = useLocation();
  // Name passed from the client list (router state) lets the header paint
  // before the profile query resolves.
  const hintedName = (location.state as { clientName?: string } | null)?.clientName || null;
  const cached = useMemo(() => getClientHeader(clientId), [clientId]);

  const [profile, setProfile] = useState<ClientProfile | null>(cached?.profile ?? null);
  const [loading, setLoading] = useState(!cached);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [programName, setProgramName] = useState<string | null>(cached?.programName ?? null);
  const [programType, setProgramType] = useState<string | null>(cached?.programType ?? null);
  const [tags, setTags] = useState<string[]>(cached?.tags ?? []);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [isPending, setIsPending] = useState(cached?.isPending ?? false);
  const [pendingBannerDismissed, setPendingBannerDismissed] = useState(false);
  const [lookaheadDays, setLookaheadDays] = useState<number>(cached?.lookaheadDays ?? 14);

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
    // Never blank an already-painted header: only show the skeleton on a cold load.
    if (!getClientHeader(clientId)) setLoading(true);
    const [profileRes, tagsRes, programRes, coachClientRes] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name, avatar_url, phone").eq("user_id", clientId).maybeSingle(),
      supabase.from("client_tags").select("tag").eq("client_id", clientId).eq("coach_id", userId),
      supabase
        .from("client_program_assignments")
        .select("program_id, programs(name)")
        .eq("client_id", clientId)
        .eq("status", "active")
        .limit(1)
        .maybeSingle(),
      supabase.from("coach_clients").select("program_type, status, calendar_lookahead_days").eq("client_id", clientId).eq("coach_id", userId).maybeSingle(),
    ]);
    const nextProfile = (profileRes.data as ClientProfile | null) ?? null;
    const nextTags = (tagsRes.data || []).map((t: any) => t.tag);
    const nextProgramName = (programRes.data as any)?.programs?.name || null;
    const nextProgramType = (coachClientRes.data as any)?.program_type || null;
    const nextPending = (coachClientRes.data as any)?.status === "pending";
    const la = (coachClientRes.data as any)?.calendar_lookahead_days;
    const nextLookahead = typeof la === "number" && la > 0 ? la : 14;

    setProfile(nextProfile);
    setNotFound(!nextProfile);
    setTags(nextTags);
    setProgramName(nextProgramName);
    setProgramType(nextProgramType);
    setIsPending(nextPending);
    setLookaheadDays(nextLookahead);
    setLoading(false);

    if (nextProfile) {
      setClientHeader(clientId, {
        profile: nextProfile,
        tags: nextTags,
        programName: nextProgramName,
        programType: nextProgramType,
        isPending: nextPending,
        lookaheadDays: nextLookahead,
      });
    }
  }, [clientId, userId]);


  const handleLookaheadChange = async (newDays: number) => {
    if (!clientId || !userId) return;
    const prev = lookaheadDays;
    setLookaheadDays(newDays); // optimistic
    const { error } = await supabase
      .from("coach_clients")
      .update({ calendar_lookahead_days: newDays })
      .eq("client_id", clientId)
      .eq("coach_id", userId);
    if (error) {
      console.error("[ClientDetail] lookahead update failed:", error);
      setLookaheadDays(prev);
    }
  };

  useEffect(() => { loadClientData(); }, [loadClientData]);

  // Kick off the active tab's chunk download in parallel with the header fetch.
  useEffect(() => {
    const loader = (tabLoaders as Record<string, (() => Promise<unknown>) | undefined>)[activeTab];
    loader?.().catch(() => { /* retried by Suspense on render */ });
  }, [activeTab]);

  if (notFound) {
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

  const displayName = profile?.full_name || hintedName || "";


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
    const prefetch = () => {
      const loader = (tabLoaders as Record<string, (() => Promise<unknown>) | undefined>)[tab.value];
      loader?.().catch(() => { /* ignore — Suspense retries on click */ });
    };
    const trigger = (
      <TabsTrigger
        value={tab.value}
        className="gap-1.5 shrink-0"
        onMouseEnter={prefetch}
        onTouchStart={prefetch}
      >
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
            <AvatarImage src={profile?.avatar_url || undefined} alt={displayName} />
            <AvatarFallback className="text-lg font-bold bg-primary/10 text-primary">
              {(displayName || "C").charAt(0)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-display text-xl font-bold text-foreground truncate">
                {displayName || (loading ? <Skeleton className="h-5 w-40 inline-block align-middle" /> : "Client")}
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
              {/* Calendar look-ahead: how many days into the future this
                  client can see on their own calendar/training views. */}
              <div className="inline-flex items-center gap-1 ml-1">
                <CalendarDays className="h-3 w-3 text-muted-foreground" />
                <select
                  value={lookaheadDays}
                  onChange={(e) => handleLookaheadChange(Number(e.target.value))}
                  className="text-[10px] bg-transparent border border-border rounded px-1.5 py-0.5 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                  title="How many days into the future this client can see on their calendar"
                >
                  {LOOKAHEAD_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      Sees {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Pending client banner */}
        {isPending && !pendingBannerDismissed && (
          <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
            <Hourglass className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">
                This client hasn't signed up yet
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Anything you build now — programs, meal plans, calendar events, supps, notes, messages — will be ready for them on first login.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 shrink-0"
              onClick={() => setPendingBannerDismissed(true)}
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

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
