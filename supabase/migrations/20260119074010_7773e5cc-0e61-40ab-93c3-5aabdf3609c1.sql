-- Add base salary columns to profiles table
ALTER TABLE public.profiles
ADD COLUMN base_salary numeric DEFAULT 0,
ADD COLUMN salary_type text DEFAULT 'monthly' CHECK (salary_type IN ('daily', 'monthly'));