-- Create table for period tracking
CREATE TABLE public.period_tracking (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start_date DATE NOT NULL,
  period_end_date DATE NOT NULL,
  cycle_length INTEGER NOT NULL DEFAULT 28,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, period_start_date)
);

-- Create table for daily health signals
CREATE TABLE public.daily_health_signals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signal_date DATE NOT NULL,
  symptoms TEXT[] DEFAULT '{}',
  intercourse JSONB DEFAULT '[]',
  mood TEXT[] DEFAULT '{}',
  discharge TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, signal_date)
);

-- Enable Row Level Security
ALTER TABLE public.period_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_health_signals ENABLE ROW LEVEL SECURITY;

-- RLS Policies for period_tracking
CREATE POLICY "Users can view their own period tracking"
ON public.period_tracking
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own period tracking"
ON public.period_tracking
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own period tracking"
ON public.period_tracking
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own period tracking"
ON public.period_tracking
FOR DELETE
USING (auth.uid() = user_id);

-- RLS Policies for daily_health_signals
CREATE POLICY "Users can view their own health signals"
ON public.daily_health_signals
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own health signals"
ON public.daily_health_signals
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own health signals"
ON public.daily_health_signals
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own health signals"
ON public.daily_health_signals
FOR DELETE
USING (auth.uid() = user_id);

-- Trigger for updated_at on period_tracking
CREATE TRIGGER update_period_tracking_updated_at
BEFORE UPDATE ON public.period_tracking
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for updated_at on daily_health_signals
CREATE TRIGGER update_daily_health_signals_updated_at
BEFORE UPDATE ON public.daily_health_signals
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_period_tracking_user_date ON public.period_tracking(user_id, period_start_date DESC);
CREATE INDEX idx_daily_health_signals_user_date ON public.daily_health_signals(user_id, signal_date DESC);