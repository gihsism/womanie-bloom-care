-- Create storage bucket for health documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'health-documents',
  'health-documents',
  false,
  10485760, -- 10MB limit
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/jpg', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
);

-- Create health_documents table
CREATE TABLE public.health_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  document_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on health_documents table
ALTER TABLE public.health_documents ENABLE ROW LEVEL SECURITY;

-- RLS Policies for health_documents table
CREATE POLICY "Users can view their own documents"
  ON public.health_documents
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own documents"
  ON public.health_documents
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own documents"
  ON public.health_documents
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own documents"
  ON public.health_documents
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Storage RLS Policies for health-documents bucket
CREATE POLICY "Users can view their own health documents"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'health-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can upload their own health documents"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'health-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can update their own health documents"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'health-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete their own health documents"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'health-documents' AND (storage.foldername(name))[1] = auth.uid()::text);