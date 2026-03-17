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
  platinum: diamondImg,
  diamond: diamondImg,
  champion: championImg,
};

interface TierIconProps {
  name: string;
  size?: number;
  className?: string;
}

const TierIcon = ({ name, size = 32, className = "" }: TierIconProps) => {
  const key = name?.toLowerCase() || "bronze";
  const src =
    TIER_IMAGES[key] ||
    Object.entries(TIER_IMAGES).find(([k]) => key.includes(k))?.[1] ||
    TIER_IMAGES.bronze;

  return (
    <img
      src={src}
      width={size}
      height={size}
      alt={`${name} tier`}
      className={`max-w-full max-h-full ${className}`}
      style={{ objectFit: "contain" }}
      draggable={false}
    />
  );
};

export default TierIcon;
