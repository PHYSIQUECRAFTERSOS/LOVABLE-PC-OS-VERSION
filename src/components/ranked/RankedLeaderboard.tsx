import { useState, useMemo } from "react";
import { useRankedLeaderboard } from "@/hooks/useRanked";
import TierBadge from "./TierBadge";
import { getDivisionLabel } from "@/utils/rankedXP";
import { Crown, Flame, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "all_time", label: "All Time" },
  { key: "this_week", label: "This Week", sublabel: "Resets Mon" },
  { key: "streak", label: "Streak Kings" },
  { key: "tier_climbers", label: "Tier Climbers" },
];

const RankedLeaderboard = () => {
  const [tab, setTab] = useState("all_time");
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

      {/* List */}
      <div className="max-h-[500px] overflow-y-auto">
        {isLoading ? (
          <div className="space-y-2 p-3">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
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

      {/* Pinned own row */}
      {myEntry && !filtered.find((e: any) => e.isMe) && (
        <div className="border-t border-primary/30">
          <LeaderboardRow entry={myEntry} value={getValueDisplay(myEntry)} />
        </div>
      )}
    </div>
  );
};

const LeaderboardRow = ({
  entry,
  value,
}: {
  entry: any;
  value: string;
}) => {
  const isChampion = entry.rank <= 5 && entry.current_tier === "champion";

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-3 border-b border-border/50 last:border-0 transition-colors",
        entry.isMe && "bg-primary/5",
        isChampion && "bg-red-950/20 border-red-900/30"
      )}
    >
      <span
        className={cn(
          "w-8 text-center text-sm font-bold",
          entry.rank === 1 && "text-yellow-400",
          entry.rank === 2 && "text-gray-300",
          entry.rank === 3 && "text-amber-600"
        )}
      >
        {entry.rank <= 3
          ? ["🥇", "🥈", "🥉"][entry.rank - 1]
          : `#${entry.rank}`}
      </span>

      <TierBadge tier={entry.current_tier} size={20} />

      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "text-sm font-semibold truncate",
            entry.isMe && "text-primary"
          )}
        >
          {entry.name}
          {isChampion && (
            <Crown className="inline ml-1 h-3.5 w-3.5 text-red-500" />
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
