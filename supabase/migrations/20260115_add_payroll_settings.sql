-- Add flexible payroll settings to companies table

ALTER TABLE companies 
ADD COLUMN IF NOT EXISTS late_penalty_per_minute INTEGER DEFAULT 1000,
ADD COLUMN IF NOT EXISTS standard_work_hours INTEGER DEFAULT 8;

-- Comment on columns
COMMENT ON COLUMN companies.late_penalty_per_minute IS 'Denda keterlambatan per menit (default: 1000)';
COMMENT ON COLUMN companies.standard_work_hours IS 'Jam kerja standar per hari (default: 8)';
