import starImg from "@/assets/challenge-star.png";

interface StarTierIconProps {
  name: string;
  size?: number;
  className?: string;
}

const StarTierIcon = ({ name, size = 16, className = "" }: StarTierIconProps) => {
  const match = name?.match(/(\d)/);
  const count = Math.min(Math.max(parseInt(match?.[1] || "1"), 1), 5);

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
