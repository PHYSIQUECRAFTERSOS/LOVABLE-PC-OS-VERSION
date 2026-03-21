import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { awardXP, XP_VALUES } from "@/utils/rankedXP";
import { checkAndAwardBadges } from "@/utils/badgeChecker";
import XPToast from "@/components/ranked/XPToast";
import RankUpOverlay from "@/components/ranked/RankUpOverlay";

interface XPEvent {
  amount: number;
  id: string;
}

interface RankEvent {
  tier: string;
  division: number;
  type: "division_up" | "tier_up" | "champion_in" | "division_down" | "tier_down";
  previousTier?: string;
}

interface XPContextType {
  triggerXP: (
    userId: string,
    txType: string,
    baseAmount: number,
    description: string,
    opts?: { relatedEventId?: string }
  ) => Promise<void>;
}

const XPContext = createContext<XPContextType>({
  triggerXP: async () => {},
});

export const useXPAward = () => useContext(XPContext);

export const RankedXPProvider = ({ children }: { children: ReactNode }) => {
  const [xpToasts, setXpToasts] = useState<XPEvent[]>([]);
  const [rankEvent, setRankEvent] = useState<RankEvent | null>(null);

  const triggerXP = useCallback(
    async (
      userId: string,
      txType: string,
      baseAmount: number,
      description: string,
      opts?: { relatedEventId?: string }
    ) => {
      try {
        const result = await awardXP(userId, txType, baseAmount, description, opts);
        if (!result) return;

        // Show XP toast
        const toastId = `${txType}-${Date.now()}`;
        setXpToasts((prev) => [...prev, { amount: result.xpAwarded, id: toastId }]);

        // Check for badge unlocks using fresh profile data
        const { supabase } = await import("@/integrations/supabase/client");
        const { data: freshProfile } = await (supabase as any)
          .from("ranked_profiles")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle();
        if (freshProfile) {
          checkAndAwardBadges(userId, freshProfile, txType).catch(console.error);
        }

        // Show rank change overlay
        if (
          result.rankChange === "division_up" ||
          result.rankChange === "tier_up" ||
          result.rankChange === "champion_in" ||
          result.rankChange === "division_down" ||
          result.rankChange === "tier_down"
        ) {
          setRankEvent({
            tier: result.tier as string,
            division: result.division,
            type: result.rankChange as RankEvent["type"],
            previousTier: result.previousTier as string | undefined,
          });
        }
      } catch (e) {
        console.error("[useXPAward] Error:", e);
      }
    },
    []
  );

  const removeToast = useCallback((id: string) => {
    setXpToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <XPContext.Provider value={{ triggerXP }}>
      {children}
      {xpToasts.map((t) => (
        <XPToast key={t.id} amount={t.amount} onDone={() => removeToast(t.id)} />
      ))}
      {rankEvent && (
        <RankUpOverlay
          tier={rankEvent.tier}
          division={rankEvent.division}
          type={rankEvent.type}
          previousTier={rankEvent.previousTier}
          onDismiss={() => setRankEvent(null)}
        />
      )}
    </XPContext.Provider>
  );
};
