// Micronutrient RDA reference data and utility functions

export interface NutrientInfo {
  key: string;
  label: string;
  unit: string;
  category: "vitamin" | "mineral" | "fatty_acid";
  rda: number; // default RDA
  upperLimit?: number;
}

export const MICRONUTRIENTS: NutrientInfo[] = [
  // Vitamins
  { key: "vitamin_a_mcg", label: "Vitamin A", unit: "mcg", category: "vitamin", rda: 900, upperLimit: 3000 },
  { key: "vitamin_c_mg", label: "Vitamin C", unit: "mg", category: "vitamin", rda: 90, upperLimit: 2000 },
  { key: "vitamin_d_mcg", label: "Vitamin D", unit: "mcg", category: "vitamin", rda: 15, upperLimit: 100 },
  { key: "vitamin_e_mg", label: "Vitamin E", unit: "mg", category: "vitamin", rda: 15, upperLimit: 1000 },
  { key: "vitamin_k_mcg", label: "Vitamin K", unit: "mcg", category: "vitamin", rda: 120 },
  { key: "vitamin_b1_mg", label: "Thiamine (B1)", unit: "mg", category: "vitamin", rda: 1.2 },
  { key: "vitamin_b2_mg", label: "Riboflavin (B2)", unit: "mg", category: "vitamin", rda: 1.3 },
  { key: "vitamin_b3_mg", label: "Niacin (B3)", unit: "mg", category: "vitamin", rda: 16, upperLimit: 35 },
  { key: "vitamin_b5_mg", label: "Pantothenic Acid (B5)", unit: "mg", category: "vitamin", rda: 5 },
  { key: "vitamin_b6_mg", label: "Vitamin B6", unit: "mg", category: "vitamin", rda: 1.3, upperLimit: 100 },
  { key: "vitamin_b7_mcg", label: "Biotin (B7)", unit: "mcg", category: "vitamin", rda: 30 },
  { key: "vitamin_b9_mcg", label: "Folate (B9)", unit: "mcg", category: "vitamin", rda: 400, upperLimit: 1000 },
  { key: "vitamin_b12_mcg", label: "Vitamin B12", unit: "mcg", category: "vitamin", rda: 2.4 },
  // Minerals
  { key: "calcium_mg", label: "Calcium", unit: "mg", category: "mineral", rda: 1000, upperLimit: 2500 },
  { key: "iron_mg", label: "Iron", unit: "mg", category: "mineral", rda: 18, upperLimit: 45 },
  { key: "magnesium_mg", label: "Magnesium", unit: "mg", category: "mineral", rda: 400, upperLimit: 350 },
  { key: "phosphorus_mg", label: "Phosphorus", unit: "mg", category: "mineral", rda: 700, upperLimit: 4000 },
  { key: "potassium_mg", label: "Potassium", unit: "mg", category: "mineral", rda: 2600 },
  { key: "zinc_mg", label: "Zinc", unit: "mg", category: "mineral", rda: 11, upperLimit: 40 },
  { key: "copper_mg", label: "Copper", unit: "mg", category: "mineral", rda: 0.9, upperLimit: 10 },
  { key: "manganese_mg", label: "Manganese", unit: "mg", category: "mineral", rda: 2.3, upperLimit: 11 },
  { key: "selenium_mcg", label: "Selenium", unit: "mcg", category: "mineral", rda: 55, upperLimit: 400 },
  { key: "chromium_mcg", label: "Chromium", unit: "mcg", category: "mineral", rda: 35 },
  { key: "molybdenum_mcg", label: "Molybdenum", unit: "mcg", category: "mineral", rda: 45, upperLimit: 2000 },
  { key: "iodine_mcg", label: "Iodine", unit: "mcg", category: "mineral", rda: 150, upperLimit: 1100 },
  // Fatty acids
  { key: "omega_3", label: "Omega-3", unit: "g", category: "fatty_acid", rda: 1.6 },
  { key: "omega_6", label: "Omega-6", unit: "g", category: "fatty_acid", rda: 17 },
];

export function calculateAdequacyScore(intakes: Record<string, number>, targets?: Record<string, number>): number {
  let totalScore = 0;
  let count = 0;

  for (const nutrient of MICRONUTRIENTS) {
    const intake = intakes[nutrient.key] || 0;
    const target = targets?.[nutrient.key] ?? nutrient.rda;
    if (target <= 0) continue;

    const pct = Math.min(intake / target, 1.5); // cap at 150%
    totalScore += Math.min(pct, 1); // score maxes at 100% per nutrient
    count++;
  }

  return count > 0 ? Math.round((totalScore / count) * 100) : 0;
}

export function getDeficiencies(intakes: Record<string, number>, targets?: Record<string, number>): NutrientInfo[] {
  return MICRONUTRIENTS.filter((n) => {
    const intake = intakes[n.key] || 0;
    const target = targets?.[n.key] ?? n.rda;
    return intake < target * 0.5; // below 50% of target
  });
}

export function getOverconsumption(intakes: Record<string, number>): NutrientInfo[] {
  return MICRONUTRIENTS.filter((n) => {
    if (!n.upperLimit) return false;
    const intake = intakes[n.key] || 0;
    return intake > n.upperLimit;
  });
}
