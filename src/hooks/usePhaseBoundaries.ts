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

export const usePhaseBoundaries = (clientId: string | null | undefined) => {
  const [phases, setPhases] = useState<ResolvedPhase[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!clientId) {
      setPhases([]);
      return;
    }
    setLoading(true);
    const { data: assignment } = await supabase
      .from("client_program_assignments")
      .select("program_id, programs(start_date)")
      .eq("client_id", clientId)
      .in("status", ["active", "subscribed"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const programId = assignment?.program_id;
    const programStart = (assignment as any)?.programs?.start_date as string | null | undefined;
    if (!programId) {
      setPhases([]);
      setLoading(false);
      return;
    }

    const { data: rawPhases } = await supabase
      .from("program_phases")
      .select("id, name, phase_order, duration_weeks")
      .eq("program_id", programId)
      .order("phase_order", { ascending: true });

    const sorted = ((rawPhases as any[]) || []) as (PhaseLike & { name: string })[];
    const derived = derivePhaseDates(programStart, sorted);
    const resolved: ResolvedPhase[] = sorted.map((p) => ({
      id: p.id,
      name: p.name,
      phase_order: p.phase_order,
      start_date: derived[p.id]?.start_date ?? null,
      end_date: derived[p.id]?.end_date ?? null,
    }));
    setPhases(resolved);
    setLoading(false);
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  /** Resolve which phase a given YYYY-MM-DD belongs to. Falls back gracefully. */
  const resolvePhaseForDate = useCallback(
    (ymd: string | null | undefined): ResolvedPhase | null => {
      if (!ymd || phases.length === 0) return phases[0] ?? null;
      // Inside a phase window
      const hit = phases.find(
        (p) => p.start_date && p.end_date && ymd >= p.start_date && ymd <= p.end_date
      );
      if (hit) return hit;
      // Before first phase → first
      const first = phases[0];
      if (first?.start_date && ymd < first.start_date) return first;
      // After last phase → last
      const last = phases[phases.length - 1];
      if (last?.end_date && ymd > last.end_date) return last;
      return phases[0] ?? null;
    },
    [phases]
  );

  /** Map<YYYY-MM-DD, PhaseBoundary[]> for calendar markers. */
  const boundariesByDate = useMemo(() => {
    const map = new Map<string, PhaseBoundary[]>();
    phases.forEach((p, idx) => {
      if (p.end_date && idx < phases.length - 1) {
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
  }, [phases]);

  return { phases, loading, resolvePhaseForDate, boundariesByDate, reload: load };
};
