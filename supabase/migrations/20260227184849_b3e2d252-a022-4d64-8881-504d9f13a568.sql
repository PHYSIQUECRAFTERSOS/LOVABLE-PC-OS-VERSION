
-- Staff invites table for coach/manager invitations
CREATE TABLE public.staff_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  role app_role NOT NULL DEFAULT 'coach',
  invited_by UUID NOT NULL,
  invite_token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  accepted_at TIMESTAMPTZ,
  created_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.staff_invites ENABLE ROW LEVEL SECURITY;

-- Only admins can view/create staff invites
CREATE POLICY "Admins can view all staff invites"
  ON public.staff_invites FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can create staff invites"
  ON public.staff_invites FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update staff invites"
  ON public.staff_invites FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Index for token lookup
CREATE INDEX idx_staff_invites_token ON public.staff_invites (invite_token);
CREATE INDEX idx_staff_invites_email ON public.staff_invites (email);
