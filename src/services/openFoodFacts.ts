/**
 * Open Food Facts API — uses edge function as primary (no CORS issues),
 * falls back to direct client-side calls if edge function fails.
 */

import { supabase } from "@/integrations/supabase/client";

export interface OFFFood {
  id: string;
  name: string;
  brand: string | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
  sugar: number | null;
  sodium: number | null;
  serving_size: number;
  serving_unit: string;
  serving_label: string | null;
  source: 'open_food_facts';
  category: string | null;
  barcode: string | null;
  image_url: string | null;
  is_verified: boolean;
  data_source: string;
}

export async function searchOFF(query: string): Promise<OFFFood[]> {
  console.log('[OFF API] Searching for:', query);

  const edgePromise = withTimeout(searchViaEdgeFunction(query), 4500, [] as OFFFood[]);
  const directPromise = withTimeout(searchDirectOFF(query), 4500, [] as OFFFood[]);

  const [edgeResult, directResult] = await Promise.all([edgePromise, directPromise]);

  if (edgeResult.length > 0) {
    console.log('[OFF API] Using edge results:', edgeResult.length);
    return edgeResult;
  }

  if (directResult.length > 0) {
    console.log('[OFF API] Using direct results:', directResult.length);
    return directResult;
  }

  return [];
}

async function searchViaEdgeFunction(query: string): Promise<OFFFood[]> {
  const { data, error } = await supabase.functions.invoke('open-food-facts-search', {
    body: { query, pageSize: 40 },
  });

  if (error) throw error;
  if (data?.error) {
    throw new Error(data.error);
  }

  const foods = data?.foods ?? [];
  if (!Array.isArray(foods) || foods.length === 0) return [];

  return foods.map((f: any) => ({
    id: f.barcode ?? f.code ?? crypto.randomUUID(),
    name: f.name ?? 'Unknown',
    brand: f.brand ?? null,
    calories: f.calories ?? null,
    protein: f.protein ?? null,
    carbs: f.carbs ?? null,
    fat: f.fat ?? null,
    fiber: f.fiber ?? null,
    sugar: f.sugar ?? null,
    sodium: f.sodium ?? null,
    serving_size: f.serving_size ?? 100,
    serving_unit: f.serving_unit ?? 'g',
    serving_label: f.serving_label ?? null,
    source: 'open_food_facts' as const,
    category: f.category?.replace('en:', '').replace(/-/g, ' ') ?? null,
    barcode: f.barcode ?? f.code ?? null,
    image_url: f.image_url ?? null,
    is_verified: false,
    data_source: 'open_food_facts',
  }));
}

/** Direct client-side fetch to OFF API */
async function searchDirectOFF(query: string): Promise<OFFFood[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const url = new URL('https://world.openfoodfacts.org/cgi/search.pl');
    url.searchParams.set('search_terms', query);
    url.searchParams.set('search_simple', '1');
    url.searchParams.set('action', 'process');
    url.searchParams.set('json', '1');
    url.searchParams.set('page_size', '50');
    url.searchParams.set('sort_by', 'unique_scans_n');
    url.searchParams.set('fields', 'code,product_name,product_name_en,brands,nutriments,serving_size,serving_quantity,categories_tags,image_front_small_url,image_url');

    console.log('[OFF API] Direct fetch:', url.toString());

    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`OFF API error: ${res.status}`);

    const data = await res.json();

    if (!data.products || !Array.isArray(data.products)) return [];

    const mapped = data.products
      .filter((p: any) => p.product_name && p.product_name.trim() !== '' && p.product_name !== 'Unknown')
      .map((p: any) => mapOFFProduct(p));

    const withData = mapped.filter((f: OFFFood) =>
      (f.calories ?? 0) > 0 || (f.protein ?? 0) > 0 || (f.carbs ?? 0) > 0 || (f.fat ?? 0) > 0
    );

    return withData.length > 0 ? withData : mapped.slice(0, 25);
  } catch (err: any) {
    clearTimeout(timeout);
    console.error('[OFF API] Direct fetch error:', err.message || err);
    return [];
  }
}

/** Lookup a single product by barcode */
export async function lookupOFFBarcode(barcode: string): Promise<OFFFood | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    console.log('[OFF API] Barcode lookup:', barcode);
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`,
      {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
      }
    );
    clearTimeout(timeout);

    const data = await res.json();
    if (data.status !== 1 || !data.product?.product_name) {
      console.log('[OFF API] Barcode not found:', barcode);
      return null;
    }

    console.log('[OFF API] Barcode found:', data.product.product_name);
    return mapOFFProduct(data.product, barcode);
  } catch (err: any) {
    clearTimeout(timeout);
    console.error('[OFF API] Barcode lookup error:', err.message || err);
    return null;
  }
}

function mapOFFProduct(p: any, barcodeOverride?: string): OFFFood {
  const n = p.nutriments ?? {};
  const rawServing = p.serving_size ?? '';
  const servingGrams = parseServingGrams(rawServing) ?? 100;

  const rawBrand = p.brands ?? null;
  const brand = rawBrand ? rawBrand.split(',')[0].trim() : null;

  const rawCat = p.categories_tags?.[0] ?? null;
  const category = rawCat ? rawCat.replace('en:', '').replace(/-/g, ' ') : null;

  let calories: number | null = null;
  if (n['energy-kcal_100g'] != null) {
    calories = Math.round(n['energy-kcal_100g']);
  } else if (n['energy-kcal'] != null) {
    calories = Math.round(n['energy-kcal']);
  } else if (n['energy_100g'] != null) {
    calories = Math.round(n['energy_100g'] / 4.184);
  }

  return {
    id: p.code ?? p._id ?? crypto.randomUUID(),
    name: p.product_name_en || p.product_name || 'Unknown',
    brand,
    calories,
    protein: n['proteins_100g'] != null ? Math.round(n['proteins_100g'] * 10) / 10 : null,
    carbs: n['carbohydrates_100g'] != null ? Math.round(n['carbohydrates_100g'] * 10) / 10 : null,
    fat: n['fat_100g'] != null ? Math.round(n['fat_100g'] * 10) / 10 : null,
    fiber: n['fiber_100g'] != null ? Math.round(n['fiber_100g'] * 10) / 10 : null,
    sugar: n['sugars_100g'] != null ? Math.round(n['sugars_100g'] * 10) / 10 : null,
    sodium: n['sodium_100g'] != null ? Math.round(n['sodium_100g'] * 1000) : null,
    serving_size: servingGrams,
    serving_unit: 'g',
    serving_label: rawServing || null,
    source: 'open_food_facts',
    category,
    barcode: barcodeOverride ?? p.code ?? null,
    image_url: p.image_front_small_url ?? p.image_url ?? null,
    is_verified: false,
    data_source: 'open_food_facts',
  };
}

function parseServingGrams(raw: string): number | null {
  if (!raw) return null;
  const paren = raw.match(/\((\d+(?:\.\d+)?)\s*g\)/i);
  if (paren) return parseFloat(paren[1]);
  const plain = raw.match(/^(\d+(?:\.\d+)?)\s*g$/i);
  if (plain) return parseFloat(plain[1]);
  const ml = raw.match(/^(\d+(?:\.\d+)?)\s*ml$/i);
  if (ml) return parseFloat(ml[1]);
  return null;
}
