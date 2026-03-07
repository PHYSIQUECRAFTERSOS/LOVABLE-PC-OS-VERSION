
-- Client Tiers
CREATE TABLE IF NOT EXISTS client_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  requires_contract BOOLEAN NOT NULL DEFAULT false,
  contract_template_key TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE client_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read tiers" ON client_tiers FOR SELECT TO authenticated USING (true);

INSERT INTO client_tiers (name, requires_contract, contract_template_key) VALUES
  ('1-Year Portal Agreement', true, 'contract_1yr'),
  ('6-Month Portal Agreement', true, 'contract_6mo'),
  ('Monthly', false, null),
  ('6-Week Program', true, 'contract_6wk')
ON CONFLICT (name) DO NOTHING;

-- Document Templates
CREATE TABLE IF NOT EXISTS document_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key TEXT NOT NULL UNIQUE,
  document_type TEXT NOT NULL,
  tier_applicability TEXT[],
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT 'v1',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE document_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read active templates" ON document_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage templates" ON document_templates FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Client Signatures (immutable audit trail)
CREATE TABLE IF NOT EXISTS client_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_template_id UUID NOT NULL REFERENCES document_templates(id),
  document_version TEXT NOT NULL,
  signed_name TEXT NOT NULL,
  ip_address TEXT,
  signed_at TIMESTAMPTZ DEFAULT now(),
  tier_at_signing TEXT NOT NULL,
  pdf_storage_path TEXT
);

CREATE INDEX IF NOT EXISTS client_signatures_client_idx ON client_signatures (client_id);
CREATE INDEX IF NOT EXISTS client_signatures_template_idx ON client_signatures (document_template_id);

ALTER TABLE client_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can read own signatures" ON client_signatures FOR SELECT TO authenticated USING (client_id = auth.uid());
CREATE POLICY "Clients can insert own signatures" ON client_signatures FOR INSERT TO authenticated WITH CHECK (client_id = auth.uid());
CREATE POLICY "Admins can read all signatures" ON client_signatures FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Coaches can read assigned client signatures" ON client_signatures FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM coach_clients cc
    WHERE cc.coach_id = auth.uid()
    AND cc.client_id = client_signatures.client_id
    AND cc.status = 'active'
  )
);

-- Add tier columns to client_invites
ALTER TABLE client_invites ADD COLUMN IF NOT EXISTS tier_id UUID REFERENCES client_tiers(id);
ALTER TABLE client_invites ADD COLUMN IF NOT EXISTS tier_name TEXT;

-- Create signature-records storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('signature-records', 'signature-records', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admins can read all signature records" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'signature-records' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can read own signature records" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'signature-records' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Service role can insert signature records" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'signature-records');
