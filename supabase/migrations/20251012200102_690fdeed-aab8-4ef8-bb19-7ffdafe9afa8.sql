-- Add life_stage column to profiles table to persist user's selected mode
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS life_stage text;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_profiles_life_stage ON public.profiles(life_stage);