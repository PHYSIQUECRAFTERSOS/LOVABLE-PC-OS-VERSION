import { useEffect, useRef } from "react";

interface ConfettiBurstProps {
  fire: boolean;
  delay?: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  rotationSpeed: number;
  opacity: number;
}

const GOLD_COLORS = [
  "hsl(43, 72%, 55%)",
  "hsl(43, 80%, 65%)",
  "hsl(43, 40%, 35%)",
  "hsl(38, 70%, 50%)",
  "hsl(48, 85%, 60%)",
  "hsl(35, 60%, 45%)",
];

const ConfettiBurst = ({ fire, delay = 0 }: ConfettiBurstProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!fire || firedRef.current) return;

    const timeout = setTimeout(() => {
      firedRef.current = true;
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
      const cy = h * 0.35;

      const particles: Particle[] = Array.from({ length: 50 }, () => {
        const angle = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 5;
        return {
          x: cx,
          y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 3,
          size: 3 + Math.random() * 5,
          color: GOLD_COLORS[Math.floor(Math.random() * GOLD_COLORS.length)],
          rotation: Math.random() * 360,
          rotationSpeed: (Math.random() - 0.5) * 10,
          opacity: 1,
        };
      });

      let frame = 0;
      const maxFrames = 120;

      const animate = () => {
        if (frame >= maxFrames) {
          ctx.clearRect(0, 0, w, h);
          return;
        }
        ctx.clearRect(0, 0, w, h);

        for (const p of particles) {
          p.x += p.vx;
          p.vy += 0.12; // gravity
          p.y += p.vy;
          p.vx *= 0.98;
          p.rotation += p.rotationSpeed;
          p.opacity = Math.max(0, 1 - frame / maxFrames);

          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate((p.rotation * Math.PI) / 180);
          ctx.globalAlpha = p.opacity;
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
          ctx.restore();
        }

        frame++;
        requestAnimationFrame(animate);
      };

      requestAnimationFrame(animate);
    }, delay);

    return () => clearTimeout(timeout);
  }, [fire, delay]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-10"
      style={{ width: "100%", height: "100%" }}
    />
  );
};

export default ConfettiBurst;
