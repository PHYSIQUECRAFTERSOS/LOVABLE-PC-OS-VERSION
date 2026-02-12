import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, UserCheck, UserX, TrendingUp } from "lucide-react";

interface PlatformStats {
  totalUsers: number;
  totalCoaches: number;
  totalClients: number;
  activeThisWeek: number;
  retentionRate: number;
  churnRate: number;
}

const PlatformMetrics = () => {
  const [stats, setStats] = useState<PlatformStats>({
    totalUsers: 0, totalCoaches: 0, totalClients: 0,
    activeThisWeek: 0, retentionRate: 0, churnRate: 0,
  });

  useEffect(() => {
    const fetch = async () => {
      // Total users by role
      const { data: roles } = await supabase.from("user_roles").select("role");
      const coaches = (roles || []).filter(r => r.role === "coach").length;
      const clients = (roles || []).filter(r => r.role === "client").length;
      const total = (roles || []).length;

      // Active this week (logged a workout or nutrition in last 7 days)
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const weekStr = weekAgo.toISOString();

      const { data: activeSessions } = await supabase
        .from("workout_sessions")
        .select("client_id")
        .gte("created_at", weekStr);

      const { data: activeLogs } = await supabase
        .from("nutrition_logs")
        .select("client_id")
        .gte("created_at", weekStr);

      const activeIds = new Set([
        ...(activeSessions || []).map(s => s.client_id),
        ...(activeLogs || []).map(l => l.client_id),
      ]);

      const activeThisWeek = activeIds.size;
      const retentionRate = clients > 0 ? Math.round((activeThisWeek / clients) * 100) : 0;
      const churnRate = clients > 0 ? Math.max(0, 100 - retentionRate) : 0;

      setStats({ totalUsers: total, totalCoaches: coaches, totalClients: clients, activeThisWeek, retentionRate, churnRate });
    };
    fetch();
  }, []);

  const metrics = [
    { label: "Total Users", value: stats.totalUsers, icon: Users, color: "text-foreground" },
    { label: "Coaches", value: stats.totalCoaches, icon: UserCheck, color: "text-primary" },
    { label: "Clients", value: stats.totalClients, icon: Users, color: "text-foreground" },
    { label: "Active This Week", value: stats.activeThisWeek, icon: TrendingUp, color: "text-primary" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {metrics.map(m => (
          <Card key={m.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{m.label}</CardTitle>
              <m.icon className={`h-4 w-4 ${m.color}`} />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold font-display text-foreground">{m.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card className="border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Retention Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-primary">{stats.retentionRate}%</p>
            <div className="mt-2 w-full bg-secondary h-2 rounded-full overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${stats.retentionRate}%` }} />
            </div>
          </CardContent>
        </Card>
        <Card className={stats.churnRate > 30 ? "border-destructive/30" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Churn Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-3xl font-bold ${stats.churnRate > 30 ? "text-destructive" : "text-foreground"}`}>{stats.churnRate}%</p>
            <div className="mt-2 w-full bg-secondary h-2 rounded-full overflow-hidden">
              <div className="h-full bg-destructive/60 transition-all" style={{ width: `${stats.churnRate}%` }} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PlatformMetrics;
