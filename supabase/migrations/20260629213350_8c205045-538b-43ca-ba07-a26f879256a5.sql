
-- 1. Meal-plan templates: any coach/admin/manager can view template meal plans
--    and their child rows. Editing stays owner-only via existing policies.

DROP POLICY IF EXISTS "Coaches view template meal plans" ON public.meal_plans;
CREATE POLICY "Coaches view template meal plans"
ON public.meal_plans
FOR SELECT
USING (
  is_template = true
  AND (has_role(auth.uid(), 'coach'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
);

DROP POLICY IF EXISTS "Coaches view template meal plan days" ON public.meal_plan_days;
CREATE POLICY "Coaches view template meal plan days"
ON public.meal_plan_days
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.meal_plans mp
    WHERE mp.id = meal_plan_days.meal_plan_id
      AND mp.is_template = true
      AND (has_role(auth.uid(), 'coach'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  )
);

DROP POLICY IF EXISTS "Coaches view template meal plan items" ON public.meal_plan_items;
CREATE POLICY "Coaches view template meal plan items"
ON public.meal_plan_items
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.meal_plans mp
    WHERE mp.id = meal_plan_items.meal_plan_id
      AND mp.is_template = true
      AND (has_role(auth.uid(), 'coach'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  )
);

DROP POLICY IF EXISTS "Coaches view template meal plan notes" ON public.meal_plan_meal_notes;
CREATE POLICY "Coaches view template meal plan notes"
ON public.meal_plan_meal_notes
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.meal_plan_days d
    JOIN public.meal_plans mp ON mp.id = d.meal_plan_id
    WHERE d.id = meal_plan_meal_notes.day_id
      AND mp.is_template = true
      AND (has_role(auth.uid(), 'coach'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  )
);

-- 2. Nutrition guide sections: any coach/admin/manager can view all coaches' sections.

DROP POLICY IF EXISTS "Coaches view all nutrition guide sections" ON public.nutrition_guide_sections;
CREATE POLICY "Coaches view all nutrition guide sections"
ON public.nutrition_guide_sections
FOR SELECT
USING (
  has_role(auth.uid(), 'coach'::app_role) OR has_role(auth.uid(), 'admin'::app_role)
);
