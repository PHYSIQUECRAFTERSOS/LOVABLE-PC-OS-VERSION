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
} from "lucide-react";
import { cn } from "@/lib/utils";

const AppLayout = ({ children }: { children: React.ReactNode }) => {
  const { role, signOut, user } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const navItems = [
    { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { to: "/training", icon: Dumbbell, label: "Training" },
    { to: "/nutrition", icon: UtensilsCrossed, label: "Nutrition" },
    { to: "/analytics", icon: Activity, label: "Analytics" },
    { to: "/messages", icon: MessageSquare, label: "Messages" },
    { to: "/progress", icon: BarChart3, label: "Progress" },
    { to: "/calendar", icon: CalendarDays, label: "Calendar" },
    { to: "/profile", icon: User, label: "Profile" },
  ];

  if (role === "admin") {
    navItems.push({ to: "/admin", icon: Shield, label: "Admin" });
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col border-r border-border bg-card">
        <div className="flex h-16 items-center px-6 border-b border-border">
          <h1 className="font-display text-lg font-bold tracking-tight">
            PHYSIQUE <span className="text-gradient-gold">CRAFTERS</span>
          </h1>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
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
          ))}
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
        <main className="flex-1 overflow-y-auto p-4 md:p-8 pb-20 md:pb-8">
          {children}
        </main>

        {/* Mobile Bottom Nav */}
        <nav className="fixed bottom-0 left-0 right-0 z-50 flex md:hidden border-t border-border bg-card/95 backdrop-blur-sm">
          {navItems.slice(0, 5).map((item) => (
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
