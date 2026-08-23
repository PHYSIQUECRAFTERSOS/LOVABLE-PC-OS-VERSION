UPDATE public.calendar_events
SET is_completed = true, completed_at = '2026-08-21 22:16:27.612+00'::timestamptz
WHERE id = 'c5164777-b2a6-4b8b-b9d7-8bbc88fb4370'
  AND is_completed = false;

INSERT INTO public.xp_transactions (user_id, xp_amount, base_amount, transaction_type, description)
SELECT 'c19ab55b-d64b-4be9-8d16-a25ed6e8180a', 4, 4, 'coach_award', 'Reversal of false missed-workout penalty for 2026-08-21 (workout was completed; auto-corrected)'
WHERE NOT EXISTS (
  SELECT 1 FROM public.xp_transactions
  WHERE user_id = 'c19ab55b-d64b-4be9-8d16-a25ed6e8180a'
    AND description = 'Reversal of false missed-workout penalty for 2026-08-21 (workout was completed; auto-corrected)'
);

UPDATE public.ranked_profiles rp
SET total_xp = total_xp + 4
WHERE rp.user_id = 'c19ab55b-d64b-4be9-8d16-a25ed6e8180a'
  AND EXISTS (
    SELECT 1 FROM public.xp_transactions
    WHERE user_id = rp.user_id
      AND description = 'Reversal of false missed-workout penalty for 2026-08-21 (workout was completed; auto-corrected)'
      AND created_at > now() - interval '10 minutes'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.xp_transactions
    WHERE user_id = rp.user_id
      AND description = 'Reversal of false missed-workout penalty for 2026-08-21 (workout was completed; auto-corrected)'
      AND created_at <= now() - interval '10 minutes'
  );