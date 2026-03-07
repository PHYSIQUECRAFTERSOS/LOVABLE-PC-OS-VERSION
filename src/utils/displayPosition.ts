/**
 * Computes sequential Day badge numbers for workout days,
 * skipping items with exclude_from_numbering = true.
 */
export function withDisplayPositions<T extends {
  id: string;
  sort_order?: number | null;
  sortOrder?: number | null;
  exclude_from_numbering?: boolean;
  custom_tag?: string | null;
}>(items: T[]): (T & { displayPosition: number | null })[] {
  const sorted = [...items].sort(
    (a, b) => ((a.sort_order ?? a.sortOrder ?? 999)) - ((b.sort_order ?? b.sortOrder ?? 999))
  );
  let counter = 1;
  return sorted.map(item => ({
    ...item,
    displayPosition: item.exclude_from_numbering ? null : counter++,
  }));
}
