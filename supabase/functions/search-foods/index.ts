import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Brand aliases ──────────────────────────────────────────────────────
const BRAND_ALIASES: Record<string, string[]> = {
  // Grocery / warehouse
  costco: ["kirkland", "kirkland signature"],
  kirkland: ["costco"], "kirkland signature": ["costco"],
  trader: ["trader joe's", "trader joes"],
  "trader joe's": ["trader"], "trader joes": ["trader"],
  walmart: ["great value"], "great value": ["walmart"],
  target: ["good & gather", "market pantry"],
  "good & gather": ["target"], "market pantry": ["target"],
  aldi: ["fit & active", "simply nature"],
  // Protein / fitness brands
  quest: [], "optimum nutrition": [], fairlife: [], fage: [], chobani: [],
  "premier protein": [], rxbar: [], clif: [], kind: [], "nature valley": [],
  "dave's killer bread": [], grenade: [], "muscle milk": [], "built bar": [],
  lenny: ["lenny & larry's", "lenny and larry's"], "lenny & larry's": ["lenny"],
  barebells: [], "think!": [], oikos: [], "siggi's": [], siggi: ["siggi's"],
  // Bakery / bread brands
  "thomas'": ["thomas"], thomas: ["thomas'"],
  "sara lee": [], "pepperidge farm": [], "nature's own": [], oroweat: [],
  "arnold": [], "wonder": [], "dave's": ["dave's killer bread"],
  // Restaurant chains
  dominos: ["domino's"], "domino's": ["dominos"],
  mcdonalds: ["mcdonald's"], "mcdonald's": ["mcdonalds"],
  "chick-fil-a": ["chickfila", "chick fil a"], chickfila: ["chick-fil-a"],
  chipotle: [], subway: [], starbucks: [],
  "wendy's": ["wendys"], wendys: ["wendy's"],
  "taco bell": [], "panda express": [], "five guys": [],
  "pizza hut": [], "burger king": [], kfc: [], "popeyes": [],
  dunkin: ["dunkin'", "dunkin donuts"], "dunkin'": ["dunkin"],
  "tim hortons": [], "panera": ["panera bread"], "panera bread": ["panera"],
  "chili's": ["chilis"], chilis: ["chili's"],
  "olive garden": [], "applebee's": ["applebees"], applebees: ["applebee's"],
  "buffalo wild wings": ["bww"], bww: ["buffalo wild wings"],
  "in-n-out": ["in n out"], "in n out": ["in-n-out"],
  "jack in the box": [], "sonic": [], "arby's": ["arbys"], arbys: ["arby's"],
  "wingstop": [], "jersey mike's": ["jersey mikes"], "jersey mikes": ["jersey mike's"],
  "raising cane's": ["raising canes", "canes"], canes: ["raising cane's"],
  "whataburger": [], "carl's jr": ["carls jr"], "carls jr": ["carl's jr"],
  "hardee's": ["hardees"], hardees: ["hardee's"],
  "el pollo loco": [], "del taco": [], "qdoba": [],
  "firehouse subs": [], "jimmy john's": ["jimmy johns"], "jimmy johns": ["jimmy john's"],
  "tropical smoothie": [], "jamba": ["jamba juice"], "jamba juice": ["jamba"],
  "smoothie king": [], "noodles & company": [],
  "sweetgreen": [], "cava": [],
  "crumbl": [], "insomnia cookies": [],
  // Additional grocery brands
  "oscar mayer": [], "hormel": [], "tyson": [], "perdue": [],
  "mission": [], "old el paso": [], "green giant": [],
  "birds eye": [], "stouffer's": ["stouffers"], stouffers: ["stouffer's"],
  "lean cuisine": [], "healthy choice": [], "amy's": ["amys"], amys: ["amy's"],
  "annie's": ["annies"], annies: ["annie's"],
  "bob's red mill": [], "kodiak": ["kodiak cakes"], "kodiak cakes": ["kodiak"],
};

function expandBrandAliases(tokens: string[]): string[] {
  const extra: string[] = [];
  const joined = tokens.join(" ");
  for (const [key, aliases] of Object.entries(BRAND_ALIASES)) {
    if (joined.includes(key)) {
      for (const alias of aliases) extra.push(alias);
    }
  }
  return extra;
}

const BRAND_KEYWORDS = new Set(Object.keys(BRAND_ALIASES));
const MULTI_WORD_BRANDS = Object.keys(BRAND_ALIASES).filter(k => k.includes(" "));

function classifyTokens(tokens: string[]): { brandTokens: string[]; foodTokens: string[] } {
  const brandTokens: string[] = [];
  const foodTokens: string[] = [];
  const joined = tokens.join(" ");
  const consumedIndices = new Set<number>();
  for (const mb of MULTI_WORD_BRANDS) {
    if (joined.includes(mb)) {
      const mbTokens = mb.split(/\s+/);
      for (let i = 0; i <= tokens.length - mbTokens.length; i++) {
        if (mbTokens.every((t, j) => tokens[i + j] === t)) {
          for (let j = 0; j < mbTokens.length; j++) consumedIndices.add(i + j);
          brandTokens.push(mb);
        }
      }
    }
  }
  for (let i = 0; i < tokens.length; i++) {
    if (consumedIndices.has(i)) continue;
    if (BRAND_KEYWORDS.has(tokens[i])) brandTokens.push(tokens[i]);
    else foodTokens.push(tokens[i]);
  }
  return { brandTokens, foodTokens };
}

// ── Scoring ────────────────────────────────────────────────────────────
function brandRelevanceScore(food: any, query: string, tokens: string[], aliases: string[], synonymTerms: string[] = []): number {
  const nameLower = (food.name ?? "").toLowerCase();
  const brandLower = (food.brand ?? "").toLowerCase();
  let score = 0;
  const { brandTokens, foodTokens } = classifyTokens(tokens);
  const hasBrandIntent = brandTokens.length > 0;
  const hasFoodIntent = foodTokens.length > 0;
  const brandMatchesDirect = hasBrandIntent && brandTokens.some(bt => brandLower.includes(bt));
  const brandMatchesAlias = !brandMatchesDirect && aliases.length > 0 && aliases.some(a => brandLower.includes(a));
  const brandMatched = brandMatchesDirect || brandMatchesAlias;
  const foodTokensInName = hasFoodIntent ? foodTokens.filter(t => nameLower.includes(t)).length : 0;
  const allFoodTokensInName = hasFoodIntent && foodTokensInName === foodTokens.length;
  const foodPhrase = foodTokens.join(" ");

  if (hasBrandIntent && hasFoodIntent) {
    if (brandMatchesDirect && allFoodTokensInName) { score += 200; if (foodPhrase && nameLower.includes(foodPhrase)) score += 50; }
    else if (brandMatchesAlias && allFoodTokensInName) { score += 180; if (foodPhrase && nameLower.includes(foodPhrase)) score += 40; }
    else if (brandMatched && foodTokensInName > 0 && !allFoodTokensInName) score += 100 + foodTokensInName * 20;
    else if (!brandMatched && allFoodTokensInName) { score += 80; if (foodPhrase && nameLower.includes(foodPhrase)) score += 30; }
    else if (brandMatched && foodTokensInName === 0) score += 10;
    else if (!brandMatched && foodTokensInName > 0) score += 40 + foodTokensInName * 10;
    else score += 5;
  } else if (hasBrandIntent && !hasFoodIntent) {
    if (brandLower === query) score += 120;
    else if (brandMatchesDirect) score += 100;
    else if (brandMatchesAlias) score += 90;
    if (nameLower.includes(query)) score += 30;
  } else {
    // No brand intent — pure food query
    if (nameLower === query) score += 120;
    else if (nameLower.includes(query)) score += 100;
    // Phrase match bonus: contiguous multi-word match in name (e.g. "everything bagel")
    else if (tokens.length > 1 && nameLower.includes(query)) score += 100;
    else if (allFoodTokensInName) {
      score += 80;
      // Bonus for contiguous phrase match within food tokens
      if (foodPhrase && foodPhrase.length > 3 && nameLower.includes(foodPhrase)) score += 50;
    }
    else if (foodTokensInName > 0) score += 40 + foodTokensInName * 10;
    if (brandLower && brandLower.includes(query)) score += 50;
    const brandTokenHits = tokens.filter(t => brandLower.includes(t)).length;
    if (brandTokenHits > 0) score += brandTokenHits * 10;
  }

  if (synonymTerms.length > 0) {
    if (synonymTerms.some(syn => nameLower.includes(syn) || brandLower.includes(syn))) score += 15;
  }

  if (food.source === "usda") score += 15;
  if (food.source === "fatsecret" && food.is_branded) score += 20;
  else if (food.source === "fatsecret") score += 12;
  if (food.is_branded || brandLower) score += 10;
  if (food.has_complete_macros !== false) score += 5;
  score += Math.min(food.popularity_score ?? 0, 20);
  if (hasBrandIntent && !brandLower) score -= 30;

  return score;
}

// ── USDA parsing ───────────────────────────────────────────────────────
function parseUsdaServings(item: any) {
  const measures = item.foodMeasures ?? [];
  const servingSize = item.servingSize ?? 100;
  const servingUnit = (item.servingSizeUnit ?? "g").toLowerCase();
  let description = `${servingSize}${servingUnit}`;
  let size_g = servingSize;
  const additional: any[] = [];
  if (measures.length > 0) {
    const primary = measures[0];
    description = primary.disseminationText ?? primary.measureUnitName ?? description;
    size_g = primary.gramWeight ?? servingSize;
    measures.slice(1).forEach((m: any) => {
      additional.push({ description: m.disseminationText ?? m.measureUnitName, size_g: m.gramWeight ?? 100 });
    });
  }
  if (!additional.find((a: any) => a.description === "100g")) additional.push({ description: "100g", size_g: 100 });
  return { description, size_g, unit: servingUnit, additional };
}

function mapUsdaFood(item: any): any | null {
  const nutrients = item.foodNutrients ?? [];
  const get = (name: string) => nutrients.find((n: any) => n.nutrientName === name)?.value ?? null;
  const protein = get("Protein"); const carbs = get("Carbohydrate, by difference"); const fat = get("Total lipid (fat)");
  if ((protein ?? 0) + (carbs ?? 0) + (fat ?? 0) === 0) return null;
  const serving = parseUsdaServings(item);
  return {
    usda_fdc_id: String(item.fdcId), name: item.description?.trim() ?? "Unknown",
    brand: item.brandOwner?.trim() ?? item.brandName?.trim() ?? null,
    calories_per_100g: get("Energy"), protein_per_100g: protein, carbs_per_100g: carbs, fat_per_100g: fat,
    fiber_per_100g: get("Fiber, total dietary"), sugar_per_100g: get("Sugars, total including NLEA"),
    sodium_per_100g: get("Sodium, Na"),
    vitamin_a_mcg_per_100g: get("Vitamin A, RAE"), vitamin_c_mg_per_100g: get("Vitamin C, total ascorbic acid"),
    vitamin_d_mcg_per_100g: get("Vitamin D (D2 + D3)"), vitamin_e_mg_per_100g: get("Vitamin E (alpha-tocopherol)"),
    vitamin_k_mcg_per_100g: get("Vitamin K (phylloquinone)"), vitamin_b1_mg_per_100g: get("Thiamin"),
    vitamin_b2_mg_per_100g: get("Riboflavin"), vitamin_b3_mg_per_100g: get("Niacin"),
    vitamin_b5_mg_per_100g: get("Pantothenic acid"), vitamin_b6_mg_per_100g: get("Vitamin B-6"),
    vitamin_b9_mcg_per_100g: get("Folate, total"), vitamin_b12_mcg_per_100g: get("Vitamin B-12"),
    calcium_mg_per_100g: get("Calcium, Ca"), iron_mg_per_100g: get("Iron, Fe"),
    magnesium_mg_per_100g: get("Magnesium, Mg"), phosphorus_mg_per_100g: get("Phosphorus, P"),
    potassium_mg_per_100g: get("Potassium, K"), zinc_mg_per_100g: get("Zinc, Zn"),
    copper_mg_per_100g: get("Copper, Cu"), manganese_mg_per_100g: get("Manganese, Mn"),
    selenium_mcg_per_100g: get("Selenium, Se"), cholesterol_per_100g: get("Cholesterol"),
    serving_size_g: serving.size_g, serving_unit: serving.unit, serving_description: serving.description,
    household_serving_fulltext: serving.description, additional_serving_sizes: serving.additional,
    image_url: null, barcode: item.gtinUpc ?? null, is_branded: !!(item.brandOwner || item.brandName),
    is_verified: true, is_custom: false, source: "usda", language_code: "en", country_code: "US",
    has_complete_macros: true, data_quality_score: 100, popularity_score: 5,
  };
}

// ── Safe JSON parse helper ─────────────────────────────────────────────
async function safeJson(response: Response): Promise<any> {
  try { return await response.json(); }
  catch { return null; }
}

// ── User food history for boosting ─────────────────────────────────────
interface HistoryEntry { food_id: string; log_count: number; is_favorite: boolean; last_logged_at: string; food_name?: string; food_brand?: string; food_data?: any; }

async function getUserFoodHistory(supabase: any, userId: string): Promise<{ byId: Map<string, HistoryEntry>; byName: Map<string, HistoryEntry>; allEntries: HistoryEntry[] }> {
  const byId = new Map<string, HistoryEntry>();
  const byName = new Map<string, HistoryEntry>();
  const allEntries: HistoryEntry[] = [];
  try {
    const { data, error } = await supabase
      .from("user_food_history").select("food_id, log_count, is_favorite, last_logged_at")
      .eq("user_id", userId).order("last_logged_at", { ascending: false }).limit(500);
    if (error || !data || data.length === 0) return { byId, byName, allEntries };

    const foodIds = data.map((r: any) => r.food_id).filter(Boolean);
    
    // Fetch from BOTH food_items and foods tables for complete coverage
    const [foodItemsRes, foodsRes] = await Promise.allSettled([
      supabase.from("food_items").select("id, name, brand, calories, protein, carbs, fat, fiber, sugar, sodium, serving_size, serving_unit, serving_label").in("id", foodIds),
      supabase.from("foods").select("id, name, brand, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, fiber_per_100g, sugar_per_100g, sodium_per_100g, serving_size_g, serving_unit, serving_description, source, is_branded, has_complete_macros, data_quality_score, popularity_score").in("id", foodIds),
    ]);

    const nameMap = new Map<string, { name: string; brand: string | null; foodData?: any }>();
    if (foodItemsRes.status === "fulfilled" && foodItemsRes.value.data) {
      foodItemsRes.value.data.forEach((f: any) => {
        const ss = f.serving_size || 100;
        const factor = 100 / ss;
        nameMap.set(f.id, {
          name: f.name,
          brand: f.brand,
          foodData: {
            id: f.id,
            name: f.name,
            brand: f.brand,
            calories_per_100g: Math.round((f.calories || 0) * factor),
            protein_per_100g: Math.round((f.protein || 0) * factor * 10) / 10,
            carbs_per_100g: Math.round((f.carbs || 0) * factor * 10) / 10,
            fat_per_100g: Math.round((f.fat || 0) * factor * 10) / 10,
            fiber_per_100g: f.fiber ? Math.round(f.fiber * factor * 10) / 10 : null,
            sugar_per_100g: f.sugar ? Math.round(f.sugar * factor * 10) / 10 : null,
            sodium_per_100g: f.sodium ? Math.round(f.sodium * factor * 10) / 10 : null,
            serving_size_g: ss,
            serving_unit: f.serving_unit || "g",
            serving_description: f.serving_label || `${ss}g`,
            source: "local",
            is_branded: !!f.brand,
            has_complete_macros: true,
            data_quality_score: 70,
            popularity_score: 10,
          },
        });
      });
    }
    if (foodsRes.status === "fulfilled" && foodsRes.value.data) {
      foodsRes.value.data.forEach((f: any) => {
        if (!nameMap.has(f.id)) {
          nameMap.set(f.id, { name: f.name, brand: f.brand, foodData: f });
        }
      });
    }

    data.forEach((row: HistoryEntry) => {
      byId.set(row.food_id, row);
      const info = nameMap.get(row.food_id);
      if (info) {
        const entry = { ...row, food_name: info.name, food_brand: info.brand ?? undefined, food_data: info.foodData };
        allEntries.push(entry);
        const key = `${(info.name ?? "").toLowerCase().trim()}::${(info.brand ?? "").toLowerCase().trim()}`;
        const existing = byName.get(key);
        if (!existing || row.log_count > existing.log_count) {
          byName.set(key, entry);
        }
      }
    });
    return { byId, byName, allEntries };
  } catch { return { byId, byName, allEntries }; }
}

function applyHistoryBoost(results: any[], historyData: { byId: Map<string, HistoryEntry>; byName: Map<string, HistoryEntry>; allEntries?: HistoryEntry[] } | Map<string, HistoryEntry>, queryTokens?: string[]): any[] {
  let byId: Map<string, HistoryEntry>;
  let byName: Map<string, HistoryEntry>;
  let allEntries: HistoryEntry[] = [];
  if (historyData instanceof Map) {
    byId = historyData;
    byName = new Map();
  } else {
    byId = historyData.byId;
    byName = historyData.byName;
    allEntries = historyData.allEntries ?? [];
  }
  if (byId.size === 0 && byName.size === 0) return results;

  // Boost existing results that match history
  const boosted = results.map(food => {
    let history = byId.get(food.id);
    if (!history) {
      const nameKey = `${(food.name ?? "").toLowerCase().trim()}::${(food.brand ?? "").toLowerCase().trim()}`;
      history = byName.get(nameKey);
    }
    // Fuzzy: check if any history entry name contains food name or vice versa
    if (!history) {
      const foodNameLower = (food.name ?? "").toLowerCase();
      for (const [, entry] of byName) {
        const histName = (entry.food_name ?? "").toLowerCase();
        if (histName && foodNameLower && (histName.includes(foodNameLower) || foodNameLower.includes(histName))) {
          history = entry;
          break;
        }
      }
    }
    if (!history) return food;
    const daysSinceLogged = Math.floor((Date.now() - new Date(history.last_logged_at).getTime()) / 86400000);
    const recencyFactor = Math.max(0, 1 - daysSinceLogged / 60);
    const historyBoost = (history.is_favorite ? 60.0 : 0) + Math.min(history.log_count, 30) * 2.5 + recencyFactor * 25.0;
    return { ...food, _relevance: (food._relevance ?? 0) + historyBoost, is_recent: true, is_favorite: history.is_favorite, log_count: history.log_count };
  });

  // Inject unmatched history items that match query tokens
  if (queryTokens && queryTokens.length > 0 && allEntries.length > 0) {
    const existingIds = new Set(boosted.map(f => f.id));
    const existingNames = new Set(boosted.map(f => `${(f.name ?? "").toLowerCase()}::${(f.brand ?? "").toLowerCase()}`));

    for (const entry of allEntries) {
      if (!entry.food_name) continue;
      const nameKey = `${entry.food_name.toLowerCase()}::${(entry.food_brand ?? "").toLowerCase()}`;
      if (existingNames.has(nameKey) || existingIds.has(entry.food_id)) continue;

      const nameLower = entry.food_name.toLowerCase();
      const brandLower = (entry.food_brand ?? "").toLowerCase();
      const allMatch = queryTokens.every(t => nameLower.includes(t) || brandLower.includes(t));
      if (!allMatch) continue;

      // Inject as a high-relevance result from foods table data if available
      const fd = entry.food_data;
      if (fd) {
        const daysSinceLogged = Math.floor((Date.now() - new Date(entry.last_logged_at).getTime()) / 86400000);
        const recencyFactor = Math.max(0, 1 - daysSinceLogged / 60);
        const historyBoost = (entry.is_favorite ? 60.0 : 0) + Math.min(entry.log_count, 30) * 2.5 + recencyFactor * 25.0;
        boosted.unshift({ ...fd, _relevance: 200 + historyBoost, is_recent: true, is_favorite: entry.is_favorite, log_count: entry.log_count });
        existingNames.add(nameKey);
      }
    }
  }

  return boosted.sort((a, b) => (b._relevance ?? 0) - (a._relevance ?? 0));
}

// ── Synonym expansion ──────────────────────────────────────────────────
async function expandWithSynonyms(supabase: any, originalQuery: string): Promise<string[]> {
  try {
    const { data, error } = await supabase.rpc("get_synonyms_for_query", { input_query: originalQuery });
    if (error || !data) return [];
    const origTokens = new Set(originalQuery.toLowerCase().split(/\s+/));
    return (data as string[]).filter(t => !origTokens.has(t));
  } catch { return []; }
}

// ── FatSecret OAuth + API helpers ──────────────────────────────────────
let cachedFsToken: string | null = null;
let fsTokenExpiry = 0;

async function getFatSecretToken(): Promise<string> {
  if (cachedFsToken && Date.now() < fsTokenExpiry) return cachedFsToken;
  const clientId = Deno.env.get("FATSECRET_CLIENT_ID");
  const clientSecret = Deno.env.get("FATSECRET_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("FatSecret credentials not configured");
  const credentials = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch("https://oauth.fatsecret.com/connect/token", {
    method: "POST",
    headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`FatSecret OAuth failed: ${res.status}`);
  const data = await res.json();
  cachedFsToken = data.access_token;
  fsTokenExpiry = Date.now() + (data.expires_in - 300) * 1000;
  return cachedFsToken!;
}

async function fatSecretAPI(method: string, params: Record<string, string>, token: string): Promise<any> {
  const searchParams = new URLSearchParams({ method, format: "json", ...params });
  const res = await fetch("https://platform.fatsecret.com/rest/server.api", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: searchParams.toString(),
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) throw new Error(`FatSecret API error: ${res.status}`);
  return res.json();
}

function mapFatSecretFood(food: any): any | null {
  const servings = food.servings?.serving;
  if (!servings) return null;
  const servingList = Array.isArray(servings) ? servings : [servings];
  // Prefer a gram-based serving with a reasonable amount (>10g) for accurate per-100g conversion
  let metricServing = servingList.find((s: any) =>
    (s.metric_serving_unit === "g" || s.metric_serving_unit === "ml") &&
    parseFloat(s.metric_serving_amount) >= 10
  );
  if (!metricServing) metricServing = servingList.find((s: any) => s.metric_serving_unit === "g" || s.metric_serving_unit === "ml");
  if (!metricServing) metricServing = servingList[0];
  if (!metricServing) return null;
  const metricAmount = parseFloat(metricServing.metric_serving_amount) || 100;
  const factor = 100 / metricAmount;
  const calories = parseFloat(metricServing.calories) || 0;
  const protein = parseFloat(metricServing.protein) || 0;
  const carbs = parseFloat(metricServing.carbohydrate) || 0;
  const fat = parseFloat(metricServing.fat) || 0;
  if (protein + carbs + fat === 0) return null;
  // Sanity check: calories_per_100g > 900 is physically impossible (pure fat = ~900)
  const calsPer100 = Math.round(calories * factor);
  if (calsPer100 > 900) return null;

  const additional: Array<{ description: string; size_g: number }> = [];
  for (const s of servingList) {
    const desc = s.serving_description || s.measurement_description;
    const grams = parseFloat(s.metric_serving_amount) || 0;
    if (desc && grams > 0) additional.push({ description: desc, size_g: grams });
  }
  if (!additional.find(a => a.description === "100g")) additional.push({ description: "100g", size_g: 100 });

  const primaryServing = servingList[0];
  const primaryDesc = primaryServing?.serving_description || `${metricAmount}g`;
  const primarySizeG = parseFloat(primaryServing?.metric_serving_amount) || metricAmount;

  // Extract micronutrients from FatSecret serving data (per-100g conversion)
  const parseMicro = (val: any) => val != null ? Math.round(parseFloat(val) * factor * 10) / 10 : null;

  return {
    fatsecret_id: String(food.food_id),
    name: food.food_name?.trim() || "Unknown",
    brand: food.brand_name?.trim() || null,
    calories_per_100g: calsPer100,
    protein_per_100g: Math.round(protein * factor * 10) / 10,
    carbs_per_100g: Math.round(carbs * factor * 10) / 10,
    fat_per_100g: Math.round(fat * factor * 10) / 10,
    fiber_per_100g: metricServing.fiber ? Math.round(parseFloat(metricServing.fiber) * factor * 10) / 10 : null,
    sugar_per_100g: metricServing.sugar ? Math.round(parseFloat(metricServing.sugar) * factor * 10) / 10 : null,
    sodium_per_100g: metricServing.sodium ? Math.round(parseFloat(metricServing.sodium) * factor * 10) / 10 : null,
    // Micronutrients from FatSecret serving data
    saturated_fat_per_100g: parseMicro(metricServing.saturated_fat),
    trans_fat_per_100g: parseMicro(metricServing.trans_fat),
    monounsaturated_fat_per_100g: parseMicro(metricServing.monounsaturated_fat),
    polyunsaturated_fat_per_100g: parseMicro(metricServing.polyunsaturated_fat),
    cholesterol_per_100g: parseMicro(metricServing.cholesterol),
    calcium_mg_per_100g: parseMicro(metricServing.calcium),
    iron_mg_per_100g: parseMicro(metricServing.iron),
    potassium_mg_per_100g: parseMicro(metricServing.potassium),
    vitamin_a_mcg_per_100g: parseMicro(metricServing.vitamin_a),
    vitamin_c_mg_per_100g: parseMicro(metricServing.vitamin_c),
    vitamin_d_mcg_per_100g: parseMicro(metricServing.vitamin_d),
    serving_size_g: primarySizeG,
    serving_unit: "g",
    serving_description: primaryDesc,
    household_serving_fulltext: primaryDesc,
    additional_serving_sizes: additional,
    image_url: null,
    barcode: null,
    is_branded: !!food.brand_name,
    is_verified: false,
    is_custom: false,
    source: "fatsecret",
    has_complete_macros: true,
    data_quality_score: food.brand_name ? 80 : 50,
    popularity_score: 5,
  };
}

// ── FatSecret search (replaces OpenFoodFacts) ─────────────────────────
async function searchFatSecret(query: string, limit: number): Promise<any[]> {
  const token = await getFatSecretToken();
  const data = await fatSecretAPI("foods.search.v3", {
    search_expression: query,
    max_results: String(Math.min(limit, 50)),
    include_food_images: "false",
  }, token);

  const searchRoot = data?.foods_search ?? data?.foods ?? data;
  const rawFoods = searchRoot?.results?.food ?? searchRoot?.foods?.food ?? searchRoot?.food;
  if (!rawFoods) return [];
  const foodList = Array.isArray(rawFoods) ? rawFoods : [rawFoods];

  // Get full details with servings for each food (parallel, capped)
  const detailedFoods = await Promise.allSettled(
    foodList.slice(0, Math.min(limit, 20)).map(async (f: any) => {
      try {
        const detail = await fatSecretAPI("food.get.v4", { food_id: f.food_id }, token);
        return detail?.food || f;
      } catch { return f; }
    })
  );

  return detailedFoods
    .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled")
    .map(r => mapFatSecretFood(r.value))
    .filter(Boolean);
}

function parseServingGrams(raw: string): number | null {
  if (!raw) return null;
  const parenG = raw.match(/\((\d+(?:\.\d+)?)\s*g\)/i);
  if (parenG) return parseFloat(parenG[1]);
  const parenMl = raw.match(/\((\d+(?:\.\d+)?)\s*ml\)/i);
  if (parenMl) return parseFloat(parenMl[1]);
  const plain = raw.match(/^(\d+(?:\.\d+)?)\s*g$/i);
  if (plain) return parseFloat(plain[1]);
  const ml = raw.match(/^(\d+(?:\.\d+)?)\s*ml$/i);
  if (ml) return parseFloat(ml[1]);
  const numOnly = raw.match(/(\d+(?:\.\d+)?)\s*(?:g|ml)/i);
  if (numOnly) return parseFloat(numOnly[1]);
  return null;
}

// ── Main handler ───────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { query: q, limit: lim = 25, user_id } = await req.json();
    const query = (q ?? "").trim().toLowerCase();
    const limit = typeof lim === "number" ? lim : 25;
    const userId = user_id ?? null;
    const usdaApiKey = Deno.env.get("USDA_API_KEY") ?? "";

    if (!query || query.length < 2) {
      return new Response(JSON.stringify({ foods: [], bestMatches: [], moreResults: [], source: "empty" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const tokens = query.split(/\s+/).filter(Boolean);
    const aliases = expandBrandAliases(tokens);
    const { brandTokens, foodTokens } = classifyTokens(tokens);
    const hasBrandIntent = brandTokens.length > 0;
    const hasFoodIntent = foodTokens.length > 0;
    const isCompoundQuery = hasBrandIntent && hasFoodIntent;

    // ── Fire ALL data sources in parallel from the start ─────────────
    const orConditions = tokens.map(t => `name.ilike.%${t}%,brand.ilike.%${t}%`).join(",");
    const aliasConditions = aliases.map(a => `brand.ilike.%${a}%`).join(",");
    const allConditions = aliasConditions ? `${orConditions},${aliasConditions}` : orConditions;

    const usdaPageSize = hasBrandIntent ? 30 : 20;
    const sourceStatus: Record<string, string> = {};

    // Fire local, synonyms, history, FatSecret, and USDA all in parallel
    const [localPromise, synonymPromise, historyPromise, fsResult, usdaResult] = await Promise.allSettled([
      // Local DB
      supabase.from("foods").select("*").or(allConditions)
        .not("calories_per_100g", "is", null)
        .order("data_quality_score", { ascending: false })
        .order("popularity_score", { ascending: false })
        .limit(50)
        .then((res: any) => {
          sourceStatus.local = `ok:${(res.data ?? []).length}`;
          return res.data ?? [];
        }),
      // Synonyms
      expandWithSynonyms(supabase, query),
      // History
      userId ? getUserFoodHistory(supabase, userId) : Promise.resolve({ byId: new Map<string, HistoryEntry>(), byName: new Map<string, HistoryEntry>() }),
      // FatSecret (replaces OpenFoodFacts — much better branded food coverage)
      searchFatSecret(query, 25).then(foods => {
        sourceStatus.fatsecret = `ok:${foods.length}`;
        return foods;
      }).catch((e: any) => {
        sourceStatus.fatsecret = e.name === "TimeoutError" ? "timeout" : `error:${e.message?.slice(0, 60)}`;
        console.warn("[search-foods] FatSecret failed:", e.message || e);
        return [] as any[];
      }),
      // USDA
      (async () => {
        if (!usdaApiKey) { sourceStatus.usda = "no_key"; return [] as any[]; }
        const res = await fetch(
          `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}&pageSize=${usdaPageSize}&api_key=${usdaApiKey}`,
          { signal: AbortSignal.timeout(3000) }
        );
        if (!res.ok) { sourceStatus.usda = `http_${res.status}`; return [] as any[]; }
        const data = await safeJson(res);
        if (!data) { sourceStatus.usda = "json_fail"; return [] as any[]; }
        const foods = (data.foods ?? []).map(mapUsdaFood).filter(Boolean);
        sourceStatus.usda = `ok:${foods.length}`;
        return foods;
      })().catch((e: any) => {
        sourceStatus.usda = e.name === "TimeoutError" ? "timeout" : "error";
        console.warn("[search-foods] USDA failed:", e.message || e);
        return [] as any[];
      }),
    ]);

    let localFoods: any[] = localPromise.status === "fulfilled" ? localPromise.value : [];
    const synonymTerms: string[] = synonymPromise.status === "fulfilled" ? synonymPromise.value : [];
    const historyMap = historyPromise.status === "fulfilled" ? historyPromise.value : { byId: new Map<string, HistoryEntry>(), byName: new Map<string, HistoryEntry>(), allEntries: [] as HistoryEntry[] };
    const fsFoods: any[] = fsResult.status === "fulfilled" ? fsResult.value : [];
    const usdaFoods: any[] = usdaResult.status === "fulfilled" ? usdaResult.value : [];

    // Filter local foods for valid macros
    localFoods = localFoods.filter((f: any) =>
      (f.protein_per_100g ?? 0) + (f.carbs_per_100g ?? 0) + (f.fat_per_100g ?? 0) > 0
    );

    // Synonym expansion for local results
    if (synonymTerms.length > 0) {
      const synConditions = synonymTerms.map(s => `name.ilike.%${s}%,brand.ilike.%${s}%`).join(",");
      try {
        const { data: synResults } = await supabase.from("foods").select("*").or(synConditions).not("calories_per_100g", "is", null).limit(20);
        if (synResults) {
          const existingIds = new Set(localFoods.map((f: any) => f.id));
          localFoods = [...localFoods, ...synResults.filter((f: any) => !existingIds.has(f.id))];
        }
      } catch { /* non-fatal */ }
    }

    console.log(`[search-foods] Sources: ${JSON.stringify(sourceStatus)} | Local:${localFoods.length} FS:${fsFoods.length} USDA:${usdaFoods.length}`);

    if (isCompoundQuery && localFoods.length > 0) {
      const filtered = localFoods.filter((f: any) => {
        const n = (f.name ?? "").toLowerCase();
        const b = (f.brand ?? "").toLowerCase();
        return foodTokens.every(ft => n.includes(ft) || b.includes(ft));
      });
      if (filtered.length > 0) localFoods = filtered;
    }

    // ── Cache USDA results ───────────────────────────────────────────
    try {
      if (usdaFoods.length > 0) {
        await supabase.from("foods").upsert(usdaFoods, { onConflict: "usda_fdc_id", ignoreDuplicates: false });
      }
    } catch { /* non-fatal */ }

    // ── Merge, score, deduplicate ────────────────────────────────────
    const existingUsdaIds = new Set(localFoods.map((f: any) => f.usda_fdc_id).filter(Boolean));
    const existingNames = new Set(localFoods.map((f: any) => `${(f.name ?? "").toLowerCase()}::${(f.brand ?? "").toLowerCase()}`));
    const newUsda = usdaFoods.filter((f) => !existingUsdaIds.has(f.usda_fdc_id));
    const newFs = fsFoods.filter((f) => !existingNames.has(`${(f.name ?? "").toLowerCase()}::${(f.brand ?? "").toLowerCase()}`));
    
    const allResultsRaw = [...localFoods, ...newFs, ...newUsda].filter((f) =>
      f.has_complete_macros !== false && ((f.protein_per_100g ?? 0) + (f.carbs_per_100g ?? 0) + (f.fat_per_100g ?? 0)) > 0
    );

    const scored = allResultsRaw.map((f) => ({ ...f, _relevance: brandRelevanceScore(f, query, tokens, aliases, synonymTerms) }));
    scored.sort((a, b) => b._relevance - a._relevance);

    const seen = new Set<string>();
    const deduped = scored.filter((f) => {
      const key = `${f.name?.toLowerCase()}::${f.brand?.toLowerCase() ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Apply history boost BEFORE slicing so previously logged foods (e.g. "jasmine rice")
    // that ranked #30+ still get promoted to the top of results
    const boosted = applyHistoryBoost(deduped, historyMap, tokens);
    let merged = boosted.slice(0, limit);

    // ── Zero-result widening ─────────────────────────────────────────
    let wasWidened = false;
    let usedQuery = query;
    let searchStrategy = "hybrid";

    if (merged.length === 0) {
      if (hasFoodIntent && foodTokens.length > 0) {
        const nameOnly = foodTokens.join(" ");
        const { data: wideResults } = await supabase.from("foods").select("*")
          .or(foodTokens.map(t => `name.ilike.%${t}%`).join(","))
          .not("calories_per_100g", "is", null).order("data_quality_score", { ascending: false }).limit(limit);
        if (wideResults && wideResults.length > 0) {
          merged = wideResults.map((f: any) => ({ ...f, _relevance: brandRelevanceScore(f, nameOnly, foodTokens, [], synonymTerms) }));
          merged.sort((a, b) => (b._relevance ?? 0) - (a._relevance ?? 0));
          merged = applyHistoryBoost(merged, historyMap);
          wasWidened = true; usedQuery = nameOnly; searchStrategy = "name_only";
        }
      }

      if (merged.length === 0 && foodTokens.length > 1) {
        const sortedTokens = [...foodTokens].sort((a, b) => b.length - a.length);
        for (const token of sortedTokens) {
          if (token.length < 3) continue;
          const { data: tokenResults } = await supabase.from("foods").select("*")
            .ilike("name", `%${token}%`).not("calories_per_100g", "is", null)
            .order("data_quality_score", { ascending: false }).limit(limit);
          if (tokenResults && tokenResults.length > 0) {
            merged = tokenResults.map((f: any) => ({ ...f, _relevance: brandRelevanceScore(f, token, [token], [], synonymTerms) }));
            merged.sort((a, b) => (b._relevance ?? 0) - (a._relevance ?? 0));
            merged = applyHistoryBoost(merged, historyMap);
            wasWidened = true; usedQuery = token; searchStrategy = "single_token"; break;
          }
        }
      }

      if (merged.length === 0 && hasBrandIntent) {
        const brandOnly = brandTokens[0];
        const { data: brandResults } = await supabase.from("foods").select("*")
          .ilike("brand", `%${brandOnly}%`).not("calories_per_100g", "is", null)
          .order("data_quality_score", { ascending: false }).limit(limit);
        if (brandResults && brandResults.length > 0) {
          merged = brandResults.map((f: any) => ({ ...f, _relevance: brandRelevanceScore(f, brandOnly, [brandOnly], aliases, synonymTerms) }));
          merged.sort((a, b) => (b._relevance ?? 0) - (a._relevance ?? 0));
          merged = applyHistoryBoost(merged, historyMap);
          wasWidened = true; usedQuery = brandOnly; searchStrategy = "brand_only";
        }
      }
    }

    // ── Group ────────────────────────────────────────────────────────
    const BEST_MATCH_THRESHOLD = isCompoundQuery ? 150 : 80;
    const bestMatches = merged.filter((f) => (f._relevance ?? 0) >= BEST_MATCH_THRESHOLD);
    const moreResults = merged.filter((f) => (f._relevance ?? 0) < BEST_MATCH_THRESHOLD);

    logSearchAnalytics(supabase, userId, query, merged.length, searchStrategy, brandTokens[0] ?? null, bestMatches.length);

    return new Response(JSON.stringify({ foods: merged, bestMatches, moreResults, source: "hybrid", wasWidened, usedQuery, strategy: searchStrategy }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("search-foods error:", err);
    return new Response(JSON.stringify({ error: "Search failed", foods: [], bestMatches: [], moreResults: [] }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function logSearchAnalytics(supabase: any, userId: string | null, query: string, resultCount: number, strategy: string, detectedBrand: string | null, bestMatchCount: number) {
  supabase.from("food_search_log").insert({
    user_id: userId, query, normalized_query: query.toLowerCase().trim(),
    results_count: resultCount, best_match_count: bestMatchCount,
    search_strategy: strategy, detected_brand: detectedBrand,
  }).then(() => {}).catch(() => {});
}
