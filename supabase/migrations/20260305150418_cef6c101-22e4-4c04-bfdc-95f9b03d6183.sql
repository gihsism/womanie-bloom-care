-- Fix the security definer view - recreate as security invoker
DROP VIEW IF EXISTS public.available_consultations;
CREATE VIEW public.available_consultations
WITH (security_invoker = true) AS
  SELECT doctor_id, is_available, consultation_price, currency,
         consultation_duration, video_enabled
  FROM public.consultation_settings
  WHERE is_available = true;