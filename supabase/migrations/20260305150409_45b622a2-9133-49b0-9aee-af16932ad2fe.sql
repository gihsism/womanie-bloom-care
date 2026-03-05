-- Fix 1: doctor_patient_connections INSERT - require doctor role
DROP POLICY "Doctors can create connection requests" ON public.doctor_patient_connections;
CREATE POLICY "Doctors can create connection requests"
ON public.doctor_patient_connections FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = doctor_id AND has_role(auth.uid(), 'doctor'));

-- Fix 2: doctor_notes INSERT - require doctor role
DROP POLICY "Doctors can create notes for connected patients" ON public.doctor_notes;
CREATE POLICY "Doctors can create notes for connected patients"
ON public.doctor_notes FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = doctor_id AND has_patient_access(auth.uid(), patient_id) AND has_role(auth.uid(), 'doctor'));

-- Fix 3: Remove public SELECT policy that exposes stripe_account_id
DROP POLICY "Public can view available consultations" ON public.consultation_settings;

-- Create a restricted view instead
CREATE OR REPLACE VIEW public.available_consultations AS
  SELECT doctor_id, is_available, consultation_price, currency,
         consultation_duration, video_enabled
  FROM public.consultation_settings
  WHERE is_available = true;