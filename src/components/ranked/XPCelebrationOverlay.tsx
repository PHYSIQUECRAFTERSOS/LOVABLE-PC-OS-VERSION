import { useEffect, useRef, useState, useCallback } from "react";
import CardioIcon from "@/assets/Cardio_icon.png";
import MacroIcon from "@/assets/macro_icon.png";
import { rankUpAudio } from "@/services/RankUpAudioService";

const CONFETTI_COLORS = [
  "hsl(43, 72%, 55%)",
  "hsl(43, 80%, 65%)",
  "hsl(145, 63%, 42%)",
  "hsl(145, 63%, 55%)",
  "hsl(38, 70%, 50%)",
  "hsl(48, 85%, 60%)",
];

interface BreakdownItem {
  label: string;
  xp: number;
}

interface XPCelebrationOverlayProps {
  type: "cardio" | "nutrition";
  totalXP: number;
  breakdown: BreakdownItem[];
  onDismiss: () => void;
  evalDateLabel?: string;
}

const XPCelebrationOverlay = ({ type, totalXP, breakdown, onDismiss, evalDateLabel }: XPCelebrationOverlayProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [displayXP, setDisplayXP] = useState(0);
  const [visibleLines, setVisibleLines] = useState(0);
  const [stage, setStage] = useState<"enter" | "counting" | "breakdown" | "exit">("enter");
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Haptic feedback
  useEffect(() => {
    if (navigator.vibrate) navigator.vibrate([50, 30, 80]);
    rankUpAudio.playXPChime();
  }, []);

  // Animation stages
  useEffect(() => {
    const t1 = setTimeout(() => setStage("counting"), 400);
    const t2 = setTimeout(() => setStage("breakdown"), 1200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  // Animated XP counter
  useEffect(() => {
    if (stage !== "counting" && stage !== "breakdown") return;
    const duration = 800;
    const start = performance.now();
    const target = Math.abs(totalXP);
    let raf: number;
    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayXP(Math.round(eased * target));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stage, totalXP]);

  // Staggered breakdown lines
  useEffect(() => {
    if (stage !== "breakdown") return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    breakdown.forEach((_, i) => {
      timers.push(setTimeout(() => setVisibleLines(i + 1), i * 250));
    });
    return () => timers.forEach(clearTimeout);
  }, [stage, breakdown]);

  // Auto-dismiss after 4s from breakdown
  useEffect(() => {
    if (stage !== "breakdown") return;
    dismissTimerRef.current = setTimeout(() => {
      setStage("exit");
      setTimeout(onDismiss, 300);
    }, 3500);
    return () => clearTimeout(dismissTimerRef.current);
  }, [stage, onDismiss]);

  // Confetti burst
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    const cx = w / 2;
    const cy = h * 0.25;

    interface P { x: number; y: number; vx: number; vy: number; size: number; color: string; rot: number; rs: number; opacity: number; }
    const particles: P[] = Array.from({ length: 60 }, () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2.5 + Math.random() * 5;
      return {
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 3.5,
        size: 3 + Math.random() * 5,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        rot: Math.random() * 360, rs: (Math.random() - 0.5) * 12, opacity: 1,
      };
    });

    let frame = 0;
    const maxFrames = 100;
    const animate = () => {
      if (frame >= maxFrames) { ctx.clearRect(0, 0, w, h); return; }
      ctx.clearRect(0, 0, w, h);
      for (const p of particles) {
        p.x += p.vx; p.vy += 0.13; p.y += p.vy; p.vx *= 0.98;
        p.rot += p.rs; p.opacity = Math.max(0, 1 - frame / maxFrames);
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate((p.rot * Math.PI) / 180);
        ctx.globalAlpha = p.opacity; ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
      frame++;
      requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, []);

  const handleDismiss = useCallback(() => {
    clearTimeout(dismissTimerRef.current);
    setStage("exit");
    setTimeout(onDismiss, 300);
  }, [onDismiss]);

  const icon = type === "cardio" ? CardioIcon : MacroIcon;
  const isGain = totalXP >= 0;
  const title = type === "cardio" ? "Cardio Complete!" : "Daily XP Summary";

  return (
    <>
      <style>{`
        @keyframes xpIconPulse {
          0%, 100% { transform: scale(1); filter: drop-shadow(0 0 8px hsl(43, 72%, 55%)); }
          50% { transform: scale(1.12); filter: drop-shadow(0 0 20px hsl(43, 80%, 65%)); }
        }
        @keyframes xpScaleBounce {
          0% { transform: scale(0.3); opacity: 0; }
          60% { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes xpCountUp {
          from { transform: scale(0.8); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        @keyframes xpLineIn {
          from { transform: translateY(8px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes xpShimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes xpOverlayIn {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes xpOverlayOut {
          from { transform: translateY(0); opacity: 1; }
          to { transform: translateY(100%); opacity: 0; }
        }
      `}</style>

      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[100] bg-black/60"
        onClick={handleDismiss}
        style={{
          opacity: stage === "exit" ? 0 : 1,
          transition: "opacity 0.3s ease",
        }}
      />

      {/* Bottom sheet */}
      <div
        className="fixed inset-x-0 bottom-0 z-[101] rounded-t-2xl border-t border-border bg-card"
        onClick={handleDismiss}
        style={{
          animation: stage === "exit"
            ? "xpOverlayOut 0.3s ease-in forwards"
            : "xpOverlayIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards",
          maxHeight: "55vh",
        }}
      >
        {/* Confetti canvas */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 pointer-events-none z-10"
          style={{ width: "100%", height: "100%" }}
        />

        {/* Grab handle */}
        <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-muted" />

        <div className="relative z-20 flex flex-col items-center px-6 pt-6 pb-8 space-y-4">
          {/* Icon with pulsing glow */}
          <div
            style={{
              animation: stage !== "enter"
                ? "xpIconPulse 2s ease-in-out infinite"
                : "xpScaleBounce 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
            }}
          >
            <div className="h-20 w-20 rounded-2xl bg-primary/10 border-2 border-primary/30 flex items-center justify-center overflow-hidden">
              <img src={icon} alt={type} className="h-14 w-14 object-contain" />
            </div>
          </div>

          {/* Title */}
          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {title}
            </p>
            {evalDateLabel && (
              <p className="text-xs text-muted-foreground/70 mt-0.5">
                Results for {evalDateLabel}
              </p>
            )}
          </div>

          {/* XP counter */}
          <div
            style={{
              animation: stage === "counting" || stage === "breakdown"
                ? "xpCountUp 0.4s ease-out forwards"
                : "none",
              opacity: stage === "enter" ? 0 : 1,
            }}
          >
            <span
              className="text-4xl font-black"
              style={{
                background: isGain
                  ? "linear-gradient(135deg, hsl(145, 63%, 42%), hsl(43, 80%, 65%))"
                  : "linear-gradient(135deg, hsl(0, 72%, 50%), hsl(0, 60%, 40%))",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundSize: "200% 100%",
                animation: "xpShimmer 2s linear infinite",
              }}
            >
              {isGain ? "+" : "-"}{displayXP} XP
            </span>
          </div>

          {/* Breakdown lines */}
          {breakdown.length > 0 && (
            <div className="w-full max-w-xs space-y-1.5 pt-1">
              {breakdown.slice(0, visibleLines).map((item, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-sm"
                  style={{ animation: "xpLineIn 0.3s ease-out forwards" }}
                >
                  <span className="text-muted-foreground">{item.label}</span>
                  <span
                    className={`font-bold ${
                      item.xp >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {item.xp >= 0 ? "+" : ""}{item.xp} XP
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default XPCelebrationOverlay;
