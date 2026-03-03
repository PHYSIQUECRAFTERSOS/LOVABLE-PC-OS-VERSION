
-- Deletion requests table for tracking account deletion lifecycle
CREATE TABLE public.deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  full_name TEXT,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'processing', 'completed', 'cancelled')),
  source TEXT NOT NULL DEFAULT 'in_app' CHECK (source IN ('in_app', 'public_form')),
  token TEXT,
  token_expires_at TIMESTAMPTZ,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.deletion_requests ENABLE ROW LEVEL SECURITY;

-- Users can view their own deletion requests
CREATE POLICY "Users can view own deletion requests"
ON public.deletion_requests FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can create their own deletion requests
CREATE POLICY "Users can create own deletion requests"
ON public.deletion_requests FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Allow anon inserts for public form (source = public_form, no user_id required)
CREATE POLICY "Public deletion requests via form"
ON public.deletion_requests FOR INSERT
TO anon
WITH CHECK (source = 'public_form' AND user_id IS NULL);

-- Service role handles updates (status changes) via edge functions

-- Timestamp trigger
CREATE TRIGGER update_deletion_requests_updated_at
BEFORE UPDATE ON public.deletion_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index for token lookups
CREATE INDEX idx_deletion_requests_token ON public.deletion_requests (token) WHERE token IS NOT NULL;
CREATE INDEX idx_deletion_requests_email ON public.deletion_requests (email);
CREATE INDEX idx_deletion_requests_user_id ON public.deletion_requests (user_id) WHERE user_id IS NOT NULL;
