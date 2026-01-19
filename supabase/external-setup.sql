-- ============================================
-- GEOATTEND - COMPLETE DATABASE SETUP
-- For Self-Hosted Supabase VPS Deployment
-- ============================================
-- 
-- INSTRUCTIONS:
-- 1. Run this SQL in your Supabase SQL Editor
-- 2. Run in order (don't skip sections)
-- 3. Create first user, then run Section 20 to make admin
--
-- ============================================

-- ============================================
-- SECTION 1: EXTENSIONS
-- ============================================
-- Enable PostGIS for GPS/Location features (optional but recommended)
-- Note: PostGIS might already be enabled on your Supabase instance
CREATE EXTENSION IF NOT EXISTS postgis;

-- UUID extension (usually already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- SECTION 2: ENUMS
-- ============================================
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'employee', 'developer');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'employee_type') THEN
    CREATE TYPE public.employee_type AS ENUM ('office', 'field');
  END IF;
END $$;

-- ============================================
-- SECTION 3: TABLES
-- ============================================

-- Companies Table (Company Settings)
CREATE TABLE IF NOT EXISTS public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  -- Office Location (for geofencing)
  office_latitude NUMERIC,
  office_longitude NUMERIC,
  radius_meters INTEGER NOT NULL DEFAULT 100,
  -- Work Hours
  work_start_time TIME WITHOUT TIME ZONE NOT NULL DEFAULT '08:00:00',
  standard_work_hours INTEGER DEFAULT 8,
  grace_period_minutes INTEGER NOT NULL DEFAULT 0,
  -- Leave Settings
  annual_leave_quota INTEGER NOT NULL DEFAULT 12,
  -- Overtime Settings
  overtime_rate_per_hour INTEGER NOT NULL DEFAULT 0,
  overtime_start_after_minutes INTEGER NOT NULL DEFAULT 0,
  -- Penalty Settings
  early_leave_deduction_per_minute INTEGER NOT NULL DEFAULT 0,
  late_penalty_per_minute NUMERIC DEFAULT 1000,
  -- Tax & BPJS Settings (Indonesia)
  use_pph21_calculation BOOLEAN DEFAULT false,
  ptkp_status_default TEXT DEFAULT 'TK/0',
  bpjs_kesehatan_employer_rate NUMERIC DEFAULT 4.0,
  bpjs_kesehatan_employee_rate NUMERIC DEFAULT 1.0,
  bpjs_tk_jht_employer_rate NUMERIC DEFAULT 3.7,
  bpjs_tk_jht_employee_rate NUMERIC DEFAULT 2.0,
  bpjs_tk_jp_employer_rate NUMERIC DEFAULT 2.0,
  bpjs_tk_jp_employee_rate NUMERIC DEFAULT 1.0,
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Shifts Table (Work Schedules)
CREATE TABLE IF NOT EXISTS public.shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  start_time TIME WITHOUT TIME ZONE NOT NULL,
  end_time TIME WITHOUT TIME ZONE NOT NULL,
  break_duration_minutes INTEGER NOT NULL DEFAULT 60,
  -- working_days: 0=Sunday, 1=Monday, ..., 6=Saturday
  working_days INTEGER[] NOT NULL DEFAULT ARRAY[1, 2, 3, 4, 5],
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- User Roles Table (CRITICAL: Roles must be separate for security)
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  role public.app_role NOT NULL DEFAULT 'employee',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Profiles Table (User Data)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  username TEXT UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  avatar_url TEXT,
  department TEXT,
  job_title TEXT,
  -- Company & Shift Assignment
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  shift_id UUID REFERENCES public.shifts(id) ON DELETE SET NULL,
  -- Employee Type: 'office' = wajib geofence, 'field' = bebas lokasi
  employee_type public.employee_type NOT NULL DEFAULT 'office',
  requires_geofence BOOLEAN NOT NULL DEFAULT true,
  -- Attendance Settings
  attendance_required BOOLEAN NOT NULL DEFAULT true, -- false = tidak wajib absen (admin/owner)
  -- Salary Settings
  salary_type TEXT DEFAULT 'monthly', -- 'monthly' atau 'daily'
  base_salary NUMERIC DEFAULT 0,
  -- Leave Balance
  leave_balance INTEGER NOT NULL DEFAULT 12,
  -- Role (for display, actual role in user_roles table)
  role public.app_role NOT NULL DEFAULT 'employee',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Locations Table (Additional Work Locations)
CREATE TABLE IF NOT EXISTS public.locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  latitude NUMERIC NOT NULL,
  longitude NUMERIC NOT NULL,
  radius_meters INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Attendance Records Table (Log Absensi)
CREATE TABLE IF NOT EXISTS public.attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  -- record_type: 'clock_in', 'clock_out', 'break_out', 'break_in'
  record_type TEXT NOT NULL,
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  -- GPS Coordinates
  latitude NUMERIC NOT NULL,
  longitude NUMERIC NOT NULL,
  accuracy_meters NUMERIC,
  -- Optional: Link to specific location
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  -- Photo URL from Storage
  photo_url TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Holidays Table
CREATE TABLE IF NOT EXISTS public.holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  date DATE NOT NULL,
  end_date DATE, -- For multi-day holidays
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Leave Requests Table
CREATE TABLE IF NOT EXISTS public.leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  leave_type TEXT NOT NULL, -- 'annual', 'sick', 'permit', etc.
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  -- Proof document from Storage
  proof_url TEXT,
  -- Status: 'pending', 'approved', 'rejected'
  status TEXT NOT NULL DEFAULT 'pending',
  review_notes TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Audit Logs Table
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  user_email TEXT,
  user_role TEXT,
  company_id UUID,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  details JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ============================================
-- SECTION 4: INDEXES (Performance)
-- ============================================

-- Attendance queries by user and date
CREATE INDEX IF NOT EXISTS idx_attendance_user_date 
  ON public.attendance_records(user_id, recorded_at DESC);

-- Attendance queries by date range
CREATE INDEX IF NOT EXISTS idx_attendance_recorded_at 
  ON public.attendance_records(recorded_at DESC);

-- Profile lookups by company
CREATE INDEX IF NOT EXISTS idx_profiles_company 
  ON public.profiles(company_id);

-- Profile lookups by username (for login)
CREATE INDEX IF NOT EXISTS idx_profiles_username 
  ON public.profiles(LOWER(username));

-- Leave requests by user
CREATE INDEX IF NOT EXISTS idx_leave_requests_user 
  ON public.leave_requests(user_id, start_date DESC);

-- ============================================
-- SECTION 5: SECURITY DEFINER FUNCTIONS
-- ============================================

-- Get user role function
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id LIMIT 1
$$;

-- Has role function (check if user has specific role)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Is admin or developer function
CREATE OR REPLACE FUNCTION public.is_admin_or_developer(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'developer')
  )
$$;

-- Is developer function
CREATE OR REPLACE FUNCTION public.is_developer(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'developer'
  )
$$;

-- Get user company ID function
CREATE OR REPLACE FUNCTION public.get_user_company_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.profiles WHERE user_id = _user_id LIMIT 1
$$;

-- Get email by username (for login with username)
CREATE OR REPLACE FUNCTION public.get_email_by_username(p_username TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
BEGIN
  SELECT email INTO v_email
  FROM public.profiles
  WHERE LOWER(username) = LOWER(TRIM(p_username))
  AND is_active = true
  LIMIT 1;
  
  RETURN v_email;
END;
$$;

-- Update updated_at column function (for triggers)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Handle new user function (auto create profile on signup)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_default_company_id UUID;
BEGIN
  -- Get default company
  SELECT id INTO v_default_company_id FROM public.companies LIMIT 1;
  
  -- Insert into profiles
  INSERT INTO public.profiles (user_id, full_name, email, company_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
    NEW.email,
    v_default_company_id
  )
  ON CONFLICT (user_id) DO NOTHING;
  
  -- Insert default role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'employee')
  ON CONFLICT (user_id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- Log audit event function
CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_user_id UUID,
  p_user_email TEXT,
  p_user_role TEXT,
  p_company_id UUID,
  p_action TEXT,
  p_resource_type TEXT,
  p_resource_id TEXT DEFAULT NULL,
  p_details JSONB DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO public.audit_logs (
    user_id, user_email, user_role, company_id,
    action, resource_type, resource_id, details,
    ip_address, user_agent
  ) VALUES (
    p_user_id, p_user_email, p_user_role, p_company_id,
    p_action, p_resource_type, p_resource_id, p_details,
    p_ip_address, p_user_agent
  ) RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;

-- ============================================
-- SECTION 6: TRIGGERS
-- ============================================

-- Drop existing triggers first (to avoid errors on re-run)
DROP TRIGGER IF EXISTS update_companies_updated_at ON public.companies;
DROP TRIGGER IF EXISTS update_shifts_updated_at ON public.shifts;
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
DROP TRIGGER IF EXISTS update_locations_updated_at ON public.locations;
DROP TRIGGER IF EXISTS update_holidays_updated_at ON public.holidays;
DROP TRIGGER IF EXISTS update_leave_requests_updated_at ON public.leave_requests;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Auto update updated_at triggers
CREATE TRIGGER update_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_shifts_updated_at
  BEFORE UPDATE ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_locations_updated_at
  BEFORE UPDATE ON public.locations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_holidays_updated_at
  BEFORE UPDATE ON public.holidays
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_leave_requests_updated_at
  BEFORE UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto create profile on user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- SECTION 7: ENABLE ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================
-- SECTION 8: RLS POLICIES - COMPANIES
-- ============================================

DROP POLICY IF EXISTS "Users can view their company" ON public.companies;
DROP POLICY IF EXISTS "Admins can manage their company" ON public.companies;
DROP POLICY IF EXISTS "Developers can manage all companies" ON public.companies;

CREATE POLICY "Users can view their company"
  ON public.companies FOR SELECT
  USING (id = get_user_company_id(auth.uid()));

CREATE POLICY "Admins can manage their company"
  ON public.companies FOR ALL
  USING (has_role(auth.uid(), 'admin') AND id = get_user_company_id(auth.uid()));

CREATE POLICY "Developers can manage all companies"
  ON public.companies FOR ALL
  USING (has_role(auth.uid(), 'developer'));

-- ============================================
-- SECTION 9: RLS POLICIES - SHIFTS
-- ============================================

DROP POLICY IF EXISTS "Authenticated users can view active shifts" ON public.shifts;
DROP POLICY IF EXISTS "Admins can manage shifts" ON public.shifts;
DROP POLICY IF EXISTS "Developers can manage all shifts" ON public.shifts;

CREATE POLICY "Authenticated users can view active shifts"
  ON public.shifts FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage shifts"
  ON public.shifts FOR ALL
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Developers can manage all shifts"
  ON public.shifts FOR ALL
  USING (has_role(auth.uid(), 'developer'));

-- ============================================
-- SECTION 10: RLS POLICIES - USER_ROLES
-- ============================================

DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Developers can manage all roles" ON public.user_roles;

CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles"
  ON public.user_roles FOR ALL
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Developers can manage all roles"
  ON public.user_roles FOR ALL
  USING (has_role(auth.uid(), 'developer'));

-- ============================================
-- SECTION 11: RLS POLICIES - PROFILES
-- ============================================

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view company profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update company profiles" ON public.profiles;
DROP POLICY IF EXISTS "Developers can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Developers can manage all profiles" ON public.profiles;

CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view company profiles"
  ON public.profiles FOR SELECT
  USING (has_role(auth.uid(), 'admin') AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Admins can update company profiles"
  ON public.profiles FOR UPDATE
  USING (has_role(auth.uid(), 'admin') AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Developers can view all profiles"
  ON public.profiles FOR SELECT
  USING (has_role(auth.uid(), 'developer'));

CREATE POLICY "Developers can manage all profiles"
  ON public.profiles FOR ALL
  USING (has_role(auth.uid(), 'developer'));

-- ============================================
-- SECTION 12: RLS POLICIES - LOCATIONS
-- ============================================

DROP POLICY IF EXISTS "Authenticated users can view active locations" ON public.locations;
DROP POLICY IF EXISTS "Admins can manage locations" ON public.locations;
DROP POLICY IF EXISTS "Developers can manage locations" ON public.locations;

CREATE POLICY "Authenticated users can view active locations"
  ON public.locations FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage locations"
  ON public.locations FOR ALL
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Developers can manage locations"
  ON public.locations FOR ALL
  USING (has_role(auth.uid(), 'developer'));

-- ============================================
-- SECTION 13: RLS POLICIES - ATTENDANCE_RECORDS
-- ============================================

DROP POLICY IF EXISTS "Users can view their own attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "Users can insert their own attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "Admins can view company attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "Developers can view all attendance" ON public.attendance_records;

CREATE POLICY "Users can view their own attendance"
  ON public.attendance_records FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own attendance"
  ON public.attendance_records FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view company attendance"
  ON public.attendance_records FOR SELECT
  USING (
    has_role(auth.uid(), 'admin') AND 
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.user_id = attendance_records.user_id 
      AND p.company_id = get_user_company_id(auth.uid())
    )
  );

CREATE POLICY "Developers can view all attendance"
  ON public.attendance_records FOR SELECT
  USING (has_role(auth.uid(), 'developer'));

-- ============================================
-- SECTION 14: RLS POLICIES - HOLIDAYS
-- ============================================

DROP POLICY IF EXISTS "Authenticated users can view active holidays" ON public.holidays;
DROP POLICY IF EXISTS "Admins can manage holidays" ON public.holidays;
DROP POLICY IF EXISTS "Developers can manage all holidays" ON public.holidays;

CREATE POLICY "Authenticated users can view active holidays"
  ON public.holidays FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage holidays"
  ON public.holidays FOR ALL
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Developers can manage all holidays"
  ON public.holidays FOR ALL
  USING (has_role(auth.uid(), 'developer'));

-- ============================================
-- SECTION 15: RLS POLICIES - LEAVE_REQUESTS
-- ============================================

DROP POLICY IF EXISTS "Users can view their own leave requests" ON public.leave_requests;
DROP POLICY IF EXISTS "Users can insert their own leave requests" ON public.leave_requests;
DROP POLICY IF EXISTS "Admins can view all leave requests in company" ON public.leave_requests;
DROP POLICY IF EXISTS "Admins can update leave requests in company" ON public.leave_requests;
DROP POLICY IF EXISTS "Developers can view all leave requests" ON public.leave_requests;
DROP POLICY IF EXISTS "Developers can update all leave requests" ON public.leave_requests;

CREATE POLICY "Users can view their own leave requests"
  ON public.leave_requests FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own leave requests"
  ON public.leave_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all leave requests in company"
  ON public.leave_requests FOR SELECT
  USING (
    has_role(auth.uid(), 'admin') AND 
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.user_id = leave_requests.user_id 
      AND p.company_id = get_user_company_id(auth.uid())
    )
  );

CREATE POLICY "Admins can update leave requests in company"
  ON public.leave_requests FOR UPDATE
  USING (
    has_role(auth.uid(), 'admin') AND 
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.user_id = leave_requests.user_id 
      AND p.company_id = get_user_company_id(auth.uid())
    )
  );

CREATE POLICY "Developers can view all leave requests"
  ON public.leave_requests FOR SELECT
  USING (has_role(auth.uid(), 'developer'));

CREATE POLICY "Developers can update all leave requests"
  ON public.leave_requests FOR UPDATE
  USING (has_role(auth.uid(), 'developer'));

-- ============================================
-- SECTION 16: RLS POLICIES - AUDIT_LOGS
-- ============================================

DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Admins can view company audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Developers can view all audit logs" ON public.audit_logs;

CREATE POLICY "Authenticated users can insert audit logs"
  ON public.audit_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view company audit logs"
  ON public.audit_logs FOR SELECT
  USING (has_role(auth.uid(), 'admin') AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Developers can view all audit logs"
  ON public.audit_logs FOR SELECT
  USING (has_role(auth.uid(), 'developer'));

-- ============================================
-- SECTION 17: STORAGE BUCKETS
-- ============================================

-- Create storage buckets (with settings)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) 
VALUES (
  'attendance-photos', 
  'attendance-photos', 
  true,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) 
VALUES (
  'avatars', 
  'avatars', 
  true,
  2097152, -- 2MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 2097152,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) 
VALUES (
  'leave-proofs', 
  'leave-proofs', 
  true,
  10485760, -- 10MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];

-- ============================================
-- SECTION 18: STORAGE POLICIES - ATTENDANCE-PHOTOS
-- ============================================

-- Drop existing policies first
DROP POLICY IF EXISTS "Public can view attendance photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload attendance photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own attendance photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own attendance photos" ON storage.objects;

CREATE POLICY "Public can view attendance photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'attendance-photos');

CREATE POLICY "Authenticated users can upload attendance photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'attendance-photos' AND auth.role() = 'authenticated');

CREATE POLICY "Users can update their own attendance photos"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'attendance-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own attendance photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'attendance-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================
-- SECTION 19: STORAGE POLICIES - AVATARS
-- ============================================

DROP POLICY IF EXISTS "Public can view avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;

CREATE POLICY "Public can view avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Authenticated users can upload avatars"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.role() = 'authenticated');

CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own avatar"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================
-- SECTION 20: STORAGE POLICIES - LEAVE-PROOFS
-- ============================================

DROP POLICY IF EXISTS "Public can view leave proofs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload leave proofs" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own leave proofs" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own leave proofs" ON storage.objects;

CREATE POLICY "Public can view leave proofs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'leave-proofs');

CREATE POLICY "Authenticated users can upload leave proofs"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'leave-proofs' AND auth.role() = 'authenticated');

CREATE POLICY "Users can update their own leave proofs"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'leave-proofs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own leave proofs"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'leave-proofs' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================
-- SECTION 21: INITIAL SEED DATA
-- ============================================

-- Insert default company (WAJIB - agar app tidak error saat load settings)
INSERT INTO public.companies (
  id, 
  name, 
  office_latitude, 
  office_longitude, 
  radius_meters, 
  work_start_time, 
  grace_period_minutes,
  standard_work_hours
)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'PT. GeoAttend Indonesia',
  -6.200000,    -- Jakarta latitude
  106.816666,   -- Jakarta longitude
  100,          -- 100 meter radius
  '08:00:00',   -- Jam masuk 08:00
  15,           -- Grace period 15 menit
  8             -- 8 jam kerja
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name;

-- Insert default shifts
INSERT INTO public.shifts (name, start_time, end_time, working_days) VALUES
  ('Shift Pagi', '08:00:00', '17:00:00', ARRAY[1, 2, 3, 4, 5]),
  ('Shift Siang', '14:00:00', '22:00:00', ARRAY[1, 2, 3, 4, 5]),
  ('Shift Malam', '22:00:00', '06:00:00', ARRAY[1, 2, 3, 4, 5])
ON CONFLICT DO NOTHING;

-- Insert 2025 Indonesian holidays
INSERT INTO public.holidays (name, date, description) VALUES
  ('Tahun Baru 2025', '2025-01-01', 'Hari libur nasional'),
  ('Imlek', '2025-01-29', 'Tahun Baru Imlek 2576'),
  ('Isra Miraj', '2025-01-27', 'Isra Miraj Nabi Muhammad SAW'),
  ('Hari Raya Nyepi', '2025-03-29', 'Tahun Baru Saka 1947'),
  ('Wafat Isa Almasih', '2025-04-18', 'Jumat Agung'),
  ('Idul Fitri', '2025-03-30', 'Hari Raya Idul Fitri 1446 H'),
  ('Cuti Bersama Idul Fitri', '2025-03-31', 'Cuti bersama'),
  ('Hari Buruh', '2025-05-01', 'Hari Buruh Internasional'),
  ('Kenaikan Isa Almasih', '2025-05-29', 'Kenaikan Yesus Kristus'),
  ('Hari Lahir Pancasila', '2025-06-01', 'Hari Lahir Pancasila'),
  ('Idul Adha', '2025-06-07', 'Hari Raya Idul Adha 1446 H'),
  ('Tahun Baru Islam', '2025-06-27', 'Tahun Baru Hijriyah 1447 H'),
  ('Hari Kemerdekaan', '2025-08-17', 'HUT RI ke-80'),
  ('Maulid Nabi', '2025-09-05', 'Maulid Nabi Muhammad SAW'),
  ('Hari Natal', '2025-12-25', 'Hari Natal')
ON CONFLICT DO NOTHING;

-- Insert default location (optional)
INSERT INTO public.locations (name, address, latitude, longitude, radius_meters)
VALUES (
  'Kantor Pusat',
  'Jakarta, Indonesia',
  -6.200000,
  106.816666,
  100
)
ON CONFLICT DO NOTHING;

-- ============================================
-- SECTION 22: CREATE FIRST ADMIN USER
-- ============================================

/*
LANGKAH-LANGKAH MEMBUAT ADMIN PERTAMA:

1. Buat user baru via Supabase Auth Dashboard:
   - Pergi ke Authentication > Users
   - Klik "Add User"
   - Isi email dan password
   - Klik "Create User"

2. Catat user_id yang baru dibuat (lihat di kolom UID)

3. Jalankan SQL berikut (ganti YOUR_USER_ID_HERE):

-- Ganti role jadi developer
UPDATE public.user_roles 
SET role = 'developer' 
WHERE user_id = 'YOUR_USER_ID_HERE';

-- Update profile
UPDATE public.profiles 
SET 
  role = 'developer',
  username = 'admin',
  full_name = 'Super Admin',
  attendance_required = false,
  company_id = 'a0000000-0000-0000-0000-000000000001'
WHERE user_id = 'YOUR_USER_ID_HERE';

-- Jika user_roles belum ada row-nya, insert:
INSERT INTO public.user_roles (user_id, role)
VALUES ('YOUR_USER_ID_HERE', 'developer')
ON CONFLICT (user_id) DO UPDATE SET role = 'developer';

*/

-- ============================================
-- SECTION 23: VERIFICATION QUERIES
-- ============================================

-- Jalankan query ini untuk verifikasi setup berhasil:

/*
-- Check tables created
SELECT tablename FROM pg_tables WHERE schemaname = 'public';

-- Check company exists
SELECT * FROM public.companies;

-- Check shifts exist
SELECT * FROM public.shifts WHERE is_active = true;

-- Check holidays exist
SELECT COUNT(*) as total_holidays FROM public.holidays WHERE is_active = true;

-- Check storage buckets
SELECT id, name, public, file_size_limit FROM storage.buckets;

-- Check RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND rowsecurity = true;
*/

-- ============================================
-- SETUP COMPLETE!
-- ============================================
-- 
-- Environment Variables untuk App:
-- VITE_SUPABASE_URL=https://[project-ref].supabase.co
-- VITE_SUPABASE_PUBLISHABLE_KEY=[anon-key]
--
-- Untuk Edge Functions:
-- SUPABASE_URL=https://[project-ref].supabase.co
-- SUPABASE_SERVICE_ROLE_KEY=[service-role-key]
--
-- ============================================
