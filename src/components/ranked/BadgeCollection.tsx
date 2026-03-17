import { useState } from "react";
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
  X,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { format } from "date-fns";

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
  const [selectedBadge, setSelectedBadge] = useState<any>(null);

  if (isLoading) return <Skeleton className="h-32" />;

  return (
    <>
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
                <button
                  key={ub.id}
                  onClick={() => setSelectedBadge({ ...badge, earned_at: ub.earned_at })}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors cursor-pointer"
                >
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <span className="text-[10px] font-semibold text-center leading-tight">
                    {badge?.display_name}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Badge Detail Dialog */}
      <Dialog open={!!selectedBadge} onOpenChange={(open) => !open && setSelectedBadge(null)}>
        <DialogContent className="max-w-sm bg-card border-border">
          <button
            onClick={() => setSelectedBadge(null)}
            className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100 transition-opacity z-10"
          >
            <X className="h-5 w-5 text-primary" />
          </button>
          {selectedBadge && (() => {
            const Icon = BADGE_ICONS[selectedBadge.name] || Trophy;
            return (
              <>
                <DialogHeader className="items-center pt-2">
                  <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                    <Icon className="h-10 w-10 text-primary" />
                  </div>
                  <DialogTitle className="text-lg font-bold text-primary text-center">
                    {selectedBadge.display_name}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-3 text-center px-2 pb-2">
                  <p className="text-sm text-muted-foreground">
                    {selectedBadge.description}
                  </p>
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1">
                    <span className="text-xs font-medium text-primary capitalize">
                      {selectedBadge.category}
                    </span>
                  </div>
                  {selectedBadge.earned_at && (
                    <p className="text-[11px] text-muted-foreground">
                      Earned on {format(new Date(selectedBadge.earned_at), "MMM d, yyyy")}
                    </p>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default BadgeCollection;
