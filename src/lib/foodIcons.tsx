import React from "react";

// ── Food Categories ──
export type FoodCategory =
  | "protein-chicken" | "protein-turkey" | "protein-beef" | "protein-fish"
  | "protein-eggs" | "protein-dairy" | "protein-whey" | "protein-plant"
  | "carb-rice" | "carb-pasta" | "carb-bread" | "carb-oats"
  | "carb-fruit" | "carb-potato" | "carb-cereal"
  | "fat-nutbutter" | "fat-nuts" | "fat-oil" | "fat-avocado"
  | "veg-leafy" | "veg-cruciferous" | "veg-root" | "veg-mixed"
  | "snack-bar" | "snack-icecream" | "snack-chips" | "snack-frozen"
  | "supplement-powder" | "supplement-creatine" | "supplement-electrolyte"
  | "recipe"
  | "unknown";

// ── Keyword → Category mapping ──
const KEYWORD_MAP: [string[], FoodCategory][] = [
  [["chicken", "grilled chicken", "chicken breast"], "protein-chicken"],
  [["turkey", "ground turkey"], "protein-turkey"],
  [["beef", "steak", "ground beef", "sirloin", "brisket"], "protein-beef"],
  [["salmon", "tuna", "tilapia", "cod", "fish", "shrimp", "lobster", "crab"], "protein-fish"],
  [["egg", "eggs", "egg white"], "protein-eggs"],
  [["yogurt", "cheese", "milk", "cottage", "cream cheese", "greek yogurt"], "protein-dairy"],
  [["whey", "casein", "protein powder", "protein shake", "isolate"], "protein-whey"],
  [["tofu", "tempeh", "seitan", "edamame", "lentil", "chickpea", "bean"], "protein-plant"],
  [["rice", "jasmine", "basmati", "brown rice", "white rice"], "carb-rice"],
  [["pasta", "spaghetti", "penne", "macaroni", "noodle", "linguine"], "carb-pasta"],
  [["bread", "bagel", "tortilla", "wrap", "pita", "english muffin", "bun"], "carb-bread"],
  [["oat", "oatmeal", "granola", "muesli"], "carb-oats"],
  [["banana", "apple", "berr", "strawberr", "blueberr", "mango", "grape", "orange", "pear", "melon", "pineapple", "peach"], "carb-fruit"],
  [["potato", "sweet potato", "yam"], "carb-potato"],
  [["cereal", "corn flakes", "cheerios"], "carb-cereal"],
  [["peanut butter", "almond butter", "nut butter", "sunflower butter"], "fat-nutbutter"],
  [["almond", "walnut", "cashew", "pecan", "pistachio", "macadamia", "peanut"], "fat-nuts"],
  [["olive oil", "coconut oil", "avocado oil", "oil", "butter", "ghee"], "fat-oil"],
  [["avocado", "guacamole"], "fat-avocado"],
  [["spinach", "kale", "lettuce", "arugula", "chard", "greens"], "veg-leafy"],
  [["broccoli", "cauliflower", "brussels sprout", "cabbage"], "veg-cruciferous"],
  [["carrot", "beet", "turnip", "radish", "parsnip"], "veg-root"],
  [["pepper", "tomato", "cucumber", "zucchini", "squash", "onion", "mushroom", "asparagus", "celery", "corn", "pea", "green bean", "vegetable"], "veg-mixed"],
  [["bar", "protein bar", "granola bar", "kind bar", "rxbar"], "snack-bar"],
  [["ice cream", "gelato", "frozen yogurt", "halo top"], "snack-icecream"],
  [["chip", "pretzel", "popcorn", "cracker"], "snack-chips"],
  [["frozen", "frozen meal", "lean cuisine", "hot pocket"], "snack-frozen"],
  [["creatine", "monohydrate"], "supplement-creatine"],
  [["electrolyte", "lmnt", "liquid iv", "pedialyte"], "supplement-electrolyte"],
];

/** Detect food category from name + optional data_source */
export function detectFoodCategory(name: string, dataSource?: string | null): FoodCategory {
  if (dataSource === "recipe") return "recipe";
  const lower = name.toLowerCase();
  for (const [keywords, category] of KEYWORD_MAP) {
    for (const kw of keywords) {
      if (lower.includes(kw)) return category;
    }
  }
  return "unknown";
}

// ── Macro-based parent group for future tinting ──
export type MacroGroup = "protein" | "carb" | "fat" | "veg" | "snack" | "supplement" | "recipe" | "unknown";

export function getMacroGroup(category: FoodCategory): MacroGroup {
  if (category.startsWith("protein-")) return "protein";
  if (category.startsWith("carb-")) return "carb";
  if (category.startsWith("fat-")) return "fat";
  if (category.startsWith("veg-")) return "veg";
  if (category.startsWith("snack-")) return "snack";
  if (category.startsWith("supplement-")) return "supplement";
  if (category === "recipe") return "recipe";
  return "unknown";
}

// ── SVG Icon Paths (flat, minimal, single-stroke) ──
// All icons are 24x24 viewBox, stroke-based
const ICON_PATHS: Record<FoodCategory, string> = {
  // Protein
  "protein-chicken": "M12 4c-2.5 0-4.5 1-5.5 3L5 10c-.5 1-.5 2 0 3l2 4c1 2 3 3 5 3s4-1 5-3l2-4c.5-1 .5-2 0-3l-1.5-3C16.5 5 14.5 4 12 4zM9 13h6",
  "protein-turkey": "M12 3c-3 0-5 2-5.5 4L5.5 10c-.3.8 0 1.7.5 2.3L8 15c1.5 2 3 3 4 3s2.5-1 4-3l2-2.7c.5-.6.8-1.5.5-2.3L17.5 7C17 5 15 3 12 3zM8 11h8M10 14h4",
  "protein-beef": "M6 8c0-1 1-3 3-4h6c2 1 3 3 3 4v4c0 3-2 5-3 6H9c-1-1-3-3-3-6V8zM6 12h12M10 8v8M14 8v8",
  "protein-fish": "M3 12c0 0 2-4 6-4c1 0 2 .3 3 1l3-2v12l-3-2c-1 .7-2 1-3 1c-4 0-6-4-6-4v-2zM21 10l-3 2l3 2",
  "protein-eggs": "M12 3C9 3 7 7 7 11c0 4 2.5 7 5 7s5-3 5-7c0-4-2-8-5-8zM9 12a3 2 0 006 0",
  "protein-dairy": "M7 4h10v2l1 1v10c0 1.5-1 3-3 3H9c-2 0-3-1.5-3-3V7l1-1V4zM7 10h10",
  "protein-whey": "M8 3h8l1 4v1c0 1-.5 2-1 2.5V20c0 .5-.5 1-1 1H9c-.5 0-1-.5-1-1V10.5C7.5 10 7 9 7 8V7l1-4zM8 7h8M10 12h4",
  "protein-plant": "M12 21V11M12 11C12 8 9 5 5 5c0 4 3 6 7 6zM12 11c0-3 3-6 7-6c0 4-3 6-7 6z",
  // Carbs
  "carb-rice": "M6 14c0-2 2-4 6-4s6 2 6 4v2c0 2-2 4-6 4s-6-2-6-4v-2zM6 16c0 2 2 4 6 4s6-2 6-4M8 10c0-1.5 1.5-3 4-3s4 1.5 4 3",
  "carb-pasta": "M5 7h14M5 7c0 5-1 10 7 10s7-5 7-10M8 7V5M12 7V4M16 7V5M8 12h8",
  "carb-bread": "M5 10c0-2 3-4 7-4s7 2 7 4v1c0 1-1 2-2 2v5c0 1-1 2-2 2h-6c-1 0-2-1-2-2v-5c-1 0-2-1-2-2v-1z",
  "carb-oats": "M6 14c0-2.5 2.5-5 6-5s6 2.5 6 5v1c0 2.5-2.5 4-6 4s-6-1.5-6-4v-1zM9 9c0-1 1.5-2 3-2s3 1 3 2M8 14h8",
  "carb-fruit": "M12 3c1 0 2 1 2 2M12 5c-3 0-6 3-6 6 0 4 3 7 6 7s6-3 6-7c0-3-3-6-6-6zM10 3c-1 0-2 1-1.5 2",
  "carb-potato": "M12 5C8 5 5 8 5 12c0 3 2 5.5 4 6.5C10.5 19.5 11 20 12 20s1.5-.5 3-1.5c2-1 4-3.5 4-6.5 0-4-3-7-7-7z",
  "carb-cereal": "M6 14c0-2.5 2.5-5 6-5s6 2.5 6 5v1c0 2.5-2.5 4-6 4s-6-1.5-6-4v-1zM9 11l2 2l2-2l2 2",
  // Fats
  "fat-nutbutter": "M8 4h8c1 0 2 1 2 2v12c0 1-1 2-2 2H8c-1 0-2-1-2-2V6c0-1 1-2 2-2zM6 9h12M10 13h4M10 16h4",
  "fat-nuts": "M8 12c-2 0-4-2-4-4s2-4 4-4c1 0 2 .5 3 1.5C12 4.5 13 4 14 4c2 0 4 2 4 4s-2 4-4 4M7 14c0 2 2 4 5 6c3-2 5-4 5-6",
  "fat-oil": "M12 3v4M10 7h4l2 3v8c0 1.5-1 3-2 3h-4c-1 0-2-1.5-2-3V10l2-3zM10 13h4",
  "fat-avocado": "M12 2C9 2 6 5.5 6 10c0 5 3 10 6 10s6-5 6-10c0-4.5-3-8-6-8zM12 13a2.5 2.5 0 110 5 2.5 2.5 0 010-5z",
  // Vegetables
  "veg-leafy": "M12 21V12M12 12c-4-1-7-4-7-8 5 0 7 4 7 8zM12 12c4-1 7-4 7-8-5 0-7 4-7 8z",
  "veg-cruciferous": "M12 20v-7M12 13c-2 0-4-1-5-3 2 0 3.5 1 5 3zM12 13c2 0 4-1 5-3-2 0-3.5 1-5 3zM12 10a4 4 0 100-8 4 4 0 000 8z",
  "veg-root": "M12 3v5M12 8c-4 0-6 3-6 7 0 3 2 6 6 6s6-3 6-6c0-4-2-7-6-7zM9 3h6",
  "veg-mixed": "M12 3v3M12 6c-3 0-6 2-6 6 0 4 3 6 6 6M12 6c3 0 6 2 6 6 0 4-3 6-6 6M8 12h8",
  // Snacks
  "snack-bar": "M4 9h16c.5 0 1 .5 1 1v4c0 .5-.5 1-1 1H4c-.5 0-1-.5-1-1v-4c0-.5.5-1 1-1zM9 9v6M15 9v6",
  "snack-icecream": "M8 3h8l-1 9H9L8 3zM12 12v3M9 15c0 2 1.5 4 3 4s3-2 3-4H9z",
  "snack-chips": "M7 6c1-2 3-3 5-3s4 1 5 3c1 3 0 6-1 9L14 18H10L8 15c-1-3-2-6-1-9z",
  "snack-frozen": "M12 3v18M8 6l8 12M16 6L8 18M3 12h18M6 8l12 8M18 8L6 16",
  // Supplements
  "supplement-powder": "M8 4h8l1 3H7l1-3zM7 7v10c0 2 1 3 2 3h6c1 0 2-1 2-3V7M10 11h4M10 14h4",
  "supplement-creatine": "M7 5h10v3l-2 1v8c0 1-1 2-2 2H11c-1 0-2-1-2-2v-8l-2-1V5zM10 12h4",
  "supplement-electrolyte": "M9 3h6v3H9V3zM9 6l-1 2v10c0 1.5 1 3 2 3h4c1 0 2-1.5 2-3V8l-1-2M11 10v4M9 12h4",
  // Recipe
  "recipe": "M6 5h12c.5 0 1 .5 1 1v2c0 .5-.5 1-1 1H6c-.5 0-1-.5-1-1V6c0-.5.5-1 1-1zM8 9v8c0 1.5 1 3 2 3h4c1 0 2-1.5 2-3V9M10 12h4",
  // Unknown fallback
  "unknown": "M12 4a8 8 0 100 16 8 8 0 000-16zM12 8v4M12 14v2",
};

// ── Component ──

interface FoodIconProps {
  name: string;
  dataSource?: string | null;
  size?: number;
  className?: string;
}

const FoodIcon: React.FC<FoodIconProps> = ({ name, dataSource, size = 32, className }) => {
  const category = detectFoodCategory(name, dataSource);
  const path = ICON_PATHS[category];
  const iconSize = Math.round(size * 0.55);

  return (
    <div
      className={`flex items-center justify-center rounded-lg bg-secondary shrink-0 ${className || ""}`}
      style={{ width: size, height: size }}
    >
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-muted-foreground"
      >
        <path d={path} />
      </svg>
    </div>
  );
};

export default FoodIcon;
