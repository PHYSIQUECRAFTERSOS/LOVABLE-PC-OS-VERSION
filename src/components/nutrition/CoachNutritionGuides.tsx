import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Save, BookOpen, Users, ChevronDown, Eye } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import RichTextToolbar from "./RichTextToolbar";
import PhaseInfoEditor from "./PhaseInfoEditor";

const DEFAULT_SECTIONS = [
  { section_key: "water_recommendation", title: "💧 Water Recommendation", sort_order: 0 },
  { section_key: "daily_ritual", title: "☀️ Daily Morning Ritual", sort_order: 1 },
  { section_key: "why_macros_matter", title: "💡 Why Are Macros So Important?", sort_order: 2 },
  { section_key: "nutrition_tips", title: "📋 Nutrition Tracking Tips", sort_order: 3 },
  { section_key: "meal_planning", title: "🥗 Meal Planning Recommendations", sort_order: 4 },
  { section_key: "eating_out_cheat_sheet", title: "🍽️ Eating Out Cheat Sheet", sort_order: 5 },
  { section_key: "eating_out_examples", title: "🍕 Eating Out Examples", sort_order: 6 },
  { section_key: "macro_cheat_sheet", title: "📊 Macro Replacement Chart", sort_order: 7 },
];

const CATEGORIES = [
  { key: "hydration", label: "💧 Hydration", sections: ["water_recommendation"] },
  { key: "daily_habits", label: "☀️ Daily Habits", sections: ["daily_ritual"] },
  { key: "tracking", label: "📋 Tracking & Planning", sections: ["why_macros_matter", "nutrition_tips", "meal_planning"] },
  { key: "eating_out", label: "🍽️ Eating Out", sections: ["eating_out_cheat_sheet", "eating_out_examples"] },
  { key: "reference", label: "📊 Reference", sections: ["macro_cheat_sheet"] },
];

const DEFAULT_CONTENT: Record<string, string> = {
  water_recommendation: `Drink plenty of water throughout the day, hydration is key for energy levels, overall function, and helping you absorb the nutrients from the food you eat.

**Aim for 3 - 4 liters a day!**

If you're currently far off of this, work your way up in increments, increasing your intake every few days until you've reached ~4 liters consistently.`,

  daily_ritual: `**Fasted: Before Any Meal**

1 TBSP Organic Lemon Juice + 1 TBSP Apple Cider Vinegar + 1 TSP Psyllium Husk (Metamucil — if this is on your supplement list)

Chug 500ml of water right after.

> Will help you boost your metabolism, digestion, make you feel more energized, improve insulin sensitivity, etc.`,

  why_macros_matter: `Each **macro** has different functions within your body.

That is why having a structured balance of all 3 is key to reaching your goals while feeling great.

We may still progress toward your goals undermining one of them, but we will sacrifice elsewhere (strength, energy, libido, etc.)`,

  nutrition_tips: `- Pick up a **food scale** from your local grocery store. This will ensure your portion sizes are on point. (Visually estimating your servings leaves a lot of room for error, and messing up your calorie intake).

- Be sure to weigh all carbs and proteins **COOKED**! (Except oatmeal and quinoa — weigh these out dry). Raw and cooked weight will vary. Just be sure to track all your foods in your food log as they will count toward your daily calories and macros.

- For ease of staying dedicated to hitting your goals, I recommend **prepping 3 - 4 days** worth of food at a time (protein, carbs, and vegetables). This way you'll always have food ready to go and no reason to stray from achieving your goals.

- Also, for ease of cooking, stick to **one protein, one carb, and one vegetable**. Or if you'd prefer, switch it up more often. Whatever better suits your schedule.`,

  meal_planning: ``,

  eating_out_cheat_sheet: `## Sides

- Rice (ask for plain)
- Salad (ask for plain — no oils/dressings)
- Mashed potatoes (ask for plain — no butter)
- Vegetables (ask for plain or steamed)

## All Orders

- Ask for sauce on side — use sparingly

## Fats

- Don't need to focus on this for your orders because most foods already have quite a bit of fats

## Protein

### More Popular
- Chicken (not deep fried — look for grilled/baked/pan fry)
- Shrimp
- Extra lean steak (top sirloin, flank, baseball top sirloin, filet mignon)
- White fish

### Less Popular
- Bison
- Tuna
- Egg whites
- Turkey
- Salmon (most are pretty fatty at restaurants though)

## Here's How To Approach It:

1. Look for something with **protein** on the menu. (Protein list is up above — these are lean protein sources).
2. If it comes with a **side**, see the list above on what to pick from.
3. Ask for **sauce on side** if it comes with it.

> **Tip:** Can always use the "Meal Scan" AI photo scanner to get an idea of how many calories your meal has when eating out after ordering.`,

  eating_out_examples: `- **McDonald's** — Grilled Chicken Caesar Salad (no croutons, light dressing). Grilled chicken is a great lean protein, and the salad base keeps it low-carb.

- **A&W** — Grilled Chicken Burger (no sauce, wrapped in lettuce). Skip the bun and sauces to keep it lighter, focusing on the grilled chicken patty.

- **Subway** — Double Chicken Chopped Salad (no cheese, oil, or heavy sauces). Load up on vegetables and ask for double chicken to increase protein intake.

- **Tim Hortons** — Grilled Chicken Wrap (no sauces, extra chicken if possible). Opt for extra chicken to make it a protein-packed option.

- **Boston Pizza** — Oven-Roasted Salmon (with steamed veggies). Salmon provides a great source of protein and healthy fats.

- **Kelsey's** — Grilled Chicken Breast with Mixed Greens. Customize your meal by choosing grilled protein options and pairing them with veggies.

- **Earls** — Cajun Blackened Chicken with Steamed Vegetables. A flavorful grilled chicken dish that's protein-focused without heavy sauces or sides.

- **Swiss Chalet** — Quarter Chicken Dinner (white meat, no skin, with steamed vegetables). Opt for white meat and remove the skin to keep it leaner.

- **The Keg** — Baseball Top Sirloin (8 oz.) with Asparagus. A high-protein steak option paired with a veggie side to balance it out.

- **Jack Astor's** — Grilled Chicken Power Bowl. Loaded with protein from chicken, plus fiber from greens and veggies.

- **Chipotle** — Burrito Bowl with Double Chicken, no rice, extra veggies. Customize your bowl for a high-protein, low-carb meal by skipping the rice and adding extra chicken.

- **Harvey's** — Grilled Chicken Sandwich (lettuce wrap, no sauce). Keep it light by skipping the bun and focusing on the lean protein from grilled chicken.

- **Pita Pit** — Chicken Souvlaki Pita (double protein, whole wheat pita). Opt for double protein and load it up with veggies for a nutritious meal.

- **Nando's** — Half Chicken with Mixed Vegetables. Flame-grilled chicken is packed with protein and pairs well with a side of veggies.

- **Panera Bread** — Mediterranean Grilled Chicken Salad. A fresh salad with lean protein from grilled chicken, balanced with healthy fats like olive oil.

- **Cactus Club Cafe** — Grilled Chimichurri Chicken. A flavorful, high-protein option, often served with lighter sides like steamed veggies.`,

  macro_cheat_sheet: `This section uses a structured visual grid — content is managed automatically from the Macro Replacement Chart.`,
};

const CoachNutritionGuides = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [sections, setSections] = useState<Record<string, { title: string; content: string; is_visible: boolean }>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [previewKeys, setPreviewKeys] = useState<Set<string>>(new Set());
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  const { data: existingSections, isLoading } = useQuery({
    queryKey: ["coach-guide-sections", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nutrition_guide_sections")
        .select("*")
        .eq("coach_id", user!.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (!existingSections) return;
    const map: Record<string, { title: string; content: string; is_visible: boolean }> = {};
    for (const def of DEFAULT_SECTIONS) {
      const existing = existingSections.find((s: any) => s.section_key === def.section_key);
      map[def.section_key] = {
        title: existing?.title || def.title,
        content: existing?.content || DEFAULT_CONTENT[def.section_key] || "",
        is_visible: existing?.is_visible ?? true,
      };
    }
    setSections(map);
  }, [existingSections]);

  const handleSave = async (sectionKey: string) => {
    if (!user) return;
    setSaving(sectionKey);
    const section = sections[sectionKey];
    const def = DEFAULT_SECTIONS.find((d) => d.section_key === sectionKey);

    try {
      const { error } = await supabase
        .from("nutrition_guide_sections")
        .upsert(
          {
            coach_id: user.id,
            section_key: sectionKey,
            title: section.title,
            content: section.content,
            is_visible: section.is_visible,
            sort_order: def?.sort_order || 0,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "coach_id,section_key" }
        );
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["coach-guide-sections"] });
      toast.success("Section saved");
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(null);
    }
  };

  const updateSection = (key: string, field: string, value: any) => {
    setSections((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  };

  const togglePreview = (key: string) => {
    setPreviewKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">Loading...</CardContent>
      </Card>
    );
  }

  return (
    <Tabs defaultValue="guides" className="w-full">
      <TabsList className="w-full">
        <TabsTrigger value="guides" className="flex-1 gap-1.5">
          <BookOpen className="h-3.5 w-3.5" />
          Guide Sections
        </TabsTrigger>
        <TabsTrigger value="phases" className="flex-1 gap-1.5">
          <Users className="h-3.5 w-3.5" />
          Client Phases
        </TabsTrigger>
      </TabsList>

      <TabsContent value="guides" className="space-y-4 mt-4">
        <p className="text-xs text-muted-foreground">
          These guides are shared with all your clients under their Plan tab. Toggle visibility per section. Supports **bold**, *italic*, - bullet lists, ## headers.
        </p>

        {CATEGORIES.map((cat) => {
          const catSections = DEFAULT_SECTIONS.filter((d) => cat.sections.includes(d.section_key));
          if (catSections.length === 0) return null;

          return (
            <Collapsible key={cat.key} defaultOpen>
              <CollapsibleTrigger className="flex items-center gap-2 w-full text-left py-2 px-1 hover:bg-muted/20 rounded-md transition-colors group">
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
                <span className="text-sm font-semibold">{cat.label}</span>
                <span className="text-xs text-muted-foreground ml-auto">{catSections.length} section{catSections.length > 1 ? "s" : ""}</span>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 mt-1 ml-2 border-l-2 border-border/30 pl-3">
                {catSections.map((def) => {
                  const section = sections[def.section_key];
                  if (!section) return null;
                  const showPreview = previewKeys.has(def.section_key);

                  return (
                    <Card key={def.section_key} className="border-border/50">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm">{def.title}</CardTitle>
                          <div className="flex items-center gap-3">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 gap-1 text-xs"
                              onClick={() => togglePreview(def.section_key)}
                            >
                              <Eye className="h-3 w-3" />
                              {showPreview ? "Edit" : "Preview"}
                            </Button>
                            <div className="flex items-center gap-1.5">
                              <Label htmlFor={`vis-${def.section_key}`} className="text-xs text-muted-foreground">
                                Visible
                              </Label>
                              <Switch
                                id={`vis-${def.section_key}`}
                                checked={section.is_visible}
                                onCheckedChange={(v) => updateSection(def.section_key, "is_visible", v)}
                              />
                            </div>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <Input
                          value={section.title}
                          onChange={(e) => updateSection(def.section_key, "title", e.target.value)}
                          placeholder="Section title"
                          className="text-sm"
                        />
                        {showPreview ? (
                          <div className="rounded-lg border border-border/50 p-4 min-h-[100px] prose prose-sm prose-invert max-w-none text-sm text-muted-foreground [&_h1]:text-foreground [&_h2]:text-foreground [&_h3]:text-foreground [&_strong]:text-foreground [&_ul]:list-disc [&_ol]:list-decimal [&_li]:my-0.5">
                            <ReactMarkdown>{section.content || "*No content yet*"}</ReactMarkdown>
                          </div>
                        ) : (
                          <>
                            <RichTextToolbar
                              textareaRef={{ current: textareaRefs.current[def.section_key] } as React.RefObject<HTMLTextAreaElement>}
                              value={section.content}
                              onChange={(v) => updateSection(def.section_key, "content", v)}
                            />
                            <Textarea
                              ref={(el) => { textareaRefs.current[def.section_key] = el; }}
                              value={section.content}
                              onChange={(e) => updateSection(def.section_key, "content", e.target.value)}
                              placeholder="Enter content... Supports **bold**, *italic*, - lists, ## headers"
                              rows={6}
                              className="text-sm font-mono"
                            />
                          </>
                        )}
                        <Button
                          size="sm"
                          onClick={() => handleSave(def.section_key)}
                          disabled={saving === def.section_key}
                        >
                          <Save className="h-3.5 w-3.5 mr-1" />
                          {saving === def.section_key ? "Saving..." : "Save"}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </TabsContent>

      <TabsContent value="phases" className="mt-4">
        <PhaseInfoEditor />
      </TabsContent>
    </Tabs>
  );
};

export default CoachNutritionGuides;
