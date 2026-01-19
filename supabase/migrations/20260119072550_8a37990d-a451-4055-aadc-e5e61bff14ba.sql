-- Add attendance_required column to profiles
-- Default true = wajib absen, false = tidak perlu absen (misal: owner, direktur)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS attendance_required BOOLEAN NOT NULL DEFAULT true;

-- Update existing admin/developer accounts to not require attendance by default
UPDATE public.profiles p
SET attendance_required = false
WHERE EXISTS (
  SELECT 1 FROM public.user_roles ur 
  WHERE ur.user_id = p.user_id 
  AND ur.role IN ('admin', 'developer')
);

COMMENT ON COLUMN public.profiles.attendance_required IS 'Whether this user is required to clock in/out. False for executives, owners, etc.';