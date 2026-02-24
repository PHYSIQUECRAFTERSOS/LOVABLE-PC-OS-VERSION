import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import UserAvatar from "@/components/profile/UserAvatar";
import { Users, Zap } from "lucide-react";
import { subDays, format } from "date-fns";
import { useDataFetch } from "@/hooks/useDataFetch";
import { GridSkeleton, RetryBanner } from "@/components/ui/data-skeleton";

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

  const { data: clients = [], loading, error, timedOut, refetch } = useDataFetch<ClientData[]>({
    queryKey: `coach-clients-${user?.id}`,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    timeout: 5000,
    fallback: [],
    queryFn: async (signal) => {
      if (!user) return [];

      const { data: assignments } = await supabase
        .from("coach_clients")
        .select("client_id")
        .eq("coach_id", user.id)
        .eq("status", "active")
        .abortSignal(signal);

      if (!assignments?.length) return [];

      const clientIds = assignments.map((a) => a.client_id);

      // Fetch profiles + all sessions + weights + checkins in parallel
      const last7Start = format(subDays(new Date(), 6), "yyyy-MM-dd");
      const last7Days = Array.from({ length: 7 }, (_, i) => format(subDays(new Date(), 6 - i), "yyyy-MM-dd"));

      const [profilesRes, sessionsRes, weightsRes, checkinsRes] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name, avatar_url").in("user_id", clientIds).abortSignal(signal),
        supabase.from("workout_sessions").select("client_id, created_at, completed_at").in("client_id", clientIds).gte("created_at", `${last7Start}T00:00:00`).abortSignal(signal),
        supabase.from("weight_logs").select("client_id, weight, logged_at").in("client_id", clientIds).order("logged_at", { ascending: false }).abortSignal(signal),
        supabase.from("weekly_checkins").select("client_id, week_date").in("client_id", clientIds).order("week_date", { ascending: false }).abortSignal(signal),
      ]);

      const profiles = profilesRes.data || [];
      const allSessions = sessionsRes.data || [];
      const allWeights = weightsRes.data || [];
      const allCheckins = checkinsRes.data || [];

      return profiles.map((p) => {
        const sessions = allSessions.filter((s) => s.client_id === p.user_id);
        const completed = sessions.filter((s) => s.completed_at).length;
        const compliance = Math.round((completed / Math.max(sessions.length, 1)) * 100);

        let streak = 0;
        for (let i = 6; i >= 0; i--) {
          if (sessions.some((s) => format(new Date(s.created_at), "yyyy-MM-dd") === last7Days[i] && s.completed_at)) streak++;
          else break;
        }

        const latestWeight = allWeights.find((w) => w.client_id === p.user_id);
        const latestCheckin = allCheckins.find((c) => c.client_id === p.user_id);

        return {
          id: p.user_id,
          name: p.full_name || "Client",
          avatar_url: p.avatar_url,
          compliance,
          streak,
          weight: latestWeight?.weight,
          lastCheckIn: latestCheckin?.week_date,
        };
      });
    },
  });

  if (loading && !clients.length) return <GridSkeleton cards={3} />;
  if ((error || timedOut) && !clients.length) return <RetryBanner onRetry={refetch} />;

  if (clients.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground flex items-center gap-2"><Users className="h-5 w-5" /> No active clients assigned</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2"><Users className="h-5 w-5" /> Your Clients</h2>
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
                <div className="mt-2 text-xs text-muted-foreground">Check-in: {format(new Date(client.lastCheckIn), "MMM d")}</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default ClientCards;
