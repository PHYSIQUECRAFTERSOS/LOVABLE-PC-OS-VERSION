import { useEffect, useRef } from "react";
import { TIER_CONFIG, TierName } from "@/utils/rankedXP";

interface RankUpConfettiProps {
  tier: string;
  intensity: "division" | "tier" | "champion";
  /** Delay before firing (ms) */
  delay?: number;
  /** Fire a second wave after this many ms */
  secondWaveDelay?: number;
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
  shape: "rect" | "circle" | "star";
}

const PARTICLE_COUNTS = { division: 40, tier: 120, champion: 200 };

function getTierPalette(tier: string): string[] {
  const base = TIER_CONFIG[tier?.toLowerCase() as TierName]?.color ?? "#CD7F32";
  // Generate complementary shades
  return [
    base,
    adjustBrightness(base, 30),
    adjustBrightness(base, -20),
    adjustBrightness(base, 60),
    "#FFFFFF",
    adjustBrightness(base, -40),
  ];
}

function adjustBrightness(hex: string, amount: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount));
  const b = Math.min(255, Math.max(0, (num & 0xff) + amount));
  return `rgb(${r},${g},${b})`;
}

function createParticles(count: number, cx: number, cy: number, colors: string[]): Particle[] {
  return Array.from({ length: count }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 3 + Math.random() * 8;
    const shapes: Particle["shape"][] = ["rect", "circle", "star"];
    return {
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed * (0.5 + Math.random()),
      vy: Math.sin(angle) * speed - 4,
      size: 3 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 12,
      opacity: 1,
      shape: shapes[Math.floor(Math.random() * shapes.length)],
    };
  });
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const spikes = 5;
  const outerRadius = size;
  const innerRadius = size * 0.4;
  let rot = (Math.PI / 2) * 3;
  const step = Math.PI / spikes;
  ctx.beginPath();
  ctx.moveTo(x, y - outerRadius);
  for (let i = 0; i < spikes; i++) {
    ctx.lineTo(x + Math.cos(rot) * outerRadius, y + Math.sin(rot) * outerRadius);
    rot += step;
    ctx.lineTo(x + Math.cos(rot) * innerRadius, y + Math.sin(rot) * innerRadius);
    rot += step;
  }
  ctx.lineTo(x, y - outerRadius);
  ctx.closePath();
  ctx.fill();
}

const RankUpConfetti = ({ tier, intensity, delay = 0, secondWaveDelay }: RankUpConfettiProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;

    const colors = getTierPalette(tier);
    const count = PARTICLE_COUNTS[intensity];

    const timeout = setTimeout(() => {
      firedRef.current = true;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx2d = canvas.getContext("2d");
      if (!ctx2d) return;

      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx2d.scale(dpr, dpr);

      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      const cx = w / 2;
      const cy = h * 0.4;

      let particles = createParticles(count, cx, cy, colors);
      let frame = 0;
      const maxFrames = 180;
      let secondWaveFired = false;

      const animate = () => {
        if (frame >= maxFrames) {
          ctx2d.clearRect(0, 0, w, h);
          return;
        }
        ctx2d.clearRect(0, 0, w, h);

        // Second wave
        if (secondWaveDelay && !secondWaveFired && frame > (secondWaveDelay / 16.67)) {
          particles = [...particles, ...createParticles(Math.floor(count * 0.6), cx, cy, colors)];
          secondWaveFired = true;
        }

        for (const p of particles) {
          p.x += p.vx;
          p.vy += 0.14;
          p.y += p.vy;
          p.vx *= 0.985;
          p.rotation += p.rotationSpeed;
          p.opacity = Math.max(0, 1 - frame / maxFrames);

          ctx2d.save();
          ctx2d.translate(p.x, p.y);
          ctx2d.rotate((p.rotation * Math.PI) / 180);
          ctx2d.globalAlpha = p.opacity;
          ctx2d.fillStyle = p.color;

          if (p.shape === "rect") {
            ctx2d.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
          } else if (p.shape === "circle") {
            ctx2d.beginPath();
            ctx2d.arc(0, 0, p.size / 2, 0, Math.PI * 2);
            ctx2d.fill();
          } else {
            drawStar(ctx2d, 0, 0, p.size / 2);
          }
          ctx2d.restore();
        }

        frame++;
        requestAnimationFrame(animate);
      };

      requestAnimationFrame(animate);
    }, delay);

    return () => clearTimeout(timeout);
  }, [tier, intensity, delay, secondWaveDelay]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-10"
      style={{ width: "100%", height: "100%" }}
    />
  );
};

export default RankUpConfetti;
