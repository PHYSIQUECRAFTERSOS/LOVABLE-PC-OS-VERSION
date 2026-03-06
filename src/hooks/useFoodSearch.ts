import { useState, useCallback, useRef } from "react";
import { searchFoods, FoodResult } from "@/services/foodSearchService";

export type { FoodResult } from "@/services/foodSearchService";

export function useFoodSearch() {
  const [results, setResults] = useState<FoodResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [offLoading, setOffLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const search = useCallback((rawQuery: string) => {
    const q = rawQuery.trim();
    setQuery(q);

    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      setOffLoading(false);
      return;
    }

    setLoading(true);
    setOffLoading(true);
    clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setError(null);
      try {
        const data = await searchFoods(q);
        setResults(data);
      } catch (err) {
        console.error("[useFoodSearch] Error:", err);
        setError("Search failed. Please try again.");
        setResults([]);
      } finally {
        setLoading(false);
        setOffLoading(false);
      }
    }, 300);
  }, []);

  const clearSearch = useCallback(() => {
    setQuery("");
    setResults([]);
    setError(null);
    setLoading(false);
    setOffLoading(false);
    clearTimeout(debounceRef.current);
  }, []);

  return { results, loading, offLoading, error, query, search, clearSearch };
}
