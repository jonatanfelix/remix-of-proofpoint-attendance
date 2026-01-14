-- Allow anonymous users to lookup email by username for login purposes
-- This is secure because it only allows SELECT on email column via username lookup
CREATE POLICY "Allow anonymous login lookup by username" 
ON public.profiles 
FOR SELECT 
USING (true);

-- Note: The above policy is too permissive, let's drop it and create a more secure approach
-- using a database function instead

DROP POLICY IF EXISTS "Allow anonymous login lookup by username" ON public.profiles;

-- Create a secure function that only returns email for a given username
-- This bypasses RLS by using SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.get_email_by_username(p_username text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  SELECT email INTO v_email
  FROM public.profiles
  WHERE LOWER(username) = LOWER(TRIM(p_username))
  AND is_active = true
  LIMIT 1;
  
  RETURN v_email;
END;
$$;