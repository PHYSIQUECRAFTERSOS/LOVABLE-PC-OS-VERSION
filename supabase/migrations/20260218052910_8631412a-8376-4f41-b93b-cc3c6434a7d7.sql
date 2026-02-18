
-- Create client_invites table for invite-only onboarding
CREATE TABLE public.client_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  phone text,
  client_type text NOT NULL DEFAULT 'full_access',
  assigned_coach_id uuid NOT NULL,
  invite_token text NOT NULL UNIQUE,
  invite_status text NOT NULL DEFAULT 'pending',
  expires_at timestamp with time zone NOT NULL,
  accepted_at timestamp with time zone,
  created_client_id uuid,
  tags text[] DEFAULT '{}',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Index for fast token lookups
CREATE INDEX idx_client_invites_token ON public.client_invites (invite_token);
CREATE INDEX idx_client_invites_email ON public.client_invites (email);
CREATE INDEX idx_client_invites_coach ON public.client_invites (assigned_coach_id);
CREATE INDEX idx_client_invites_status ON public.client_invites (invite_status);

-- Enable RLS
ALTER TABLE public.client_invites ENABLE ROW LEVEL SECURITY;

-- Coaches can manage invites they created
CREATE POLICY "Coaches can manage own invites"
ON public.client_invites
FOR ALL
USING (assigned_coach_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (assigned_coach_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

-- Admins can view all invites
CREATE POLICY "Admins can view all invites"
ON public.client_invites
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_client_invites_updated_at
BEFORE UPDATE ON public.client_invites
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
