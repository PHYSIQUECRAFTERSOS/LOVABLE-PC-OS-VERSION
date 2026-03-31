import { useEffect, useState, useCallback } from "react";
import { getDivisionLabel, getTierColor, TIER_CONFIG, TierName } from "@/utils/rankedXP";
import RankUpConfetti from "./RankUpConfetti";
import { rankUpAudio } from "@/services/RankUpAudioService";

// Animation-only badge assets
import animBronze from "@/assets/tiers/anim/bronze.png";
import animSilver from "@/assets/tiers/anim/silver.png";
import animGold from "@/assets/tiers/anim/gold.png";
import animEmerald from "@/assets/tiers/anim/emerald.png";
import animDiamond from "@/assets/tiers/anim/diamond.png";
import animChampion from "@/assets/tiers/anim/champion.png";

const ANIM_BADGES: Record<string, string> = {
  bronze: animBronze,
  silver: animSilver,
  gold: animGold,
  emerald: animEmerald,
  diamond: animDiamond,
  champion: animChampion,
};

// Regular badges for "old tier" dissolve
import bronzeImg from "@/assets/tiers/bronze.png";
import silverImg from "@/assets/tiers/silver.png";
import goldImg from "@/assets/tiers/gold.png";
import emeraldImg from "@/assets/tiers/emerald.png";
import diamondImg from "@/assets/tiers/diamond.png";
import championImg from "@/assets/tiers/champion.png";

const OLD_BADGES: Record<string, string> = {
  bronze: bronzeImg,
  silver: silverImg,
  gold: goldImg,
  emerald: emeraldImg,
  diamond: diamondImg,
  champion: championImg,
};

interface RankUpOverlayProps {
  tier: string;
  division: number;
  type: "division_up" | "tier_up" | "champion_in" | "division_down" | "tier_down" | "placement_reveal";
  previousTier?: string;
  placementScore?: number;
  placementLabel?: string;
  onDismiss: () => void;
}

const DURATIONS: Record<string, number> = {
  division_up: 3000,
  tier_up: 5500,
  champion_in: 7000,
  division_down: 3000,
  tier_down: 3000,
  placement_reveal: 6000,
};

const RAY_COUNT = 12;

const RankUpOverlay = ({ tier, division, type, previousTier, placementScore, placementLabel, onDismiss }: RankUpOverlayProps) => {
  const [stage, setStage] = useState(0);
  const [dismissing, setDismissing] = useState(false);
  const prefersReduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  const color = getTierColor(tier);
  const label = getDivisionLabel(tier, division);
  const isPromotion = type === "division_up" || type === "tier_up" || type === "champion_in" || type === "placement_reveal";
  const isTierUp = type === "tier_up" || type === "champion_in";
  const isPlacement = type === "placement_reveal";
  const isDemotion = type === "division_down" || type === "tier_down";
  const duration = DURATIONS[type] || 5000;

  const badgeSrc = ANIM_BADGES[tier?.toLowerCase()] || ANIM_BADGES.bronze;
  const oldBadgeSrc = previousTier ? (OLD_BADGES[previousTier?.toLowerCase()] || OLD_BADGES.bronze) : null;

  const dismiss = useCallback(() => {
    if (dismissing) return;
    setDismissing(true);
    setTimeout(onDismiss, 300);
  }, [dismissing, onDismiss]);

  // Stage progression
  useEffect(() => {
    if (isDemotion) {
      const t1 = setTimeout(() => setStage(1), 200);
      const t2 = setTimeout(() => setStage(2), 800);
      const t3 = setTimeout(dismiss, duration);
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    }

    if (type === "division_up") {
      const t1 = setTimeout(() => setStage(1), 100);
      const t2 = setTimeout(() => setStage(2), 400);
      const t3 = setTimeout(() => setStage(3), 800);
      const t4 = setTimeout(dismiss, duration);
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
    }

    if (isPlacement) {
      const timers = [
        setTimeout(() => setStage(1), 400),
        setTimeout(() => setStage(2), 1000),
        setTimeout(() => setStage(3), 1800),
        setTimeout(() => setStage(4), 2800),
        setTimeout(() => setStage(5), 4200),
        setTimeout(dismiss, duration),
      ];
      return () => timers.forEach(clearTimeout);
    }

    // Tier up & Champion
    const timers = [
      setTimeout(() => setStage(1), 300),   // Old badge dissolve / overlay settles
      setTimeout(() => setStage(2), 800),    // Light rays appear, confetti wave 1
      setTimeout(() => setStage(3), 1500),   // Badge springs in
      setTimeout(() => setStage(4), 2500),   // Text reveals
      setTimeout(() => setStage(5), 4000),   // Subtitle, glow pulse
      setTimeout(dismiss, duration),
    ];
    return () => timers.forEach(clearTimeout);
  }, [type, isDemotion, duration, dismiss]);

  // Audio
  useEffect(() => {
    if (prefersReduced) return;
    if (type === "division_up") rankUpAudio.playDivisionUp();
    else if (type === "tier_up" || type === "placement_reveal") rankUpAudio.playTierUp();
    else if (type === "champion_in") rankUpAudio.playChampionIn();
    // No sound for demotions
  }, [type, prefersReduced]);

  // Haptic feedback for tier-ups and placement reveals
  useEffect(() => {
    if ((isTierUp || isPlacement) && navigator.vibrate) {
      navigator.vibrate([100, 50, 200]);
    }
  }, [isTierUp, isPlacement]);

  // ─── Render: PLACEMENT REVEAL ───
  if (isPlacement) {
    const tierName = TIER_CONFIG[tier?.toLowerCase() as TierName]?.name?.toUpperCase() ?? tier?.toUpperCase();
    return (
      <div
        className={`fixed inset-0 z-[100] flex items-center justify-center transition-opacity duration-300 ${dismissing ? "opacity-0" : "opacity-100"}`}
        style={{ backgroundColor: "rgba(0,0,0,0.92)" }}
        onClick={dismiss}
      >
        <style>{`
          @keyframes placementFadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes placementBadgePop {
            0% { transform: scale(0.2); opacity: 0; }
            60% { transform: scale(1.2); opacity: 1; }
            80% { transform: scale(0.95); }
            100% { transform: scale(1); opacity: 1; }
          }
          @keyframes placementGlow {
            0%, 100% { filter: drop-shadow(0 0 15px ${color}60); }
            50% { filter: drop-shadow(0 0 35px ${color}bb); }
          }
          @keyframes scoreCount {
            from { opacity: 0; transform: scale(0.5); }
            to { opacity: 1; transform: scale(1); }
          }
        `}</style>

        {!prefersReduced && stage >= 2 && (
          <RankUpConfetti tier={tier} intensity="tier" delay={0} />
        )}

        <div className="flex flex-col items-center gap-5 px-4 relative z-[5]">
          {/* Header text */}
          <div
            style={{
              animation: stage >= 1 ? "placementFadeIn 0.6s ease-out forwards" : "none",
              opacity: stage >= 1 ? undefined : 0,
            }}
          >
            <p className="text-xs font-bold tracking-[0.3em] text-primary uppercase text-center">
              Placement Complete
            </p>
          </div>

          {/* Score */}
          {stage >= 2 && placementScore !== undefined && (
            <div
              className="text-center"
              style={{ animation: "scoreCount 0.5s ease-out forwards" }}
            >
              <p className="text-4xl font-black tabular-nums" style={{ color }}>
                {Math.round(placementScore)}%
              </p>
              <p className="text-xs text-muted-foreground mt-1">Compliance Score</p>
            </div>
          )}

          {/* Badge */}
          <div
            className="relative"
            style={{
              width: "min(60vw, 280px)",
              height: "min(60vw, 280px)",
              animation: stage >= 3 ? "placementBadgePop 1s cubic-bezier(0.34, 1.56, 0.64, 1) forwards" : "none",
              opacity: stage >= 3 ? undefined : 0,
            }}
          >
            <img
              src={badgeSrc}
              className="w-full h-full object-contain"
              alt={tier}
              draggable={false}
              style={{
                animation: stage >= 5 ? "placementGlow 2s ease-in-out infinite" : "none",
              }}
            />
          </div>

          {/* Rank label */}
          {stage >= 4 && (
            <div
              className="text-center"
              style={{ animation: "placementFadeIn 0.5s ease-out forwards" }}
            >
              <h1 className="text-3xl font-black tracking-wider" style={{ color }}>
                {label}
              </h1>
              <p className="text-sm text-muted-foreground mt-2">
                Your journey begins here. Climb the ranks! 🏆
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Render: DEMOTION ───
  if (isDemotion) {
    return (
      <div
        className={`fixed inset-0 z-[100] flex items-center justify-center transition-opacity duration-300 ${dismissing ? "opacity-0" : "opacity-100"}`}
        style={{ backgroundColor: "rgba(0,0,0,0.8)" }}
        onClick={dismiss}
      >
        <style>{`
          @keyframes demotionShake {
            0%, 100% { transform: translateX(0) translateY(0); }
            10% { transform: translateX(-4px) translateY(2px); }
            30% { transform: translateX(4px) translateY(-1px); }
            50% { transform: translateX(-3px) translateY(1px); }
            70% { transform: translateX(3px); }
            90% { transform: translateX(-2px); }
          }
          @keyframes slideDown {
            from { transform: translateY(-30px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
        `}</style>
        <div className="flex flex-col items-center gap-4 px-4">
          <div
            className="w-32 h-32"
            style={{
              animation: stage >= 1 ? "demotionShake 0.6s ease-out, slideDown 0.4s ease-out" : "none",
              opacity: stage >= 1 ? 1 : 0,
              filter: "grayscale(40%) brightness(0.7)",
            }}
          >
            <img src={badgeSrc} className="w-full h-full object-contain" alt={tier} draggable={false} />
          </div>
          <h2
            className="text-2xl font-bold text-red-400 transition-opacity duration-300"
            style={{ opacity: stage >= 2 ? 1 : 0 }}
          >
            {label}
          </h2>
          <p
            className="text-sm text-muted-foreground transition-opacity duration-300"
            style={{ opacity: stage >= 2 ? 1 : 0 }}
          >
            {type === "tier_down" ? "Tier demoted. Time to fight back! ⚔️" : "Division dropped. Keep pushing! 💪"}
          </p>
        </div>
      </div>
    );
  }

  // ─── Render: DIVISION UP ───
  if (type === "division_up") {
    return (
      <div
        className={`fixed inset-0 z-[100] flex items-center justify-center transition-opacity duration-300 ${dismissing ? "opacity-0" : "opacity-100"}`}
        style={{ backgroundColor: "rgba(0,0,0,0.85)" }}
        onClick={dismiss}
      >
        <style>{`
          @keyframes divBadgePop {
            0% { transform: scale(0.6); opacity: 0; }
            60% { transform: scale(1.15); opacity: 1; }
            100% { transform: scale(1); opacity: 1; }
          }
          @keyframes divTextSlide {
            from { transform: translateY(20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
          @keyframes shimmerSweep {
            0% { left: -100%; }
            100% { left: 200%; }
          }
        `}</style>

        {!prefersReduced && <RankUpConfetti tier={tier} intensity="division" delay={100} />}

        <div className="flex flex-col items-center gap-4 px-4 relative">
          {/* Badge with shimmer */}
          <div
            className="w-40 h-40 relative overflow-hidden"
            style={{
              animation: stage >= 2 ? "divBadgePop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards" : "none",
              opacity: stage >= 2 ? undefined : 0,
            }}
          >
            <img src={badgeSrc} className="w-full h-full object-contain relative z-[2]" alt={tier} draggable={false} />
            {/* Shimmer sweep */}
            {stage >= 2 && !prefersReduced && (
              <div
                className="absolute top-0 w-[50%] h-full z-[3] pointer-events-none"
                style={{
                  background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)`,
                  animation: "shimmerSweep 0.8s ease-out 0.3s forwards",
                  left: "-100%",
                }}
              />
            )}
          </div>

          {/* Label */}
          <h1
            className="text-3xl font-black tracking-wider"
            style={{
              color,
              animation: stage >= 3 ? "divTextSlide 0.4s ease-out forwards" : "none",
              opacity: stage >= 3 ? undefined : 0,
            }}
          >
            {label}
          </h1>
          <p
            className="text-sm text-emerald-400 transition-opacity duration-300"
            style={{ opacity: stage >= 3 ? 1 : 0 }}
          >
            Division promoted! 🎉
          </p>
        </div>
      </div>
    );
  }

  // ─── Render: TIER UP / CHAMPION ───
  const isChampion = type === "champion_in";
  const tierName = TIER_CONFIG[tier?.toLowerCase() as TierName]?.name?.toUpperCase() ?? tier?.toUpperCase();

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center transition-opacity duration-300 ${dismissing ? "opacity-0" : "opacity-100"}`}
      style={{ backgroundColor: "rgba(0,0,0,0.92)" }}
      onClick={dismiss}
    >
      <style>{`
        @keyframes overlayPulse {
          0%, 100% { opacity: 0.92; }
          50% { opacity: 0.96; }
        }
        @keyframes oldBadgeDissolve {
          0% { transform: scale(1); opacity: 0.8; filter: blur(0); }
          100% { transform: scale(0.5); opacity: 0; filter: blur(12px); }
        }
        @keyframes glowRingExpand {
          0% { transform: scale(0); opacity: 1; }
          100% { transform: scale(3); opacity: 0; }
        }
        @keyframes badgeSpringIn {
          0% { transform: scale(${isChampion ? "0.3" : "0.4"}); opacity: 0; }
          60% { transform: scale(${isChampion ? "1.3" : "1.2"}); opacity: 1; }
          80% { transform: scale(0.95); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes badgeGlow {
          0%, 100% { filter: drop-shadow(0 0 20px ${color}80); }
          50% { filter: drop-shadow(0 0 40px ${color}cc); }
        }
        @keyframes rayRotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes textCharReveal {
          0% { transform: scale(0.3) translateY(10px); opacity: 0; }
          60% { transform: scale(1.1) translateY(-2px); opacity: 1; }
          100% { transform: scale(1) translateY(0); opacity: 1; }
        }
        @keyframes subtitleFade {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes borderShimmer {
          0% { opacity: 0; }
          30% { opacity: 0.6; }
          70% { opacity: 0.6; }
          100% { opacity: 0; }
        }
      `}</style>

      {/* Champion golden border */}
      {isChampion && stage >= 2 && !prefersReduced && (
        <div
          className="absolute inset-0 pointer-events-none z-[1]"
          style={{
            border: `2px solid ${color}`,
            boxShadow: `inset 0 0 60px ${color}40, 0 0 60px ${color}20`,
            animation: "borderShimmer 3s ease-in-out",
          }}
        />
      )}

      {/* Confetti */}
      {!prefersReduced && stage >= 2 && (
        <RankUpConfetti
          tier={tier}
          intensity={isChampion ? "champion" : "tier"}
          delay={0}
          secondWaveDelay={isChampion ? 1500 : undefined}
        />
      )}

      {/* Light rays behind badge */}
      {isTierUp && stage >= 2 && !prefersReduced && (
        <div
          className="absolute z-[2] pointer-events-none"
          style={{
            width: "400px",
            height: "400px",
            animation: `rayRotate ${isChampion ? "6s" : "8s"} linear infinite`,
          }}
        >
          {Array.from({ length: RAY_COUNT }).map((_, i) => (
            <div
              key={i}
              className="absolute"
              style={{
                width: "4px",
                height: "200px",
                left: "50%",
                top: "50%",
                marginLeft: "-2px",
                marginTop: "-200px",
                transformOrigin: "center bottom",
                transform: `rotate(${(360 / RAY_COUNT) * i}deg)`,
                background: `linear-gradient(to top, ${color}60, transparent)`,
                borderRadius: "2px",
              }}
            />
          ))}
        </div>
      )}

      <div className="flex flex-col items-center gap-4 px-4 relative z-[5] max-w-[90vw]">
        {/* Old badge dissolve (tier-up only, stage 1) */}
        {isTierUp && oldBadgeSrc && stage >= 1 && stage < 3 && !prefersReduced && (
          <div
            className="absolute w-28 h-28"
            style={{ animation: "oldBadgeDissolve 1.0s ease-out forwards" }}
          >
            <img src={oldBadgeSrc} className="w-full h-full object-contain" alt="previous tier" draggable={false} />
          </div>
        )}

        {/* Glow ring (before badge) */}
        {isTierUp && stage >= 2 && !prefersReduced && (
          <div
            className="absolute w-16 h-16 rounded-full"
            style={{
              backgroundColor: `${color}40`,
              animation: "glowRingExpand 1s ease-out forwards",
            }}
          />
        )}

        {/* Main badge */}
        <div
          className="relative overflow-hidden"
          style={{
            width: isChampion ? "min(70vw, 340px)" : "min(60vw, 300px)",
            height: isChampion ? "min(70vw, 340px)" : "min(60vw, 300px)",
            animation: stage >= 3
              ? `badgeSpringIn ${isChampion ? "2s" : "0.8s"} cubic-bezier(0.34, 1.56, 0.64, 1) forwards`
              : "none",
            opacity: stage >= 3 ? undefined : 0,
          }}
        >
          <img
            src={badgeSrc}
            className="w-full h-full object-contain"
            alt={tier}
            draggable={false}
            style={{
              animation: stage >= 5 ? "badgeGlow 2s ease-in-out infinite" : "none",
            }}
          />
        </div>

        {/* Tier name with per-character reveal */}
        <div
          className="flex justify-center overflow-hidden"
          style={{ minHeight: "40px" }}
        >
          {stage >= 4 && (
            <h1 className="text-3xl font-black tracking-[0.2em] flex">
              {tierName.split("").map((char, i) => (
                <span
                  key={i}
                  style={{
                    color,
                    display: "inline-block",
                    animation: `textCharReveal 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) ${i * (isChampion ? 80 : 50)}ms forwards`,
                    opacity: 0,
                    textShadow: isChampion ? `0 0 20px ${color}80` : "none",
                  }}
                >
                  {char}
                </span>
              ))}
            </h1>
          )}
        </div>

        {/* Division label for tier-up */}
        {type === "tier_up" && stage >= 4 && (
          <p
            className="text-lg font-semibold text-muted-foreground"
            style={{
              animation: "subtitleFade 0.5s ease-out 0.3s forwards",
              opacity: 0,
            }}
          >
            Division {["V", "IV", "III", "II", "I"][5 - division] ?? "V"}
          </p>
        )}

        {/* Subtitle */}
        {stage >= 5 && (
          <div
            style={{
              animation: "subtitleFade 0.5s ease-out forwards",
              opacity: 0,
            }}
          >
            {type === "tier_up" && (
              <p className="text-sm text-emerald-400 font-medium">
                New tier unlocked! 🏆
              </p>
            )}
            {isChampion && (
              <p className="text-sm font-bold animate-pulse" style={{ color: "#FF4444" }}>
                Only 5 can hold this rank. ⚔️
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default RankUpOverlay;
