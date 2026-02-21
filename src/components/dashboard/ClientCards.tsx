import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import UserAvatar from "@/components/profile/UserAvatar";
import { Users, TrendingUp, Zap } from "lucide-react";
import { subDays, format } from "date-fns";

interface ClientData {
  id: string;
  name: string;
  avatar_url?: string;
  compliance: number;
  streak: number;
  weight?: number;
  lastCheckIn?: string;
}

const ClientCards = () => {
  const { user } = useAuth();
  const [clients, setClients] = useState<ClientData[]>([]);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      // Get coach's clients
      const { data: assignments } = await supabase
        .from("coach_clients")
        .select("client_id")
        .eq("coach_id", user.id)
        .eq("status", "active");

      if (!assignments?.length) {
        setClients([]);
        return;
      }

      const clientIds = assignments.map((a) => a.client_id);

      // Fetch client profiles
      const { data: profiles } = await supabase.from("profiles").select("*").in("user_id", clientIds);

      // Fetch compliance for each
      const last7Days = Array.from({ length: 7 }, (_, i) => format(subDays(new Date(), i), "yyyy-MM-dd")).reverse();

      const clientsData = await Promise.all(
        (profiles || []).map(async (p) => {
          const { data: sessions } = await supabase
            .from("workout_sessions")
            .select("created_at, completed_at")
            .eq("client_id", p.user_id)
            .gte("created_at", `${last7Days[0]}T00:00:00`);

          const completed = (sessions || []).filter((s) => s.completed_at).length;
          const compliance = Math.round((completed / Math.max((sessions || []).length, 1)) * 100);

          let streak = 0;
          for (let i = 6; i >= 0; i--) {
            const dayComplete = (sessions || []).some(
              (s) => format(new Date(s.created_at), "yyyy-MM-dd") === last7Days[i] && s.completed_at
            );
            if (dayComplete) streak++;
            else break;
          }

          const { data: weight } = await supabase
            .from("weight_logs")
            .select("weight")
            .eq("client_id", p.user_id)
            .order("logged_at", { ascending: false })
            .limit(1);

          const { data: checkin } = await supabase
            .from("weekly_checkins")
            .select("week_date")
            .eq("client_id", p.user_id)
            .order("week_date", { ascending: false })
            .limit(1);

          return {
            id: p.user_id,
            name: p.full_name || "Client",
            avatar_url: p.avatar_url,
            compliance,
            streak,
            weight: weight?.[0]?.weight,
            lastCheckIn: checkin?.[0]?.week_date,
          };
        })
      );

      setClients(clientsData);
    };
    fetch();
  }, [user]);

  if (clients.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" /> Clients
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No active clients assigned</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
        <Users className="h-5 w-5" /> Your Clients
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {clients.map((client) => (
          <Card key={client.id} className="hover:border-primary/30 transition-colors">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <UserAvatar src={client.avatar_url} name={client.name} className="h-10 w-10" />
                  <div>
                    <p className="font-medium text-foreground text-sm">{client.name}</p>
                    <p className="text-xs text-muted-foreground">{client.id.slice(0, 8)}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Compliance</span>
                  <span className="font-bold text-primary">{client.compliance}%</span>
                </div>

                <div className="w-full bg-secondary h-1.5 rounded-full overflow-hidden">
                  <div className="h-full bg-primary transition-all" style={{ width: `${client.compliance}%` }} />
                </div>

                <div className="flex items-center gap-2 text-xs text-primary font-bold pt-1">
                  <Zap className="h-3 w-3" /> {client.streak} day streak
                </div>
              </div>

              {client.weight && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-xs text-muted-foreground">Latest Weight</p>
                  <p className="font-bold text-foreground">{client.weight}</p>
                </div>
              )}

              {client.lastCheckIn && (
                <div className="mt-2 text-xs text-muted-foreground">
                  Check-in: {format(new Date(client.lastCheckIn), "MMM d")}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default ClientCards;
