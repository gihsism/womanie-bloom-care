-- Add AI analysis columns to health_documents table
ALTER TABLE public.health_documents
ADD COLUMN ai_summary text,
ADD COLUMN ai_suggested_name text,
ADD COLUMN ai_suggested_category text;