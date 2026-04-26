-- Validation trigger to block the "1g portion + real-portion macros" corruption pattern.
-- Rationale: 1 gram of any food contains at most ~9 kcal (pure fat). A row with
-- serving_unit='g', quantity=1, and calories > 9 is mathematically impossible
-- and indicates the original portion was lost during write.
CREATE OR REPLACE FUNCTION public.validate_saved_meal_item_portion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.serving_unit = 'g'
     AND NEW.quantity = 1
     AND COALESCE(NEW.calories, 0) > 9 THEN
    RAISE EXCEPTION
      'saved_meal_items portion corruption blocked: quantity=1g but calories=% (max possible for 1g is ~9). food_name=%, food_item_id=%',
      NEW.calories, NEW.food_name, NEW.food_item_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_saved_meal_item_portion ON public.saved_meal_items;
CREATE TRIGGER trg_validate_saved_meal_item_portion
BEFORE INSERT OR UPDATE ON public.saved_meal_items
FOR EACH ROW
EXECUTE FUNCTION public.validate_saved_meal_item_portion();