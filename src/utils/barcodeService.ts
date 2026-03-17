/**
 * Barcode lookup service — routes through edge function.
 * No direct browser-side API calls (avoids CORS issues).
 */

import { supabase } from "@/integrations/supabase/client";

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
  source: string;
  category: string | null;
  barcode: string;
  image_url: string | null;
  has_macros: boolean;
}

export async function lookupBarcode(barcode: string): Promise<BarcodeProduct | null> {
  console.log('[BarcodeService] Looking up barcode via edge function:', barcode);

  try {
    const { data, error } = await supabase.functions.invoke("barcode-lookup", {
      body: { barcode },
    });

    if (error) {
      console.error("[BarcodeService] Edge function error:", error);
      return null;
    }

    if (!data?.found) {
      console.log("[BarcodeService] Not found for barcode:", barcode);
      return null;
    }

    console.log("[BarcodeService] Found:", data.name, "via", data.source);

    return {
      name: data.name || "Unknown Product",
      brand: data.brand || null,
      calories_per_100g: data.per_100g?.calories ?? null,
      protein_per_100g: data.per_100g?.protein ?? null,
      carbs_per_100g: data.per_100g?.carbs ?? null,
      fat_per_100g: data.per_100g?.fat ?? null,
      fiber_per_100g: data.per_100g?.fiber ?? null,
      sugar_per_100g: data.per_100g?.sugar ?? null,
      sodium_per_100g: data.per_100g?.sodium ?? null,
      serving_size: data.serving_quantity ?? 100,
      serving_unit: "g",
      serving_label: data.serving_size ?? "100g",
      source: data.source ?? "fatsecret",
      category: null,
      barcode,
      image_url: null,
      has_macros: (data.per_100g?.calories ?? 0) > 0 || (data.per_100g?.protein ?? 0) > 0,
    };
  } catch (err) {
    console.error("[BarcodeService] Lookup failed:", err);
    return null;
  }
}
