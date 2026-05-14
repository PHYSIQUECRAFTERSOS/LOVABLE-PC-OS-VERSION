/**
 * usePhaseBoundaries — fetches the active program + phases for a client and
 * returns helpers for date-driven phase resolution and calendar boundary markers.
 *
 * Used by:
 *  - Schedule dialogs (resolve which phase a chosen date belongs to)
 *  - Calendar views (show "Phase N ends" / "Phase N+1 starts" markers)
 *
 * Coach Authority: only reads. Never mutates current_phase_id.
 */
import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { derivePhaseDates, type PhaseLike } from "@/lib/phaseDates";

export interface ResolvedPhase {
  id: string;
  name: string;
  phase_order: number;
  start_date: string | null;
  end_date: string | null;
}

export interface PhaseBoundary {
  type: "end" | "start";
  phaseName: string;
  phaseOrder: number;
}

export interface PhaseBoundariesSeed {
  programStart?: string | null;
  phases?: Array<{ id: string; name: string; phase_order: number; duration_weeks: number }>;
}

export const usePhaseBoundaries = (
  clientId: string | null | undefined,
  seed?: PhaseBoundariesSeed,
) => {
  const [phases, setPhases] = useState<ResolvedPhase[]>([]);
  const [loading, setLoading] = useState(false);

  // If a seed is provided (caller already has program + phases loaded), hydrate
  // synchronously so banners render on first paint with zero round-trips.
  const seededPhases = useMemo<ResolvedPhase[] | null>(() => {
    if (!seed?.phases?.length || !seed.programStart) return null;
    const sorted = [...seed.phases].sort((a, b) => a.phase_order - b.phase_order);
    const derived = derivePhaseDates(seed.programStart, sorted as PhaseLike[]);
    return sorted.map((p) => ({
      id: p.id,
      name: p.name,
      phase_order: p.phase_order,
      start_date: derived[p.id]?.start_date ?? null,
      end_date: derived[p.id]?.end_date ?? null,
    }));
  }, [seed?.programStart, seed?.phases]);

  const load = useCallback(async () => {
    if (!clientId) {
      setPhases([]);
      return;
    }
    setLoading(true);
    const { data: assignment, error: assignErr } = await supabase
      .from("client_program_assignments")
      .select("program_id, programs!client_program_assignments_program_id_fkey(start_date)")
      .eq("client_id", clientId)
      .in("status", ["active", "subscribed"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (assignErr) console.warn("[usePhaseBoundaries] assignment fetch error:", assignErr);

    const programId = assignment?.program_id;
    const programStart = (assignment as any)?.programs?.start_date as string | null | undefined;
    if (!programId) {
      console.warn("[usePhaseBoundaries] no active program assignment for client", clientId);
      setPhases([]);
      setLoading(false);
      return;
    }

    const { data: rawPhases, error: phasesErr } = await supabase
      .from("program_phases")
      .select("id, name, phase_order, duration_weeks")
      .eq("program_id", programId)
      .order("phase_order", { ascending: true });

    if (phasesErr) console.warn("[usePhaseBoundaries] phases fetch error:", phasesErr);

    const sorted = ((rawPhases as any[]) || []) as (PhaseLike & { name: string })[];
    const derived = derivePhaseDates(programStart, sorted);
    const resolved: ResolvedPhase[] = sorted.map((p) => ({
      id: p.id,
      name: p.name,
      phase_order: p.phase_order,
      start_date: derived[p.id]?.start_date ?? null,
      end_date: derived[p.id]?.end_date ?? null,
    }));
    if (resolved.length === 0) {
      console.warn("[usePhaseBoundaries] resolved 0 phases for program", programId);
    }
    setPhases(resolved);
    setLoading(false);
  }, [clientId]);

  // Always run the network load so we stay correct even if seed is stale.
  useEffect(() => { load(); }, [load]);

  // Prefer fetched phases once available; otherwise fall back to seed.
  const effectivePhases = phases.length > 0 ? phases : (seededPhases ?? phases);

  /** Resolve which phase a given YYYY-MM-DD belongs to. Falls back gracefully. */
  const resolvePhaseForDate = useCallback(
    (ymd: string | null | undefined): ResolvedPhase | null => {
      const list = effectivePhases;
      if (!ymd || list.length === 0) return list[0] ?? null;
      const hit = list.find(
        (p) => p.start_date && p.end_date && ymd >= p.start_date && ymd <= p.end_date
      );
      if (hit) return hit;
      const first = list[0];
      if (first?.start_date && ymd < first.start_date) return first;
      const last = list[list.length - 1];
      if (last?.end_date && ymd > last.end_date) return last;
      return list[0] ?? null;
    },
    [effectivePhases]
  );

  /** Map<YYYY-MM-DD, PhaseBoundary[]> for calendar markers. */
  const boundariesByDate = useMemo(() => {
    const map = new Map<string, PhaseBoundary[]>();
    effectivePhases.forEach((p, idx) => {
      if (p.end_date && idx < effectivePhases.length - 1) {
        const arr = map.get(p.end_date) || [];
        arr.push({ type: "end", phaseName: p.name, phaseOrder: p.phase_order });
        map.set(p.end_date, arr);
      }
      if (p.start_date && idx > 0) {
        const arr = map.get(p.start_date) || [];
        arr.push({ type: "start", phaseName: p.name, phaseOrder: p.phase_order });
        map.set(p.start_date, arr);
      }
    });
    return map;
  }, [effectivePhases]);

  /**
   * Find any phase whose start_date falls within [weekStartYmd, weekEndYmd].
   * Used to render the Trainerize-style banner above a week row.
   */
  const findPhaseStartsInWeek = useCallback(
    (weekStartYmd: string, weekEndYmd: string) => {
      return effectivePhases
        .filter(
          (p, idx) =>
            idx > 0 &&
            p.start_date &&
            p.start_date >= weekStartYmd &&
            p.start_date <= weekEndYmd,
        )
        .map((p) => ({
          startDate: p.start_date as string,
          phaseName: p.name,
          phaseOrder: p.phase_order,
        }));
    },
    [effectivePhases],
  );

  return {
    phases: effectivePhases,
    loading,
    resolvePhaseForDate,
    boundariesByDate,
    findPhaseStartsInWeek,
    reload: load,
  };
};

