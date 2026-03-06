/**
 * Barcode lookup service with dual-API fallback:
 * 1. Open Food Facts (primary, global)
 * 2. UPC Item DB (fallback, strong Canadian/NA coverage)
 */

export interface BarcodeProduct {
  name: string;
  brand: string | null;
  calories_per_100g: number | null;
  protein_per_100g: number | null;
  carbs_per_100g: number | null;
  fat_per_100g: number | null;
  fiber_per_100g: number | null;
  sugar_per_100g: number | null;
  sodium_per_100g: number | null;
  serving_size: number;
  serving_unit: string;
  serving_label: string;
  source: "open_food_facts" | "upc_item_db";
  category: string | null;
  barcode: string;
  image_url: string | null;
  has_macros: boolean;
}

export async function lookupBarcode(barcode: string): Promise<BarcodeProduct | null> {
  console.log('[BarcodeService] Looking up barcode:', barcode);

  // STEP 1: Open Food Facts (primary, free, global)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`,
      {
        signal: controller.signal,
        headers: { "Accept": "application/json" },
      }
    );
    clearTimeout(timeoutId);

    const data = await res.json();
    console.log('[BarcodeService] OFF response status:', data.status);

    if (data.status === 1 && data.product?.product_name) {
      console.log("[BarcodeService] Found via Open Food Facts:", data.product.product_name);
      return mapOFFProduct(data.product, barcode);
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.warn("[BarcodeService] OFF lookup timed out (8s)");
    } else {
      console.warn("[BarcodeService] OFF lookup failed:", err.message || err);
    }
  }

  // STEP 2: UPC Item DB (fallback for Canadian/NA products)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(
      `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);

    const data = await res.json();
    console.log('[BarcodeService] UPC DB response code:', data.code);

    if (data.code === "OK" && data.items?.length > 0) {
      console.log("[BarcodeService] Found via UPC Item DB:", data.items[0].title);
      return mapUPCItem(data.items[0], barcode);
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.warn("[BarcodeService] UPC Item DB timed out (6s)");
    } else {
      console.warn("[BarcodeService] UPC Item DB lookup failed:", err.message || err);
    }
  }

  // STEP 3: Not found
  console.log("[BarcodeService] Not found in any source for barcode:", barcode);
  return null;
}

function mapOFFProduct(product: any, barcode: string): BarcodeProduct {
  const n = product.nutriments ?? {};
  const rawServing = product.serving_size ?? "";
  const servingGrams = parseServingGrams(rawServing) ?? product.serving_quantity ?? 100;
  const servingLabel = rawServing || `${servingGrams}g`;

  const cal = n["energy-kcal_100g"] ?? (n["energy_100g"] ? n["energy_100g"] / 4.184 : null);

  return {
    name: product.product_name_en || product.product_name || "Unknown Product",
    brand: product.brands ? product.brands.split(',')[0].trim() : null,
    calories_per_100g: cal != null ? Math.round(cal) : null,
    protein_per_100g: n.proteins_100g != null ? Math.round(n.proteins_100g * 10) / 10 : null,
    carbs_per_100g: n.carbohydrates_100g != null ? Math.round(n.carbohydrates_100g * 10) / 10 : null,
    fat_per_100g: n.fat_100g != null ? Math.round(n.fat_100g * 10) / 10 : null,
    fiber_per_100g: n.fiber_100g != null ? Math.round(n.fiber_100g * 10) / 10 : null,
    sugar_per_100g: n.sugars_100g != null ? Math.round(n.sugars_100g * 10) / 10 : null,
    sodium_per_100g: n.sodium_100g != null ? Math.round(n.sodium_100g * 1000) / 10 : null,
    serving_size: servingGrams,
    serving_unit: "g",
    serving_label: servingLabel,
    source: "open_food_facts",
    category: product.categories_tags?.[0]?.replace("en:", "") ?? null,
    barcode,
    image_url: product.image_front_small_url ?? null,
    has_macros: cal != null,
  };
}

function mapUPCItem(item: any, barcode: string): BarcodeProduct {
  return {
    name: item.title ?? "Unknown Product",
    brand: item.brand ?? null,
    calories_per_100g: null,
    protein_per_100g: null,
    carbs_per_100g: null,
    fat_per_100g: null,
    fiber_per_100g: null,
    sugar_per_100g: null,
    sodium_per_100g: null,
    serving_size: 100,
    serving_unit: "g",
    serving_label: "1 serving",
    source: "upc_item_db",
    category: item.category ?? null,
    barcode,
    image_url: item.images?.[0] ?? null,
    has_macros: false,
  };
}

function parseServingGrams(raw: string): number | null {
  if (!raw) return null;
  const parenMatch = raw.match(/\((\d+(?:\.\d+)?)\s*g\)/i);
  if (parenMatch) return parseFloat(parenMatch[1]);
  const plainMatch = raw.match(/^(\d+(?:\.\d+)?)\s*g$/i);
  if (plainMatch) return parseFloat(plainMatch[1]);
  const mlMatch = raw.match(/^(\d+(?:\.\d+)?)\s*ml$/i);
  if (mlMatch) return parseFloat(mlMatch[1]);
  return null;
}
