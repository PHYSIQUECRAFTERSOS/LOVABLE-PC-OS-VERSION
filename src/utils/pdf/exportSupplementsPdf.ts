import { supabase } from "@/integrations/supabase/client";
import {
  createBrandedDoc, drawCoverPage, newContentPage, drawSectionTitle, drawParagraph,
  pcTable, finalizePages, savePdf, nameSlug, todayStamp, PAGE,
} from "./brandedPdf";
import { loadClientContext } from "./pdfShared";

const TIMING_LABELS: Record<string, string> = {
  morning: "Morning",
  pre_workout: "Pre-Workout",
  intra_workout: "Intra-Workout",
  post_workout: "Post-Workout",
  with_meal: "With Meal",
  evening: "Evening",
  before_bed: "Before Bed",
  any_time: "Any Time",
};

export async function exportSupplementsPdf(clientId: string): Promise<{ ok: boolean; reason?: string }> {
  const ctx = await loadClientContext(clientId);

  const { data: assign } = await supabase
    .from("client_supplement_assignments")
    .select("id, plan_id, notes, assigned_at")
    .eq("client_id", clientId)
    .eq("is_active", true)
    .order("assigned_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!assign) return { ok: false, reason: "No supplement plan assigned yet." };

  const { data: plan } = await supabase
    .from("supplement_plans")
    .select("id, name, description")
    .eq("id", assign.plan_id)
    .maybeSingle();

  const [{ data: items }, { data: overrides }] = await Promise.all([
    supabase
      .from("supplement_plan_items")
      .select("*, master_supplements(id, name, brand, default_dosage, default_dosage_unit, serving_unit, notes, link_url, discount_code, discount_label)")
      .eq("plan_id", assign.plan_id)
      .order("timing_slot")
      .order("sort_order"),
    supabase
      .from("client_supplement_overrides")
      .select("*")
      .eq("assignment_id", assign.id),
  ]);

  const overrideMap = new Map<string, any>();
  for (const o of overrides || []) overrideMap.set(o.plan_item_id, o);

  // Filter out items the client has hidden/removed via override (if column exists)
  const visible = (items || []).filter((it: any) => {
    const ov = overrideMap.get(it.id);
    return !ov?.is_removed;
  });

  if (!visible.length) return { ok: false, reason: "Supplement plan is empty." };

  // Group by timing slot
  const grouped = new Map<string, any[]>();
  for (const it of visible) {
    const slot = it.timing_slot || "any_time";
    if (!grouped.has(slot)) grouped.set(slot, []);
    grouped.get(slot)!.push(it);
  }

  const orderedSlots = [
    "morning", "pre_workout", "intra_workout", "post_workout",
    "with_meal", "evening", "before_bed", "any_time",
  ].filter((s) => grouped.has(s));

  const doc = createBrandedDoc();
  drawCoverPage(doc, {
    title: "Supplement Plan",
    subtitle: plan?.name || undefined,
    clientName: ctx.clientName,
    coachName: ctx.coachName,
  });

  let y = newContentPage(doc);
  y = drawSectionTitle(doc, plan?.name || "Supplement Stack", y);
  if (plan?.description) y = drawParagraph(doc, plan.description, y);

  for (const slot of orderedSlots) {
    if (y > PAGE.height - 180) y = newContentPage(doc);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(212, 160, 23);
    doc.text(TIMING_LABELS[slot] || slot, PAGE.marginX, y);
    y += 8;

    const body = grouped.get(slot)!.map((it: any) => {
      const ms = it.master_supplements || {};
      const ov = overrideMap.get(it.id) || {};
      const name = ms.name || "Supplement";
      const brand = ms.brand ? ` (${ms.brand})` : "";
      const dose = ov.dosage_override || it.dosage || ms.default_dosage || "—";
      const unit = ov.dosage_unit_override || it.dosage_unit || ms.default_dosage_unit || "";
      const note = (ov.coach_note_override ?? it.coach_note) || ms.notes || "";
      return [
        `${name}${brand}`,
        `${dose} ${unit}`.trim(),
        ms.serving_unit || "",
        note,
      ];
    });

    y = pcTable(doc, y + 4, {
      head: [["Supplement", "Dose", "Form", "Notes"]],
      body,
      columnStyles: {
        0: { cellWidth: 170, fontStyle: "bold" },
        1: { cellWidth: 95 },
        2: { cellWidth: 65 },
        3: { cellWidth: "auto" },
      },
    });
  }

  if (assign.notes) {
    if (y > PAGE.height - 120) y = newContentPage(doc);
    y = drawSectionTitle(doc, "Coach Notes", y + 10);
    y = drawParagraph(doc, assign.notes, y);
  }

  finalizePages(doc, { clientName: ctx.clientName, coverFirstPage: true });
  await savePdf(doc, `${nameSlug(ctx.clientName)}-Supplements-${todayStamp()}.pdf`);
  return { ok: true };
}
