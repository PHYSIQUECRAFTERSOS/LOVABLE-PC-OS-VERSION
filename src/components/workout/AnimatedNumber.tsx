import { useEffect, useRef, useState } from "react";

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  delay?: number;
  formatFn?: (n: number) => string;
  className?: string;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

const AnimatedNumber = ({
  value,
  duration = 800,
  delay = 0,
  formatFn,
  className = "",
}: AnimatedNumberProps) => {
  const [display, setDisplay] = useState("0");
  const [bouncing, setBouncing] = useState(false);
  const rafRef = useRef<number>(0);
  const startedRef = useRef(false);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (startedRef.current) return;
      startedRef.current = true;
      const start = performance.now();

      const tick = (now: number) => {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = easeOutCubic(progress);
        const current = Math.round(eased * value);

        setDisplay(formatFn ? formatFn(current) : current.toLocaleString());

        if (progress < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          setDisplay(formatFn ? formatFn(value) : value.toLocaleString());
          setBouncing(true);
          setTimeout(() => setBouncing(false), 300);
        }
      };

      rafRef.current = requestAnimationFrame(tick);
    }, delay);

    return () => {
      clearTimeout(timeout);
      cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration, delay, formatFn]);

  return (
    <span
      className={`inline-block transition-transform duration-300 ${
        bouncing ? "animate-bounce-land" : ""
      } ${className}`}
    >
      {display}
    </span>
  );
};

export default AnimatedNumber;
