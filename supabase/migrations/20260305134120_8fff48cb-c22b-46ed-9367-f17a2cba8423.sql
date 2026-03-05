
-- Drop the overly permissive policy and replace with a service-role-only approach
-- The edge function uses SUPABASE_SERVICE_ROLE_KEY which bypasses RLS entirely,
-- so we don't need a permissive policy at all.
DROP POLICY IF EXISTS "Service role can manage medical data" ON public.medical_extracted_data;
