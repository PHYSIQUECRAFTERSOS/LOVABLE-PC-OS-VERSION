import { supabase } from "@/integrations/supabase/client";
import {
  createBrandedDoc, drawCoverPage, newContentPage, drawSectionTitle, drawParagraph,
  drawStatsRow, pcTable, finalizePages, savePdf, nameSlug, todayStamp, PAGE,
} from "./brandedPdf";
import { loadClientContext } from "./pdfShared";

interface MealPlanRow {
  id: string;
  name: string;
  day_type: string;
  day_type_label: string;
  target_calories: number | null;
  target_protein: number | null;
  target_carbs: number | null;
  target_fat: number | null;
  description: string | null;
  sort_order: number;
}

interface ItemRow {
  id: string;
  meal_plan_id: string;
  custom_name: string | null;
  meal_type: string;
  meal_name: string;
  meal_order: number;
  item_order: number;
  servings: number;
  gram_amount: number;
  serving_unit: string | null;
  serving_size: number | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  note: string | null;
  food_item_id: string | null;
  food_items?: { name: string | null } | null;
  day_id: string | null;
}

interface NoteRow {
  day_id: string;
  meal_order: number;
  meal_name: string;
  note: string;
}

function fmt(n: number | null | undefined, suffix = "") {
  if (n == null) return "—";
  return `${Math.round(Number(n) * 10) / 10}${suffix}`;
}

async function fetchPlanContent(plan: MealPlanRow) {
  const { data: days } = await supabase
    .from("meal_plan_days")
    .select("id, day_label, day_order")
    .eq("meal_plan_id", plan.id)
    .order("day_order");

  const dayIds = (days || []).map((d: any) => d.id);
  const [{ data: items }, { data: notes }] = await Promise.all([
    supabase
      .from("meal_plan_items")
      .select("*, food_items(name)")
      .eq("meal_plan_id", plan.id)
      .order("meal_order")
      .order("item_order"),
    dayIds.length
      ? supabase.from("meal_plan_meal_notes").select("day_id, meal_order, meal_name, note").in("day_id", dayIds)
      : Promise.resolve({ data: [] as NoteRow[] }),
  ]);

  return { days: days || [], items: (items || []) as ItemRow[], notes: (notes || []) as NoteRow[] };
}

function renderPlanSection(
  doc: any,
  startY: number,
  plan: MealPlanRow,
  items: ItemRow[],
  notes: NoteRow[],
): number {
  let y = startY;
  y = drawSectionTitle(doc, plan.day_type_label || plan.name, y);

  // Targets row
  const totals = items.reduce(
    (a, it) => {
      a.cals += Number(it.calories || 0);
      a.p += Number(it.protein || 0);
      a.c += Number(it.carbs || 0);
      a.f += Number(it.fat || 0);
      return a;
    },
    { cals: 0, p: 0, c: 0, f: 0 },
  );
  y = drawStatsRow(doc, [
    { label: "Calories", value: plan.target_calories ? `${plan.target_calories}` : `${Math.round(totals.cals)}` },
    { label: "Protein",  value: `${plan.target_protein ?? Math.round(totals.p)}g` },
    { label: "Carbs",    value: `${plan.target_carbs ?? Math.round(totals.c)}g` },
    { label: "Fat",      value: `${plan.target_fat ?? Math.round(totals.f)}g` },
  ], y);

  if (plan.description) y = drawParagraph(doc, plan.description, y + 4);

  // Group items by meal_order
  const byMeal = new Map<number, ItemRow[]>();
  for (const it of items) {
    const k = it.meal_order ?? 0;
    if (!byMeal.has(k)) byMeal.set(k, []);
    byMeal.get(k)!.push(it);
  }
  const orderedKeys = [...byMeal.keys()].sort((a, b) => a - b);

  for (const k of orderedKeys) {
    const mealItems = byMeal.get(k)!;
    const mealName = mealItems[0]?.meal_name || `Meal ${k + 1}`;
    const note = notes.find((n) => n.meal_order === k && n.day_id === mealItems[0]?.day_id)?.note;

    if (y > PAGE.height - 160) y = newContentPage(doc);

    // Meal heading
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(20, 20, 20);
    doc.text(mealName, PAGE.marginX, y);
    y += 6;

    const body = mealItems.map((it) => {
      const name = it.custom_name || it.food_items?.name || "Food";
      const qty = `${fmt(it.gram_amount)}${it.serving_unit && it.serving_unit !== "g" ? ` (${fmt(it.servings)} ${it.serving_unit})` : "g"}`;
      return [
        name,
        qty,
        fmt(it.calories),
        `${fmt(it.protein)}g`,
        `${fmt(it.carbs)}g`,
        `${fmt(it.fat)}g`,
      ];
    });

    // Meal totals row
    const mt = mealItems.reduce(
      (a, it) => ({
        cals: a.cals + Number(it.calories || 0),
        p: a.p + Number(it.protein || 0),
        c: a.c + Number(it.carbs || 0),
        f: a.f + Number(it.fat || 0),
      }),
      { cals: 0, p: 0, c: 0, f: 0 },
    );
    body.push([
      { content: "Meal Total", styles: { fontStyle: "bold" } } as any,
      "",
      { content: fmt(mt.cals), styles: { fontStyle: "bold" } } as any,
      { content: `${fmt(mt.p)}g`, styles: { fontStyle: "bold" } } as any,
      { content: `${fmt(mt.c)}g`, styles: { fontStyle: "bold" } } as any,
      { content: `${fmt(mt.f)}g`, styles: { fontStyle: "bold" } } as any,
    ]);

    y = pcTable(doc, y + 4, {
      head: [["Food", "Amount", "Cal", "P", "C", "F"]],
      body,
      columnStyles: {
        0: { cellWidth: 200 },
        1: { cellWidth: 110 },
        2: { halign: "right" },
        3: { halign: "right" },
        4: { halign: "right" },
        5: { halign: "right" },
      },
    });

    if (note && note.trim()) {
      y = drawParagraph(doc, `Note: ${note.trim()}`, y, { color: [110, 110, 110], size: 9 });
    }
  }

  return y;
}

export async function exportMealPlanPdf(clientId: string): Promise<{ ok: boolean; reason?: string }> {
  const ctx = await loadClientContext(clientId);

  const { data: plans } = await supabase
    .from("meal_plans")
    .select("id, name, day_type, day_type_label, target_calories, target_protein, target_carbs, target_fat, description, sort_order")
    .eq("client_id", clientId)
    .eq("is_template", false)
    .order("sort_order");

  const planList = (plans || []) as MealPlanRow[];
  if (!planList.length) return { ok: false, reason: "No meal plan assigned yet." };

  // Order: training first, then rest, then anything else
  planList.sort((a, b) => {
    const rank = (d: string) => (d === "training" ? 0 : d === "rest" ? 1 : 2);
    return rank(a.day_type) - rank(b.day_type) || a.sort_order - b.sort_order;
  });

  const doc = createBrandedDoc();
  drawCoverPage(doc, {
    title: "Meal Plan",
    subtitle: "Training Day & Rest Day Macros",
    clientName: ctx.clientName,
    coachName: ctx.coachName,
  });

  let isFirstSection = true;
  for (const plan of planList) {
    const { items, notes } = await fetchPlanContent(plan);
    const y = newContentPage(doc);
    renderPlanSection(doc, y, plan, items, notes);
    isFirstSection = false;
  }

  finalizePages(doc, { clientName: ctx.clientName, coverFirstPage: true });
  await savePdf(doc, `${nameSlug(ctx.clientName)}-MealPlan-${todayStamp()}.pdf`);
  return { ok: true };
}
