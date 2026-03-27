
-- grocery_lists table
CREATE TABLE IF NOT EXISTS grocery_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  generated_at TIMESTAMPTZ DEFAULT now(),
  items JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE grocery_lists ENABLE ROW LEVEL SECURITY;

-- Client can read/update their own grocery list
CREATE POLICY "Clients can view own grocery list" ON grocery_lists
  FOR SELECT TO authenticated
  USING (client_id = auth.uid());

CREATE POLICY "Clients can update own grocery list" ON grocery_lists
  FOR UPDATE TO authenticated
  USING (client_id = auth.uid());

-- Coach/admin can view/manage their clients' grocery lists
CREATE POLICY "Coaches can view client grocery lists" ON grocery_lists
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM coach_clients cc
      WHERE cc.client_id = grocery_lists.client_id
      AND cc.coach_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Coaches can insert client grocery lists" ON grocery_lists
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM coach_clients cc
      WHERE cc.client_id = grocery_lists.client_id
      AND cc.coach_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Coaches can update client grocery lists" ON grocery_lists
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM coach_clients cc
      WHERE cc.client_id = grocery_lists.client_id
      AND cc.coach_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin')
  );

-- nutrition_guide_sections table
CREATE TABLE IF NOT EXISTS nutrition_guide_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES auth.users(id),
  section_key TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  sort_order INT DEFAULT 0,
  is_visible BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(coach_id, section_key)
);
ALTER TABLE nutrition_guide_sections ENABLE ROW LEVEL SECURITY;

-- Coach can manage their own guide sections
CREATE POLICY "Coaches can manage own guide sections" ON nutrition_guide_sections
  FOR ALL TO authenticated
  USING (coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Clients can read guide sections from their coach
CREATE POLICY "Clients can read coach guide sections" ON nutrition_guide_sections
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM coach_clients cc
      WHERE cc.client_id = auth.uid()
      AND cc.coach_id = nutrition_guide_sections.coach_id
    )
  );

-- client_phase_info table
CREATE TABLE IF NOT EXISTS client_phase_info (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL REFERENCES auth.users(id),
  current_phase_name TEXT,
  current_phase_description TEXT,
  next_phase_name TEXT,
  next_phase_description TEXT,
  coach_notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id)
);
ALTER TABLE client_phase_info ENABLE ROW LEVEL SECURITY;

-- Client can read their own phase info
CREATE POLICY "Clients can read own phase info" ON client_phase_info
  FOR SELECT TO authenticated
  USING (client_id = auth.uid());

-- Coach can manage phase info for their clients
CREATE POLICY "Coaches can manage client phase info" ON client_phase_info
  FOR ALL TO authenticated
  USING (
    coach_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    coach_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );
