-- Add end_date column to holidays table to support date ranges
ALTER TABLE public.holidays 
ADD COLUMN end_date date;

-- Set end_date = date for existing single-day holidays
UPDATE public.holidays SET end_date = date WHERE end_date IS NULL;