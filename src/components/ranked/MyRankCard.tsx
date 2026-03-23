import legacyBronze from "@/assets/tiers/legacy/bronze.png";
import legacySilver from "@/assets/tiers/legacy/silver.png";
import legacyGold from "@/assets/tiers/legacy/gold.png";
import legacyEmerald from "@/assets/tiers/legacy/emerald.png";
import legacyDiamond from "@/assets/tiers/legacy/diamond.png";
import legacyChampion from "@/assets/tiers/legacy/champion.png";
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
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4 overflow-hidden">
      {/* Hero badge — fills card width (legacy logos with background + text) */}
      <div className="w-full aspect-square max-w-full flex items-center justify-center overflow-hidden mx-auto">
        <img
          src={LEGACY_TIER_IMAGES[profile.current_tier?.toLowerCase()] || LEGACY_TIER_IMAGES.bronze}
          width={400}
          height={400}
          alt={`${profile.current_tier} tier`}
          className="max-w-full max-h-full"
          style={{ objectFit: "contain" }}
          draggable={false}
        />
      </div>

      {/* Info row */}
      <div className="space-y-1 min-w-0">
        <h2
          className="text-xl sm:text-2xl font-bold tracking-tight truncate"
          style={{ color: tierColor }}
        >
          {label}
        </h2>
        <p className="text-sm text-muted-foreground truncate">
          #{profile.position} of {profile.totalPlayers}
        </p>
      </div>

      {/* XP Progress Bar */}
      {profile.current_tier !== "champion" && (
        <div className="space-y-1.5 min-w-0">
          <div className="flex justify-between text-xs text-muted-foreground gap-2 min-w-0">
            <span className="shrink-0">Division Progress</span>
            <span className="tabular-nums truncate">
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
      <div className="flex items-center gap-3 sm:gap-4 flex-wrap min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <Flame className="h-4 w-4 text-orange-500 shrink-0" />
          <span className="text-sm font-semibold whitespace-nowrap">
            {profile.current_streak} day streak
          </span>
        </div>
        {multiplier > 1 && (
          <div className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1">
            <TrendingUp className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="text-xs font-bold text-primary whitespace-nowrap">
              {multiplier}x Bonus
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default MyRankCard;
