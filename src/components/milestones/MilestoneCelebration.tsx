import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import ConfettiBurst from "@/components/workout/ConfettiBurst";
import MilestoneShield from "./MilestoneShield";
import { CATEGORY_META, pickHypeLine, MilestoneCategory, MilestoneTier } from "@/utils/milestoneDefinitions";
import type { MilestoneUnlock } from "@/hooks/useMilestoneWatcher";

interface Props {
  unlock: MilestoneUnlock | null;
  onDismiss: () => void;
}

export default function MilestoneCelebration({ unlock, onDismiss }: Props) {
  const [fireConfetti, setFireConfetti] = useState(false);

  useEffect(() => {
    if (!unlock) return;
    setFireConfetti(false);
    const t = setTimeout(() => setFireConfetti(true), 350);

    // Haptic on iOS Capacitor
    (async () => {
      try {
        const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
        await Haptics.impact({ style: ImpactStyle.Heavy });
      } catch {
        // Web fallback
        if (navigator.vibrate) navigator.vibrate([20, 40, 60]);
      }
    })();

    return () => clearTimeout(t);
  }, [unlock?.id]);

  return (
    <AnimatePresence>
      {unlock && (
        <motion.div
          key={unlock.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[120] flex flex-col items-center justify-center px-6"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(40,30,5,0.95) 0%, rgba(0,0,0,0.98) 60%)",
            paddingTop: "env(safe-area-inset-top)",
            paddingBottom: "env(safe-area-inset-bottom)",
          }}
          onClick={onDismiss}
        >
          {/* Close */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDismiss();
            }}
            className="absolute top-[max(env(safe-area-inset-top),16px)] right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors z-10"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-white/80" />
          </button>

          {/* Confetti */}
          <ConfettiBurst fire={fireConfetti} />

          {/* Shield */}
          <MilestoneShield
            number={unlock.threshold}
            tier={(unlock.badge.tier as MilestoneTier) ?? "gold"}
            lucideIcon={unlock.badge.lucide_icon}
            fallbackEmoji={unlock.badge.icon}
          />

          {/* Copy */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9, duration: 0.5 }}
            className="mt-8 text-center max-w-sm"
          >
            <p className="text-xs uppercase tracking-[0.35em] text-[#D4A017]/80 mb-2 font-semibold">
              {CATEGORY_META[unlock.category as MilestoneCategory]?.sublabel ?? "You just hit"}
            </p>
            <h2 className="font-display text-3xl font-black text-white leading-tight">
              {unlock.threshold}{" "}
              <span className="text-[#D4A017]">
                {CATEGORY_META[unlock.category as MilestoneCategory]?.unit ?? "milestone"}
              </span>
            </h2>
            <p className="mt-4 text-base text-white/70 italic">
              {unlock.badge.description || pickHypeLine(unlock.id)}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.6, duration: 0.6 }}
            className="absolute bottom-[max(env(safe-area-inset-bottom),32px)] left-0 right-0 text-center"
          >
            <p className="text-xs uppercase tracking-[0.3em] text-white/40">
              Tap anywhere to continue
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
