/**
 * Maps food name/category to a relevant emoji icon.
 * Used across all food search results, meal plan entries, and nutrition logs.
 */
export function getFoodEmoji(food: {
  name?: string;
  category?: string;
  brand?: string | null;
}): string {
  const name = (food.name || '').toLowerCase();
  const category = (food.category || '').toLowerCase();
  const combined = `${name} ${category}`;

  // Proteins
  if (/chicken|poultry/.test(combined)) return '🍗';
  if (/beef|steak|burger|ground beef|brisket|sirloin/.test(combined)) return '🥩';
  if (/fish|salmon|tuna|tilapia|cod|shrimp|seafood|lobster|crab/.test(combined)) return '🐟';
  if (/egg/.test(combined)) return '🥚';
  if (/turkey/.test(combined)) return '🦃';
  if (/pork|bacon|ham|sausage/.test(combined)) return '🥓';
  if (/protein powder|whey|casein|protein shake|isolate/.test(combined)) return '💪';
  if (/tofu|tempeh|edamame/.test(combined)) return '🫘';

  // Dairy
  if (/milk/.test(combined)) return '🥛';
  if (/cheese/.test(combined)) return '🧀';
  if (/yogurt|greek yogurt/.test(combined)) return '🫙';
  if (/butter(?!.*peanut)(?!.*almond)(?!.*cashew)(?!.*sun)/.test(combined)) return '🧈';
  if (/ice cream|gelato|frozen yogurt|halo top/.test(combined)) return '🍦';

  // Grains / Carbs
  if (/bagel/.test(combined)) return '🥯';
  if (/english muffin|muffin/.test(combined)) return '🧁';
  if (/bread|toast|bun|roll/.test(combined)) return '🍞';
  if (/rice/.test(combined)) return '🍚';
  if (/pasta|spaghetti|noodle|macaroni|penne|linguine/.test(combined)) return '🍝';
  if (/oat|oatmeal|granola|muesli/.test(combined)) return '🥣';
  if (/cereal/.test(combined)) return '🥣';
  if (/tortilla|wrap|pita/.test(combined)) return '🫓';
  if (/pancake|waffle/.test(combined)) return '🥞';
  if (/cracker|pretzel/.test(combined)) return '🥨';
  if (/cookie|biscuit/.test(combined)) return '🍪';
  if (/potato|fries/.test(combined)) return '🥔';
  if (/corn/.test(combined)) return '🌽';

  // Fruits — specific BEFORE generic (order matters!)
  if (/pineapple/.test(combined)) return '🍍';
  if (/banana/.test(combined)) return '🍌';
  if (/apple(?!.*cider)/.test(combined)) return '🍎';
  if (/orange/.test(combined)) return '🍊';
  if (/blueberr/.test(combined)) return '🫐';
  if (/raspberr/.test(combined)) return '🫐';
  if (/blackberr/.test(combined)) return '🫐';
  if (/strawberr/.test(combined)) return '🍓';
  if (/cranberr/.test(combined)) return '🫐';
  if (/berry/.test(combined)) return '🍓';
  if (/grape(?!fruit)/.test(combined)) return '🍇';
  if (/grapefruit/.test(combined)) return '🍊';
  if (/mango/.test(combined)) return '🥭';
  if (/avocado|guacamole/.test(combined)) return '🥑';
  if (/watermelon/.test(combined)) return '🍉';
  if (/melon|cantaloupe|honeydew/.test(combined)) return '🍈';
  if (/peach|nectarine/.test(combined)) return '🍑';
  if (/pear/.test(combined)) return '🍐';
  if (/cherry|cherries/.test(combined)) return '🍒';
  if (/coconut/.test(combined)) return '🥥';
  if (/lemon/.test(combined)) return '🍋';
  if (/lime/.test(combined)) return '🍋';
  if (/kiwi/.test(combined)) return '🥝';
  if (/fruit/.test(combined)) return '🍑';

  // Vegetables
  if (/broccoli/.test(combined)) return '🥦';
  if (/spinach|kale|greens|lettuce|arugula/.test(combined)) return '🥬';
  if (/carrot/.test(combined)) return '🥕';
  if (/tomato/.test(combined)) return '🍅';
  if (/pepper/.test(combined)) return '🫑';
  if (/onion|garlic/.test(combined)) return '🧅';
  if (/mushroom/.test(combined)) return '🍄';
  if (/cucumber/.test(combined)) return '🥒';
  if (/eggplant|aubergine/.test(combined)) return '🍆';
  if (/sweet potato|yam/.test(combined)) return '🍠';
  if (/salad/.test(combined)) return '🥗';
  if (/vegetable|veggie/.test(combined)) return '🥦';

  // Nuts / Fats
  if (/almond butter|peanut butter|cashew butter|nut butter|sunflower butter/.test(combined)) return '🥜';
  if (/almond|cashew|walnut|pecan|pistachio|macadamia|peanut|nut/.test(combined)) return '🥜';
  if (/olive oil|coconut oil|avocado oil|oil/.test(combined)) return '🫒';

  // Drinks
  if (/coffee|espresso|latte|cappuccino/.test(combined)) return '☕';
  if (/tea/.test(combined)) return '🍵';
  if (/juice/.test(combined)) return '🧃';
  if (/soda|cola|drink|beverage/.test(combined)) return '🥤';
  if (/smoothie/.test(combined)) return '🥤';

  // Sweets / Snacks
  if (/chocolate/.test(combined)) return '🍫';
  if (/candy|sugar/.test(combined)) return '🍬';
  if (/cake/.test(combined)) return '🎂';
  if (/chips|crisps|popcorn/.test(combined)) return '🍿';
  if (/pizza/.test(combined)) return '🍕';
  if (/burger|hamburger/.test(combined)) return '🍔';
  if (/sandwich|sub/.test(combined)) return '🥪';
  if (/soup|stew|chili/.test(combined)) return '🍲';
  if (/taco|burrito/.test(combined)) return '🌮';
  if (/sushi/.test(combined)) return '🍣';

  // Condiments / Sauces
  if (/sauce|ketchup|mayo|mustard|dressing/.test(combined)) return '🫙';
  if (/salt|pepper|spice|seasoning/.test(combined)) return '🧂';
  if (/honey|syrup|jam|jelly/.test(combined)) return '🍯';

  // Default
  return '🍽️';
}
