import { useEffect, useState } from "react";
import TierBadge from "./TierBadge";
import { getDivisionLabel, getTierColor } from "@/utils/rankedXP";

interface RankUpOverlayProps {
  tier: string;
  division: number;
  type: "division_up" | "tier_up" | "champion_in" | "division_down" | "tier_down";
  onDismiss: () => void;
}

const RankUpOverlay = ({ tier, division, type, onDismiss }: RankUpOverlayProps) => {
  const [visible, setVisible] = useState(true);
  const color = getTierColor(tier);
  const label = getDivisionLabel(tier, division);
  const isPromotion = type === "division_up" || type === "tier_up" || type === "champion_in";
  const duration = type === "champion_in" ? 6000 : type === "tier_up" || type === "tier_down" ? 5000 : 4000;

  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(false);
      onDismiss();
    }, duration);
    return () => clearTimeout(t);
  }, [duration, onDismiss]);

  if (!visible) return null;

  return (
    <>
      <style>{`
        @keyframes rankUpEntry {
          from { transform: translateY(40px) scale(0.8); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes rankDownEntry {
          from { transform: translateY(-40px) scale(0.8); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes particleFly {
          0% { opacity: 1; transform: translate(0, 0) scale(1); }
          100% { opacity: 0; transform: translate(var(--tx, 50px), var(--ty, -80px)) scale(0); }
        }
        @keyframes overlayFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center"
        style={{
          backgroundColor: "rgba(0,0,0,0.85)",
          animation: "overlayFadeIn 0.3s ease-out",
        }}
        onClick={() => {
          setVisible(false);
          onDismiss();
        }}
      >
        {/* Particles (only for promotions) */}
        {isPromotion && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {[...Array(24)].map((_, i) => {
              const angle = (i / 24) * Math.PI * 2;
              const dist = 80 + Math.random() * 120;
              return (
                <div
                  key={i}
                  className="absolute w-2 h-2 rounded-full"
                  style={{
                    backgroundColor: color,
                    left: "50%",
                    top: "50%",
                    ["--tx" as any]: `${Math.cos(angle) * dist}px`,
                    ["--ty" as any]: `${Math.sin(angle) * dist}px`,
                    animation: `particleFly ${0.8 + Math.random() * 0.6}s ease-out ${Math.random() * 0.3}s forwards`,
                  }}
                />
              );
            })}
          </div>
        )}

        {/* Badge + Label */}
        <div
          className="flex flex-col items-center gap-4"
          style={{ animation: isPromotion ? "rankUpEntry 0.6s ease-out" : "rankDownEntry 0.6s ease-out" }}
        >
          <TierBadge tier={tier} size={type === "champion_in" ? 400 : 320} />
          <h1
            className="text-3xl font-black tracking-wider"
            style={{ color: isPromotion ? color : undefined }}
          >
            {label}
          </h1>
          {type === "tier_up" && (
            <p className="text-sm text-muted-foreground">New tier unlocked!</p>
          )}
          {type === "champion_in" && (
            <p className="text-sm text-red-400 animate-pulse">
              Only 5 can hold this rank.
            </p>
          )}
          {type === "division_up" && (
            <p className="text-sm text-emerald-400">Division promoted! 🎉</p>
          )}
          {type === "division_down" && (
            <p className="text-sm text-red-400">Division dropped. Keep pushing! 💪</p>
          )}
          {type === "tier_down" && (
            <p className="text-sm text-red-400">Tier demoted. Time to fight back! ⚔️</p>
          )}
        </div>
      </div>
    </>
  );
};

export default RankUpOverlay;
