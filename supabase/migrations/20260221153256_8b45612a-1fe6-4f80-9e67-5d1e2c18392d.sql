
-- Legal documents table (versioned content)
CREATE TABLE public.legal_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type text NOT NULL CHECK (document_type IN ('terms_of_service', 'privacy_policy')),
  title text NOT NULL,
  content text NOT NULL,
  version_number integer NOT NULL DEFAULT 1,
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  is_current boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Legal acceptances table (audit trail)
CREATE TABLE public.legal_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  document_id uuid NOT NULL REFERENCES public.legal_documents(id),
  document_type text NOT NULL,
  document_version integer NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  app_version text DEFAULT '1.0.0',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Only one current version per document type
CREATE UNIQUE INDEX idx_legal_documents_current_type 
ON public.legal_documents (document_type) WHERE is_current = true;

-- Index for checking user acceptances
CREATE INDEX idx_legal_acceptances_user_doc 
ON public.legal_acceptances (user_id, document_type, document_version);

-- RLS
ALTER TABLE public.legal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;

-- Legal docs: publicly readable (needed for unauthenticated setup page)
CREATE POLICY "Anyone can view current legal documents"
ON public.legal_documents FOR SELECT
TO anon, authenticated
USING (is_current = true);

-- Admins can manage legal documents
CREATE POLICY "Admins can manage legal documents"
ON public.legal_documents FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Users can view own acceptances
CREATE POLICY "Users can view own acceptances"
ON public.legal_acceptances FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Users can insert own acceptances
CREATE POLICY "Users can insert own acceptances"
ON public.legal_acceptances FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Coaches/admins can view all acceptances
CREATE POLICY "Coaches and admins can view acceptances"
ON public.legal_acceptances FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'coach'::app_role) OR has_role(auth.uid(), 'admin'::app_role));
