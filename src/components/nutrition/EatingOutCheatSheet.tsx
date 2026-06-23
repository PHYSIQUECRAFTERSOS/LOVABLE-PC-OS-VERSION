import { Salad, Beef, Droplets, UtensilsCrossed, Lightbulb } from "lucide-react";

const SIDES = [
  { name: "Rice", qualifier: "ask for plain" },
  { name: "Salad", qualifier: "ask for plain — no oils/dressings" },
  { name: "Mashed potatoes", qualifier: "ask for plain — no butter" },
  { name: "Vegetables", qualifier: "ask for plain or steamed" },
];

const PROTEIN_MORE = [
  { name: "Chicken", qualifier: "not deep fried — grilled, baked, or pan fry" },
  { name: "Shrimp" },
  { name: "Extra lean steak", qualifier: "top sirloin, flank, baseball top sirloin, filet mignon" },
  { name: "White fish" },
];

const PROTEIN_LESS = [
  { name: "Bison" },
  { name: "Tuna" },
  { name: "Egg whites" },
  { name: "Turkey" },
  { name: "Salmon", qualifier: "most are pretty fatty at restaurants" },
];

const STEPS = [
  {
    n: "01",
    text: (
      <>
        Look for something with <span className="text-[hsl(var(--primary))] font-semibold">protein</span> on
        the menu. The protein list above shows lean sources.
      </>
    ),
  },
  {
    n: "02",
    text: (
      <>
        If it comes with a <span className="text-[hsl(var(--primary))] font-semibold">side</span>, pick from
        the sides list above.
      </>
    ),
  },
  {
    n: "03",
    text: (
      <>
        Ask for <span className="text-[hsl(var(--primary))] font-semibold">sauce on the side</span> if it
        comes with any.
      </>
    ),
  },
];

const ItemChip = ({ name, qualifier }: { name: string; qualifier?: string }) => (
  <div className="rounded-xl bg-background/40 border border-border/40 px-3 py-2">
    <div className="text-sm font-semibold text-foreground/95">{name}</div>
    {qualifier && (
      <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{qualifier}</div>
    )}
  </div>
);

const SectionTile = ({
  icon: Icon,
  title,
  tintClass,
  iconTint,
  children,
}: {
  icon: typeof Salad;
  title: string;
  tintClass: string;
  iconTint: string;
  children: React.ReactNode;
}) => (
  <div className={`rounded-2xl border p-4 ${tintClass}`}>
    <div className="flex items-center gap-2 mb-3">
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${iconTint}`}>
        <Icon className="w-4 h-4" />
      </div>
      <h4 className="text-xs font-bold uppercase tracking-[0.18em] text-foreground/90">{title}</h4>
    </div>
    {children}
  </div>
);

const EatingOutCheatSheet = () => {
  return (
    <div className="space-y-4">
      {/* Intro banner — visually distinct from the Macro Chart's gold banner */}
      <div className="rounded-xl border border-[hsl(var(--primary))]/25 bg-gradient-to-r from-[hsl(var(--primary))]/10 via-background/0 to-[hsl(var(--primary))]/10 px-4 py-3">
        <p className="text-xs uppercase tracking-[0.22em] text-[hsl(var(--primary))] font-semibold text-center">
          Order Smart · Stay On Plan
        </p>
      </div>

      {/* Sides */}
      <SectionTile
        icon={Salad}
        title="Sides"
        tintClass="bg-success/5 border-success/25"
        iconTint="bg-success/15 text-success"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {SIDES.map((s) => (
            <ItemChip key={s.name} {...s} />
          ))}
        </div>
      </SectionTile>

      {/* All Orders */}
      <SectionTile
        icon={Droplets}
        title="All Orders"
        tintClass="bg-[hsl(var(--primary))]/5 border-[hsl(var(--primary))]/25"
        iconTint="bg-[hsl(var(--primary))]/15 text-[hsl(var(--primary))]"
      >
        <div className="rounded-xl bg-background/40 border border-border/40 px-3 py-3 text-sm text-foreground/90">
          Ask for <span className="text-[hsl(var(--primary))] font-semibold">sauce on the side</span> —
          use sparingly.
        </div>
      </SectionTile>

      {/* Fats */}
      <SectionTile
        icon={UtensilsCrossed}
        title="Fats"
        tintClass="bg-warn/5 border-warn/25"
        iconTint="bg-warn/15 text-warn"
      >
        <p className="text-sm text-foreground/85 leading-relaxed">
          You don't need to focus on this — most restaurant foods already contain plenty of fats.
        </p>
      </SectionTile>

      {/* Protein */}
      <SectionTile
        icon={Beef}
        title="Protein"
        tintClass="bg-destructive/5 border-destructive/25"
        iconTint="bg-destructive/15 text-destructive"
      >
        <div className="space-y-3">
          {/* More popular */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-1 h-3.5 rounded-full bg-[hsl(var(--primary))]" />
              <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[hsl(var(--primary))]">
                More Popular
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {PROTEIN_MORE.map((p) => (
                <ItemChip key={p.name} {...p} />
              ))}
            </div>
          </div>

          {/* Less popular */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-1 h-3.5 rounded-full bg-muted-foreground/60" />
              <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                Less Popular
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {PROTEIN_LESS.map((p) => (
                <ItemChip key={p.name} {...p} />
              ))}
            </div>
          </div>
        </div>
      </SectionTile>

      {/* How to approach it — vertical numbered cards */}
      <div className="space-y-2.5">
        <div className="flex items-center gap-2 px-1">
          <div className="h-px flex-1 bg-[hsl(var(--primary))]/30" />
          <h4 className="text-xs font-bold uppercase tracking-[0.22em] text-foreground/90">
            Here's How To Approach It
          </h4>
          <div className="h-px flex-1 bg-[hsl(var(--primary))]/30" />
        </div>

        {STEPS.map((s) => (
          <div
            key={s.n}
            className="flex items-stretch gap-3 rounded-2xl border border-[hsl(var(--primary))]/25 bg-[hsl(var(--primary))]/[0.04] p-3"
          >
            <div className="flex-shrink-0 w-12 rounded-xl bg-gradient-to-b from-[hsl(var(--primary))]/25 to-[hsl(var(--primary))]/5 border border-[hsl(var(--primary))]/30 flex items-center justify-center">
              <span className="font-display text-xl font-black text-[hsl(var(--primary))] leading-none">
                {s.n}
              </span>
            </div>
            <div className="flex items-center text-sm text-foreground/90 leading-relaxed">{s.text}</div>
          </div>
        ))}
      </div>

      {/* Tip */}
      <div className="rounded-xl border-l-2 border-[hsl(var(--primary))]/60 bg-[hsl(var(--primary))]/5 px-4 py-3">
        <div className="flex items-start gap-2.5">
          <Lightbulb className="w-4 h-4 text-[hsl(var(--primary))] mt-0.5 flex-shrink-0" />
          <p className="text-sm text-foreground/85 leading-relaxed italic">
            <span className="text-[hsl(var(--primary))] font-bold not-italic">Tip:</span> Use the{" "}
            <span className="font-semibold">Meal Scan</span> AI photo scanner to estimate your meal's
            calories when eating out.
          </p>
        </div>
      </div>
    </div>
  );
};

export default EatingOutCheatSheet;
