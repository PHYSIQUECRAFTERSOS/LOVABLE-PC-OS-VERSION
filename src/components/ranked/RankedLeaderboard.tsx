import { useState, useMemo } from "react";
import { useRankedLeaderboard } from "@/hooks/useRanked";
import TierBadge from "./TierBadge";
import { getDivisionLabel, TIER_ORDER, TIER_CONFIG, type TierName } from "@/utils/rankedXP";
import { Crown, Flame, Search, ChevronDown, ChevronRight, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "divisions", label: "Divisions" },
  { key: "this_week", label: "This Week", sublabel: "Resets Mon" },
  { key: "streak", label: "Streak Kings" },
  { key: "tier_climbers", label: "Tier Climbers" },
];

const DIVISION_ROMAN = ["I", "II", "III", "IV", "V"];
const TIER_DISPLAY_ORDER: TierName[] = [...TIER_ORDER].reverse(); // champion → bronze

const RankedLeaderboard = () => {
  const [tab, setTab] = useState("divisions");
  const [search, setSearch] = useState("");
  const { data: entries = [], isLoading } = useRankedLeaderboard(tab);

  const filtered = useMemo(() => {
    if (!search.trim()) return entries;
    const q = search.toLowerCase();
    return entries.filter((e: any) => e.name?.toLowerCase().includes(q));
  }, [entries, search]);

  const myEntry = entries.find((e: any) => e.isMe);

  const getValueDisplay = (entry: any) => {
    if (tab === "this_week") return `${entry.weekly_xp || 0} XP`;
    if (tab === "streak") return `${entry.current_streak || 0} days`;
    if (tab === "tier_climbers")
      return entry.last_rank_up_at
        ? new Date(entry.last_rank_up_at).toLocaleDateString()
        : "—";
    return `${entry.total_xp?.toLocaleString() || 0} XP`;
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-border overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex-1 min-w-[90px] px-3 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap flex flex-col items-center",
              tab === t.key
                ? "text-primary border-b-2 border-primary bg-primary/5"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
            {"sublabel" in t && t.sublabel && (
              <span className="text-[9px] font-normal text-muted-foreground">{t.sublabel}</span>
            )}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="p-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search members..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 bg-secondary/50"
          />
        </div>
      </div>

      {/* Content */}
      <div className="max-h-[600px] overflow-y-auto">
        {isLoading ? (
          <div className="space-y-2 p-3">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : tab === "divisions" ? (
          <DivisionsView entries={filtered} search={search} />
        ) : filtered.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            No participants yet
          </p>
        ) : (
          filtered.map((entry: any) => (
            <LeaderboardRow
              key={entry.user_id}
              entry={entry}
              value={getValueDisplay(entry)}
            />
          ))
        )}
      </div>

      {/* Pinned own row (non-divisions tabs) */}
      {tab !== "divisions" && myEntry && !filtered.find((e: any) => e.isMe) && (
        <div className="border-t border-primary/30">
          <LeaderboardRow entry={myEntry} value={getValueDisplay(myEntry)} />
        </div>
      )}
    </div>
  );
};

/* ── Divisions Accordion View ──────────────────────────────── */

const DivisionsView = ({ entries, search }: { entries: any[]; search: string }) => {
  // Group by tier
  const tierGroups = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const tier of TIER_ORDER) groups[tier] = [];
    for (const e of entries) {
      const t = e.current_tier || "bronze";
      if (groups[t]) groups[t].push(e);
      else groups["bronze"].push(e);
    }
    return groups;
  }, [entries]);

  // Find tier with most players to auto-expand
  const mostPopulatedTier = useMemo(() => {
    let max = 0;
    let tier = "bronze";
    for (const [t, players] of Object.entries(tierGroups)) {
      if (players.length > max) { max = players.length; tier = t; }
    }
    return tier;
  }, [tierGroups]);

  if (entries.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-muted-foreground">
        {search ? "No matching members found." : "No participants yet"}
      </p>
    );
  }

  return (
    <div className="divide-y divide-border">
      {TIER_DISPLAY_ORDER.map((tier) => (
        <TierSection
          key={tier}
          tier={tier}
          players={tierGroups[tier]}
          defaultOpen={tier === mostPopulatedTier || tier === "champion"}
        />
      ))}
    </div>
  );
};

/* ── Tier Section (Collapsible) ─────────────────────────────── */

const TierSection = ({
  tier,
  players,
  defaultOpen,
}: {
  tier: TierName;
  players: any[];
  defaultOpen: boolean;
}) => {
  const config = TIER_CONFIG[tier];
  const color = config.color;
  const count = players.length;

  // Sub-group by division
  const divGroups = useMemo(() => {
    if (tier === "champion") return { 0: players };
    const groups: Record<number, any[]> = {};
    for (let d = 1; d <= 5; d++) groups[d] = [];
    for (const p of players) {
      const div = p.current_division || 5;
      if (groups[div]) groups[div].push(p);
      else groups[5].push(p);
    }
    return groups;
  }, [players, tier]);

  return (
    <Collapsible defaultOpen={defaultOpen}>
      <CollapsibleTrigger className="w-full">
        <div
          className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors cursor-pointer"
          style={{ borderLeft: `3px solid ${color}` }}
        >
          <div className="h-14 w-14 shrink-0 flex items-center justify-center overflow-hidden">
            <TierBadge tier={tier} size={110} />
          </div>
          <span
            className="text-sm font-bold tracking-wide uppercase flex-1 text-left"
            style={{ color }}
          >
            {config.name}
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3 w-3" />
            {count}
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        {count === 0 ? (
          <p className="px-8 py-3 text-xs text-muted-foreground italic">
            No players in this tier yet
          </p>
        ) : tier === "champion" ? (
          <div className="pb-1">
            {players
              .sort((a: any, b: any) => (b.total_xp || 0) - (a.total_xp || 0))
              .map((entry: any, i: number) => (
                <DivisionPlayerRow key={entry.user_id} entry={entry} rank={i + 1} tierColor={color} />
              ))}
          </div>
        ) : (
          <div className="pb-1">
            {[1, 2, 3, 4, 5].map((div) => (
              <DivisionSubGroup
                key={div}
                division={div}
                players={divGroups[div] || []}
                tierColor={color}
                tier={tier}
              />
            ))}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
};

/* ── Division Sub-Group ─────────────────────────────────────── */

const DivisionSubGroup = ({
  division,
  players,
  tierColor,
  tier,
}: {
  division: number;
  players: any[];
  tierColor: string;
  tier: TierName;
}) => {
  const [open, setOpen] = useState(players.length > 0);
  const roman = DIVISION_ROMAN[division - 1];

  return (
    <div className="ml-4">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 w-full hover:bg-secondary/20 transition-colors rounded"
      >
        {open ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
        )}
        <span className="text-xs font-semibold" style={{ color: tierColor }}>
          Division {roman}
        </span>
        <span className="text-[10px] text-muted-foreground">({players.length})</span>
      </button>

      {open && players.length > 0 && (
        <div className="ml-2">
          {players
            .sort((a: any, b: any) => (b.total_xp || 0) - (a.total_xp || 0))
            .map((entry: any, i: number) => (
              <DivisionPlayerRow key={entry.user_id} entry={entry} rank={i + 1} tierColor={tierColor} />
            ))}
        </div>
      )}

      {open && players.length === 0 && (
        <p className="ml-7 py-1 text-[10px] text-muted-foreground/60 italic">Empty</p>
      )}
    </div>
  );
};

/* ── Player Row (Divisions view) ────────────────────────────── */

const DivisionPlayerRow = ({
  entry,
  rank,
  tierColor,
}: {
  entry: any;
  rank: number;
  tierColor: string;
}) => {
  const initials = (entry.name || "U")
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-2 transition-colors",
        entry.isMe && "bg-primary/5"
      )}
    >
      <Avatar className="h-7 w-7 shrink-0">
        {entry.avatar_url && <AvatarImage src={entry.avatar_url} alt={entry.name} />}
        <AvatarFallback
          className="text-[10px] font-semibold"
          style={{ backgroundColor: `${tierColor}20`, color: tierColor }}
        >
          {initials}
        </AvatarFallback>
      </Avatar>

      <span
        className={cn(
          "text-sm font-medium truncate flex-1",
          entry.isMe ? "text-primary" : "text-foreground"
        )}
      >
        {entry.name}
        {entry.current_tier === "champion" && rank <= 5 && (
          <Crown className="inline ml-1 h-3 w-3 text-destructive" />
        )}
      </span>

      <div className="text-right shrink-0">
        <p className="text-xs font-bold" style={{ color: tierColor }}>
          {(entry.total_xp || 0).toLocaleString()} XP
        </p>
        {entry.current_streak > 0 && (
          <p className="text-[9px] text-orange-400 flex items-center gap-0.5 justify-end">
            <Flame className="h-2.5 w-2.5" />
            {entry.current_streak}
          </p>
        )}
      </div>
    </div>
  );
};

/* ── Flat Leaderboard Row (other tabs) ──────────────────────── */

const LeaderboardRow = ({
  entry,
  value,
}: {
  entry: any;
  value: string;
}) => {
  const isChampion = entry.rank <= 5 && entry.current_tier === "champion";
  const initials = (entry.name || "U")
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-3 border-b border-border/50 last:border-0 transition-colors",
        entry.isMe && "bg-primary/5",
        isChampion && "bg-red-950/20 border-red-900/30"
      )}
    >
      <span className="w-8 text-center text-sm font-bold text-foreground">
        #{entry.rank}
      </span>

      <Avatar className="h-7 w-7 shrink-0">
        {entry.avatar_url && <AvatarImage src={entry.avatar_url} alt={entry.name} />}
        <AvatarFallback className="text-[10px] font-semibold bg-secondary text-foreground">
          {initials}
        </AvatarFallback>
      </Avatar>

      <div className="h-12 w-12 shrink-0 flex items-center justify-center overflow-hidden">
        <TierBadge tier={entry.current_tier} size={90} />
      </div>

      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "text-sm font-semibold truncate",
            entry.isMe && "text-primary"
          )}
        >
          {entry.name}
          {isChampion && (
            <Crown className="inline ml-1 h-3.5 w-3.5 text-destructive" />
          )}
        </p>
        <p className="text-[10px] text-muted-foreground">
          {getDivisionLabel(entry.current_tier, entry.current_division)}
        </p>
      </div>

      <div className="text-right">
        <p className="text-sm font-bold">{value}</p>
        {entry.current_streak > 0 && (
          <p className="text-[10px] text-orange-400 flex items-center gap-0.5 justify-end">
            <Flame className="h-3 w-3" />
            {entry.current_streak}
          </p>
        )}
      </div>
    </div>
  );
};

export default RankedLeaderboard;
