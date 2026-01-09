-- ============================================================
-- GEOATTEND - SETUP USER DEVELOPER PERTAMA
-- ============================================================
-- Jalankan script ini SETELAH membuat user di Authentication
-- ============================================================

-- INSTRUKSI:
-- 1. Buka Supabase Dashboard → Authentication → Users
-- 2. Klik "Add User"
-- 3. Masukkan:
--    - Email: admin@internal.local (atau email valid Anda)
--    - Password: (password yang aman, min 6 karakter)
--    - Centang "Auto Confirm User"
-- 4. Klik "Create User"
-- 5. Salin USER ID yang muncul
-- 6. Ganti 'GANTI_DENGAN_USER_ID' di bawah dengan UUID tersebut
-- 7. Jalankan script ini

-- ============================================================
-- GANTI USER_ID DI BAWAH INI!
-- ============================================================

DO $$
DECLARE
  v_user_id UUID := 'GANTI_DENGAN_USER_ID';  -- <-- GANTI INI!
  v_company_id UUID := '6fbcdc6b-7558-45a8-8031-70a0eb46bda2';
  v_shift_id UUID;
BEGIN
  -- Validasi: Pastikan user_id sudah diganti
  IF v_user_id = 'GANTI_DENGAN_USER_ID' THEN
    RAISE EXCEPTION 'ERROR: Anda belum mengganti USER_ID! Silakan ganti "GANTI_DENGAN_USER_ID" dengan UUID user yang sudah dibuat.';
  END IF;

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
  RAISE NOTICE 'Username: superadmin';
  RAISE NOTICE 'Role: developer';
  RAISE NOTICE 'Anda sekarang bisa login ke aplikasi.';
END $$;

-- ============================================================
-- VERIFIKASI
-- ============================================================
-- Jalankan query ini untuk memastikan user sudah dikonfigurasi

SELECT 
  p.username,
  p.full_name,
  p.email,
  ur.role as user_role,
  p.role as profile_role,
  c.name as company_name,
  s.name as shift_name,
  p.is_active
FROM profiles p
LEFT JOIN user_roles ur ON p.user_id = ur.user_id
LEFT JOIN companies c ON p.company_id = c.id
LEFT JOIN shifts s ON p.shift_id = s.id
WHERE ur.role = 'developer';

-- ============================================================
-- SELESAI!
-- ============================================================
-- 
-- Anda sekarang bisa:
-- 1. Login ke aplikasi dengan email/password yang sudah dibuat
-- 2. Akses semua fitur admin dan developer
-- 3. Menambahkan karyawan baru melalui menu Admin → Karyawan
-- 
-- CATATAN PENTING:
-- - Setelah ini, JANGAN buat user langsung di Supabase Auth
-- - Semua user baru harus dibuat melalui aplikasi (Admin → Karyawan)
-- - Ini memastikan username, company_id, dan data lain terisi otomatis
-- 
-- ============================================================
