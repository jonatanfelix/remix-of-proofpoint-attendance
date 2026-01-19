-- ============================================
-- GEOATTEND - COMPLETE DATABASE SETUP
-- For External Supabase Deployment
-- ============================================
-- Run this SQL in your Supabase SQL Editor
-- Make sure to run in order (don't skip sections)
-- ============================================

-- ============================================
-- SECTION 1: ENUMS
-- ============================================

CREATE TYPE public.app_role AS ENUM ('admin', 'employee', 'developer');
CREATE TYPE public.employee_type AS ENUM ('office', 'field');

-- ============================================
-- SECTION 2: TABLES
-- ============================================

-- Companies Table
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  office_latitude NUMERIC,
  office_longitude NUMERIC,
  radius_meters INTEGER NOT NULL DEFAULT 100,
  work_start_time TIME WITHOUT TIME ZONE NOT NULL DEFAULT '08:00:00',
  grace_period_minutes INTEGER NOT NULL DEFAULT 0,
  annual_leave_quota INTEGER NOT NULL DEFAULT 12,
  overtime_rate_per_hour INTEGER NOT NULL DEFAULT 0,
  overtime_start_after_minutes INTEGER NOT NULL DEFAULT 0,
  early_leave_deduction_per_minute INTEGER NOT NULL DEFAULT 0,
  late_penalty_per_minute NUMERIC DEFAULT 1000,
  standard_work_hours INTEGER DEFAULT 8,
  use_pph21_calculation BOOLEAN DEFAULT false,
  ptkp_status_default TEXT DEFAULT 'TK/0',
  bpjs_kesehatan_employer_rate NUMERIC DEFAULT 4.0,
  bpjs_kesehatan_employee_rate NUMERIC DEFAULT 1.0,
  bpjs_tk_jht_employer_rate NUMERIC DEFAULT 3.7,
  bpjs_tk_jht_employee_rate NUMERIC DEFAULT 2.0,
  bpjs_tk_jp_employer_rate NUMERIC DEFAULT 2.0,
  bpjs_tk_jp_employee_rate NUMERIC DEFAULT 1.0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Shifts Table
CREATE TABLE public.shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  start_time TIME WITHOUT TIME ZONE NOT NULL,
  end_time TIME WITHOUT TIME ZONE NOT NULL,
  break_duration_minutes INTEGER NOT NULL DEFAULT 60,
  working_days INTEGER[] NOT NULL DEFAULT ARRAY[1, 2, 3, 4, 5],
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- User Roles Table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role public.app_role NOT NULL DEFAULT 'employee',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Profiles Table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  username TEXT UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  avatar_url TEXT,
  department TEXT,
  job_title TEXT,
  company_id UUID REFERENCES public.companies(id),
  shift_id UUID REFERENCES public.shifts(id),
  employee_type public.employee_type NOT NULL DEFAULT 'office',
  requires_geofence BOOLEAN NOT NULL DEFAULT true,
  leave_balance INTEGER NOT NULL DEFAULT 12,
  role public.app_role NOT NULL DEFAULT 'employee',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Locations Table
CREATE TABLE public.locations (
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

-- Attendance Records Table
CREATE TABLE public.attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  record_type TEXT NOT NULL,
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  latitude NUMERIC NOT NULL,
  longitude NUMERIC NOT NULL,
  accuracy_meters NUMERIC,
  location_id UUID REFERENCES public.locations(id),
  photo_url TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Holidays Table
CREATE TABLE public.holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  date DATE NOT NULL,
  end_date DATE,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Leave Requests Table
CREATE TABLE public.leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  leave_type TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  proof_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  review_notes TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Audit Logs Table
CREATE TABLE public.audit_logs (
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
-- SECTION 3: SECURITY DEFINER FUNCTIONS
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

-- Has role function
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

-- Get email by username (for login)
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

-- Update updated_at column function
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

-- Handle new user function (auto create profile)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert into profiles
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
    NEW.email
  );
  
  -- Insert default role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'employee');
  
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
-- SECTION 4: TRIGGERS
-- ============================================

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
-- SECTION 5: ENABLE ROW LEVEL SECURITY
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
-- SECTION 6: RLS POLICIES - COMPANIES
-- ============================================

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
-- SECTION 7: RLS POLICIES - SHIFTS
-- ============================================

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
-- SECTION 8: RLS POLICIES - USER_ROLES
-- ============================================

CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles"
  ON public.user_roles FOR ALL
  USING (has_role(auth.uid(), 'admin'));

-- ============================================
-- SECTION 9: RLS POLICIES - PROFILES
-- ============================================

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
-- SECTION 10: RLS POLICIES - LOCATIONS
-- ============================================

CREATE POLICY "Authenticated users can view active locations"
  ON public.locations FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage locations"
  ON public.locations FOR ALL
  USING (has_role(auth.uid(), 'admin'));

-- ============================================
-- SECTION 11: RLS POLICIES - ATTENDANCE_RECORDS
-- ============================================

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
-- SECTION 12: RLS POLICIES - HOLIDAYS
-- ============================================

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
-- SECTION 13: RLS POLICIES - LEAVE_REQUESTS
-- ============================================

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
-- SECTION 14: RLS POLICIES - AUDIT_LOGS
-- ============================================

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
-- SECTION 15: STORAGE BUCKETS
-- ============================================

-- Create storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('attendance-photos', 'attendance-photos', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('leave-proofs', 'leave-proofs', true);

-- ============================================
-- SECTION 16: STORAGE POLICIES - ATTENDANCE-PHOTOS
-- ============================================

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
-- SECTION 17: STORAGE POLICIES - AVATARS
-- ============================================

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
-- SECTION 18: STORAGE POLICIES - LEAVE-PROOFS
-- ============================================

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
-- SECTION 19: INITIAL SEED DATA (OPTIONAL)
-- ============================================

-- Insert default company
INSERT INTO public.companies (id, name, office_latitude, office_longitude, radius_meters, work_start_time, grace_period_minutes)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'PT. GeoAttend Indonesia',
  -6.200000,
  106.816666,
  100,
  '08:00:00',
  15
);

-- Insert default shifts
INSERT INTO public.shifts (name, start_time, end_time, working_days) VALUES
  ('Shift Pagi', '08:00:00', '17:00:00', ARRAY[1, 2, 3, 4, 5]),
  ('Shift Siang', '14:00:00', '22:00:00', ARRAY[1, 2, 3, 4, 5]),
  ('Shift Malam', '22:00:00', '06:00:00', ARRAY[1, 2, 3, 4, 5]);

-- Insert 2025 Indonesian holidays
INSERT INTO public.holidays (name, date, description) VALUES
  ('Tahun Baru 2025', '2025-01-01', 'Hari libur nasional'),
  ('Imlek', '2025-01-29', 'Tahun Baru Imlek 2576'),
  ('Isra Miraj', '2025-01-27', 'Isra Miraj Nabi Muhammad SAW'),
  ('Hari Raya Nyepi', '2025-03-29', 'Tahun Baru Saka 1947'),
  ('Wafat Isa Almasih', '2025-04-18', 'Jumat Agung'),
  ('Hari Buruh', '2025-05-01', 'Hari Buruh Internasional'),
  ('Kenaikan Isa Almasih', '2025-05-29', 'Kenaikan Yesus Kristus'),
  ('Hari Lahir Pancasila', '2025-06-01', 'Hari Lahir Pancasila'),
  ('Idul Adha', '2025-06-07', 'Hari Raya Idul Adha 1446 H'),
  ('Tahun Baru Islam', '2025-06-27', 'Tahun Baru Hijriyah 1447 H'),
  ('Hari Kemerdekaan', '2025-08-17', 'HUT RI ke-80'),
  ('Maulid Nabi', '2025-09-05', 'Maulid Nabi Muhammad SAW'),
  ('Hari Natal', '2025-12-25', 'Hari Natal');

-- ============================================
-- SECTION 20: CREATE FIRST ADMIN USER (MANUAL)
-- ============================================

-- After running this SQL, create your first user via Supabase Auth
-- Then run this to make them a developer:
/*
-- Replace 'YOUR_USER_ID_HERE' with actual user_id from auth.users

UPDATE public.user_roles 
SET role = 'developer' 
WHERE user_id = 'YOUR_USER_ID_HERE';

UPDATE public.profiles 
SET 
  role = 'developer',
  username = 'admin',
  company_id = 'a0000000-0000-0000-0000-000000000001'
WHERE user_id = 'YOUR_USER_ID_HERE';
*/

-- ============================================
-- SETUP COMPLETE!
-- ============================================
-- Next steps:
-- 1. Create a user via Supabase Auth Dashboard
-- 2. Run the SQL in Section 20 to make them admin
-- 3. Deploy your app to VPS with correct env vars:
--    VITE_SUPABASE_URL=https://[project].supabase.co
--    VITE_SUPABASE_PUBLISHABLE_KEY=[anon-key]
-- ============================================
