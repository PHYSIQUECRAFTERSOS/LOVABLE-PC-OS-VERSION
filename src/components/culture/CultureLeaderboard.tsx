import { useCultureLeaderboard, useActiveSpotlights, useCultureMessages } from "@/hooks/useCulture";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, Crown, Flame, Star, Search, Sparkles, Megaphone } from "lucide-react";
import { useState } from "react";

const tierColors: Record<string, string> = {
  bronze: "text-orange-400 border-orange-400/30",
  silver: "text-zinc-300 border-zinc-300/30",
  gold: "text-primary border-primary/30",
  elite: "text-primary border-primary/50",
};

const tierLabels: Record<string, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  elite: "Elite",
};

const medals = ["🥇", "🥈", "🥉"];

const CultureLeaderboard = () => {
  const { data: leaders, isLoading } = useCultureLeaderboard();
  const { data: spotlights } = useActiveSpotlights();
  const { data: messages } = useCultureMessages();
  const [search, setSearch] = useState("");

  const pinnedMessage = (messages || []).find((m: any) => m.is_pinned);

  const filtered = search
    ? (leaders || []).filter((l) => l.full_name?.toLowerCase().includes(search.toLowerCase()))
    : leaders || [];

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Pinned Culture Message */}
      {pinnedMessage && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 flex items-start gap-3">
          <Megaphone className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <p className="text-xs text-foreground/90 leading-relaxed">{pinnedMessage.content}</p>
        </div>
      )}

      {/* Spotlights */}
      {(spotlights || []).length > 0 && (
        <div className="space-y-2">
          {(spotlights || []).map((s) => {
            const initials = (s.full_name || "U").split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
            const typeLabel =
              s.spotlight_type === "high_performer" ? "🏆 Featured Performer" :
              s.spotlight_type === "most_improved" ? "📈 Most Improved" :
              "🔄 Comeback of the Week";

            return (
              <div key={s.id} className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-center gap-3">
                <Sparkles className="h-5 w-5 text-primary shrink-0" />
                <Avatar className="h-8 w-8">
                  {s.avatar_url && <AvatarImage src={s.avatar_url} />}
                  <AvatarFallback className="bg-primary/20 text-primary text-xs">{initials}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-primary">{typeLabel}</p>
                  <p className="text-sm font-semibold text-foreground">{s.full_name}</p>
                  {s.message && <p className="text-xs text-muted-foreground mt-0.5">{s.message}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search members..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-9 bg-secondary/30 border-0 text-sm"
        />
      </div>

      {/* Leaderboard */}
      {!filtered.length ? (
        <div className="text-center py-12">
          <Trophy className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">
            {search ? "No matching members found." : "No compliance data yet. Scores calculate weekly."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((entry, i) => {
            const initials = (entry.full_name || "U").split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
            const isTop3 = i < 3 && !search;
            const tierClass = tierColors[entry.tier || "bronze"];

            return (
              <div
                key={entry.user_id}
                className={`flex items-center gap-3 rounded-lg border p-3 transition-all ${
                  isTop3 ? "border-primary/30 bg-primary/5" : "border-border bg-card"
                }`}
              >
                <span className="w-8 text-center font-bold text-lg shrink-0">
                  {isTop3 ? medals[i] : <span className="text-muted-foreground text-sm">#{i + 1}</span>}
                </span>

                <div className="relative">
                  <Avatar className={`h-9 w-9 ${entry.consistency_active ? "ring-2 ring-green-500" : ""}`}>
                    {entry.avatar_url && <AvatarImage src={entry.avatar_url} />}
                    <AvatarFallback className={isTop3 ? "bg-primary/20 text-primary" : "bg-secondary text-foreground"}>
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  {i === 0 && !search && (
                    <Crown className="absolute -top-2 -right-1 h-4 w-4 text-primary" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground truncate">{entry.full_name}</span>
                    <Badge variant="outline" className={`text-[8px] px-1.5 py-0 ${tierClass}`}>
                      {tierLabels[entry.tier || "bronze"]}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-[10px] text-muted-foreground">
                      W: {entry.workout_pct}% · N: {entry.nutrition_pct}%
                    </span>
                    {entry.consistency_active && (
                      <span className="text-[10px] text-green-400">● Consistent</span>
                    )}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="flex items-center gap-1 text-primary font-bold text-sm">
                    <Star className="h-3.5 w-3.5" />
                    {entry.total_score}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CultureLeaderboard;
