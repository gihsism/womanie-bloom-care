-- Drop all existing RESTRICTIVE policies and recreate as PERMISSIVE for key tables

-- health_documents
DROP POLICY IF EXISTS "Users can view their own documents" ON public.health_documents;
DROP POLICY IF EXISTS "Users can insert their own documents" ON public.health_documents;
DROP POLICY IF EXISTS "Users can update their own documents" ON public.health_documents;
DROP POLICY IF EXISTS "Users can delete their own documents" ON public.health_documents;

CREATE POLICY "Users can view their own documents" ON public.health_documents
  AS PERMISSIVE FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own documents" ON public.health_documents
  AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own documents" ON public.health_documents
  AS PERMISSIVE FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own documents" ON public.health_documents
  AS PERMISSIVE FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- medical_extracted_data
DROP POLICY IF EXISTS "Users can view their own medical data" ON public.medical_extracted_data;
DROP POLICY IF EXISTS "Users can insert their own medical data" ON public.medical_extracted_data;
DROP POLICY IF EXISTS "Users can delete their own medical data" ON public.medical_extracted_data;

CREATE POLICY "Users can view their own medical data" ON public.medical_extracted_data
  AS PERMISSIVE FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own medical data" ON public.medical_extracted_data
  AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own medical data" ON public.medical_extracted_data
  AS PERMISSIVE FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- daily_health_signals
DROP POLICY IF EXISTS "Users can view their own health signals" ON public.daily_health_signals;
DROP POLICY IF EXISTS "Users can insert their own health signals" ON public.daily_health_signals;
DROP POLICY IF EXISTS "Users can update their own health signals" ON public.daily_health_signals;
DROP POLICY IF EXISTS "Users can delete their own health signals" ON public.daily_health_signals;

CREATE POLICY "Users can view their own health signals" ON public.daily_health_signals
  AS PERMISSIVE FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own health signals" ON public.daily_health_signals
  AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own health signals" ON public.daily_health_signals
  AS PERMISSIVE FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own health signals" ON public.daily_health_signals
  AS PERMISSIVE FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- period_tracking
DROP POLICY IF EXISTS "Users can view their own period tracking" ON public.period_tracking;
DROP POLICY IF EXISTS "Users can insert their own period tracking" ON public.period_tracking;
DROP POLICY IF EXISTS "Users can update their own period tracking" ON public.period_tracking;
DROP POLICY IF EXISTS "Users can delete their own period tracking" ON public.period_tracking;

CREATE POLICY "Users can view their own period tracking" ON public.period_tracking
  AS PERMISSIVE FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own period tracking" ON public.period_tracking
  AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own period tracking" ON public.period_tracking
  AS PERMISSIVE FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own period tracking" ON public.period_tracking
  AS PERMISSIVE FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- profiles
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can view their own profile" ON public.profiles
  AS PERMISSIVE FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can insert their own profile" ON public.profiles
  AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON public.profiles
  AS PERMISSIVE FOR UPDATE TO authenticated USING (auth.uid() = id);

-- user_roles
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;

CREATE POLICY "Users can view their own roles" ON public.user_roles
  AS PERMISSIVE FOR SELECT TO authenticated USING (auth.uid() = user_id);