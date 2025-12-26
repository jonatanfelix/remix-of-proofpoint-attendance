-- Create audit_logs table for immutable audit trail
CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  user_id UUID NOT NULL,
  user_email TEXT,
  user_role TEXT,
  company_id UUID,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  details JSONB,
  ip_address TEXT,
  user_agent TEXT
);

-- Enable RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Audit logs are immutable - no updates or deletes allowed
-- Only insert by authenticated users
CREATE POLICY "Authenticated users can insert audit logs"
ON public.audit_logs
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Admins and developers can view audit logs for their company
CREATE POLICY "Admins can view company audit logs"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  AND company_id = get_user_company_id(auth.uid())
);

CREATE POLICY "Developers can view all audit logs"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'developer'::app_role));

-- Create index for faster queries
CREATE INDEX idx_audit_logs_company_id ON public.audit_logs(company_id);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs(user_id);

-- Function to log audit events (can be called from edge functions or triggers)
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