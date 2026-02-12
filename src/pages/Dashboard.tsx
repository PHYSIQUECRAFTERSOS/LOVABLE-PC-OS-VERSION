import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dumbbell, UtensilsCrossed, TrendingUp, Flame } from "lucide-react";

const Dashboard = () => {
  const { role, user } = useAuth();

  return (
    <AppLayout>
      <div className="animate-fade-in space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            {role === "coach" ? "Coach Dashboard" : role === "admin" ? "Admin Dashboard" : "Your Dashboard"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Welcome back. Here's your overview.
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { label: "Today's Workout", value: "Push Day", icon: Dumbbell, accent: true },
            { label: "Macros Left", value: "1,240 cal", icon: UtensilsCrossed },
            { label: "Weekly Streak", value: "5 days", icon: Flame },
            { label: "Compliance", value: "92%", icon: TrendingUp },
          ].map((stat) => (
            <Card key={stat.label} className={stat.accent ? "border-primary/30 glow-gold" : ""}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {stat.label}
                </CardTitle>
                <stat.icon className={`h-4 w-4 ${stat.accent ? "text-primary" : "text-muted-foreground"}`} />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold font-display text-foreground">{stat.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {role === "coach" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Your Clients</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Client list and compliance overview will appear here.
              </p>
            </CardContent>
          </Card>
        )}

        {role === "admin" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Platform Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Retention, churn, and engagement metrics will appear here.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
};

export default Dashboard;
