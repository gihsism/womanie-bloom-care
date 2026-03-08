
CREATE TABLE public.ivf_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  event_date DATE NOT NULL,
  event_time TIME WITHOUT TIME ZONE,
  event_type TEXT NOT NULL DEFAULT 'injection',
  title TEXT NOT NULL,
  description TEXT,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  remind_before_minutes INTEGER DEFAULT 30,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.ivf_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own IVF events"
  ON public.ivf_events FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own IVF events"
  ON public.ivf_events FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own IVF events"
  ON public.ivf_events FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own IVF events"
  ON public.ivf_events FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
