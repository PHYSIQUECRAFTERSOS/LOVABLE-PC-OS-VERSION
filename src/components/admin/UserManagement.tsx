import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Users, Zap } from "lucide-react";
import { format, subDays } from "date-fns";

interface UserRow {
  userId: string;
  name: string;
  role: string;
  compliance: number;
  engagement: number;
  lastActive: string | null;
}

const UserManagement = () => {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [filter, setFilter] = useState<"all" | "coach" | "client">("all");

  useEffect(() => {
    const fetch = async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id, role");
      if (!roles) return;

      const userIds = roles.map(r => r.user_id);
      const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", userIds);

      const last7 = format(subDays(new Date(), 7), "yyyy-MM-dd");

      const results: UserRow[] = await Promise.all(
        roles.map(async (r) => {
          const profile = (profiles || []).find(p => p.user_id === r.user_id);

          // Compliance: completed sessions / total sessions in last 7 days
          const { data: sessions } = await supabase
            .from("workout_sessions")
            .select("completed_at, created_at")
            .eq("client_id", r.user_id)
            .gte("created_at", `${last7}T00:00:00`);

          const total = (sessions || []).length;
          const completed = (sessions || []).filter(s => s.completed_at).length;
          const compliance = total > 0 ? Math.round((completed / total) * 100) : 0;

          // Engagement: count of nutrition logs + workout sessions + checkins in last 7 days
          const { count: nutCount } = await supabase
            .from("nutrition_logs")
            .select("id", { count: "exact", head: true })
            .eq("client_id", r.user_id)
            .gte("created_at", `${last7}T00:00:00`);

          const { count: checkinCount } = await supabase
            .from("weekly_checkins")
            .select("id", { count: "exact", head: true })
            .eq("client_id", r.user_id)
            .gte("created_at", `${last7}T00:00:00`);

          const engagement = Math.min(100, ((nutCount || 0) + total + (checkinCount || 0)) * 5);

          // Last activity
          const lastActive = sessions && sessions.length > 0
            ? sessions.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]?.created_at
            : null;

          return {
            userId: r.user_id,
            name: profile?.full_name || "User",
            role: r.role,
            compliance,
            engagement,
            lastActive,
          };
        })
      );

      setUsers(results);
    };
    fetch();
  }, []);

  const filtered = users.filter(u => filter === "all" || u.role === filter);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" /> All Users
          </CardTitle>
          <div className="flex gap-1">
            {(["all", "coach", "client"] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                  filter === f ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                {f === "all" ? "All" : f === "coach" ? "Coaches" : "Clients"}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {/* Header */}
          <div className="grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wider text-muted-foreground px-3 py-2 border-b border-border">
            <div className="col-span-4">User</div>
            <div className="col-span-2 text-center">Role</div>
            <div className="col-span-2 text-center">Compliance</div>
            <div className="col-span-2 text-center">Engagement</div>
            <div className="col-span-2 text-center">Last Active</div>
          </div>

          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No users found</p>
          )}

          {filtered.map(u => (
            <div key={u.userId} className="grid grid-cols-12 gap-2 items-center px-3 py-2.5 rounded-lg hover:bg-secondary/50 transition-colors">
              <div className="col-span-4 flex items-center gap-2 min-w-0">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="text-xs">{u.name.charAt(0)}</AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium text-foreground truncate">{u.name}</span>
              </div>
              <div className="col-span-2 text-center">
                <Badge variant={u.role === "coach" ? "default" : u.role === "admin" ? "destructive" : "secondary"} className="text-[10px]">
                  {u.role}
                </Badge>
              </div>
              <div className="col-span-2 text-center">
                <span className={`text-sm font-bold ${u.compliance >= 80 ? "text-primary" : u.compliance >= 50 ? "text-foreground" : "text-destructive"}`}>
                  {u.compliance}%
                </span>
              </div>
              <div className="col-span-2 text-center">
                <div className="flex items-center justify-center gap-1">
                  <Zap className="h-3 w-3 text-primary" />
                  <span className="text-sm font-medium text-foreground">{u.engagement}</span>
                </div>
              </div>
              <div className="col-span-2 text-center text-xs text-muted-foreground">
                {u.lastActive ? format(new Date(u.lastActive), "MMM d") : "—"}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default UserManagement;
