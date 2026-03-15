interface TierIconProps {
  name: string;
  size?: number;
  className?: string;
}

const TierIcon = ({ name, size = 32, className = "" }: TierIconProps) => {
  const tier = name.toLowerCase();

  if (tier === "bronze" || tier.includes("bronze")) {
    return (
      <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
        <defs>
          <linearGradient id="bronze-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#CD7F32" />
            <stop offset="100%" stopColor="#A0522D" />
          </linearGradient>
        </defs>
        {/* Shield body */}
        <path d="M32 6L10 18v16c0 12 9.5 20 22 24 12.5-4 22-12 22-24V18L32 6z" fill="url(#bronze-grad)" opacity="0.2" stroke="#CD7F32" strokeWidth="2" />
        {/* Wings */}
        <path d="M10 22C6 20 3 16 2 12c4 2 8 5 10 10z" fill="#CD7F32" opacity="0.6" />
        <path d="M54 22c4-2 7-6 8-10-4 2-8 5-10 10z" fill="#CD7F32" opacity="0.6" />
        {/* Center emblem */}
        <circle cx="32" cy="32" r="10" fill="#CD7F32" opacity="0.3" stroke="#CD7F32" strokeWidth="1.5" />
        <text x="32" y="37" textAnchor="middle" fontSize="14" fontWeight="bold" fill="#CD7F32">B</text>
      </svg>
    );
  }

  if (tier === "silver" || tier.includes("silver")) {
    return (
      <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
        <defs>
          <linearGradient id="silver-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#E0E0E0" />
            <stop offset="100%" stopColor="#9E9E9E" />
          </linearGradient>
        </defs>
        <path d="M32 6L10 18v16c0 12 9.5 20 22 24 12.5-4 22-12 22-24V18L32 6z" fill="url(#silver-grad)" opacity="0.2" stroke="#C0C0C0" strokeWidth="2" />
        {/* Wider wings */}
        <path d="M10 22C5 19 2 14 1 9c5 3 9 7 11 13z" fill="#C0C0C0" opacity="0.5" />
        <path d="M54 22c5-3 8-8 9-13-5 3-9 7-11 13z" fill="#C0C0C0" opacity="0.5" />
        <path d="M12 26C7 24 4 20 3 16c4 2 8 5 10 10z" fill="#C0C0C0" opacity="0.35" />
        <path d="M52 26c5-2 8-6 9-10-4 2-8 5-10 10z" fill="#C0C0C0" opacity="0.35" />
        <circle cx="32" cy="32" r="10" fill="#C0C0C0" opacity="0.25" stroke="#C0C0C0" strokeWidth="1.5" />
        <text x="32" y="37" textAnchor="middle" fontSize="14" fontWeight="bold" fill="#C0C0C0">S</text>
      </svg>
    );
  }

  if (tier === "gold" || tier.includes("gold")) {
    return (
      <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
        <defs>
          <linearGradient id="gold-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFD700" />
            <stop offset="50%" stopColor="#D4A017" />
            <stop offset="100%" stopColor="#B8860B" />
          </linearGradient>
          <filter id="gold-glow">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <path d="M32 5L8 18v16c0 13 10.5 21 24 25 13.5-4 24-12 24-25V18L32 5z" fill="url(#gold-grad)" opacity="0.2" stroke="#D4A017" strokeWidth="2" />
        {/* Ornate wings */}
        <path d="M8 20C4 17 1 12 0 7c5 3 9 7 10 13z" fill="#D4A017" opacity="0.55" />
        <path d="M56 20c4-3 7-8 8-13-5 3-9 7-10 13z" fill="#D4A017" opacity="0.55" />
        <path d="M10 26C5 23 2 18 1 13c4 3 8 6 10 13z" fill="#D4A017" opacity="0.4" />
        <path d="M54 26c5-3 8-8 9-13-4 3-8 6-10 13z" fill="#D4A017" opacity="0.4" />
        <path d="M13 30C9 28 6 24 5 20c3 2 7 5 9 10z" fill="#D4A017" opacity="0.25" />
        <path d="M51 30c4-2 7-6 8-10-3 2-7 5-9 10z" fill="#D4A017" opacity="0.25" />
        {/* Gem center */}
        <circle cx="32" cy="32" r="11" fill="#D4A017" opacity="0.2" stroke="#D4A017" strokeWidth="2" filter="url(#gold-glow)" />
        <polygon points="32,24 35,30 42,31 37,36 38,43 32,39 26,43 27,36 22,31 29,30" fill="#D4A017" opacity="0.7" />
      </svg>
    );
  }

  if (tier === "platinum" || tier.includes("platinum")) {
    return (
      <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
        <defs>
          <linearGradient id="plat-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#40E0D0" />
            <stop offset="50%" stopColor="#00CED1" />
            <stop offset="100%" stopColor="#008B8B" />
          </linearGradient>
          <filter id="plat-glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <path d="M32 4L6 18v16c0 14 11.5 22 26 26 14.5-4 26-12 26-26V18L32 4z" fill="url(#plat-grad)" opacity="0.15" stroke="#00CED1" strokeWidth="2" filter="url(#plat-glow)" />
        {/* Crystalline wings */}
        <path d="M6 18C2 14 0 9 0 4c4 4 7 9 8 14z" fill="#00CED1" opacity="0.5" />
        <path d="M58 18c4-4 6-9 6-14-4 4-7 9-8 14z" fill="#00CED1" opacity="0.5" />
        <path d="M8 24C3 20 0 14 0 9c4 4 8 8 10 15z" fill="#00CED1" opacity="0.4" />
        <path d="M56 24c5-4 8-10 8-15-4 4-8 8-10 15z" fill="#00CED1" opacity="0.4" />
        <path d="M11 30C6 27 3 22 2 17c3 3 7 7 10 13z" fill="#00CED1" opacity="0.3" />
        <path d="M53 30c5-3 8-8 9-13-3 3-7 7-10 13z" fill="#00CED1" opacity="0.3" />
        <path d="M14 35C10 33 7 29 6 25c3 2 6 5 9 10z" fill="#00CED1" opacity="0.2" />
        <path d="M50 35c4-2 7-6 8-10-3 2-6 5-9 10z" fill="#00CED1" opacity="0.2" />
        {/* Crystal center */}
        <polygon points="32,20 38,28 38,38 32,44 26,38 26,28" fill="#00CED1" opacity="0.3" stroke="#00CED1" strokeWidth="1.5" />
        <polygon points="32,24 36,30 36,36 32,40 28,36 28,30" fill="#00CED1" opacity="0.5" />
      </svg>
    );
  }

  if (tier === "diamond" || tier.includes("diamond")) {
    return (
      <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
        <defs>
          <linearGradient id="dia-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#E0F7FF" />
            <stop offset="40%" stopColor="#B9F2FF" />
            <stop offset="100%" stopColor="#7DD3FC" />
          </linearGradient>
          <filter id="dia-glow">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <path d="M32 3L4 18v16c0 15 12 23 28 27 16-4 28-12 28-27V18L32 3z" fill="url(#dia-grad)" opacity="0.15" stroke="#B9F2FF" strokeWidth="2.5" filter="url(#dia-glow)" />
        {/* Layered ornate wings */}
        <path d="M4 16C1 11 0 6 0 1c3 4 5 9 6 15z" fill="#B9F2FF" opacity="0.5" />
        <path d="M60 16c3-5 4-10 4-15-3 4-5 9-6 15z" fill="#B9F2FF" opacity="0.5" />
        <path d="M6 22C2 17 0 11 0 6c3 5 6 10 8 16z" fill="#B9F2FF" opacity="0.4" />
        <path d="M58 22c4-5 6-11 6-16-3 5-6 10-8 16z" fill="#B9F2FF" opacity="0.4" />
        <path d="M9 28C4 24 1 18 0 12c4 4 8 9 11 16z" fill="#B9F2FF" opacity="0.35" />
        <path d="M55 28c5-4 8-10 9-16-4 4-8 9-11 16z" fill="#B9F2FF" opacity="0.35" />
        <path d="M12 34C7 31 4 26 3 21c3 3 7 7 10 13z" fill="#B9F2FF" opacity="0.25" />
        <path d="M52 34c5-3 8-8 9-13-3 3-7 7-10 13z" fill="#B9F2FF" opacity="0.25" />
        <path d="M15 39C11 37 8 33 7 28c3 3 6 6 9 11z" fill="#B9F2FF" opacity="0.15" />
        <path d="M49 39c4-2 7-6 8-11-3 3-6 6-9 11z" fill="#B9F2FF" opacity="0.15" />
        {/* Diamond gem center */}
        <polygon points="32,18 42,30 32,46 22,30" fill="#B9F2FF" opacity="0.3" stroke="#B9F2FF" strokeWidth="1.5" />
        <polygon points="32,22 38,30 32,42 26,30" fill="#B9F2FF" opacity="0.5" />
        <polygon points="32,26 35,31 32,38 29,31" fill="#E0F7FF" opacity="0.7" />
      </svg>
    );
  }

  // Fallback
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
      <circle cx="32" cy="32" r="14" fill="hsl(var(--muted))" opacity="0.3" stroke="hsl(var(--muted-foreground))" strokeWidth="1.5" />
      <text x="32" y="37" textAnchor="middle" fontSize="14" fontWeight="bold" fill="hsl(var(--muted-foreground))">?</text>
    </svg>
  );
};

export default TierIcon;