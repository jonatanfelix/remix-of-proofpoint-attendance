-- Add working_days column to shifts table
-- Stored as integer array: 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday
-- Default to Monday-Friday (1,2,3,4,5)
ALTER TABLE public.shifts 
ADD COLUMN working_days integer[] NOT NULL DEFAULT ARRAY[1,2,3,4,5];

-- Add grace_period_minutes to companies table for late tolerance
ALTER TABLE public.companies 
ADD COLUMN grace_period_minutes integer NOT NULL DEFAULT 0;

-- Add annual_leave_quota to companies table (default 12 days per year)
ALTER TABLE public.companies 
ADD COLUMN annual_leave_quota integer NOT NULL DEFAULT 12;

-- Add break_duration_minutes to shifts table (standard break duration)
ALTER TABLE public.shifts 
ADD COLUMN break_duration_minutes integer NOT NULL DEFAULT 60;

-- Add overtime_start_after_minutes to companies (overtime starts after X minutes past end time)
ALTER TABLE public.companies 
ADD COLUMN overtime_start_after_minutes integer NOT NULL DEFAULT 0;

-- Add overtime_rate_per_hour to companies (in IDR)
ALTER TABLE public.companies 
ADD COLUMN overtime_rate_per_hour integer NOT NULL DEFAULT 0;

-- Add early_leave_deduction_per_minute to companies (in IDR)
ALTER TABLE public.companies 
ADD COLUMN early_leave_deduction_per_minute integer NOT NULL DEFAULT 0;

-- Add leave_balance to profiles for tracking individual leave quota used
ALTER TABLE public.profiles 
ADD COLUMN leave_balance integer NOT NULL DEFAULT 12;