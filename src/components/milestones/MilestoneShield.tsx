import { motion } from "framer-motion";
import * as Icons from "lucide-react";
import { TIER_RING, MilestoneTier } from "@/utils/milestoneDefinitions";

interface Props {
  number: number;
  tier: MilestoneTier;
  lucideIcon?: string | null;
  fallbackEmoji?: string;
}

export default function MilestoneShield({ number, tier, lucideIcon, fallbackEmoji = "🏆" }: Props) {
  const IconComp = (lucideIcon && (Icons as any)[lucideIcon]) || null;
  const ringClass = TIER_RING[tier] ?? TIER_RING.gold;

  return (
    <motion.div
      initial={{ scale: 0, rotate: -180, opacity: 0 }}
      animate={{ scale: 1, rotate: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 140, damping: 14, delay: 0.15 }}
      className="relative"
    >
      {/* Outer glow */}
      <div className="absolute inset-0 -m-8 rounded-full bg-[#D4A017]/30 blur-3xl animate-pulse" />

      {/* Shield container */}
      <div className="relative w-64 h-72">
        <svg viewBox="0 0 200 230" className="w-full h-full drop-shadow-[0_20px_40px_rgba(212,160,23,0.45)]">
          <defs>
            <linearGradient id="shieldFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1a1a1a" />
              <stop offset="60%" stopColor="#0f0f0f" />
              <stop offset="100%" stopColor="#000" />
            </linearGradient>
            <linearGradient id="shieldRing" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f5e6a8" />
              <stop offset="50%" stopColor="#D4A017" />
              <stop offset="100%" stopColor="#8a6b13" />
            </linearGradient>
            <linearGradient id="shimmer" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="rgba(255,255,255,0)" />
              <stop offset="50%" stopColor="rgba(255,255,255,0.3)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </linearGradient>
          </defs>
          <path
            d="M100 10 L185 40 L185 130 Q185 190 100 220 Q15 190 15 130 L15 40 Z"
            fill="url(#shieldFill)"
            stroke="url(#shieldRing)"
            strokeWidth="6"
          />
          {/* shimmer sweep */}
          <motion.path
            d="M100 10 L185 40 L185 130 Q185 190 100 220 Q15 190 15 130 L15 40 Z"
            fill="url(#shimmer)"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.6, 0] }}
            transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 1.5, delay: 1 }}
          />
        </svg>

        {/* Number */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pt-2 pointer-events-none">
          <CountUp value={number} />
          <div className="mt-2">
            {IconComp ? (
              <IconComp size={56} strokeWidth={2.2} className="text-[#D4A017]" />
            ) : (
              <span className="text-5xl">{fallbackEmoji}</span>
            )}
          </div>
          <div className={`mt-3 text-[10px] uppercase tracking-[0.3em] font-bold bg-gradient-to-r ${ringClass} bg-clip-text text-transparent`}>
            {tier}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function CountUp({ value }: { value: number }) {
  return (
    <motion.span
      key={value}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.4 }}
      className="font-display text-7xl font-black text-[#D4A017] tabular-nums leading-none"
      style={{ textShadow: "0 2px 20px rgba(212,160,23,0.6)" }}
    >
      <CountUpInner value={value} />
    </motion.span>
  );
}

function CountUpInner({ value }: { value: number }) {
  // Local count-up animation via requestAnimationFrame
  const [displayed, setDisplayed] = useStateCountUp(value);
  return <>{displayed}</>;
}

import { useEffect, useState } from "react";

function useStateCountUp(target: number): [number, (n: number) => void] {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let raf = 0;
    const startTime = performance.now();
    const duration = 900;
    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(eased * target));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return [val, setVal];
}
