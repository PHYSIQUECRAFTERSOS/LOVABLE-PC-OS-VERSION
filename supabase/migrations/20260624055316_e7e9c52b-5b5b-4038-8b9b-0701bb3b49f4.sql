
-- 1. Supplement synonyms table (mirrors exercise_synonyms)
CREATE TABLE IF NOT EXISTS public.supplement_synonyms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term text NOT NULL,
  canonical text NOT NULL,
  weight smallint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (term, canonical)
);
CREATE INDEX IF NOT EXISTS idx_supplement_synonyms_term ON public.supplement_synonyms (lower(term));

GRANT SELECT ON public.supplement_synonyms TO authenticated;
GRANT ALL ON public.supplement_synonyms TO service_role;

ALTER TABLE public.supplement_synonyms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authed can read supplement_synonyms"
  ON public.supplement_synonyms FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage supplement_synonyms"
  ON public.supplement_synonyms FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 2. Seed canonical master supplements (only if name not already present, case-insensitive)
DO $$
DECLARE
  v_admin uuid := '321eb3a1-b898-4d15-92a8-8c6db2f37bdb';
  rec record;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('Multivitamin (Triumph)', 'Legion', '3', 'pills'),
      ('Vitamin D3 + K2', NULL, '5000', 'IU'),
      ('Berberine', NULL, '500', 'mg'),
      ('Fish Oil', 'Legion', '3000', 'mg'),
      ('Iodine', NULL, '1', 'drop'),
      ('Probiotics (25B)', NULL, '25', 'Billion'),
      ('Psyllium Husk', NULL, '1', 'tsp'),
      ('Magnesium Glycinate', NULL, '400', 'mg'),
      ('Magnesium Citrate', NULL, '400', 'mg'),
      ('Creatine Monohydrate', NULL, '5', 'g'),
      ('Ashwagandha KSM-66', NULL, '600', 'mg'),
      ('Aloe Vera Drink', NULL, '5', 'g'),
      ('Apple Cider Vinegar', NULL, '1', 'TBSP'),
      ('Greens Powder', NULL, '1', 'scoop'),
      ('CoQ10 Ubiquinol', NULL, '100', 'mg'),
      ('NAC', NULL, '600', 'mg'),
      ('Methylcobalamin B12', NULL, '1000', 'mcg'),
      ('Methylfolate L-5-MTHF', NULL, '400', 'mcg'),
      ('Boron', NULL, '10', 'mg'),
      ('Glutamine', NULL, '5', 'g'),
      ('EAA', NULL, '1', 'serving'),
      ('Protein Powder (Whey Isolate)', 'Legion', '1', 'scoop'),
      ('Caffeine', NULL, '200', 'mg'),
      ('Citrus Bergamot', NULL, '500', 'mg'),
      ('Digestive Enzyme', NULL, '1', 'capsule'),
      ('DIM', NULL, '200', 'mg'),
      ('Krill Oil', NULL, '1000', 'mg'),
      ('Melatonin', NULL, '3', 'mg'),
      ('Iron', NULL, '18', 'mg'),
      ('Taurine', NULL, '1000', 'mg')
    ) AS s(name, brand, dosage, unit)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.master_supplements
      WHERE is_master = true AND lower(name) = lower(rec.name)
    ) THEN
      INSERT INTO public.master_supplements
        (coach_id, name, brand, default_dosage, default_dosage_unit, is_active, is_master)
      VALUES
        (v_admin, rec.name, rec.brand, rec.dosage, rec.unit, true, true);
    END IF;
  END LOOP;
END $$;

-- 3. Seed supplement synonyms
INSERT INTO public.supplement_synonyms (term, canonical) VALUES
  ('multivit', 'multivitamin'),
  ('multi-vit', 'multivitamin'),
  ('multi vitamin', 'multivitamin'),
  ('triumph', 'multivitamin'),
  ('triumph multivit', 'multivitamin'),
  ('vit d', 'vitamin d3'),
  ('vit d3', 'vitamin d3'),
  ('d3', 'vitamin d3'),
  ('vitamin d', 'vitamin d3'),
  ('vit k', 'vitamin k2'),
  ('k2', 'vitamin k2'),
  ('vit k2', 'vitamin k2'),
  ('vitamin k', 'vitamin k2'),
  ('vitamin d3 k2', 'vitamin d3 + k2'),
  ('d3 + k2', 'vitamin d3 + k2'),
  ('d3 plus k2', 'vitamin d3 + k2'),
  ('d3 and k2', 'vitamin d3 + k2'),
  ('berberine hcl', 'berberine'),
  ('berberbine', 'berberine'),
  ('fish oils', 'fish oil'),
  ('omega 3', 'fish oil'),
  ('omega-3', 'fish oil'),
  ('epa dha', 'fish oil'),
  ('mag glycinate', 'magnesium glycinate'),
  ('magnesium bisglycinate', 'magnesium glycinate'),
  ('mag biglycinate', 'magnesium glycinate'),
  ('mag sucrosomial', 'magnesium glycinate'),
  ('magnesium sucrosomial', 'magnesium glycinate'),
  ('psyllium', 'psyllium husk'),
  ('psyullium husk', 'psyllium husk'),
  ('meta mucil', 'psyllium husk'),
  ('probiotic', 'probiotics'),
  ('25b', 'probiotics'),
  ('25 billion', 'probiotics'),
  ('probiotics 25b', 'probiotics'),
  ('ashwagandha ksm 66', 'ashwagandha ksm-66'),
  ('ashwaganada ksm 66', 'ashwagandha ksm-66'),
  ('ashwaghanda', 'ashwagandha ksm-66'),
  ('ashwagandha', 'ashwagandha ksm-66'),
  ('creatine mono', 'creatine monohydrate'),
  ('creatine', 'creatine monohydrate'),
  ('b12', 'methylcobalamin b12'),
  ('methyl b12', 'methylcobalamin b12')
ON CONFLICT (term, canonical) DO NOTHING;
