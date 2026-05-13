-- Remove 'whoop' from wearable_connections provider constraint
ALTER TABLE public.wearable_connections
DROP CONSTRAINT IF EXISTS wearable_connections_provider_check;

ALTER TABLE public.wearable_connections
ADD CONSTRAINT wearable_connections_provider_check
CHECK (provider IN ('apple_health', 'google_fit', 'fitbit'));

-- Also update the CHECK on metric_type if whoop was referenced there (it wasn't, but for completeness)
-- The provider column in client_health_metrics has no CHECK constraint on provider values,
-- so no change needed there.