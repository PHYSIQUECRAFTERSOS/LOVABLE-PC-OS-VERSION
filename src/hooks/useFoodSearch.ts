import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Food {
  id?: string;
  off_id?: string;
  usda_fdc_id?: string;
  name: string;
  brand?: string | null;
  calories_per_100g?: number | null;
  protein_per_100g?: number | null;
  carbs_per_100g?: number | null;
  fat_per_100g?: number | null;
  fiber_per_100g?: number | null;
  sugar_per_100g?: number | null;
  sodium_per_100g?: number | null;
  serving_size_g?: number | null;
  serving_unit?: string | null;
  serving_description?: string | null;
  household_serving_fulltext?: string | null;
  additional_serving_sizes?: Array<{ description: string; size_g: number }> | null;
  image_url?: string | null;
  barcode?: string | null;
  is_branded?: boolean;
  is_verified?: boolean;
  is_custom?: boolean;
  popularity_score?: number;
  source?: string;
  data_quality_score?: number;
  has_complete_macros?: boolean;
}

export function useFoodSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Food[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortController = useRef<AbortController | null>(null);

  const search = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    if (abortController.current) {
      abortController.current.abort();
    }
    abortController.current = new AbortController();

    setIsLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id ?? null;

      const { data, error: fnError } = await supabase.functions.invoke("search-foods", {
        body: { query: searchQuery, limit: 25, user_id: userId },
      });

      if (fnError) throw fnError;
      setResults(data?.foods ?? []);
    } catch (err: any) {
      if (err.name === "AbortError") return;
      console.error("[useFoodSearch] Error:", err);
      setError("Search failed. Please try again.");
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    if (!query || query.length < 2) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    debounceTimer.current = setTimeout(() => {
      search(query);
    }, 300);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [query, search]);

  const logSelection = useCallback(async (foodId: string, mealType?: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return;
      await supabase.from("food_selection_log" as any).insert({
        food_id: foodId,
        user_id: session.user.id,
        meal_type: mealType ?? null,
      });
    } catch { /* ignore */ }
  }, []);

  return { query, setQuery, results, isLoading, error, logSelection };
}
