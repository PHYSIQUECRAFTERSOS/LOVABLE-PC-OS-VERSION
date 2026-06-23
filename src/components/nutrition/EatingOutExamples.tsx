import { Utensils } from "lucide-react";

const EXAMPLES: { restaurant: string; order: string; why: string }[] = [
  {
    restaurant: "McDonald's",
    order: "Grilled Chicken Caesar Salad (no croutons, light dressing)",
    why: "Grilled chicken is a great lean protein and the salad base keeps it low-carb.",
  },
  {
    restaurant: "A&W",
    order: "Grilled Chicken Burger (no sauce, wrapped in lettuce)",
    why: "Skip the bun and sauces to keep it lighter, focusing on the grilled chicken patty.",
  },
  {
    restaurant: "Subway",
    order: "Double Chicken Chopped Salad (no cheese, oil, or heavy sauces)",
    why: "Load up on vegetables and ask for double chicken to increase protein intake.",
  },
  {
    restaurant: "Tim Hortons",
    order: "Grilled Chicken Wrap (no sauces, extra chicken if possible)",
    why: "Opt for extra chicken to make it a protein-packed option.",
  },
  {
    restaurant: "Boston Pizza",
    order: "Oven-Roasted Salmon with steamed veggies",
    why: "Salmon provides a great source of protein and healthy fats.",
  },
  {
    restaurant: "Kelsey's",
    order: "Grilled Chicken Breast with Mixed Greens",
    why: "Customize your meal by choosing grilled protein options paired with veggies.",
  },
  {
    restaurant: "Earls",
    order: "Cajun Blackened Chicken with Steamed Vegetables",
    why: "Flavorful grilled chicken without heavy sauces or sides.",
  },
  {
    restaurant: "Swiss Chalet",
    order: "Quarter Chicken Dinner (white meat, no skin, steamed vegetables)",
    why: "White meat with the skin removed keeps it lean.",
  },
  {
    restaurant: "The Keg",
    order: "Baseball Top Sirloin (8 oz.) with Asparagus",
    why: "High-protein steak option paired with a veggie side.",
  },
  {
    restaurant: "Jack Astor's",
    order: "Grilled Chicken Power Bowl",
    why: "Loaded with protein from chicken, plus fiber from greens and veggies.",
  },
  {
    restaurant: "Chipotle",
    order: "Burrito Bowl — double chicken, no rice, extra veggies",
    why: "High-protein, low-carb bowl by skipping the rice.",
  },
  {
    restaurant: "Harvey's",
    order: "Grilled Chicken Sandwich (lettuce wrap, no sauce)",
    why: "Skip the bun and focus on lean grilled chicken protein.",
  },
  {
    restaurant: "Pita Pit",
    order: "Chicken Souvlaki Pita (double protein, whole wheat pita)",
    why: "Double protein loaded with veggies for a nutritious meal.",
  },
  {
    restaurant: "Nando's",
    order: "Half Chicken with Mixed Vegetables",
    why: "Flame-grilled chicken packed with protein, paired with veggies.",
  },
  {
    restaurant: "Panera Bread",
    order: "Mediterranean Grilled Chicken Salad",
    why: "Fresh salad with lean protein, balanced with healthy fats from olive oil.",
  },
  {
    restaurant: "Cactus Club Cafe",
    order: "Grilled Chimichurri Chicken",
    why: "Flavorful, high-protein option, often served with lighter sides.",
  },
];

const EatingOutExamples = () => {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-[hsl(var(--primary))]/25 bg-gradient-to-r from-[hsl(var(--primary))]/10 via-background/0 to-[hsl(var(--primary))]/10 px-4 py-3">
        <p className="text-xs uppercase tracking-[0.22em] text-[hsl(var(--primary))] font-semibold text-center">
          Real-World Order Examples
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {EXAMPLES.map((e) => (
          <div
            key={e.restaurant}
            className="rounded-2xl border border-border/40 bg-card/60 p-3.5 space-y-2 hover:border-[hsl(var(--primary))]/40 transition-colors"
          >
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[hsl(var(--primary))]/15 text-[hsl(var(--primary))] flex items-center justify-center flex-shrink-0">
                <Utensils className="w-3.5 h-3.5" />
              </div>
              <h4 className="text-sm font-bold uppercase tracking-wide text-foreground">
                {e.restaurant}
              </h4>
            </div>
            <div className="rounded-lg bg-background/40 border border-border/30 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wider text-[hsl(var(--primary))]/80 font-semibold mb-1">
                Order
              </p>
              <p className="text-sm text-foreground/95 leading-snug">{e.order}</p>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed italic">{e.why}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default EatingOutExamples;
