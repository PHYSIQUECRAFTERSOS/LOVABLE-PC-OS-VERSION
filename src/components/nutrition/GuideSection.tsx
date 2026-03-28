import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, ChevronRight } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";

interface GuideSectionProps {
  title: string;
  content: string;
  icon?: React.ReactNode;
  sectionKey?: string;
}

const SECTION_ICONS: Record<string, string> = {
  water_recommendation: "💧",
  daily_ritual: "☀️",
  nutrition_tips: "📋",
  eating_out_cheat_sheet: "🍽️",
  eating_out_examples: "🍕",
  macro_cheat_sheet: "📊",
  additional_notes: "📝",
  meal_planning: "🥗",
  why_macros_matter: "💡",
};

/* ─── Macro Cheat Sheet structured grid ─── */
const MACRO_CATEGORIES = [
  {
    label: "Protein",
    emoji: "🥩",
    color: "from-red-500/20 to-red-900/10 border-red-500/30",
    items: [
      "Chicken Breast", "Turkey Breast", "Ground Turkey", "Egg Whites",
      "Extra Lean Steak", "Scallops", "Shrimp", "White Fish",
      "Ground Bison", "Bison Steak", "Whey Protein (sub for 40g powder)",
      "Turkey Bacon (Canada Style)", "Fat Free Greek Yogurt",
      "Low/No Fat Cottage Cheese",
    ],
  },
  {
    label: "Carbs",
    emoji: "🍚",
    color: "from-amber-500/20 to-amber-900/10 border-amber-500/30",
    items: [
      "Potatoes (White / Russet / Yellow)", "Sweet Potatoes",
      "Beans & Lentils", "Quinoa", "Bulgur",
      "Jasmine / Brown / Basmati / Wild Rice",
      "Baked Sweet Potato Chips",
    ],
  },
  {
    label: "Fruits",
    emoji: "🍎",
    color: "from-pink-500/20 to-pink-900/10 border-pink-500/30",
    items: [
      "Blueberries", "Strawberries", "Raspberries", "Blackberries",
      "Pineapple", "Banana", "Apple", "Orange",
    ],
  },
  {
    label: "Vegetables",
    emoji: "🥦",
    color: "from-green-500/20 to-green-900/10 border-green-500/30",
    items: [
      "Spinach", "Carrots", "Cauliflower", "Green Beans",
      "Cucumbers", "Mushrooms", "Peppers",
    ],
  },
  {
    label: "Fats",
    emoji: "🥑",
    color: "from-yellow-500/20 to-yellow-900/10 border-yellow-500/30",
    items: [
      "Avocados", "Almond Butter", "Peanut Butter", "Sunflower Butter",
      "Cashew Butter", "Eggs (w/ yolk)", "Nuts (Almonds, Cashews)",
      "Flax Seed Oil", "Grass Fed Butter / Ghee",
      "Coconut Oil", "Avocado Oil", "Olive Oil",
    ],
  },
  {
    label: "Spices",
    emoji: "🧂",
    color: "from-orange-500/20 to-orange-900/10 border-orange-500/30",
    items: [
      "Salt", "Pepper", "Garlic Powder", "Cinnamon",
    ],
    note: "Stick to these — others can include fillers, cause inflammation, and make fat loss harder.",
  },
  {
    label: "Sauces",
    emoji: "🫙",
    color: "from-purple-500/20 to-purple-900/10 border-purple-500/30",
    items: [
      "G Hughes Sugar Free (BBQ, Thai)", "Walmart Sugar Free BBQ",
      "Sriracha", "Hot Sauces (Frank's, Nando's, any < 10 cal)",
      "Fat Free Dressings", "Any Sugar Free Sauce (≤ 15 cal/serving)",
    ],
  },
];

const MacroCheatSheetGrid = () => (
  <div className="space-y-4">
    <div className="text-center py-3 rounded-lg bg-[hsl(var(--primary))]/10 border border-[hsl(var(--primary))]/20">
      <p className="text-xs uppercase tracking-widest text-[hsl(var(--primary))] font-semibold mb-1">
        Replace 1:1 Ratio
      </p>
      <p className="text-[10px] text-muted-foreground">
        Protein → Protein &nbsp;|&nbsp; Carb → Carb &nbsp;|&nbsp; Fat → Fat
      </p>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {MACRO_CATEGORIES.map((cat) => (
        <div
          key={cat.label}
          className={`rounded-xl border bg-gradient-to-br ${cat.color} p-3 space-y-2`}
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">{cat.emoji}</span>
            <h4 className="text-sm font-bold text-foreground uppercase tracking-wide">{cat.label}</h4>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {cat.items.map((item) => (
              <span
                key={item}
                className="text-[11px] px-2 py-1 rounded-full bg-background/40 text-foreground/80 border border-border/30"
              >
                {item}
              </span>
            ))}
          </div>
          {cat.note && (
            <p className="text-[10px] text-muted-foreground italic mt-1">{cat.note}</p>
          )}
        </div>
      ))}
    </div>
  </div>
);

/* ─── Custom markdown renderers ─── */
const premiumComponents: Components = {
  ul: ({ children }) => (
    <ul className="space-y-2 my-3">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="space-y-3 my-3 counter-reset-item">{children}</ol>
  ),
  li: ({ children, ...props }) => {
    const parent = (props as any).node?.parentNode?.tagName;
    const isOrdered = parent === "ol";

    if (isOrdered) {
      return (
        <li className="flex gap-3 items-start group" value={(props as any).value}>
          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[hsl(var(--primary))]/20 border border-[hsl(var(--primary))]/40 flex items-center justify-center">
            <span className="text-xs font-bold text-[hsl(var(--primary))]">{(props as any).index != null ? (props as any).index + 1 : ""}</span>
          </div>
          <span className="text-foreground/90 text-sm leading-relaxed pt-0.5">{children}</span>
        </li>
      );
    }

    return (
      <li className="flex gap-2.5 items-start">
        <div className="flex-shrink-0 flex items-center mt-1.5 text-[hsl(var(--primary))]">
          <ChevronRight className="w-3 h-3" />
          <ChevronRight className="w-3 h-3 -ml-1.5" />
        </div>
        <span className="text-foreground/90 text-sm leading-relaxed">{children}</span>
      </li>
    );
  },
  strong: ({ children }) => (
    <strong className="text-[hsl(var(--primary))] font-bold">{children}</strong>
  ),
  h2: ({ children }) => (
    <h2 className="text-base font-bold text-foreground uppercase tracking-wide mt-4 mb-2 pb-1 border-b border-[hsl(var(--primary))]/30">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm font-bold text-foreground uppercase tracking-wide mt-3 mb-1.5 flex items-center gap-2">
      <div className="w-1 h-4 rounded-full bg-[hsl(var(--primary))]" />
      {children}
    </h3>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-[hsl(var(--primary))]/50 bg-[hsl(var(--primary))]/5 rounded-r-lg px-4 py-3 my-3 text-sm text-foreground/80 italic">
      {children}
    </blockquote>
  ),
  p: ({ children }) => (
    <p className="text-sm text-foreground/80 leading-relaxed my-1.5">{children}</p>
  ),
};

const GuideSection = ({ title, content, icon, sectionKey }: GuideSectionProps) => {
  if (!content?.trim() && sectionKey !== "macro_cheat_sheet") return null;

  const isMacroSheet = sectionKey === "macro_cheat_sheet";

  return (
    <Card className="border-border/50 border-l-2 border-l-[hsl(var(--primary))]/60 hover:border-l-[hsl(var(--primary))] transition-all duration-300 hover:shadow-[0_0_20px_-8px_hsl(var(--primary)/0.15)] overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2.5 text-base">
          {icon || <BookOpen className="h-4 w-4 text-[hsl(var(--primary))]" />}
          <span className="uppercase tracking-wide text-sm">{title}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isMacroSheet ? (
          <MacroCheatSheetGrid />
        ) : (
          <div className="max-w-none">
            <ReactMarkdown components={premiumComponents}>{content}</ReactMarkdown>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export { SECTION_ICONS };
export default GuideSection;
