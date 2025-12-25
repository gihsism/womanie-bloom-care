-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('patient', 'doctor', 'admin');

-- Create user_roles table for role management
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- RLS policies for user_roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
USING (auth.uid() = user_id);

-- Create doctor_profiles table
CREATE TABLE public.doctor_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  specialty TEXT,
  license_number TEXT,
  bio TEXT,
  avatar_url TEXT,
  is_verified BOOLEAN DEFAULT FALSE,
  verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN ('pending', 'approved', 'rejected')),
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  verified_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on doctor_profiles
ALTER TABLE public.doctor_profiles ENABLE ROW LEVEL SECURITY;

-- RLS policies for doctor_profiles
CREATE POLICY "Doctors can view their own profile"
ON public.doctor_profiles FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Doctors can insert their own profile"
ON public.doctor_profiles FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Doctors can update their own profile"
ON public.doctor_profiles FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Verified doctors are publicly viewable"
ON public.doctor_profiles FOR SELECT
USING (is_verified = true);

-- Create patient_access_codes table
CREATE TABLE public.patient_access_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  code TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  is_used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.patient_access_codes ENABLE ROW LEVEL SECURITY;

-- RLS policies for patient_access_codes
CREATE POLICY "Patients can view their own codes"
ON public.patient_access_codes FOR SELECT
USING (auth.uid() = patient_id);

CREATE POLICY "Patients can create their own codes"
ON public.patient_access_codes FOR INSERT
WITH CHECK (auth.uid() = patient_id);

CREATE POLICY "Patients can update their own codes"
ON public.patient_access_codes FOR UPDATE
USING (auth.uid() = patient_id);

-- Create doctor_patient_connections table
CREATE TABLE public.doctor_patient_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  patient_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'revoked')),
  connection_type TEXT CHECK (connection_type IN ('code', 'request')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  approved_at TIMESTAMP WITH TIME ZONE,
  UNIQUE (doctor_id, patient_id)
);

-- Enable RLS
ALTER TABLE public.doctor_patient_connections ENABLE ROW LEVEL SECURITY;

-- RLS policies for connections
CREATE POLICY "Doctors can view their connections"
ON public.doctor_patient_connections FOR SELECT
USING (auth.uid() = doctor_id);

CREATE POLICY "Patients can view their connections"
ON public.doctor_patient_connections FOR SELECT
USING (auth.uid() = patient_id);

CREATE POLICY "Doctors can create connection requests"
ON public.doctor_patient_connections FOR INSERT
WITH CHECK (auth.uid() = doctor_id);

CREATE POLICY "Patients can update connection status"
ON public.doctor_patient_connections FOR UPDATE
USING (auth.uid() = patient_id);

-- Create doctor_notes table (notes doctors add to patient records)
CREATE TABLE public.doctor_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  patient_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  note_type TEXT CHECK (note_type IN ('observation', 'diagnosis', 'recommendation', 'follow_up')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  is_visible_to_patient BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.doctor_notes ENABLE ROW LEVEL SECURITY;

-- Security definer function to check doctor-patient connection
CREATE OR REPLACE FUNCTION public.has_patient_access(_doctor_id UUID, _patient_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.doctor_patient_connections
    WHERE doctor_id = _doctor_id
      AND patient_id = _patient_id
      AND status = 'approved'
  )
$$;

-- RLS policies for doctor_notes
CREATE POLICY "Doctors can view notes they created"
ON public.doctor_notes FOR SELECT
USING (auth.uid() = doctor_id);

CREATE POLICY "Patients can view notes visible to them"
ON public.doctor_notes FOR SELECT
USING (auth.uid() = patient_id AND is_visible_to_patient = true);

CREATE POLICY "Doctors can create notes for connected patients"
ON public.doctor_notes FOR INSERT
WITH CHECK (auth.uid() = doctor_id AND public.has_patient_access(auth.uid(), patient_id));

CREATE POLICY "Doctors can update their notes"
ON public.doctor_notes FOR UPDATE
USING (auth.uid() = doctor_id);

-- Create consultation_settings table
CREATE TABLE public.consultation_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  is_available BOOLEAN DEFAULT FALSE,
  consultation_price DECIMAL(10,2),
  currency TEXT DEFAULT 'CHF',
  consultation_duration INTEGER DEFAULT 30,
  video_enabled BOOLEAN DEFAULT TRUE,
  stripe_account_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.consultation_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies for consultation_settings
CREATE POLICY "Doctors can view their own settings"
ON public.consultation_settings FOR SELECT
USING (auth.uid() = doctor_id);

CREATE POLICY "Doctors can insert their settings"
ON public.consultation_settings FOR INSERT
WITH CHECK (auth.uid() = doctor_id);

CREATE POLICY "Doctors can update their settings"
ON public.consultation_settings FOR UPDATE
USING (auth.uid() = doctor_id);

CREATE POLICY "Public can view available consultations"
ON public.consultation_settings FOR SELECT
USING (is_available = true);

-- Create doctor_schedule table
CREATE TABLE public.doctor_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  day_of_week INTEGER CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.doctor_schedule ENABLE ROW LEVEL SECURITY;

-- RLS policies for doctor_schedule
CREATE POLICY "Doctors can manage their schedule"
ON public.doctor_schedule FOR ALL
USING (auth.uid() = doctor_id);

CREATE POLICY "Public can view doctor schedules"
ON public.doctor_schedule FOR SELECT
USING (is_active = true);

-- Create appointments table
CREATE TABLE public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  patient_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  duration INTEGER DEFAULT 30,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show')),
  consultation_type TEXT CHECK (consultation_type IN ('video', 'in_person', 'phone')),
  notes TEXT,
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'refunded')),
  payment_intent_id TEXT,
  meeting_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- RLS policies for appointments
CREATE POLICY "Doctors can view their appointments"
ON public.appointments FOR SELECT
USING (auth.uid() = doctor_id);

CREATE POLICY "Patients can view their appointments"
ON public.appointments FOR SELECT
USING (auth.uid() = patient_id);

CREATE POLICY "Patients can create appointments"
ON public.appointments FOR INSERT
WITH CHECK (auth.uid() = patient_id);

CREATE POLICY "Doctors can update appointment status"
ON public.appointments FOR UPDATE
USING (auth.uid() = doctor_id);

CREATE POLICY "Patients can update their appointments"
ON public.appointments FOR UPDATE
USING (auth.uid() = patient_id);

-- Triggers for updated_at
CREATE TRIGGER update_doctor_profiles_updated_at
BEFORE UPDATE ON public.doctor_profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_doctor_notes_updated_at
BEFORE UPDATE ON public.doctor_notes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_consultation_settings_updated_at
BEFORE UPDATE ON public.consultation_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_appointments_updated_at
BEFORE UPDATE ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();