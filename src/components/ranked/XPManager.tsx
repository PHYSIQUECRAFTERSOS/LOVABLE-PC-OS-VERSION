import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCoachAwardXP,
  useAtRiskClients,
  useTopMovers,
  useStagnantClients,
  useXPHistory,
} from "@/hooks/useRanked";
import TierBadge from "./TierBadge";
import { getDivisionLabel, COACH_PRESETS, calculateTierAndDivision, PLACEMENT_XP_MAP, TIER_FLOOR } from "@/utils/rankedXP";
import { toast } from "sonner";
import {
  AlertTriangle,
  TrendingUp,
  Clock,
  Award,
  Search,
  Trophy,
  Star,
  Link,
  Rocket,
  MapPin,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

const PRESET_ICONS: Record<string, any> = {
  pr_hit: Trophy,
  perfect_week: Star,
  consistency: Link,
  above_and_beyond: Rocket,
};

const XPManager = () => {
  const [section, setSection] = useState("at_risk");

  const sections = [
    { key: "at_risk", label: "At-Risk", icon: AlertTriangle },
    { key: "top_movers", label: "Top Movers", icon: TrendingUp },
    { key: "stagnant", label: "Stagnant", icon: Clock },
    { key: "award", label: "Award XP", icon: Award },
    { key: "ledger", label: "Ledger", icon: Search },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {sections.map((s) => (
          <button
            key={s.key}
            onClick={() => setSection(s.key)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors",
              section === s.key
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            )}
          >
            <s.icon className="h-3.5 w-3.5" />
            {s.label}
          </button>
        ))}
      </div>

      {section === "at_risk" && <AtRiskSection />}
      {section === "top_movers" && <TopMoversSection />}
      {section === "stagnant" && <StagnantSection />}
      {section === "award" && <AwardXPSection />}
      {section === "ledger" && <ClientLedgerSection />}
    </div>
  );
};

const AtRiskSection = () => {
  const { data = [], isLoading } = useAtRiskClients();
  if (isLoading) return <Skeleton className="h-32" />;
  if (!data.length)
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        No at-risk clients 🎉
      </p>
    );
  return (
    <div className="rounded-xl border border-border bg-card divide-y divide-border/50">
      {data.map((c: any) => (
        <div key={c.user_id} className="flex items-center gap-3 px-4 py-3">
          <div className="h-20 w-20 shrink-0 flex items-center justify-center overflow-hidden">
            <TierBadge tier={c.current_tier} size={200} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{c.name}</p>
            <p className="text-[10px] text-muted-foreground">
              {c.lossDays} loss days this week • Streak: {c.current_streak}
            </p>
          </div>
          <span className="text-xs text-red-400 font-bold">
            {c.lossDays}d loss
          </span>
        </div>
      ))}
    </div>
  );
};

const TopMoversSection = () => {
  const { data = [], isLoading } = useTopMovers();
  if (isLoading) return <Skeleton className="h-32" />;
  if (!data.length)
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        No data this week
      </p>
    );
  return (
    <div className="rounded-xl border border-border bg-card divide-y divide-border/50">
      {data.map((c: any, i: number) => (
        <div key={c.user_id} className="flex items-center gap-3 px-4 py-3">
          <span className="w-6 text-center text-sm font-bold text-muted-foreground">
            #{i + 1}
          </span>
          <div className="h-20 w-20 shrink-0 flex items-center justify-center overflow-hidden">
            <TierBadge tier={c.current_tier} size={200} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{c.name}</p>
            <p className="text-[10px] text-muted-foreground">
              {getDivisionLabel(c.current_tier, c.current_division)}
            </p>
          </div>
          <span className="text-sm font-bold text-emerald-500">
            +{c.weekly_xp || 0} XP
          </span>
        </div>
      ))}
    </div>
  );
};

const StagnantSection = () => {
  const { data = [], isLoading } = useStagnantClients();
  if (isLoading) return <Skeleton className="h-32" />;
  if (!data.length)
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        All clients are active 🎉
      </p>
    );
  return (
    <div className="rounded-xl border border-border bg-card divide-y divide-border/50">
      {data.map((c: any) => (
        <div key={c.user_id} className="flex items-center gap-3 px-4 py-3">
          <div className="h-20 w-20 shrink-0 flex items-center justify-center overflow-hidden">
            <TierBadge tier={c.current_tier} size={200} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{c.name}</p>
            <p className="text-[10px] text-muted-foreground">
              {getDivisionLabel(c.current_tier, c.current_division)}
            </p>
          </div>
          <span className="text-xs text-amber-400 font-bold">
            {c.inactive_days}d inactive
          </span>
        </div>
      ))}
    </div>
  );
};

const AwardXPSection = () => {
  const [selectedClient, setSelectedClient] = useState("");
  const [selectedPreset, setSelectedPreset] = useState("");
  const [customAmount, setCustomAmount] = useState(20);
  const [customNote, setCustomNote] = useState("");
  const [clients, setClients] = useState<any[]>([]);
  const [searchQ, setSearchQ] = useState("");
  const { user } = useAuth();
  const award = useCoachAwardXP();

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data: cc } = await db
        .from("coach_clients")
        .select("client_id")
        .eq("coach_id", user.id)
        .eq("status", "active");
      if (!cc?.length) return;
      const ids = cc.map((c: any) => c.client_id);
      const { data: profiles } = await db
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", ids);
      setClients(profiles || []);
    })();
  }, [user?.id]);

  const filteredClients = clients.filter((c) =>
    c.full_name?.toLowerCase().includes(searchQ.toLowerCase())
  );

  const handleAward = () => {
    if (!selectedClient) return;
    award.mutate({
      clientId: selectedClient,
      preset: selectedPreset || undefined,
      customAmount: selectedPreset ? undefined : customAmount,
      customNote: selectedPreset ? undefined : customNote,
    });
    setSelectedPreset("");
    setCustomNote("");
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Input
          placeholder="Search client..."
          value={searchQ}
          onChange={(e) => {
            setSearchQ(e.target.value);
            if (selectedClient) setSelectedClient("");
          }}
          className="bg-secondary/50"
        />
        {searchQ && !selectedClient && (
          <div className="rounded-lg border border-border bg-card max-h-40 overflow-y-auto">
            {filteredClients.map((c) => (
              <button
                key={c.user_id}
                onClick={() => {
                  setSelectedClient(c.user_id);
                  setSearchQ(c.full_name);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-secondary"
              >
                {c.full_name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {Object.entries(COACH_PRESETS).map(([key, preset]) => {
          const Icon = PRESET_ICONS[key] || Trophy;
          return (
            <button
              key={key}
              onClick={() =>
                setSelectedPreset(selectedPreset === key ? "" : key)
              }
              className={cn(
                "flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-semibold transition-colors",
                selectedPreset === key
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-secondary/30 text-foreground hover:bg-secondary"
              )}
            >
              <Icon className="h-4 w-4" />
              {preset.label} (+{preset.xp})
            </button>
          );
        })}
      </div>

      {!selectedPreset && (
        <div className="space-y-3 rounded-lg border border-border p-3">
          <p className="text-xs font-semibold text-muted-foreground">
            Custom Award
          </p>
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold w-12">+{customAmount}</span>
            <Slider
              value={[customAmount]}
              onValueChange={([v]) => setCustomAmount(v)}
              min={10}
              max={50}
              step={5}
              className="flex-1"
            />
          </div>
          <Textarea
            placeholder="Reason..."
            value={customNote}
            onChange={(e) => setCustomNote(e.target.value)}
            rows={2}
          />
        </div>
      )}

      <Button
        onClick={handleAward}
        disabled={!selectedClient || award.isPending}
        className="w-full bg-primary text-primary-foreground"
      >
        {award.isPending ? "Awarding..." : "Award XP"}
      </Button>
    </div>
  );
};

const ClientLedgerSection = () => {
  const [selectedClient, setSelectedClient] = useState("");
  const [clients, setClients] = useState<any[]>([]);
  const [searchQ, setSearchQ] = useState("");
  const { user } = useAuth();
  const { data: history = [], isLoading } = useXPHistory(
    selectedClient || undefined
  );

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data: cc } = await db
        .from("coach_clients")
        .select("client_id")
        .eq("coach_id", user.id)
        .eq("status", "active");
      if (!cc?.length) return;
      const ids = cc.map((c: any) => c.client_id);
      const { data: profiles } = await db
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", ids);
      setClients(profiles || []);
    })();
  }, [user?.id]);

  return (
    <div className="space-y-3">
      <Input
        placeholder="Search client..."
        value={searchQ}
        onChange={(e) => {
          setSearchQ(e.target.value);
          if (selectedClient) setSelectedClient("");
        }}
        className="bg-secondary/50"
      />
      {searchQ && !selectedClient && (
        <div className="rounded-lg border border-border bg-card max-h-40 overflow-y-auto">
          {clients
            .filter((c) =>
              c.full_name?.toLowerCase().includes(searchQ.toLowerCase())
            )
            .map((c) => (
              <button
                key={c.user_id}
                onClick={() => {
                  setSelectedClient(c.user_id);
                  setSearchQ(c.full_name);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-secondary"
              >
                {c.full_name}
              </button>
            ))}
        </div>
      )}

      {selectedClient &&
        (isLoading ? (
          <Skeleton className="h-32" />
        ) : !history.length ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No XP history for this client
          </p>
        ) : (
          <div className="rounded-lg border border-border bg-card divide-y divide-border/50 max-h-[400px] overflow-y-auto">
            {history.map((tx: any) => (
              <div
                key={tx.id}
                className="flex items-center justify-between px-3 py-2"
              >
                <div>
                  <p className="text-sm">{tx.description}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(tx.created_at).toLocaleString()}
                  </p>
                </div>
                <span
                  className={cn(
                    "text-sm font-bold",
                    tx.xp_amount > 0 ? "text-emerald-500" : "text-red-500"
                  )}
                >
                  {tx.xp_amount > 0 ? "+" : ""}
                  {tx.xp_amount}
                </span>
              </div>
            ))}
          </div>
        ))}
    </div>
  );
};

export default XPManager;
