import { Shield, Crown, Gem, Diamond } from "lucide-react";
import { getTierColor } from "@/utils/rankedXP";

interface TierBadgeProps {
  tier: string;
  size?: number;
  className?: string;
}

const TierBadge = ({ tier, size = 24, className = "" }: TierBadgeProps) => {
  const color = getTierColor(tier);
  const iconProps = { size, className, style: { color } };

  switch (tier) {
    case "champion":
      return (
        <Crown
          {...iconProps}
          style={{ color, filter: "drop-shadow(0 0 6px #FF0000)" }}
        />
      );
    case "diamond":
      return <Diamond {...iconProps} />;
    case "emerald":
      return <Gem {...iconProps} />;
    default:
      return <Shield {...iconProps} />;
  }
};

export default TierBadge;
