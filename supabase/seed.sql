-- ============================================================
-- GEOATTEND - SEED DATA SCRIPT
-- ============================================================
-- Jalankan script ini di Supabase SQL Editor setelah migrasi
-- untuk mengisi data awal yang diperlukan sistem
-- ============================================================

-- ============================================================
-- 1. COMPANIES (PERUSAHAAN) - WAJIB MINIMAL 1
-- ============================================================
-- Ubah data berikut sesuai dengan perusahaan Anda

INSERT INTO companies (
  id,
  name,
  office_latitude,
  office_longitude,
  radius_meters,
  work_start_time,
  grace_period_minutes,
  annual_leave_quota,
  overtime_rate_per_hour,
  overtime_start_after_minutes,
  early_leave_deduction_per_minute
) VALUES (
  '6fbcdc6b-7558-45a8-8031-70a0eb46bda2',  -- ID tetap untuk referensi
  'Default Company',                         -- Ganti dengan nama perusahaan Anda
  -6.200000,                                 -- Latitude kantor (contoh: Jakarta Pusat)
  106.816666,                                -- Longitude kantor
  100,                                       -- Radius geofence (meter)
  '08:00:00',                                -- Jam mulai kerja
  15,                                        -- Grace period keterlambatan (menit)
  12,                                        -- Kuota cuti tahunan (hari)
  0,                                         -- Rate lembur per jam (Rp)
  0,                                         -- Lembur dimulai setelah X menit dari jam pulang
  0                                          -- Potongan pulang awal per menit (Rp)
) ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  office_latitude = EXCLUDED.office_latitude,
  office_longitude = EXCLUDED.office_longitude;

-- ============================================================
-- 2. SHIFTS (JADWAL KERJA) - WAJIB MINIMAL 1
-- ============================================================
-- Tambah/ubah shift sesuai kebutuhan perusahaan

-- Shift Regular (Senin-Jumat, 08:00-17:00)
INSERT INTO shifts (name, start_time, end_time, working_days, break_duration_minutes, is_active)
VALUES ('Regular', '08:00:00', '17:00:00', ARRAY[1,2,3,4,5], 60, true)
ON CONFLICT DO NOTHING;

-- Shift Pagi (Senin-Sabtu, 06:00-14:00)
INSERT INTO shifts (name, start_time, end_time, working_days, break_duration_minutes, is_active)
VALUES ('Shift Pagi', '06:00:00', '14:00:00', ARRAY[1,2,3,4,5,6], 60, true)
ON CONFLICT DO NOTHING;

-- Shift Siang (Senin-Sabtu, 14:00-22:00)
INSERT INTO shifts (name, start_time, end_time, working_days, break_duration_minutes, is_active)
VALUES ('Shift Siang', '14:00:00', '22:00:00', ARRAY[1,2,3,4,5,6], 60, true)
ON CONFLICT DO NOTHING;

-- Shift Malam (Senin-Jumat, 22:00-06:00)
INSERT INTO shifts (name, start_time, end_time, working_days, break_duration_minutes, is_active)
VALUES ('Shift Malam', '22:00:00', '06:00:00', ARRAY[1,2,3,4,5], 60, true)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 3. HOLIDAYS (HARI LIBUR) - OPSIONAL
-- ============================================================
-- Tambahkan hari libur nasional dan perusahaan

-- Hari Libur Nasional 2025
INSERT INTO holidays (name, date, end_date, description, is_active) VALUES
('Tahun Baru 2025', '2025-01-01', NULL, 'Tahun Baru Masehi', true),
('Isra Miraj', '2025-01-27', NULL, 'Isra Miraj Nabi Muhammad SAW', true),
('Imlek', '2025-01-29', NULL, 'Tahun Baru Imlek', true),
('Hari Raya Nyepi', '2025-03-29', NULL, 'Tahun Baru Saka', true),
('Hari Raya Idul Fitri', '2025-03-30', '2025-03-31', 'Hari Raya Idul Fitri 1446 H', true),
('Wafat Isa Almasih', '2025-04-18', NULL, 'Jumat Agung', true),
('Hari Buruh', '2025-05-01', NULL, 'Hari Buruh Internasional', true),
('Kenaikan Isa Almasih', '2025-05-29', NULL, 'Kenaikan Isa Almasih', true),
('Hari Lahir Pancasila', '2025-06-01', NULL, 'Hari Lahir Pancasila', true),
('Hari Raya Idul Adha', '2025-06-06', NULL, 'Hari Raya Idul Adha 1446 H', true),
('Tahun Baru Islam', '2025-06-27', NULL, 'Tahun Baru Islam 1447 H', true),
('Hari Kemerdekaan RI', '2025-08-17', NULL, 'HUT Kemerdekaan RI ke-80', true),
('Maulid Nabi Muhammad', '2025-09-05', NULL, 'Maulid Nabi Muhammad SAW', true),
('Hari Natal', '2025-12-25', NULL, 'Hari Raya Natal', true)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 4. LOCATIONS (LOKASI KERJA) - OPSIONAL
-- ============================================================
-- Untuk karyawan lapangan yang bekerja di beberapa lokasi
-- Tambahkan sesuai kebutuhan

-- Contoh lokasi (hapus atau ubah sesuai kebutuhan)
INSERT INTO locations (name, address, latitude, longitude, radius_meters, is_active) VALUES
('Kantor Pusat', 'Jl. Sudirman No. 1, Jakarta Pusat', -6.200000, 106.816666, 100, true)
ON CONFLICT DO NOTHING;

-- Tambahkan lokasi lain jika diperlukan:
-- INSERT INTO locations (name, address, latitude, longitude, radius_meters, is_active) VALUES
-- ('Cabang Bandung', 'Jl. Asia Afrika No. 5, Bandung', -6.921000, 107.607000, 100, true),
-- ('Gudang Cikarang', 'Jl. Industri Raya, Cikarang', -6.310000, 107.140000, 150, true);

-- ============================================================
-- 5. VERIFIKASI DATA
-- ============================================================
-- Jalankan query berikut untuk memastikan data sudah masuk

-- Cek companies
SELECT 'COMPANIES' as table_name, count(*) as total FROM companies;

-- Cek shifts
SELECT 'SHIFTS' as table_name, count(*) as total FROM shifts WHERE is_active = true;

-- Cek holidays
SELECT 'HOLIDAYS' as table_name, count(*) as total FROM holidays WHERE is_active = true;

-- Cek locations
SELECT 'LOCATIONS' as table_name, count(*) as total FROM locations WHERE is_active = true;

-- ============================================================
-- SELESAI!
-- ============================================================
-- 
-- LANGKAH SELANJUTNYA:
-- 
-- 1. Buat user Developer/Super Admin pertama:
--    - Buka Supabase Dashboard → Authentication → Users
--    - Klik "Add User"
--    - Email: admin@internal.local (atau email valid)
--    - Password: (password yang aman)
--    - Centang "Auto Confirm User"
--    - Klik "Create User"
-- 
-- 2. Jalankan script di bawah ini setelah user dibuat:
--    (Ganti 'USER_ID_ANDA' dengan UUID user yang baru dibuat)
-- 
-- ============================================================
