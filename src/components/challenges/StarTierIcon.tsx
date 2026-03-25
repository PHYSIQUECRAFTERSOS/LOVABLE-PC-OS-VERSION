import starImg from "@/assets/challenge-star.png";

interface StarTierIconProps {
  name: string;
  size?: number;
  className?: string;
}

const LEGACY_MAP: Record<string, number> = {
  bronze: 1, silver: 2, gold: 3, platinum: 4, diamond: 5,
};

const StarTierIcon = ({ name, size = 16, className = "" }: StarTierIconProps) => {
  const parsed = parseInt(name?.match(/(\d)/)?.[1] || "");
  const count = Math.min(Math.max(parsed || LEGACY_MAP[name?.toLowerCase()] || 1, 1), 5);

  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <img
          key={i}
          src={starImg}
          width={size}
          height={size}
          alt=""
          className="object-contain"
          draggable={false}
        />
      ))}
    </span>
  );
};

export default StarTierIcon;
