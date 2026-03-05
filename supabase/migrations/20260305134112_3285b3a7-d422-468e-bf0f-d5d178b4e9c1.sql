
-- Table to store structured medical data extracted from documents
CREATE TABLE public.medical_extracted_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  document_id UUID REFERENCES public.health_documents(id) ON DELETE CASCADE,
  data_type TEXT NOT NULL, -- 'condition', 'medication', 'lab_result', 'cycle_info', 'allergy', 'procedure', 'vaccination'
  title TEXT NOT NULL,
  value TEXT,
  unit TEXT,
  reference_range TEXT,
  status TEXT, -- 'normal', 'abnormal', 'critical', 'active', 'resolved'
  date_recorded DATE,
  notes TEXT,
  raw_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.medical_extracted_data ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own medical data"
  ON public.medical_extracted_data FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own medical data"
  ON public.medical_extracted_data FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own medical data"
  ON public.medical_extracted_data FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Allow service role to insert (for edge function)
CREATE POLICY "Service role can manage medical data"
  ON public.medical_extracted_data FOR ALL
  USING (true)
  WITH CHECK (true);
