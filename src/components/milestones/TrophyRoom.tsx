import { useEffect, useState } from "react";
import * as Icons from "lucide-react";
import { Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CATEGORY_META, MilestoneCategory, MilestoneTier, TIER_RING } from "@/utils/milestoneDefinitions";
import MilestoneCelebration from "./MilestoneCelebration";
import type { MilestoneUnlock } from "@/hooks/useMilestoneWatcher";

const db = supabase as any;

interface BadgeRow {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  category: MilestoneCategory;
  threshold: number;
  tier: MilestoneTier;
  lucide_icon: string | null;
}

interface ProgressRow {
  workouts_completed: number;
  cardio_completed: number;
  nutrition_days_total: number;
  nutrition_current_streak: number;
  nutrition_longest_streak: number;
}

export default function TrophyRoom({ clientId }: { clientId?: string }) {
  const { user } = useAuth();
  const uid = clientId || user?.id;
  const [badges, setBadges] = useState<BadgeRow[]>([]);
  const [earned, setEarned] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<ProgressRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [replay, setReplay] = useState<MilestoneUnlock | null>(null);

  useEffect(() => {
    if (!uid) return;
    (async () => {
      setLoading(true);
      const [{ data: bs }, { data: us }, { data: pr }] = await Promise.all([
        db
          .from("badges")
          .select("id, name, description, icon, category, threshold, tier, lucide_icon")
          .not("category", "is", null)
          .not("threshold", "is", null)
          .order("category")
          .order("threshold"),
        db.from("client_milestone_unlocks").select("badge_id").eq("client_id", uid),
        db.from("client_milestone_progress").select("*").eq("client_id", uid).maybeSingle(),
      ]);
      setBadges((bs as BadgeRow[]) || []);
      setEarned(new Set(((us as any[]) || []).map((u) => u.badge_id)));
      setProgress((pr as ProgressRow) || null);
      setLoading(false);
    })();
  }, [uid]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="aspect-square rounded-xl bg-card animate-pulse" />
        ))}
      </div>
    );
  }

  const getCurrent = (cat: MilestoneCategory) => {
    if (!progress) return 0;
    switch (cat) {
      case "workout_count": return progress.workouts_completed;
      case "cardio_count": return progress.cardio_completed;
      case "nutrition_total": return progress.nutrition_days_total;
      case "nutrition_streak": return progress.nutrition_longest_streak;
    }
  };

  const grouped: Record<string, BadgeRow[]> = {};
  for (const b of badges) {
    (grouped[b.category] ||= []).push(b);
  }

  return (
    <div className="space-y-8">
      {Object.entries(grouped).map(([cat, list]) => {
        const meta = CATEGORY_META[cat as MilestoneCategory];
        const current = getCurrent(cat as MilestoneCategory);
        const earnedCount = list.filter((b) => earned.has(b.id)).length;
        return (
          <section key={cat}>
            <div className="flex items-end justify-between mb-3">
              <div>
                <h3 className="font-display text-lg font-bold text-white">{meta.label}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {current} {meta.unit} · {earnedCount}/{list.length} earned
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {list.map((b) => {
                const isEarned = earned.has(b.id);
                const IconComp = (b.lucide_icon && (Icons as any)[b.lucide_icon]) || null;
                const ringClass = TIER_RING[b.tier] ?? TIER_RING.gold;
                return (
                  <button
                    key={b.id}
                    disabled={!isEarned}
                    onClick={() => {
                      if (!isEarned) return;
                      setReplay({
                        id: `replay-${b.id}`,
                        badge_id: b.id,
                        category: b.category,
                        threshold: b.threshold,
                        unlocked_at: new Date().toISOString(),
                        badge: {
                          name: b.name,
                          description: b.description,
                          icon: b.icon,
                          tier: b.tier,
                          lucide_icon: b.lucide_icon,
                        },
                      });
                    }}
                    className={`relative aspect-square rounded-xl p-3 flex flex-col items-center justify-center transition-all ${
                      isEarned
                        ? "bg-gradient-to-b from-[#1a1a1a] to-[#0a0a0a] border border-[#D4A017]/40 hover:border-[#D4A017] hover:scale-[1.03] active:scale-95"
                        : "bg-card/40 border border-border opacity-50"
                    }`}
                  >
                    {isEarned ? (
                      IconComp ? (
                        <IconComp className="w-7 h-7 text-[#D4A017]" strokeWidth={2.2} />
                      ) : (
                        <span className="text-2xl">{b.icon}</span>
                      )
                    ) : (
                      <Lock className="w-6 h-6 text-muted-foreground" />
                    )}
                    <div className={`mt-2 font-display text-xl font-black ${isEarned ? "text-white" : "text-muted-foreground"}`}>
                      {b.threshold}
                    </div>
                    {isEarned && (
                      <div className={`mt-1 text-[8px] uppercase tracking-widest font-bold bg-gradient-to-r ${ringClass} bg-clip-text text-transparent`}>
                        {b.tier}
                      </div>
                    )}
                    {!isEarned && (
                      <div className="mt-1 text-[9px] text-muted-foreground">
                        {Math.max(0, b.threshold - current)} to go
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}

      <MilestoneCelebration unlock={replay} onDismiss={() => setReplay(null)} />
    </div>
  );
}
