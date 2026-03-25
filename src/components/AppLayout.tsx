import { useAuth } from "@/hooks/useAuth";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Dumbbell,
  UtensilsCrossed,
  MessageSquare,
  BarChart3,
  User,
  LogOut,
  LayoutDashboard,
  Shield,
  CalendarDays,
  Users,
  Trophy,
  Flame,
  Library,
  Settings,
  UsersRound,
  Menu,
  CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import { useActiveSession } from "@/hooks/useActiveSession";
import UnfinishedWorkoutBanner from "@/components/workout/UnfinishedWorkoutBanner";

interface NavItem {
  to: string;
  icon: React.ElementType;
  label: string;
}

const AppLayout = ({ children }: { children: React.ReactNode }) => {
  const { role, roleLoading, signOut, user } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { activeSession, online, dismiss: dismissBanner } = useActiveSession();
  const [unreadCount, setUnreadCount] = useState(0);

  // Fetch unread message count
  const fetchUnread = useCallback(async () => {
    if (!user) return;
    const isCoach = role === "coach" || role === "admin";

    if (isCoach) {
      // Count threads with unread messages for coach
      const { data: threads } = await (supabase as any)
        .from("message_threads")
        .select("id, updated_at, coach_last_seen_at")
        .eq("coach_id", user.id);
      const count = (threads || []).filter(
        (t: any) => !t.coach_last_seen_at || new Date(t.updated_at) > new Date(t.coach_last_seen_at)
      ).length;
      setUnreadCount(count);
    } else {
      // Count unread messages for client
      const { count } = await (supabase as any)
        .from("thread_messages")
        .select("id, message_threads!inner(client_id)", { count: "exact", head: true })
        .eq("message_threads.client_id", user.id)
        .neq("sender_id", user.id)
        .is("read_at", null);
      setUnreadCount(count || 0);
    }
  }, [user, role]);

  useEffect(() => {
    fetchUnread();

    // Subscribe to realtime changes on thread_messages
    const channel = supabase
      .channel("unread-badge")
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "thread_messages" },
        () => fetchUnread()
      )
      .on(
        "postgres_changes" as any,
        { event: "UPDATE", schema: "public", table: "message_threads" },
        () => fetchUnread()
      )
      .subscribe();

    // Listen for manual "messages-read" events from ThreadChatView
    const onRead = () => fetchUnread();
    window.addEventListener("messages-read", onRead);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener("messages-read", onRead);
    };
  }, [fetchUnread]);

  if (roleLoading || !role) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const isCoach = role === "coach" || role === "admin";

  const coachNav: NavItem[] = [
    { to: "/dashboard", icon: LayoutDashboard, label: "Overview" },
    { to: "/messages", icon: MessageSquare, label: "Messages" },
    { to: "/community", icon: UsersRound, label: "Community" },
    { to: "/challenges", icon: Flame, label: "Challenges" },
    { to: "/ranked", icon: Trophy, label: "Ranked" },
    { to: "/clients", icon: Users, label: "Clients" },
    { to: "/team", icon: Shield, label: "Team" },
    { to: "/libraries", icon: Library, label: "Master Libraries" },
  ];

  const coachSecondaryNav: NavItem[] = [
    { to: "/profile", icon: Settings, label: "Settings" },
  ];

  if (role === "admin") {
    coachSecondaryNav.push({ to: "/admin", icon: Shield, label: "Admin" });
  }

  const clientNav: NavItem[] = [
    { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { to: "/calendar", icon: CalendarDays, label: "Calendar" },
    { to: "/training", icon: Dumbbell, label: "Training" },
    { to: "/nutrition", icon: UtensilsCrossed, label: "Nutrition" },
    { to: "/progress", icon: BarChart3, label: "Progress" },
    { to: "/community", icon: UsersRound, label: "Community" },
    { to: "/messages", icon: MessageSquare, label: "Messages" },
    { to: "/challenges", icon: Flame, label: "Challenges" },
    { to: "/ranked", icon: Trophy, label: "Ranked" },
    
    { to: "/profile", icon: User, label: "Settings" },
  ];

  const mobileBottomItems: NavItem[] = isCoach
    ? [
        { to: "/dashboard", icon: LayoutDashboard, label: "Overview" },
        { to: "/clients", icon: Users, label: "Clients" },
        { to: "/messages", icon: MessageSquare, label: "Messages" },
        { to: "/community", icon: UsersRound, label: "Community" },
      ]
    : [
        { to: "/dashboard", icon: LayoutDashboard, label: "Home" },
        { to: "/calendar", icon: CalendarDays, label: "Calendar" },
        { to: "/training", icon: Dumbbell, label: "Training" },
        { to: "/nutrition", icon: UtensilsCrossed, label: "Nutrition" },
        { to: "/messages", icon: MessageSquare, label: "Messages" },
      ];

  const sidebarItems = isCoach ? coachNav : clientNav;
  const secondaryItems = isCoach ? coachSecondaryNav : [];

  const renderNavLink = (item: NavItem, onClick?: () => void) => (
    <NavLink
      key={item.to}
      to={item.to}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
          isActive
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-secondary hover:text-foreground"
        )
      }
    >
      <item.icon className="h-4 w-4" />
      <span className="flex-1">{item.label}</span>
      {item.to === "/messages" && unreadCount > 0 && (
        <span className="min-w-[20px] h-5 flex items-center justify-center rounded-full bg-primary text-[11px] font-bold text-black px-1.5">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </NavLink>
  );

  return (
    <div className="fixed inset-0 flex overflow-hidden bg-background safe-left safe-right">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col border-r border-border bg-card">
        <div className="flex h-16 items-center px-6 border-b border-border">
          <h1 className="font-display text-lg font-bold tracking-tight">
            PHYSIQUE <span className="text-gradient-gold">CRAFTERS</span>
          </h1>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {sidebarItems.map((item) => renderNavLink(item))}

          {secondaryItems.length > 0 && (
            <>
              <div className="my-3 border-t border-border" />
              <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                Tools
              </p>
              {secondaryItems.map((item) => renderNavLink(item))}
            </>
          )}
        </nav>

        <div className="border-t border-border p-3">
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Mobile Header — safe-area aware */}
        <header className="flex md:hidden items-center justify-between h-auto min-h-[56px] px-4 border-b border-border bg-card safe-top">
          <h1 className="font-display text-base font-bold tracking-tight min-w-0 truncate">
            PHYSIQUE <span className="text-gradient-gold">CRAFTERS</span>
          </h1>
          <div className="flex items-center gap-1 shrink-0">
            {/* Direct Settings shortcut for discoverability */}
            <button
              onClick={() => navigate("/profile")}
              className="p-2 text-muted-foreground hover:text-foreground"
              aria-label="Settings"
            >
              <Settings className="h-5 w-5" />
            </button>
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <button className="p-2 text-muted-foreground hover:text-foreground">
                  <Menu className="h-5 w-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="w-64 bg-card p-0">
                <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
                <nav className="flex flex-col h-full max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom))]">
                  <div className="flex-1 px-3 pt-[calc(env(safe-area-inset-top,0px)+1.5rem)] pb-6 space-y-1 overflow-y-auto">
                    {sidebarItems.map((item) => renderNavLink(item, () => setMobileOpen(false)))}
                    {secondaryItems.length > 0 && (
                      <>
                        <div className="my-3 border-t border-border" />
                        {secondaryItems.map((item) => renderNavLink(item, () => setMobileOpen(false)))}
                      </>
                    )}
                  </div>
                  <div className="border-t border-border p-3">
                    <button
                      onClick={() => { setMobileOpen(false); handleSignOut(); }}
                      className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign Out
                    </button>
                  </div>
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </header>

        {activeSession && (
          <UnfinishedWorkoutBanner session={activeSession} online={online} onDismiss={dismissBanner} />
        )}

        <main className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 md:pb-8">
          {children}
        </main>

        {/* Mobile Bottom Nav — safe-area aware */}
        <nav className="fixed bottom-0 left-0 right-0 z-50 flex md:hidden border-t border-border bg-card/95 backdrop-blur-sm safe-bottom">
          {mobileBottomItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex flex-1 flex-col items-center gap-0.5 pt-2.5 pb-1.5 text-[10px] font-medium transition-colors relative",
                  isActive ? "text-primary" : "text-muted-foreground"
                )
              }
            >
              <div className="relative">
                <item.icon className="h-6 w-6" />
                {item.to === "/messages" && unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-primary text-[10px] font-bold text-black px-1">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </div>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
};

export default AppLayout;
