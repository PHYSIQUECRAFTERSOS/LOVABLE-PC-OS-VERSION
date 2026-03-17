import bronzeImg from "@/assets/tiers/bronze.png";
import silverImg from "@/assets/tiers/silver.png";
import goldImg from "@/assets/tiers/gold.png";
import emeraldImg from "@/assets/tiers/emerald.png";
import diamondImg from "@/assets/tiers/diamond.png";
import championImg from "@/assets/tiers/champion.png";

const TIER_IMAGES: Record<string, string> = {
  bronze: bronzeImg,
  silver: silverImg,
  gold: goldImg,
  emerald: emeraldImg,
  diamond: diamondImg,
  champion: championImg,
};

interface TierBadgeProps {
  tier: string;
  size?: number;
  className?: string;
}

const TierBadge = ({ tier, size = 48, className = "" }: TierBadgeProps) => {
  const src = TIER_IMAGES[tier?.toLowerCase()] || TIER_IMAGES.bronze;

  return (
    <img
      src={src}
      width={size}
      height={size}
      alt={`${tier} tier`}
      className={`max-w-full max-h-full ${className}`}
      style={{ objectFit: "contain" }}
      draggable={false}
    />
  );
};

export default TierBadge;
