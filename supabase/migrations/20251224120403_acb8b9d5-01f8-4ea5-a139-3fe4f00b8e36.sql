-- Create storage bucket for leave proofs
INSERT INTO storage.buckets (id, name, public) 
VALUES ('leave-proofs', 'leave-proofs', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public to view leave proofs
CREATE POLICY "Public can view leave proofs"
ON storage.objects FOR SELECT
USING (bucket_id = 'leave-proofs');

-- Allow authenticated users to upload their own leave proofs
CREATE POLICY "Users can upload leave proofs"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'leave-proofs' 
  AND auth.role() = 'authenticated'
);

-- Allow users to update their own leave proofs
CREATE POLICY "Users can update their leave proofs"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'leave-proofs' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to delete their own leave proofs
CREATE POLICY "Users can delete their leave proofs"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'leave-proofs' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Add proof_url column to leave_requests table
ALTER TABLE public.leave_requests 
ADD COLUMN IF NOT EXISTS proof_url text;