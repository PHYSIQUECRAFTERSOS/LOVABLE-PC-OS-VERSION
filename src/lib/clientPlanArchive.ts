import { supabase } from "@/integrations/supabase/client";

// ─── MEAL PLANS ────────────────────────────────────────────────────────────────

/**
 * Archive all currently-active (non-template, non-archived) meal plans for a client.
 * Both Training Day and Rest Day plans get stamped with the SAME archive_group_id
 * so they restore together as one snapshot.
 *
 * Returns the archive_group_id used (null if there were no active plans).
 */
export async function archiveActiveMealPlans(clientId: string): Promise<string | null> {
  const { data: active, error: fetchErr } = await (supabase as any)
    .from("meal_plans")
    .select("id")
    .eq("client_id", clientId)
    .eq("is_template", false)
    .is("archived_at", null);

  if (fetchErr) throw fetchErr;
  if (!active || active.length === 0) return null;

  const groupId = crypto.randomUUID();
  const ids = active.map((r: any) => r.id);

  const { error: updateErr } = await (supabase as any)
    .from("meal_plans")
    .update({ archived_at: new Date().toISOString(), archive_group_id: groupId })
    .in("id", ids);

  if (updateErr) throw updateErr;
  return groupId;
}

/**
 * Restore an archived meal-plan snapshot (group). Current active plans get archived
 * under a NEW group first, then the chosen group's rows have their archive_at/group cleared.
 */
export async function restoreMealPlanGroup(clientId: string, archiveGroupId: string): Promise<void> {
  // 1. Archive currently active plans (if any)
  await archiveActiveMealPlans(clientId);

  // 2. Un-archive the chosen group
  const { error } = await (supabase as any)
    .from("meal_plans")
    .update({ archived_at: null, archive_group_id: null })
    .eq("client_id", clientId)
    .eq("archive_group_id", archiveGroupId);

  if (error) throw error;
}

export async function deleteArchivedMealPlanGroup(clientId: string, archiveGroupId: string): Promise<void> {
  const { error } = await supabase
    .from("meal_plans")
    .delete()
    .eq("client_id", clientId)
    .eq("archive_group_id", archiveGroupId);
  if (error) throw error;
}

// ─── SUPPLEMENT ASSIGNMENTS ────────────────────────────────────────────────────

export async function archiveActiveSupplementAssignment(clientId: string): Promise<void> {
  const { error } = await (supabase as any)
    .from("client_supplement_assignments")
    .update({ is_active: false, archived_at: new Date().toISOString() })
    .eq("client_id", clientId)
    .eq("is_active", true)
    .is("archived_at", null);
  if (error) throw error;
}

export async function restoreSupplementAssignment(clientId: string, assignmentId: string): Promise<void> {
  await archiveActiveSupplementAssignment(clientId);
  const { error } = await (supabase as any)
    .from("client_supplement_assignments")
    .update({ is_active: true, archived_at: null })
    .eq("id", assignmentId)
    .eq("client_id", clientId);
  if (error) throw error;
}

export async function deleteArchivedSupplementAssignment(id: string): Promise<void> {
  const { error } = await supabase.from("client_supplement_assignments").delete().eq("id", id);
  if (error) throw error;
}
