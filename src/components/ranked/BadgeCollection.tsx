import { useMyBadges } from "@/hooks/useRanked";
import {
  Trophy,
  Shield,
  Flame,
  Zap,
  Star,
  Crown,
  Mountain,
  Link,
  Rocket,
  Sword,
  Award,
  Heart,
  Gem,
  Lock,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const BADGE_ICONS: Record<string, any> = {
  iron_stomach: Shield,
  cardio_machine: Zap,
  relentless: Link,
  locked_in: Lock,
  in_momentum: Rocket,
  first_blood: Sword,
  century_club: Trophy,
  "1k_club": Star,
  "10k_club": Gem,
  tier_breaker: Flame,
  summit: Mountain,
  untouchable: Crown,
  perfect_month: Star,
  coachs_pick: Award,
  comeback_king: Heart,
  the_wall: Shield,
};

interface BadgeCollectionProps {
  userId?: string;
}

const BadgeCollection = ({ userId }: BadgeCollectionProps) => {
  const { data: badges = [], isLoading } = useMyBadges(userId);

  if (isLoading) return <Skeleton className="h-32" />;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <h3 className="px-4 py-3 text-sm font-semibold border-b border-border">
        Badge Collection
      </h3>
      {!badges.length ? (
        <p className="p-6 text-center text-sm text-muted-foreground">
          Complete challenges to earn badges.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-3 p-4">
          {badges.map((ub: any) => {
            const badge = ub.ranked_badges;
            const Icon = BADGE_ICONS[badge?.name] || Trophy;
            return (
              <div
                key={ub.id}
                className="flex flex-col items-center gap-1.5 p-3 rounded-lg bg-secondary/30"
              >
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Icon className="h-6 w-6 text-primary" />
                </div>
                <span className="text-[10px] font-semibold text-center leading-tight">
                  {badge?.display_name}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default BadgeCollection;
