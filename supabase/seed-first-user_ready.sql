-- ============================================================
-- GEOATTEND - SETUP USER DEVELOPER PERTAMA (READY)
-- ============================================================

DO $$
DECLARE
  v_user_id UUID := '61730cd4-6510-4f02-9686-afd811120323';
  v_company_id UUID := '6fbcdc6b-7558-45a8-8031-70a0eb46bda2';
  v_shift_id UUID;
BEGIN
  -- Ambil shift Regular pertama
  SELECT id INTO v_shift_id FROM shifts WHERE name = 'Regular' AND is_active = true LIMIT 1;
  
  -- Update role menjadi developer
  UPDATE user_roles 
  SET role = 'developer' 
  WHERE user_id = v_user_id;
  
  -- Jika belum ada record di user_roles, insert
  IF NOT FOUND THEN
    INSERT INTO user_roles (user_id, role) VALUES (v_user_id, 'developer');
  END IF;
  
  -- Update profile
  UPDATE profiles 
  SET 
    company_id = v_company_id,
    username = 'superadmin',
    role = 'developer',
    full_name = COALESCE(full_name, 'Super Admin'),
    job_title = 'System Administrator',
    department = 'IT',
    shift_id = v_shift_id,
    is_active = true,
    requires_geofence = false,
    employee_type = 'office'
  WHERE user_id = v_user_id;
  
  RAISE NOTICE 'SUCCESS: User Developer berhasil dikonfigurasi!';
END $$;
