import TierBadge from "./TierBadge";
import {
  getDivisionLabel,
  getTierColor,
  calculateTierAndDivision,
} from "@/utils/rankedXP";
import { Flame, TrendingUp } from "lucide-react";

interface MyRankCardProps {
  profile: any;
}

const MyRankCard = ({ profile }: MyRankCardProps) => {
  if (!profile) return null;

  const tierColor = getTierColor(profile.current_tier);
  const label = getDivisionLabel(
    profile.current_tier,
    profile.current_division
  );
  const { divisionXP, xpNeeded } = calculateTierAndDivision(profile.total_xp);
  const progress = xpNeeded > 0 ? (divisionXP / xpNeeded) * 100 : 100;
  const multiplier =
    profile.current_streak >= 30
      ? 1.5
      : profile.current_streak >= 7
        ? 1.25
        : 1.0;

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-4">
        <TierBadge tier={profile.current_tier} size={240} />
        <div className="flex-1">
          <h2
            className="text-xl font-bold tracking-tight"
            style={{ color: tierColor }}
          >
            {label}
          </h2>
          <p className="text-sm text-muted-foreground">
            #{profile.position} of {profile.totalPlayers}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-foreground">
            {profile.total_xp.toLocaleString()} XP
          </p>
        </div>
      </div>

      {/* XP Progress Bar */}
      {profile.current_tier !== "champion" && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Division Progress</span>
            <span>
              {divisionXP} / {xpNeeded} XP
            </span>
          </div>
          <div className="h-3 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progress}%`, backgroundColor: tierColor }}
            />
          </div>
        </div>
      )}

      {/* Streak + Multiplier */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <Flame className="h-4 w-4 text-orange-500" />
          <span className="text-sm font-semibold">
            {profile.current_streak} day streak
          </span>
        </div>
        {multiplier > 1 && (
          <div className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1">
            <TrendingUp className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-bold text-primary">
              {multiplier}x Bonus
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default MyRankCard;
