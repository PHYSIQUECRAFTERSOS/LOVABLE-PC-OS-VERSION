// Micronutrient RDA reference data, optimal ranges, bioavailability, and utility functions

export interface NutrientInfo {
  key: string;
  label: string;
  unit: string;
  category: "vitamin" | "mineral" | "fatty_acid" | "other";
  rda: number;
  upperLimit?: number;
  // Physique Crafters Optimal Engine
  pcOptimalMin: number;
  pcOptimalMax: number;
  pcUpperCaution?: number;
}

export interface BioavailabilityForm {
  form: string;
  multiplier: number;
  label: string;
}

export const BIOAVAILABILITY_FORMS: Record<string, BioavailabilityForm[]> = {
  magnesium_mg: [
    { form: "glycinate", multiplier: 0.9, label: "Magnesium Glycinate" },
    { form: "threonate", multiplier: 0.85, label: "Magnesium L-Threonate" },
    { form: "citrate", multiplier: 0.7, label: "Magnesium Citrate" },
    { form: "taurate", multiplier: 0.75, label: "Magnesium Taurate" },
    { form: "malate", multiplier: 0.7, label: "Magnesium Malate" },
    { form: "oxide", multiplier: 0.5, label: "Magnesium Oxide" },
  ],
  zinc_mg: [
    { form: "picolinate", multiplier: 0.9, label: "Zinc Picolinate" },
    { form: "bisglycinate", multiplier: 0.85, label: "Zinc Bisglycinate" },
    { form: "citrate", multiplier: 0.7, label: "Zinc Citrate" },
    { form: "gluconate", multiplier: 0.6, label: "Zinc Gluconate" },
    { form: "oxide", multiplier: 0.5, label: "Zinc Oxide" },
  ],
  iron_mg: [
    { form: "bisglycinate", multiplier: 0.9, label: "Iron Bisglycinate" },
    { form: "ferrous_sulfate", multiplier: 0.7, label: "Ferrous Sulfate" },
    { form: "ferric", multiplier: 0.4, label: "Ferric Iron" },
  ],
  calcium_mg: [
    { form: "citrate", multiplier: 0.8, label: "Calcium Citrate" },
    { form: "carbonate", multiplier: 0.6, label: "Calcium Carbonate" },
    { form: "hydroxyapatite", multiplier: 0.85, label: "Calcium Hydroxyapatite" },
  ],
  vitamin_d_mcg: [
    { form: "d3_cholecalciferol", multiplier: 1.0, label: "Vitamin D3 (Cholecalciferol)" },
    { form: "d2_ergocalciferol", multiplier: 0.6, label: "Vitamin D2 (Ergocalciferol)" },
  ],
  vitamin_b12_mcg: [
    { form: "methylcobalamin", multiplier: 0.95, label: "Methylcobalamin" },
    { form: "adenosylcobalamin", multiplier: 0.9, label: "Adenosylcobalamin" },
    { form: "cyanocobalamin", multiplier: 0.7, label: "Cyanocobalamin" },
  ],
  vitamin_b9_mcg: [
    { form: "methylfolate", multiplier: 0.95, label: "5-MTHF (Methylfolate)" },
    { form: "folic_acid", multiplier: 0.7, label: "Folic Acid" },
  ],
  selenium_mcg: [
    { form: "selenomethionine", multiplier: 0.9, label: "Selenomethionine" },
    { form: "sodium_selenite", multiplier: 0.6, label: "Sodium Selenite" },
  ],
  copper_mg: [
    { form: "bisglycinate", multiplier: 0.85, label: "Copper Bisglycinate" },
    { form: "gluconate", multiplier: 0.7, label: "Copper Gluconate" },
    { form: "oxide", multiplier: 0.4, label: "Copper Oxide" },
  ],
  omega_3: [
    { form: "triglyceride", multiplier: 0.95, label: "Triglyceride Form" },
    { form: "ethyl_ester", multiplier: 0.7, label: "Ethyl Ester" },
    { form: "phospholipid", multiplier: 0.9, label: "Phospholipid (Krill)" },
  ],
};

export const MICRONUTRIENTS: NutrientInfo[] = [
  // Vitamins
  { key: "vitamin_a_mcg", label: "Vitamin A", unit: "mcg", category: "vitamin", rda: 900, upperLimit: 3000, pcOptimalMin: 750, pcOptimalMax: 1500, pcUpperCaution: 2500 },
  { key: "vitamin_c_mg", label: "Vitamin C", unit: "mg", category: "vitamin", rda: 90, upperLimit: 2000, pcOptimalMin: 200, pcOptimalMax: 1000, pcUpperCaution: 1500 },
  { key: "vitamin_d_mcg", label: "Vitamin D", unit: "mcg", category: "vitamin", rda: 15, upperLimit: 100, pcOptimalMin: 50, pcOptimalMax: 100, pcUpperCaution: 125 },
  { key: "vitamin_e_mg", label: "Vitamin E", unit: "mg", category: "vitamin", rda: 15, upperLimit: 1000, pcOptimalMin: 15, pcOptimalMax: 200, pcUpperCaution: 800 },
  { key: "vitamin_k_mcg", label: "Vitamin K", unit: "mcg", category: "vitamin", rda: 120, pcOptimalMin: 120, pcOptimalMax: 500 },
  { key: "vitamin_b1_mg", label: "Thiamine (B1)", unit: "mg", category: "vitamin", rda: 1.2, pcOptimalMin: 1.2, pcOptimalMax: 10 },
  { key: "vitamin_b2_mg", label: "Riboflavin (B2)", unit: "mg", category: "vitamin", rda: 1.3, pcOptimalMin: 1.3, pcOptimalMax: 10 },
  { key: "vitamin_b3_mg", label: "Niacin (B3)", unit: "mg", category: "vitamin", rda: 16, upperLimit: 35, pcOptimalMin: 16, pcOptimalMax: 30, pcUpperCaution: 35 },
  { key: "vitamin_b5_mg", label: "Pantothenic Acid (B5)", unit: "mg", category: "vitamin", rda: 5, pcOptimalMin: 5, pcOptimalMax: 20 },
  { key: "vitamin_b6_mg", label: "Vitamin B6", unit: "mg", category: "vitamin", rda: 1.3, upperLimit: 100, pcOptimalMin: 2, pcOptimalMax: 25, pcUpperCaution: 50 },
  { key: "vitamin_b7_mcg", label: "Biotin (B7)", unit: "mcg", category: "vitamin", rda: 30, pcOptimalMin: 30, pcOptimalMax: 300 },
  { key: "vitamin_b9_mcg", label: "Folate (B9)", unit: "mcg", category: "vitamin", rda: 400, upperLimit: 1000, pcOptimalMin: 400, pcOptimalMax: 800, pcUpperCaution: 1000 },
  { key: "vitamin_b12_mcg", label: "Vitamin B12", unit: "mcg", category: "vitamin", rda: 2.4, pcOptimalMin: 5, pcOptimalMax: 500 },
  // Minerals
  { key: "calcium_mg", label: "Calcium", unit: "mg", category: "mineral", rda: 1000, upperLimit: 2500, pcOptimalMin: 1000, pcOptimalMax: 1500, pcUpperCaution: 2000 },
  { key: "iron_mg", label: "Iron", unit: "mg", category: "mineral", rda: 18, upperLimit: 45, pcOptimalMin: 8, pcOptimalMax: 18, pcUpperCaution: 35 },
  { key: "magnesium_mg", label: "Magnesium", unit: "mg", category: "mineral", rda: 400, upperLimit: 350, pcOptimalMin: 400, pcOptimalMax: 600, pcUpperCaution: 800 },
  { key: "phosphorus_mg", label: "Phosphorus", unit: "mg", category: "mineral", rda: 700, upperLimit: 4000, pcOptimalMin: 700, pcOptimalMax: 1200, pcUpperCaution: 3000 },
  { key: "potassium_mg", label: "Potassium", unit: "mg", category: "mineral", rda: 2600, pcOptimalMin: 3500, pcOptimalMax: 4700 },
  { key: "zinc_mg", label: "Zinc", unit: "mg", category: "mineral", rda: 11, upperLimit: 40, pcOptimalMin: 15, pcOptimalMax: 30, pcUpperCaution: 35 },
  { key: "copper_mg", label: "Copper", unit: "mg", category: "mineral", rda: 0.9, upperLimit: 10, pcOptimalMin: 1, pcOptimalMax: 3, pcUpperCaution: 8 },
  { key: "manganese_mg", label: "Manganese", unit: "mg", category: "mineral", rda: 2.3, upperLimit: 11, pcOptimalMin: 2.3, pcOptimalMax: 5, pcUpperCaution: 9 },
  { key: "selenium_mcg", label: "Selenium", unit: "mcg", category: "mineral", rda: 55, upperLimit: 400, pcOptimalMin: 100, pcOptimalMax: 200, pcUpperCaution: 300 },
  { key: "chromium_mcg", label: "Chromium", unit: "mcg", category: "mineral", rda: 35, pcOptimalMin: 35, pcOptimalMax: 200 },
  { key: "molybdenum_mcg", label: "Molybdenum", unit: "mcg", category: "mineral", rda: 45, upperLimit: 2000, pcOptimalMin: 45, pcOptimalMax: 150, pcUpperCaution: 1000 },
  { key: "iodine_mcg", label: "Iodine", unit: "mcg", category: "mineral", rda: 150, upperLimit: 1100, pcOptimalMin: 150, pcOptimalMax: 300, pcUpperCaution: 600 },
  // Fatty acids
  { key: "omega_3", label: "Omega-3", unit: "g", category: "fatty_acid", rda: 1.6, pcOptimalMin: 2, pcOptimalMax: 4 },
  { key: "omega_6", label: "Omega-6", unit: "g", category: "fatty_acid", rda: 17, pcOptimalMin: 11, pcOptimalMax: 17 },
  // Other
  { key: "fiber", label: "Fiber", unit: "g", category: "other", rda: 28, pcOptimalMin: 25, pcOptimalMax: 40 },
  { key: "sodium", label: "Sodium", unit: "mg", category: "other", rda: 2300, upperLimit: 2300, pcOptimalMin: 1500, pcOptimalMax: 3500, pcUpperCaution: 4000 },
  { key: "cholesterol", label: "Cholesterol", unit: "mg", category: "other", rda: 300, upperLimit: 300, pcOptimalMin: 0, pcOptimalMax: 300 },
];

// IU to mcg conversion factors
export const IU_CONVERSIONS: Record<string, number> = {
  vitamin_a_mcg: 0.3,     // 1 IU = 0.3 mcg retinol
  vitamin_d_mcg: 0.025,   // 1 IU = 0.025 mcg
  vitamin_e_mg: 0.67,     // 1 IU = 0.67 mg alpha-tocopherol
};

export function convertIUtoStandard(nutrientKey: string, iuValue: number): number {
  return iuValue * (IU_CONVERSIONS[nutrientKey] || 1);
}

export type OptimizationStatus = "deficient" | "suboptimal" | "optimal" | "caution" | "excessive";

export function getOptimizationStatus(intake: number, nutrient: NutrientInfo): OptimizationStatus {
  if (nutrient.upperLimit && intake > nutrient.upperLimit) return "excessive";
  if (nutrient.pcUpperCaution && intake > nutrient.pcUpperCaution) return "caution";
  if (intake >= nutrient.pcOptimalMin && intake <= nutrient.pcOptimalMax) return "optimal";
  if (intake >= nutrient.pcOptimalMin * 0.5) return "suboptimal";
  return "deficient";
}

export function calculateOptimizationScore(intakes: Record<string, number>, targets?: Record<string, number>): number {
  let totalScore = 0;
  let count = 0;

  for (const nutrient of MICRONUTRIENTS) {
    if (nutrient.category === "other") continue; // Skip fiber/sodium/cholesterol for score
    const intake = intakes[nutrient.key] || 0;
    const optMin = targets?.[nutrient.key] ?? nutrient.pcOptimalMin;
    const optMax = nutrient.pcOptimalMax;

    let score = 0;
    if (intake >= optMin && intake <= optMax) {
      score = 1.0; // Perfect
    } else if (intake < optMin) {
      score = Math.max(0, intake / optMin); // Linear ramp up
    } else if (nutrient.upperLimit && intake > nutrient.upperLimit) {
      score = Math.max(0, 0.5 - ((intake - nutrient.upperLimit) / nutrient.upperLimit) * 0.5); // Penalty
    } else if (nutrient.pcUpperCaution && intake > nutrient.pcUpperCaution) {
      score = 0.7; // Near upper caution
    } else {
      score = 0.9; // Above optimal but safe
    }

    totalScore += score;
    count++;
  }

  return count > 0 ? Math.round((totalScore / count) * 100) : 0;
}

// Legacy compatibility
export function calculateAdequacyScore(intakes: Record<string, number>, targets?: Record<string, number>): number {
  return calculateOptimizationScore(intakes, targets);
}

export function getDeficiencies(intakes: Record<string, number>, targets?: Record<string, number>): NutrientInfo[] {
  return MICRONUTRIENTS.filter((n) => {
    if (n.category === "other") return false;
    const intake = intakes[n.key] || 0;
    const target = targets?.[n.key] ?? n.pcOptimalMin;
    return intake < target * 0.5;
  });
}

export function getOverconsumption(intakes: Record<string, number>): NutrientInfo[] {
  return MICRONUTRIENTS.filter((n) => {
    if (!n.upperLimit) return false;
    const intake = intakes[n.key] || 0;
    return intake > n.upperLimit;
  });
}

export function getDuplicateStackingWarnings(
  supplementIntakes: Record<string, { sources: string[]; total: number }>
): { nutrient: NutrientInfo; sources: string[]; total: number }[] {
  const warnings: { nutrient: NutrientInfo; sources: string[]; total: number }[] = [];
  for (const n of MICRONUTRIENTS) {
    const data = supplementIntakes[n.key];
    if (data && data.sources.length > 1 && n.upperLimit && data.total > n.upperLimit * 0.8) {
      warnings.push({ nutrient: n, sources: data.sources, total: data.total });
    }
  }
  return warnings;
}
