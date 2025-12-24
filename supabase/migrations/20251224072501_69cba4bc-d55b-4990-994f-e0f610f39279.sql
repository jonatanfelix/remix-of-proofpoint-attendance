-- Create security definer function to get user's company_id without recursion
CREATE OR REPLACE FUNCTION public.get_user_company_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.profiles WHERE user_id = _user_id LIMIT 1
$$;

-- Drop problematic policies on profiles that cause recursion
DROP POLICY IF EXISTS "Admins can view company profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update company profiles" ON public.profiles;

-- Recreate admin policies using the security definer function
CREATE POLICY "Admins can view company profiles"
ON public.profiles FOR SELECT
USING (
  has_role(auth.uid(), 'admin') AND 
  company_id = get_user_company_id(auth.uid())
);

CREATE POLICY "Admins can update company profiles"
ON public.profiles FOR UPDATE
USING (
  has_role(auth.uid(), 'admin') AND 
  company_id = get_user_company_id(auth.uid())
);

-- Fix attendance_records policies
DROP POLICY IF EXISTS "Admins can view company attendance" ON public.attendance_records;

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

-- Fix leave_requests policies  
DROP POLICY IF EXISTS "Admins can view all leave requests in company" ON public.leave_requests;
DROP POLICY IF EXISTS "Admins can update leave requests in company" ON public.leave_requests;

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

-- Fix companies policies
DROP POLICY IF EXISTS "Users can view their company" ON public.companies;
DROP POLICY IF EXISTS "Admins can manage their company" ON public.companies;

CREATE POLICY "Users can view their company"
ON public.companies FOR SELECT
USING (id = get_user_company_id(auth.uid()));

CREATE POLICY "Admins can manage their company"
ON public.companies FOR ALL
USING (
  has_role(auth.uid(), 'admin') AND 
  id = get_user_company_id(auth.uid())
);