import { useAuth } from "@/hooks/useAuth";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Dumbbell,
  UtensilsCrossed,
  MessageSquare,
  BarChart3,
  Activity,
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";

interface NavItem {
  to: string;
  icon: React.ElementType;
  label: string;
}

const AppLayout = ({ children }: { children: React.ReactNode }) => {
  const { role, roleLoading, signOut, user } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Never render layout until role is confirmed — prevents cross-rendering
  if (roleLoading || !role) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  console.log("[AppLayout] Rendering with role:", role);

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const isCoach = role === "coach" || role === "admin";

  // Coach/Admin navigation — Trainerize-style
  const coachNav: NavItem[] = [
    { to: "/dashboard", icon: LayoutDashboard, label: "Overview" },
    { to: "/messages", icon: MessageSquare, label: "Messages" },
    { to: "/community", icon: UsersRound, label: "Community" },
    { to: "/challenges", icon: Flame, label: "Challenges" },
    { to: "/clients", icon: Users, label: "Clients" },
    { to: "/team", icon: Shield, label: "Team" },
    { to: "/libraries", icon: Library, label: "Master Libraries" },
  ];

  const coachSecondaryNav: NavItem[] = [
    { to: "/training", icon: Dumbbell, label: "Training" },
    { to: "/nutrition", icon: UtensilsCrossed, label: "Nutrition" },
    { to: "/analytics", icon: Activity, label: "Analytics" },
    { to: "/progress", icon: BarChart3, label: "Progress" },
    { to: "/calendar", icon: CalendarDays, label: "Calendar" },
    { to: "/profile", icon: Settings, label: "Settings" },
  ];

  if (role === "admin") {
    coachSecondaryNav.push({ to: "/admin", icon: Shield, label: "Admin" });
  }

  // Client navigation — mobile-first
  const clientNav: NavItem[] = [
    { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { to: "/training", icon: Dumbbell, label: "Training" },
    { to: "/nutrition", icon: UtensilsCrossed, label: "Nutrition" },
    { to: "/progress", icon: BarChart3, label: "Progress" },
    { to: "/community", icon: UsersRound, label: "Community" },
    { to: "/messages", icon: MessageSquare, label: "Messages" },
    { to: "/challenges", icon: Flame, label: "Challenges" },
    { to: "/calendar", icon: CalendarDays, label: "Calendar" },
    { to: "/profile", icon: User, label: "Settings" },
  ];

  // Pick bottom nav items for mobile
  const mobileBottomItems: NavItem[] = isCoach
    ? [
        { to: "/dashboard", icon: LayoutDashboard, label: "Overview" },
        { to: "/clients", icon: Users, label: "Clients" },
        { to: "/messages", icon: MessageSquare, label: "Messages" },
        { to: "/community", icon: UsersRound, label: "Community" },
      ]
    : [
        { to: "/dashboard", icon: LayoutDashboard, label: "Home" },
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
      {item.label}
    </NavLink>
  );

  return (
    <div className="flex min-h-screen bg-background">
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
      <div className="flex flex-1 flex-col">
        {/* Mobile Header */}
        <header className="flex md:hidden items-center justify-between h-14 px-4 border-b border-border bg-card">
          <h1 className="font-display text-base font-bold tracking-tight">
            PHYSIQUE <span className="text-gradient-gold">CRAFTERS</span>
          </h1>
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button className="p-2 text-muted-foreground hover:text-foreground">
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-64 bg-card p-0">
              <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
              <nav className="flex flex-col h-full">
                <div className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
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
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-8 pb-20 md:pb-8">
          {children}
        </main>

        {/* Mobile Bottom Nav */}
        <nav className="fixed bottom-0 left-0 right-0 z-50 flex md:hidden border-t border-border bg-card/95 backdrop-blur-sm">
          {mobileBottomItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground"
                )
              }
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
};

export default AppLayout;
