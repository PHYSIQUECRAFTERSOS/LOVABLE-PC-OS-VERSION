/**
 * Open Food Facts API — direct client-side calls.
 * This is the PRIMARY food data source (3.2M+ products).
 */

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

/** Search OFF by text query — returns up to 50 results sorted by popularity */
export async function searchOFF(query: string): Promise<OFFFood[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const url = new URL('https://world.openfoodfacts.org/cgi/search.pl');
    url.searchParams.set('search_terms', query);
    url.searchParams.set('search_simple', '1');
    url.searchParams.set('action', 'process');
    url.searchParams.set('json', '1');
    url.searchParams.set('page_size', '50');
    url.searchParams.set('sort_by', 'unique_scans_n');

    const res = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`OFF API error: ${res.status}`);

    const data = await res.json();
    if (!data.products || !Array.isArray(data.products)) return [];

    return data.products
      .filter((p: any) => p.product_name && p.product_name.trim() !== '' && p.product_name !== 'Unknown')
      .map((p: any) => mapOFFProduct(p))
      .filter((f: OFFFood) => (f.calories ?? 0) > 0 || (f.protein ?? 0) > 0 || (f.carbs ?? 0) > 0 || (f.fat ?? 0) > 0);
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      console.warn('[OFF] Search timed out for:', query);
    } else {
      console.error('[OFF] Search error:', err);
    }
    return [];
  }
}

/** Lookup a single product by barcode */
export async function lookupOFFBarcode(barcode: string): Promise<OFFFood | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    const data = await res.json();
    if (data.status !== 1 || !data.product?.product_name) return null;

    return mapOFFProduct(data.product, barcode);
  } catch (err: any) {
    clearTimeout(timeout);
    console.error('[OFF] Barcode lookup error:', err);
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

  return {
    id: p.code ?? p._id ?? crypto.randomUUID(),
    name: p.product_name_en || p.product_name || 'Unknown',
    brand,
    calories: n['energy-kcal_100g'] != null ? Math.round(n['energy-kcal_100g']) : (n['energy-kcal'] != null ? Math.round(n['energy-kcal']) : null),
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
