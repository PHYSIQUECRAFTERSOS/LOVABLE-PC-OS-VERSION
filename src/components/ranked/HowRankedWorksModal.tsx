import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { HelpCircle, Flame, Shield, Crown, Gem, Diamond, ChevronDown, ChevronUp, Zap, TrendingUp, TrendingDown } from "lucide-react";
import TierBadge from "./TierBadge";
import { TIER_CONFIG, TIER_ORDER, XP_VALUES } from "@/utils/rankedXP";

const DIVISIONS = ["V", "IV", "III", "II", "I"];

const XP_GAINS = [
  { action: "Complete scheduled workout", xp: `+${XP_VALUES.workout_completed}`, icon: "💪" },
  { action: "Complete scheduled cardio", xp: `+${XP_VALUES.cardio_completed}`, icon: "🏃" },
  { action: "Calories within ±100 of target", xp: `+${XP_VALUES.calories_on_target}`, icon: "🎯" },
  { action: "Protein within ±5g", xp: `+${XP_VALUES.protein_on_target}`, icon: "🥩" },
  { action: "Carbs within ±5g", xp: `+${XP_VALUES.carbs_on_target}`, icon: "🍚" },
  { action: "Fats within ±5g", xp: `+${XP_VALUES.fats_on_target}`, icon: "🥑" },
  { action: "Weekly check-in submitted", xp: `+${XP_VALUES.checkin_submitted}`, icon: "📋" },
  { action: "7-day compliance streak bonus", xp: `+${XP_VALUES.streak_bonus_7}`, icon: "🔥" },
];

const XP_LOSSES = [
  { action: "Missed scheduled workout", xp: `${XP_VALUES.missed_workout}`, icon: "❌" },
  { action: "Missed scheduled cardio", xp: `${XP_VALUES.missed_cardio}`, icon: "❌" },
  { action: "No nutrition logged", xp: `${XP_VALUES.no_nutrition}`, icon: "🚫" },
  { action: "Calories off by 300+", xp: `${XP_VALUES.calories_off_300}`, icon: "⚠️" },
  { action: "Missed weekly check-in", xp: `${XP_VALUES.missed_checkin}`, icon: "📋" },
  { action: "7+ days inactive (per day)", xp: `${XP_VALUES.decay_per_day}`, icon: "💀" },
];

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

const CollapsibleSection = ({ title, icon, children, defaultOpen = false }: SectionProps) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-secondary/30 hover:bg-secondary/50 transition-colors"
      >
        {icon}
        <span className="text-sm font-semibold flex-1 text-left">{title}</span>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-4 py-3 space-y-3">{children}</div>}
    </div>
  );
};

const HowRankedWorksModal = () => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        className="h-8 w-8 text-muted-foreground hover:text-primary"
      >
        <HelpCircle className="h-5 w-5" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="h-[90vh] overflow-y-auto rounded-t-2xl bg-background p-0">
          <SheetHeader className="sticky top-0 z-10 bg-background border-b border-border px-5 py-4">
            <SheetTitle className="text-lg font-bold flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              How Ranked Works
            </SheetTitle>
          </SheetHeader>

          <div className="px-5 py-4 space-y-4">
            {/* Tier Ladder */}
            <CollapsibleSection
              title="Tier Ladder"
              icon={<Shield className="h-4 w-4 text-primary" />}
              defaultOpen={true}
            >
              <p className="text-xs text-muted-foreground mb-3">
                Climb from Bronze V to Champion. Each tier has 5 divisions (V → I). Fill a division's XP bar to promote.
              </p>
              <div className="space-y-2">
                {TIER_ORDER.map((tier) => {
                  const cfg = TIER_CONFIG[tier];
                  return (
                    <div
                      key={tier}
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 border border-border/50"
                      style={{ borderLeftColor: cfg.color, borderLeftWidth: 3 }}
                    >
                      <TierBadge tier={tier} size={100} />
                      <div className="flex-1">
                        <p className="text-sm font-semibold" style={{ color: cfg.color }}>
                          {cfg.name}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {tier === "champion"
                            ? "Top 5 clients only · No divisions"
                            : `${DIVISIONS.join(" → ")} · ${cfg.xpPerDiv} XP per division · ${cfg.xpPerDiv * 5} XP total`}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CollapsibleSection>

            {/* How XP Works */}
            <CollapsibleSection
              title="Earning XP"
              icon={<TrendingUp className="h-4 w-4 text-green-500" />}
            >
              <p className="text-xs text-muted-foreground mb-2">
                XP is earned instantly when you log actions. Max daily XP from actions: 18 XP.
              </p>
              <div className="space-y-1">
                {XP_GAINS.map((g) => (
                  <div key={g.action} className="flex items-center gap-2 text-xs py-1.5 border-b border-border/30 last:border-0">
                    <span className="w-5 text-center">{g.icon}</span>
                    <span className="flex-1 text-muted-foreground">{g.action}</span>
                    <span className="font-bold text-green-500">{g.xp} XP</span>
                  </div>
                ))}
              </div>
            </CollapsibleSection>

            {/* XP Losses */}
            <CollapsibleSection
              title="Losing XP"
              icon={<TrendingDown className="h-4 w-4 text-red-500" />}
            >
              <p className="text-xs text-muted-foreground mb-2">
                Losses apply 24 hours after a missed scheduled event. No penalties on rest days or unscheduled days.
              </p>
              <div className="space-y-1">
                {XP_LOSSES.map((l) => (
                  <div key={l.action} className="flex items-center gap-2 text-xs py-1.5 border-b border-border/30 last:border-0">
                    <span className="w-5 text-center">{l.icon}</span>
                    <span className="flex-1 text-muted-foreground">{l.action}</span>
                    <span className="font-bold text-red-500">{l.xp} XP</span>
                  </div>
                ))}
              </div>
            </CollapsibleSection>

            {/* Streak Multipliers */}
            <CollapsibleSection
              title="Streak Multipliers"
              icon={<Flame className="h-4 w-4 text-orange-500" />}
            >
              <p className="text-xs text-muted-foreground mb-2">
                Hit all your daily targets to build a streak. Multipliers apply to XP <strong>gains only</strong>, never losses.
              </p>
              <div className="space-y-2">
                {[
                  { range: "Days 1–6", mult: "1.0x", desc: "Base rate" },
                  { range: "Days 7–29", mult: "1.25x", desc: "25% bonus on all gains" },
                  { range: "Days 30+", mult: "1.5x", desc: "50% bonus on all gains" },
                ].map((s) => (
                  <div key={s.range} className="flex items-center gap-3 rounded-lg px-3 py-2 bg-secondary/30">
                    <Flame className="h-4 w-4 text-orange-500 shrink-0" />
                    <div className="flex-1">
                      <p className="text-xs font-semibold">{s.range}</p>
                      <p className="text-[10px] text-muted-foreground">{s.desc}</p>
                    </div>
                    <span className="text-sm font-bold text-orange-400">{s.mult}</span>
                  </div>
                ))}
              </div>
            </CollapsibleSection>

            {/* Promotion & Demotion */}
            <CollapsibleSection
              title="Promotion & Demotion"
              icon={<Crown className="h-4 w-4 text-primary" />}
            >
              <div className="space-y-2 text-xs text-muted-foreground">
                <div className="flex gap-2">
                  <span className="text-green-500 font-bold">↑</span>
                  <p><strong className="text-foreground">Auto-Promote:</strong> Fill your division's XP bar and you automatically advance to the next division (V → IV → III → II → I) or tier.</p>
                </div>
                <div className="flex gap-2">
                  <span className="text-primary font-bold">🛡</span>
                  <p><strong className="text-foreground">Demotion Shield:</strong> You cannot drop below the floor of your current tier through normal XP loss. Your tier is protected.</p>
                </div>
                <div className="flex gap-2">
                  <span className="text-red-500 font-bold">⚠</span>
                  <p><strong className="text-foreground">Shield Break:</strong> If you have 7+ consecutive days of total inactivity (zero logs), the shield expires and you <em>can</em> drop a full tier.</p>
                </div>
                <div className="flex gap-2">
                  <span className="text-red-500 font-bold">👑</span>
                  <p><strong className="text-foreground">Champion:</strong> Reserved for the top 5 clients by total XP. You must climb past Diamond I first. If someone surpasses your XP, you drop back to Diamond I.</p>
                </div>
              </div>
            </CollapsibleSection>

            {/* Perfect Day Example */}
            <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
              <p className="text-xs font-semibold text-primary mb-1">💎 Perfect Day = 18 XP</p>
              <p className="text-[10px] text-muted-foreground">
                Workout (+5) + Cardio (+3) + Calories on target (+7) + Protein (+1) + Carbs (+1) + Fats (+1) = 18 XP base. With a 30-day streak that's 27 XP/day!
              </p>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default HowRankedWorksModal;
