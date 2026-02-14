import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  AlertTriangle,
  ShieldAlert,
  TrendingDown,
  MessageSquare,
  RefreshCw,
  Send,
  ChevronDown,
  ChevronUp,
  Activity,
  Loader2,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format, subDays } from "date-fns";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

interface RiskClient {
  clientId: string;
  name: string;
  score: number;
  riskLevel: string;
  signals: Record<string, unknown>;
  calculatedAt: string;
}

interface RiskHistoryPoint {
  date: string;
  score: number;
}

interface NudgeRecord {
  id: string;
  message: string;
  nudge_type: string;
  risk_level_at_send: string;
  sent_at: string;
  acknowledged_at: string | null;
  reengaged_at: string | null;
}

const riskColorMap: Record<string, string> = {
  low: "text-primary",
  moderate: "text-yellow-400",
  high: "text-orange-400",
  critical: "text-destructive",
};

const riskBadgeVariant = (level: string) => {
  if (level === "critical") return "destructive" as const;
  if (level === "high") return "destructive" as const;
  return "secondary" as const;
};

const RetentionPanel = () => {
  const [clients, setClients] = useState<RiskClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [expandedClient, setExpandedClient] = useState<string | null>(null);
  const [clientHistory, setClientHistory] = useState<RiskHistoryPoint[]>([]);
  const [clientNudges, setClientNudges] = useState<NudgeRecord[]>([]);
  const [customMessage, setCustomMessage] = useState("");
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  const fetchRiskScores = useCallback(async () => {
    setLoading(true);
    const today = format(new Date(), "yyyy-MM-dd");

    const { data: scores } = await supabase
      .from("client_risk_scores")
      .select("*")
      .eq("calculated_at", today)
      .order("score", { ascending: false });

    if (!scores || scores.length === 0) {
      setClients([]);
      setLoading(false);
      return;
    }

    const clientIds = scores.map((s) => s.client_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name")
      .in("user_id", clientIds);

    const profileMap = new Map(
      (profiles || []).map((p) => [p.user_id, p.full_name || "User"])
    );

    setClients(
      scores.map((s) => ({
        clientId: s.client_id,
        name: profileMap.get(s.client_id) || "User",
        score: s.score,
        riskLevel: s.risk_level,
        signals: (s.signals as Record<string, unknown>) || {},
        calculatedAt: s.calculated_at,
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRiskScores();
  }, [fetchRiskScores]);

  const runCalculation = async () => {
    setCalculating(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "calculate-risk-scores"
      );
      if (error) throw error;
      toast({ title: "Risk scores calculated", description: `${data?.results?.length || 0} clients processed` });
      await fetchRiskScores();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setCalculating(false);
  };

  const loadClientDetail = async (clientId: string) => {
    if (expandedClient === clientId) {
      setExpandedClient(null);
      return;
    }
    setExpandedClient(clientId);

    const fourteenDaysAgo = format(subDays(new Date(), 14), "yyyy-MM-dd");

    const [historyRes, nudgesRes] = await Promise.all([
      supabase
        .from("client_risk_scores")
        .select("calculated_at, score")
        .eq("client_id", clientId)
        .gte("calculated_at", fourteenDaysAgo)
        .order("calculated_at", { ascending: true }),
      supabase
        .from("retention_nudges")
        .select("*")
        .eq("client_id", clientId)
        .order("sent_at", { ascending: false })
        .limit(10),
    ]);

    setClientHistory(
      (historyRes.data || []).map((h) => ({
        date: format(new Date(h.calculated_at), "MM/dd"),
        score: h.score,
      }))
    );
    setClientNudges((nudgesRes.data as NudgeRecord[]) || []);
  };

  const sendIntervention = async (clientId: string) => {
    if (!customMessage.trim()) return;
    setSending(true);
    const { error } = await supabase.from("retention_nudges").insert({
      client_id: clientId,
      nudge_type: "coach_intervention",
      risk_level_at_send:
        clients.find((c) => c.clientId === clientId)?.riskLevel || "high",
      message: customMessage.trim(),
    });
    setSending(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Intervention sent" });
      setCustomMessage("");
      loadClientDetail(clientId);
    }
  };

  const atRisk = clients.filter((c) => c.riskLevel !== "low");
  const critical = clients.filter((c) => c.riskLevel === "critical");
  const high = clients.filter((c) => c.riskLevel === "high");
  const moderate = clients.filter((c) => c.riskLevel === "moderate");

  const signalLabels: Record<string, string> = {
    noLogin: "No activity 3+ days",
    noEngagement: "No engagement 5+ days",
    streakBroken: "Streak broken",
    missedCheckin: "Missed weekly check-in",
    workoutDecline: "Workout frequency decline",
    nutritionDecline: "Nutrition logging decline",
  };

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl font-bold text-foreground flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-primary" />
            Retention Intelligence
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Predictive churn detection & intervention tools
          </p>
        </div>
        <Button
          onClick={runCalculation}
          disabled={calculating}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          {calculating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {calculating ? "Calculating..." : "Recalculate"}
        </Button>
      </div>

      {/* Risk Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{clients.length}</p>
            <p className="text-xs text-muted-foreground">Total Clients</p>
          </CardContent>
        </Card>
        <Card className={critical.length > 0 ? "border-destructive/50" : ""}>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-destructive">{critical.length}</p>
            <p className="text-xs text-muted-foreground">Critical Risk</p>
          </CardContent>
        </Card>
        <Card className={high.length > 0 ? "border-orange-400/30" : ""}>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-orange-400">{high.length}</p>
            <p className="text-xs text-muted-foreground">High Risk</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-yellow-400">{moderate.length}</p>
            <p className="text-xs text-muted-foreground">Moderate Risk</p>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : clients.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Activity className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              No risk scores calculated yet. Click "Recalculate" to run the analysis.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="at-risk" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="at-risk" className="gap-2">
              <AlertTriangle className="h-4 w-4" /> At-Risk ({atRisk.length})
            </TabsTrigger>
            <TabsTrigger value="all" className="gap-2">
              <Activity className="h-4 w-4" /> All Clients
            </TabsTrigger>
          </TabsList>

          {[
            { key: "at-risk", list: atRisk },
            { key: "all", list: clients },
          ].map(({ key, list }) => (
            <TabsContent key={key} value={key} className="mt-4 space-y-2">
              {list.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No clients in this category
                </p>
              ) : (
                list.map((client) => (
                  <Card key={client.clientId} className={
                    client.riskLevel === "critical" ? "border-destructive/30" :
                    client.riskLevel === "high" ? "border-orange-400/20" : ""
                  }>
                    <div
                      className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-secondary/30 transition-colors rounded-t-lg"
                      onClick={() => loadClientDetail(client.clientId)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">
                            {client.name.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {client.name}
                          </p>
                          <div className="flex gap-1 mt-0.5 flex-wrap">
                            {Object.keys(client.signals)
                              .filter((k) => client.signals[k] === true)
                              .slice(0, 3)
                              .map((sig) => (
                                <span
                                  key={sig}
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground"
                                >
                                  {signalLabels[sig] || sig}
                                </span>
                              ))}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className={`text-lg font-bold ${riskColorMap[client.riskLevel]}`}>
                            {client.score}
                          </p>
                          <Badge variant={riskBadgeVariant(client.riskLevel)} className="text-[10px]">
                            {client.riskLevel}
                          </Badge>
                        </div>
                        {expandedClient === client.clientId ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>

                    {expandedClient === client.clientId && (
                      <CardContent className="pt-0 space-y-4">
                        {/* Risk Trend */}
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-2">
                            14-Day Risk Trend
                          </p>
                          {clientHistory.length > 1 ? (
                            <div className="h-32">
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={clientHistory}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 16%)" />
                                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: "hsl(0 0% 55%)" }} />
                                  <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "hsl(0 0% 55%)" }} />
                                  <Tooltip
                                    contentStyle={{
                                      backgroundColor: "hsl(0 0% 10%)",
                                      border: "1px solid hsl(0 0% 16%)",
                                      borderRadius: 8,
                                      color: "hsl(45 10% 90%)",
                                    }}
                                  />
                                  <Line
                                    type="monotone"
                                    dataKey="score"
                                    stroke="hsl(0 72% 50%)"
                                    strokeWidth={2}
                                    dot={{ r: 2 }}
                                  />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              Not enough history yet
                            </p>
                          )}
                        </div>

                        {/* Risk Score Bar */}
                        <div>
                          <div className="flex justify-between text-xs text-muted-foreground mb-1">
                            <span>Client Risk Index</span>
                            <span>{client.score}/100</span>
                          </div>
                          <Progress value={client.score} className="h-2" />
                        </div>

                        {/* Active Signals */}
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-2">
                            Active Signals
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            {Object.entries(client.signals)
                              .filter(([, v]) => v === true)
                              .map(([key]) => (
                                <div
                                  key={key}
                                  className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-md bg-destructive/10 text-destructive"
                                >
                                  <TrendingDown className="h-3 w-3" />
                                  {signalLabels[key] || key}
                                </div>
                              ))}
                          </div>
                        </div>

                        {/* Send Intervention */}
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground">
                            Send Structured Intervention
                          </p>
                          <Textarea
                            placeholder="Write a supportive, structured message..."
                            value={customMessage}
                            onChange={(e) => setCustomMessage(e.target.value)}
                            className="text-sm resize-none"
                            rows={3}
                          />
                          <Button
                            size="sm"
                            onClick={() => sendIntervention(client.clientId)}
                            disabled={sending || !customMessage.trim()}
                            className="gap-2"
                          >
                            <Send className="h-3 w-3" />
                            {sending ? "Sending..." : "Send Intervention"}
                          </Button>
                        </div>

                        {/* Recent Nudges */}
                        {clientNudges.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-2">
                              Recent Nudges
                            </p>
                            <div className="space-y-1.5">
                              {clientNudges.slice(0, 5).map((nudge) => (
                                <div
                                  key={nudge.id}
                                  className="flex items-start gap-2 text-xs px-3 py-2 rounded-md bg-secondary/50"
                                >
                                  <MessageSquare className="h-3 w-3 text-primary mt-0.5 shrink-0" />
                                  <div className="min-w-0">
                                    <p className="text-foreground leading-relaxed">
                                      {nudge.message}
                                    </p>
                                    <p className="text-muted-foreground mt-1">
                                      {format(new Date(nudge.sent_at), "MMM d, h:mm a")} ·{" "}
                                      {nudge.nudge_type}
                                      {nudge.reengaged_at && (
                                        <span className="text-primary ml-1">· Re-engaged ✓</span>
                                      )}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    )}
                  </Card>
                ))
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
};

export default RetentionPanel;
