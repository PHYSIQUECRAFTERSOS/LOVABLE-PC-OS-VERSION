import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Dumbbell, HeartPulse, Apple, Flame, Trophy, Zap } from "lucide-react";
import ConfettiBurst from "@/components/workout/ConfettiBurst";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { MilestoneUnlock } from "@/hooks/useMilestoneWatcher";

interface Props {
  unlock: MilestoneUnlock | null;
  onDismiss: () => void;
}

type Variant = "workout" | "cardio" | "nutrition";

const db = supabase as any;

function variantFor(category: string): Variant {
  if (category === "workout_count") return "workout";
  if (category === "cardio_count") return "cardio";
  return "nutrition";
}

function copyFor(unlock: MilestoneUnlock): {
  eyebrow: string;
  title: string;
  subtitle: string;
  cta: string;
} {
  const n = unlock.threshold;
  const v = variantFor(unlock.category);
  if (v === "workout") {
    return {
      eyebrow: "WORKOUT",
      title: "MILESTONE UNLOCKED!",
      subtitle: `You've crushed ${n} workout${n === 1 ? "" : "s"}!\nLet's keep it going.`,
      cta: "KEEP CRUSHING IT!",
    };
  }
  if (v === "cardio") {
    return {
      eyebrow: "CARDIO SESSIONS",
      title: "CARDIO MILESTONE UNLOCKED!",
      subtitle: `You've completed ${n} cardio session${n === 1 ? "" : "s"}!\nWe're proud of you.`,
      cta: "CONTINUE",
    };
  }
  if (unlock.category === "nutrition_streak") {
    return {
      eyebrow: "NUTRITION TRACKING",
      title: "NUTRITION MILESTONE UNLOCKED!",
      subtitle: `You're on a ${n}-day tracking streak!\nKeep it rolling.`,
      cta: "CONTINUE",
    };
  }
  return {
    eyebrow: "NUTRITION TRACKING",
    title: "NUTRITION MILESTONE UNLOCKED!",
    subtitle: `You've completed ${n} day${n === 1 ? "" : "s"} of tracking!\nWe're proud of you.`,
    cta: "CONTINUE",
  };
}

function ShieldGraphic({ number, variant }: { number: number; variant: Variant }) {
  const Icon = variant === "workout" ? Dumbbell : variant === "cardio" ? HeartPulse : Apple;
  // Font-size shrinks for larger numbers so they fit inside the shield
  const digits = String(number).length;
  const numberSize = digits <= 2 ? 110 : digits === 3 ? 88 : 72;

  return (
    <motion.div
      initial={{ scale: 0.4, opacity: 0, rotate: -8 }}
      animate={{ scale: 1, opacity: 1, rotate: 0 }}
      transition={{ type: "spring", stiffness: 180, damping: 14, delay: 0.1 }}
      className="relative w-[280px] h-[280px] flex items-center justify-center"
    >
      {/* Glow */}
      <div
        className="absolute inset-0 rounded-full blur-3xl opacity-60"
        style={{
          background:
            "radial-gradient(circle, rgba(212,160,23,0.55) 0%, rgba(212,160,23,0) 65%)",
        }}
      />

      <svg viewBox="0 0 320 320" className="absolute inset-0 w-full h-full drop-shadow-[0_8px_24px_rgba(0,0,0,0.5)]">
        <defs>
          <linearGradient id="goldFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f5e6a8" />
            <stop offset="35%" stopColor="#D4A017" />
            <stop offset="70%" stopColor="#a67a0e" />
            <stop offset="100%" stopColor="#f0d878" />
          </linearGradient>
          <linearGradient id="goldRim" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff6c9" />
            <stop offset="100%" stopColor="#8a6b13" />
          </linearGradient>
          <linearGradient id="leafGold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f5e6a8" />
            <stop offset="100%" stopColor="#a67a0e" />
          </linearGradient>
        </defs>

        {/* Laurel wreath - left */}
        <g transform="translate(40, 110)" fill="url(#leafGold)" opacity="0.95">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <ellipse
              key={`l-${i}`}
              cx={20 + i * 6}
              cy={120 - i * 22}
              rx="14"
              ry="6"
              transform={`rotate(${-30 - i * 8} ${20 + i * 6} ${120 - i * 22})`}
            />
          ))}
          {[0, 1, 2, 3, 4].map((i) => (
            <ellipse
              key={`l2-${i}`}
              cx={5 + i * 6}
              cy={110 - i * 20}
              rx="12"
              ry="5"
              transform={`rotate(${-60 - i * 6} ${5 + i * 6} ${110 - i * 20})`}
            />
          ))}
        </g>

        {/* Laurel wreath - right (mirror) */}
        <g transform="translate(280, 110) scale(-1, 1)" fill="url(#leafGold)" opacity="0.95">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <ellipse
              key={`r-${i}`}
              cx={20 + i * 6}
              cy={120 - i * 22}
              rx="14"
              ry="6"
              transform={`rotate(${-30 - i * 8} ${20 + i * 6} ${120 - i * 22})`}
            />
          ))}
          {[0, 1, 2, 3, 4].map((i) => (
            <ellipse
              key={`r2-${i}`}
              cx={5 + i * 6}
              cy={110 - i * 20}
              rx="12"
              ry="5"
              transform={`rotate(${-60 - i * 6} ${5 + i * 6} ${110 - i * 20})`}
            />
          ))}
        </g>

        {/* Shield outer */}
        <path
          d="M160 30 L270 70 L270 170 Q270 240 160 290 Q50 240 50 170 L50 70 Z"
          fill="url(#goldRim)"
        />
        {/* Shield inner */}
        <path
          d="M160 45 L258 80 L258 170 Q258 230 160 275 Q62 230 62 170 L62 80 Z"
          fill="url(#goldFill)"
        />
        {/* Inner border */}
        <path
          d="M160 60 L246 90 L246 170 Q246 222 160 262 Q74 222 74 170 L74 90 Z"
          fill="none"
          stroke="#8a6b13"
          strokeWidth="2.5"
          opacity="0.7"
        />
      </svg>

      {/* Number + icon overlay */}
      <div className="relative flex flex-col items-center justify-center pt-2 pointer-events-none">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 220, damping: 14, delay: 0.5 }}
          className="font-display font-black text-[#1a1305] leading-none"
          style={{ fontSize: numberSize, textShadow: "0 2px 0 rgba(255,255,255,0.25)" }}
        >
          {number}
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.75, duration: 0.3 }}
          className="mt-1"
        >
          <Icon className="w-9 h-9 text-[#1a1305]" strokeWidth={2.5} />
        </motion.div>
      </div>
    </motion.div>
  );
}

function StatsRowWorkout({ count, prs }: { count: number; prs: number }) {
  return (
    <div className="grid grid-cols-3 divide-x divide-white/10 rounded-2xl bg-white/[0.04] border border-white/10 px-2 py-4">
      <div className="flex flex-col items-center gap-1 px-2">
        <Flame className="w-5 h-5 text-[#D4A017]" />
        <div className="text-2xl font-bold text-white leading-none mt-1">{count}</div>
        <div className="text-[11px] text-white/60 text-center leading-tight mt-1">
          Workouts<br />Completed
        </div>
      </div>
      <div className="flex flex-col items-center gap-1 px-2">
        <Trophy className="w-5 h-5 text-[#D4A017]" />
        <div className="text-2xl font-bold text-white leading-none mt-1">{prs}</div>
        <div className="text-[11px] text-white/60 text-center leading-tight mt-1">New PRs</div>
      </div>
      <div className="flex flex-col items-center gap-1 px-2">
        <Zap className="w-5 h-5 text-[#D4A017]" />
        <div className="text-2xl font-bold text-white leading-none mt-1">100%</div>
        <div className="text-[11px] text-white/60 text-center leading-tight mt-1">Dedication</div>
      </div>
    </div>
  );
}

function StatTile({
  number,
  label,
  icon: Icon,
}: {
  number: number;
  label: string;
  icon: typeof HeartPulse;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-[#8a6b13]/60 bg-gradient-to-b from-[#2a2008]/70 to-[#1a1305]/70 px-10 py-5">
      <Icon className="w-8 h-8 text-[#D4A017]" strokeWidth={2.2} />
      <div className="mt-2 text-3xl font-bold text-[#D4A017] leading-none">{number}</div>
      <div className="mt-2 text-xs text-[#D4A017]/80 text-center leading-tight whitespace-pre-line">
        {label}
      </div>
    </div>
  );
}

export default function MilestoneCelebrationV2({ unlock, onDismiss }: Props) {
  const { user } = useAuth();
  const [fireConfetti, setFireConfetti] = useState(false);
  const [prCount, setPrCount] = useState<number>(0);

  useEffect(() => {
    if (!unlock) return;
    setFireConfetti(false);
    const t = setTimeout(() => setFireConfetti(true), 350);

    (async () => {
      try {
        const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
        await Haptics.impact({ style: ImpactStyle.Heavy });
      } catch {
        if (navigator.vibrate) navigator.vibrate([20, 40, 60]);
      }
    })();

    return () => clearTimeout(t);
  }, [unlock?.id]);

  // Fetch PR count for the workout session that triggered this milestone
  useEffect(() => {
    if (!unlock || !user) return;
    if (variantFor(unlock.category) !== "workout") {
      setPrCount(0);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await db
          .from("workout_sessions")
          .select("pr_count")
          .eq("client_id", user.id)
          .eq("status", "completed")
          .order("completed_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!cancelled) setPrCount(Number(data?.pr_count ?? 0));
      } catch {
        if (!cancelled) setPrCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [unlock?.id, user?.id]);

  if (!unlock) return null;

  const variant = variantFor(unlock.category);
  const copy = copyFor(unlock);
  const n = unlock.threshold;

  return (
    <AnimatePresence>
      <motion.div
        key={unlock.id}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="fixed inset-0 z-[120] flex flex-col items-center px-6 overflow-y-auto"
        style={{
          background:
            "linear-gradient(180deg, #1a1a1f 0%, #0d0d10 50%, #050505 100%)",
          paddingTop: "max(env(safe-area-inset-top), 16px)",
          paddingBottom: "max(env(safe-area-inset-bottom), 16px)",
        }}
      >
        {/* Header */}
        <div className="w-full max-w-md flex items-center justify-between pt-2">
          <div className="flex-1" />
          <div className="font-display text-sm font-black tracking-[0.18em]">
            <span className="text-white">PHYSIQUE </span>
            <span className="text-[#D4A017]">CRAFTERS</span>
          </div>
          <div className="flex-1 flex justify-end">
            <button
              onClick={onDismiss}
              className="p-2 rounded-full hover:bg-white/10 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-white/80" />
            </button>
          </div>
        </div>

        {/* Shield */}
        <div className="relative mt-4">
          <ConfettiBurst fire={fireConfetti} />
          <ShieldGraphic number={n} variant={variant} />
        </div>

        {/* Copy */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.45 }}
          className="mt-4 text-center max-w-md"
        >
          <h2 className="font-display text-3xl font-black text-white tracking-wide">
            {copy.eyebrow}
          </h2>
          <h3 className="font-display text-2xl font-black text-[#D4A017] tracking-wide mt-1">
            {copy.title}
          </h3>
          <p className="mt-4 text-base text-white/80 leading-snug whitespace-pre-line">
            {copy.subtitle}
          </p>
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.95, duration: 0.45 }}
          className="mt-6 w-full max-w-md"
        >
          {variant === "workout" && <StatsRowWorkout count={n} prs={prCount} />}
          {variant === "cardio" && (
            <div className="flex justify-center">
              <StatTile number={n} label={"Sessions\nCompleted"} icon={HeartPulse} />
            </div>
          )}
          {variant === "nutrition" && (
            <div className="flex justify-center">
              <StatTile
                number={n}
                label={unlock.category === "nutrition_streak" ? "Day\nStreak" : "Days\nTracked"}
                icon={Apple}
              />
            </div>
          )}
        </motion.div>

        {/* CTA */}
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2, duration: 0.4 }}
          onClick={onDismiss}
          className="mt-8 mb-2 w-full max-w-md rounded-full bg-gradient-to-b from-[#f0c850] to-[#D4A017] py-4 font-display text-base font-black text-[#1a1305] tracking-wider shadow-[0_6px_20px_rgba(212,160,23,0.4)] active:scale-[0.98] transition-transform"
        >
          {copy.cta}
        </motion.button>
      </motion.div>
    </AnimatePresence>
  );
}
