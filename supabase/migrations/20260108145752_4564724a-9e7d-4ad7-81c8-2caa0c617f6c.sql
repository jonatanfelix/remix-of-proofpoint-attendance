-- Add username column to profiles table
ALTER TABLE public.profiles ADD COLUMN username TEXT;

-- Create unique index for username
CREATE UNIQUE INDEX profiles_username_unique ON public.profiles(username) WHERE username IS NOT NULL;

-- Update existing profiles to have username from full_name (lowercase, replace spaces with dots)
UPDATE public.profiles 
SET username = LOWER(REPLACE(REPLACE(full_name, ' ', '.'), '''', ''))
WHERE username IS NULL;