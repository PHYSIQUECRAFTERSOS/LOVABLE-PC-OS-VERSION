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
  placement_reveal: 8000,
};

const RAY_COUNT = 12;

const RankUpOverlay = ({ tier, division, type, previousTier, placementScore, placementLabel, onDismiss }: RankUpOverlayProps) => {
  const [stage, setStage] = useState(0);
  const [dismissing, setDismissing] = useState(false);
  const [countedScore, setCountedScore] = useState(0);
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

  // Animated score counter for placement
  useEffect(() => {
    if (!isPlacement || stage < 2 || placementScore === undefined) return;
    const target = Math.round(placementScore);
    if (target <= 0) { setCountedScore(0); return; }
    
    let current = 0;
    const step = Math.max(1, Math.floor(target / 30));
    const interval = setInterval(() => {
      current = Math.min(current + step, target);
      setCountedScore(current);
      if (current >= target) clearInterval(interval);
    }, 30);
    return () => clearInterval(interval);
  }, [isPlacement, stage, placementScore]);

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
        setTimeout(() => setStage(1), 500),    // "Placement Complete" text
        setTimeout(() => setStage(2), 1200),    // Score counter starts
        setTimeout(() => setStage(3), 2200),    // Badge pops in + confetti
        setTimeout(() => setStage(4), 3200),    // Rank label reveals
        setTimeout(() => setStage(5), 4500),    // Subtitle + rays
        setTimeout(() => setStage(6), 5500),    // Final glow pulse
        setTimeout(dismiss, duration),
      ];
      return () => timers.forEach(clearTimeout);
    }

    // Tier up & Champion
    const timers = [
      setTimeout(() => setStage(1), 300),
      setTimeout(() => setStage(2), 800),
      setTimeout(() => setStage(3), 1500),
      setTimeout(() => setStage(4), 2500),
      setTimeout(() => setStage(5), 4000),
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
  }, [type, prefersReduced]);

  // Haptic feedback
  useEffect(() => {
    if ((isTierUp || isPlacement) && navigator.vibrate) {
      navigator.vibrate([100, 50, 200]);
    }
  }, [isTierUp, isPlacement]);

  // Second haptic burst when badge appears
  useEffect(() => {
    if (isPlacement && stage === 3 && navigator.vibrate) {
      navigator.vibrate([50, 30, 100, 30, 150]);
    }
  }, [isPlacement, stage]);

  // ─── Render: PLACEMENT REVEAL ───
  if (isPlacement) {
    const tierName = TIER_CONFIG[tier?.toLowerCase() as TierName]?.name?.toUpperCase() ?? tier?.toUpperCase();
    const scoreColor = (placementScore || 0) >= 90 ? "#FFD700" : (placementScore || 0) >= 70 ? "#50C878" : (placementScore || 0) >= 50 ? "#C0C0C0" : "#CD7F32";

    return (
      <div
        className={`fixed inset-0 z-[100] flex items-center justify-center transition-opacity duration-300 ${dismissing ? "opacity-0" : "opacity-100"}`}
        style={{ backgroundColor: "rgba(0,0,0,0.95)" }}
        onClick={dismiss}
      >
        <style>{`
          @keyframes placementFadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes placementBadgePop {
            0% { transform: scale(0); opacity: 0; }
            50% { transform: scale(1.3); opacity: 1; }
            70% { transform: scale(0.9); }
            85% { transform: scale(1.1); }
            100% { transform: scale(1); opacity: 1; }
          }
          @keyframes placementGlow {
            0%, 100% { filter: drop-shadow(0 0 15px ${color}60); }
            50% { filter: drop-shadow(0 0 45px ${color}cc); }
          }
          @keyframes scoreReveal {
            0% { opacity: 0; transform: scale(0.3) rotate(-10deg); }
            60% { transform: scale(1.1) rotate(2deg); }
            100% { opacity: 1; transform: scale(1) rotate(0deg); }
          }
          @keyframes labelSlideUp {
            from { opacity: 0; transform: translateY(30px) scale(0.8); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
          @keyframes ringExpand {
            0% { transform: scale(0.5); opacity: 0.8; }
            100% { transform: scale(2.5); opacity: 0; }
          }
          @keyframes sparkle {
            0%, 100% { opacity: 0; transform: scale(0); }
            50% { opacity: 1; transform: scale(1); }
          }
          @keyframes rayRotateSlow {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          @keyframes subtitleReveal {
            from { opacity: 0; letter-spacing: 0.5em; }
            to { opacity: 1; letter-spacing: 0.15em; }
          }
        `}</style>

        {/* Light rays behind badge */}
        {stage >= 5 && !prefersReduced && (
          <div
            className="absolute z-[1] pointer-events-none"
            style={{
              width: "350px",
              height: "350px",
              animation: "rayRotateSlow 10s linear infinite",
            }}
          >
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="absolute"
                style={{
                  width: "3px",
                  height: "175px",
                  left: "50%",
                  top: "50%",
                  marginLeft: "-1.5px",
                  marginTop: "-175px",
                  transformOrigin: "center bottom",
                  transform: `rotate(${(360 / 8) * i}deg)`,
                  background: `linear-gradient(to top, ${color}40, transparent)`,
                  borderRadius: "2px",
                }}
              />
            ))}
          </div>
        )}

        {/* Confetti - two waves */}
        {!prefersReduced && stage >= 3 && (
          <RankUpConfetti tier={tier} intensity="tier" delay={0} />
        )}
        {!prefersReduced && stage >= 5 && (
          <RankUpConfetti tier={tier} intensity="division" delay={200} />
        )}

        {/* Expanding ring on badge appear */}
        {stage >= 3 && !prefersReduced && (
          <div
            className="absolute z-[2] pointer-events-none rounded-full border-2"
            style={{
              width: "120px",
              height: "120px",
              borderColor: color,
              animation: "ringExpand 1s ease-out forwards",
            }}
          />
        )}

        <div className="flex flex-col items-center gap-5 px-4 relative z-[5]">
          {/* Header text */}
          <div
            style={{
              animation: stage >= 1 ? "placementFadeIn 0.8s ease-out forwards" : "none",
              opacity: stage >= 1 ? undefined : 0,
            }}
          >
            <p
              className="text-sm font-bold tracking-[0.3em] uppercase text-center"
              style={{ color, animation: stage >= 1 ? "subtitleReveal 1s ease-out forwards" : "none" }}
            >
              Placement Complete
            </p>
          </div>

          {/* Score with animated counter */}
          {stage >= 2 && placementScore !== undefined && (
            <div
              className="text-center"
              style={{ animation: "scoreReveal 0.6s ease-out forwards" }}
            >
              <p
                className="text-5xl font-black tabular-nums"
                style={{
                  color: scoreColor,
                  textShadow: `0 0 30px ${scoreColor}66`,
                }}
              >
                {countedScore}%
              </p>
              <p className="text-xs text-muted-foreground mt-1 tracking-wide">Consistency Score</p>
            </div>
          )}

          {/* Badge with spring pop */}
          <div
            className="relative"
            style={{
              width: "min(65vw, 300px)",
              height: "min(65vw, 300px)",
              animation: stage >= 3 ? "placementBadgePop 1.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards" : "none",
              opacity: stage >= 3 ? undefined : 0,
            }}
          >
            <img
              src={badgeSrc}
              className="w-full h-full object-contain"
              alt={tier}
              draggable={false}
              style={{
                animation: stage >= 6 ? "placementGlow 2s ease-in-out infinite" : "none",
              }}
            />

            {/* Sparkle particles around badge */}
            {stage >= 4 && !prefersReduced && (
              <>
                {[0, 60, 120, 180, 240, 300].map((angle, i) => (
                  <div
                    key={i}
                    className="absolute text-xl pointer-events-none"
                    style={{
                      top: `${50 + 45 * Math.sin((angle * Math.PI) / 180)}%`,
                      left: `${50 + 45 * Math.cos((angle * Math.PI) / 180)}%`,
                      animation: `sparkle 1.5s ease-in-out ${i * 0.2}s infinite`,
                    }}
                  >
                    ✦
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Rank label with dramatic reveal */}
          {stage >= 4 && (
            <div
              className="text-center"
              style={{ animation: "labelSlideUp 0.7s ease-out forwards" }}
            >
              <h1
                className="text-4xl font-black tracking-wider"
                style={{
                  color,
                  textShadow: `0 0 20px ${color}44, 0 2px 4px rgba(0,0,0,0.5)`,
                }}
              >
                {label}
              </h1>
            </div>
          )}

          {/* Subtitle */}
          {stage >= 5 && (
            <div
              className="text-center space-y-1"
              style={{ animation: "placementFadeIn 0.6s ease-out forwards" }}
            >
              <p className="text-sm text-muted-foreground">
                Your journey begins here 🏆
              </p>
              <p className="text-xs text-muted-foreground/60">
                Tap to continue
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
          <div
            className="w-40 h-40 relative overflow-hidden"
            style={{
              animation: stage >= 2 ? "divBadgePop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards" : "none",
              opacity: stage >= 2 ? undefined : 0,
            }}
          >
            <img src={badgeSrc} className="w-full h-full object-contain relative z-[2]" alt={tier} draggable={false} />
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

      {!prefersReduced && stage >= 2 && (
        <RankUpConfetti
          tier={tier}
          intensity={isChampion ? "champion" : "tier"}
          delay={0}
          secondWaveDelay={isChampion ? 1500 : undefined}
        />
      )}

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
        {isTierUp && oldBadgeSrc && stage >= 1 && stage < 3 && !prefersReduced && (
          <div
            className="absolute w-28 h-28"
            style={{ animation: "oldBadgeDissolve 1.0s ease-out forwards" }}
          >
            <img src={oldBadgeSrc} className="w-full h-full object-contain" alt="previous tier" draggable={false} />
          </div>
        )}

        {isTierUp && stage >= 2 && !prefersReduced && (
          <div
            className="absolute w-36 h-36 rounded-full border-2 pointer-events-none"
            style={{
              borderColor: color,
              animation: "glowRingExpand 1.0s ease-out forwards",
            }}
          />
        )}

        <div
          className="relative"
          style={{
            width: "min(60vw, 260px)",
            height: "min(60vw, 260px)",
            animation: stage >= 3 ? `badgeSpringIn 1.0s cubic-bezier(0.34, 1.56, 0.64, 1) forwards` : "none",
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

        {stage >= 4 && (
          <div className="text-center flex flex-col items-center gap-0.5">
            <div className="flex justify-center flex-wrap gap-0">
              {tierName.split("").map((ch: string, i: number) => (
                <span
                  key={i}
                  className="text-3xl font-black tracking-wider inline-block"
                  style={{
                    color,
                    animation: `textCharReveal 0.3s ease-out ${i * 40}ms backwards`,
                    textShadow: `0 0 12px ${color}66`,
                  }}
                >
                  {ch === " " ? "\u00A0" : ch}
                </span>
              ))}
            </div>
            {!isChampion && (
              <p className="text-lg font-bold" style={{ color, animation: "subtitleFade 0.4s ease-out 0.4s backwards" }}>
                {label}
              </p>
            )}
          </div>
        )}

        {stage >= 5 && (
          <p
            className="text-sm text-center max-w-[250px]"
            style={{
              color: isChampion ? color : undefined,
              animation: "subtitleFade 0.5s ease-out forwards",
            }}
          >
            {isChampion
              ? "You've reached the pinnacle. Welcome to the elite. 👑"
              : `Welcome to ${TIER_CONFIG[tier?.toLowerCase() as TierName]?.name ?? tier}! Keep climbing! 🚀`}
          </p>
        )}
      </div>
    </div>
  );
};

export default RankUpOverlay;
