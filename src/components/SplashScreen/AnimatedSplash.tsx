import { useEffect, useState } from "react";
import { SPLASH } from "@/config/splash";
import "./animated-splash.css";

interface AnimatedSplashProps {
  onComplete: () => void;
  reducedMotion: boolean;
}

/**
 * Full-screen launch overlay. Renders the brand mark + wordmark with a
 * subtle fade/scale reveal, holds, then cross-fades out and unmounts.
 * Presentation-only — no business logic, no data fetching.
 */
const AnimatedSplash = ({ onComplete, reducedMotion }: AnimatedSplashProps) => {
  const [fadingOut, setFadingOut] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Trigger reveal on next frame so initial styles paint first
    const r = requestAnimationFrame(() => setMounted(true));
    const holdTimer = setTimeout(() => {
      setFadingOut(true);
      const exitTimer = setTimeout(onComplete, SPLASH.SPLASH_FADE_OUT_MS);
      // chain cleanup via outer
      (holdTimer as any)._exit = exitTimer;
    }, SPLASH.SPLASH_DURATION_MS);

    return () => {
      cancelAnimationFrame(r);
      clearTimeout(holdTimer);
      if ((holdTimer as any)._exit) clearTimeout((holdTimer as any)._exit);
    };
  }, [onComplete]);

  const style = SPLASH.SPLASH_STYLE;
  const cls = [
    "pc-splash",
    `pc-splash--${style}`,
    mounted && "pc-splash--in",
    fadingOut && "pc-splash--out",
    reducedMotion && "pc-splash--reduced",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={cls}
      style={
        {
          backgroundColor: SPLASH.SPLASH_BG,
          ["--pc-accent" as any]: SPLASH.SPLASH_ACCENT,
          ["--pc-fade-out" as any]: `${SPLASH.SPLASH_FADE_OUT_MS}ms`,
        } as React.CSSProperties
      }
      aria-hidden="true"
    >
      <div className="pc-splash__logo">
        {/* PC monogram */}
        <svg
          className="pc-splash__mark"
          viewBox="0 0 120 60"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <g fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
            {/* P */}
            <path d="M14 52 V8 H38 a14 14 0 0 1 0 28 H14" />
            {/* C */}
            <path d="M108 16 a22 22 0 1 0 0 28" />
          </g>
        </svg>
        <div className="pc-splash__wordmark">
          <span>PHYSIQUE</span>
          <span className="pc-splash__wordmark-accent">CRAFTERS</span>
        </div>
      </div>
    </div>
  );
};

export default AnimatedSplash;
