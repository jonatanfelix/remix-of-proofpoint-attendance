-- Create companies table
CREATE TABLE public.companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  office_latitude NUMERIC,
  office_longitude NUMERIC,
  radius_meters INTEGER NOT NULL DEFAULT 100,
  work_start_time TIME NOT NULL DEFAULT '08:00',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- Admins can manage companies
CREATE POLICY "Admins can manage companies"
ON public.companies
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- All authenticated users can view companies
CREATE POLICY "Authenticated users can view companies"
ON public.companies
FOR SELECT
USING (auth.role() = 'authenticated');

-- Add company_id and requires_geofence to profiles
ALTER TABLE public.profiles 
ADD COLUMN company_id UUID REFERENCES public.companies(id),
ADD COLUMN requires_geofence BOOLEAN NOT NULL DEFAULT TRUE;

-- Create trigger for updated_at
CREATE TRIGGER update_companies_updated_at
BEFORE UPDATE ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default company
INSERT INTO public.companies (name, office_latitude, office_longitude, radius_meters, work_start_time)
VALUES ('Default Company', NULL, NULL, 100, '08:00');