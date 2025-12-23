-- Create employee type enum
CREATE TYPE public.employee_type AS ENUM ('office', 'field');

-- Add employee_type column to profiles
ALTER TABLE public.profiles 
ADD COLUMN employee_type employee_type NOT NULL DEFAULT 'office';