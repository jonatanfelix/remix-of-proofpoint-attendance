# Panduan Instalasi GeoAttend

Panduan lengkap untuk instalasi aplikasi GeoAttend di lingkungan lokal (development) dan VPS (production).

---

## 📋 Persyaratan Sistem

### Software yang Diperlukan

| Software | Versi Minimum | Keterangan |
|----------|---------------|------------|
| Node.js | 18.x atau lebih | Runtime JavaScript |
| npm / bun | npm 9.x / bun 1.x | Package manager |
| Git | 2.x | Version control |
| Supabase CLI | 1.x | Untuk local development (opsional) |

### Akun & Layanan

- **Supabase Project** - Database, Auth, Storage, Edge Functions
- **Resend Account** - Untuk pengiriman email (reset password)
- **Domain** (untuk production) - Opsional tapi disarankan

---

## 🖥️ Instalasi Lokal (Development)

### 1. Clone Repository

```bash
git clone <repository-url>
cd geoattend
```

### 2. Install Dependencies

```bash
# Menggunakan npm
npm install

# Atau menggunakan bun (lebih cepat)
bun install
```

### 3. Setup Environment Variables

Buat file `.env` di root project:

```env
# Supabase Configuration (dari Supabase Dashboard)
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_SUPABASE_PROJECT_ID=your-project-id
```

> ⚠️ **Catatan**: Nilai-nilai di atas adalah **publishable keys** yang aman untuk disimpan di frontend.

### 4. Setup Supabase

#### Opsi A: Menggunakan Supabase Cloud (Disarankan)

1. Buat project baru di [supabase.com](https://supabase.com)
2. Salin `Project URL` dan `anon/public key` ke file `.env`
3. Jalankan migrasi database (lihat bagian Database Setup)

#### Opsi B: Menggunakan Supabase Local

```bash
# Install Supabase CLI
npm install -g supabase

# Login ke Supabase
supabase login

# Start local Supabase
supabase start

# Akan menampilkan local credentials
```

### 5. Database Setup

#### Menjalankan Migrasi

Semua file migrasi ada di folder `supabase/migrations/`. Jalankan di Supabase SQL Editor atau CLI:

```bash
# Menggunakan Supabase CLI
supabase db push
```

#### Tabel yang Akan Dibuat

| Tabel | Deskripsi |
|-------|-----------|
| `profiles` | Data profil karyawan |
| `user_roles` | Role pengguna (admin/employee/developer) |
| `companies` | Konfigurasi perusahaan |
| `shifts` | Jadwal shift kerja |
| `attendance_records` | Catatan absensi |
| `leave_requests` | Pengajuan cuti/izin |
| `holidays` | Hari libur |
| `locations` | Lokasi kerja (untuk field workers) |
| `audit_logs` | Log aktivitas sistem |

### 6. Setup Storage Buckets

Buat 3 storage bucket di Supabase Dashboard → Storage:

1. **attendance-photos** (Public) - Foto absensi
2. **avatars** (Public) - Foto profil
3. **leave-proofs** (Public) - Bukti pengajuan cuti

### 7. Setup Edge Functions Secrets

Di Supabase Dashboard → Edge Functions → Secrets, tambahkan:

| Secret Name | Deskripsi |
|-------------|-----------|
| `RESEND_API_KEY` | API key dari resend.com untuk email |

### 8. Jalankan Development Server

```bash
# Menggunakan npm
npm run dev

# Atau menggunakan bun
bun dev
```

Aplikasi akan berjalan di `http://localhost:5173`

---

## 🚀 Instalasi VPS (Production)

### 1. Persiapan VPS

#### Spesifikasi Minimum

- **CPU**: 1 vCPU
- **RAM**: 1 GB (2 GB disarankan)
- **Storage**: 20 GB SSD
- **OS**: Ubuntu 22.04 LTS

#### Provider VPS yang Disarankan

- DigitalOcean
- Vultr
- Linode
- AWS EC2
- Google Cloud Compute

### 2. Setup Server

```bash
# Update sistem
sudo apt update && sudo apt upgrade -y

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verifikasi instalasi
node --version
npm --version

# Install Git
sudo apt install -y git

# Install Nginx (reverse proxy)
sudo apt install -y nginx

# Install Certbot (SSL)
sudo apt install -y certbot python3-certbot-nginx
```

### 3. Clone & Build Project

```bash
# Buat direktori untuk aplikasi
sudo mkdir -p /var/www/geoattend
sudo chown -R $USER:$USER /var/www/geoattend

# Clone repository
cd /var/www/geoattend
git clone <repository-url> .

# Install dependencies
npm install

# Buat file environment
nano .env
```

Isi `.env`:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
VITE_SUPABASE_PROJECT_ID=your-project-id
```

```bash
# Build untuk production
npm run build
```

### 4. Setup Nginx

```bash
# Buat konfigurasi Nginx
sudo nano /etc/nginx/sites-available/geoattend
```

Isi konfigurasi:

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    
    root /var/www/geoattend/dist;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # SPA routing - semua route ke index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
```

```bash
# Aktifkan site
sudo ln -s /etc/nginx/sites-available/geoattend /etc/nginx/sites-enabled/

# Test konfigurasi
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

### 5. Setup SSL (HTTPS)

```bash
# Dapatkan SSL certificate gratis dari Let's Encrypt
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Certbot akan otomatis mengupdate konfigurasi Nginx
```

### 6. Auto-Renewal SSL

```bash
# Test auto-renewal
sudo certbot renew --dry-run

# Cron job sudah otomatis dibuat oleh certbot
```

### 7. Setup Firewall

```bash
# Enable UFW
sudo ufw enable

# Allow SSH, HTTP, HTTPS
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'

# Verifikasi
sudo ufw status
```

### 8. Deploy Updates (CI/CD Manual)

Buat script untuk deployment:

```bash
nano /var/www/geoattend/deploy.sh
```

```bash
#!/bin/bash
cd /var/www/geoattend

echo "📥 Pulling latest changes..."
git pull origin main

echo "📦 Installing dependencies..."
npm install

echo "🔨 Building application..."
npm run build

echo "✅ Deployment complete!"
```

```bash
chmod +x deploy.sh

# Untuk deploy update
./deploy.sh
```

---

## 📊 Setup Data Awal Supabase

Setelah database dan tabel terbuat, Anda perlu mengisi data awal. Tersedia **2 file SQL siap pakai**:

### 🚀 Cara Cepat (Menggunakan Script)

#### Langkah 1: Jalankan Seed Data

Buka Supabase Dashboard → SQL Editor, lalu jalankan file:

```
📁 supabase/seed.sql
```

File ini berisi:
- ✅ 1 Company default dengan konfigurasi lengkap
- ✅ 4 Shift (Regular, Pagi, Siang, Malam)
- ✅ 14 Hari libur nasional 2025
- ✅ 1 Lokasi contoh

#### Langkah 2: Buat User Developer Pertama

1. Buka Supabase Dashboard → **Authentication** → **Users**
2. Klik **"Add User"**
3. Isi:
   - Email: `admin@internal.local`
   - Password: (password aman, min 6 karakter)
   - ✅ Centang **"Auto Confirm User"**
4. Klik **"Create User"**
5. **Salin UUID** user yang baru dibuat

#### Langkah 3: Konfigurasi User Developer

Buka SQL Editor, lalu jalankan file:

```
📁 supabase/seed-first-user.sql
```

> ⚠️ **PENTING**: Ganti `'GANTI_DENGAN_USER_ID'` dengan UUID yang disalin di langkah sebelumnya!

#### Langkah 4: Verifikasi

Jalankan query ini untuk memastikan setup berhasil:

```sql
-- Cek semua data
SELECT 'companies' as tabel, count(*) FROM companies
UNION ALL SELECT 'shifts', count(*) FROM shifts WHERE is_active = true
UNION ALL SELECT 'holidays', count(*) FROM holidays
UNION ALL SELECT 'users', count(*) FROM profiles WHERE role = 'developer';
```

---

### 📝 Cara Manual (Referensi Detail)

Jika ingin input data secara manual, berikut detailnya:

```sql
INSERT INTO companies (
  id,
  name,
  office_latitude,
  office_longitude,
  radius_meters,
  work_start_time,
  grace_period_minutes,
  annual_leave_quota
) VALUES (
  '6fbcdc6b-7558-45a8-8031-70a0eb46bda2',  -- ID tetap (atau generate baru)
  'Nama Perusahaan Anda',
  -6.200000,                                -- Latitude kantor (contoh: Jakarta)
  106.816666,                               -- Longitude kantor
  100,                                      -- Radius geofence (meter)
  '08:00:00',                               -- Jam mulai kerja
  15,                                       -- Grace period (menit)
  12                                        -- Kuota cuti tahunan
);
```

| Field | Deskripsi | Contoh |
|-------|-----------|--------|
| `name` | Nama perusahaan | "PT Contoh Indonesia" |
| `office_latitude` | Latitude lokasi kantor | -6.200000 |
| `office_longitude` | Longitude lokasi kantor | 106.816666 |
| `radius_meters` | Radius geofence dalam meter | 100 |
| `work_start_time` | Jam mulai kerja | '08:00:00' |
| `grace_period_minutes` | Toleransi keterlambatan (menit) | 15 |
| `annual_leave_quota` | Jatah cuti per tahun | 12 |

> 💡 **Tip**: Dapatkan koordinat dari Google Maps dengan klik kanan → "What's here?"

### 2. Shifts (Jadwal Kerja) - WAJIB

Minimal 1 shift harus ada untuk assign ke karyawan.

```sql
INSERT INTO shifts (
  name,
  start_time,
  end_time,
  working_days,
  break_duration_minutes,
  is_active
) VALUES 
-- Shift Reguler (Senin-Jumat)
(
  'Regular',
  '08:00:00',
  '17:00:00',
  ARRAY[1,2,3,4,5],   -- 1=Senin, 2=Selasa, ..., 5=Jumat
  60,                  -- Istirahat 60 menit
  true
),
-- Shift Pagi (Senin-Sabtu)
(
  'Shift Pagi',
  '06:00:00',
  '14:00:00',
  ARRAY[1,2,3,4,5,6], -- Senin-Sabtu
  60,
  true
),
-- Shift Malam (Senin-Jumat)
(
  'Shift Malam',
  '22:00:00',
  '06:00:00',
  ARRAY[1,2,3,4,5],
  60,
  true
);
```

| Field | Deskripsi | Format |
|-------|-----------|--------|
| `name` | Nama shift | Text |
| `start_time` | Jam mulai | 'HH:MM:SS' |
| `end_time` | Jam selesai | 'HH:MM:SS' |
| `working_days` | Hari kerja (array) | [1,2,3,4,5] = Sen-Jum |
| `break_duration_minutes` | Durasi istirahat | Integer (menit) |
| `is_active` | Status aktif | true/false |

**Kode Hari:**
- 0 = Minggu
- 1 = Senin
- 2 = Selasa
- 3 = Rabu
- 4 = Kamis
- 5 = Jumat
- 6 = Sabtu

### 3. Holidays (Hari Libur) - OPSIONAL

Tambahkan hari libur nasional atau perusahaan.

```sql
INSERT INTO holidays (name, date, end_date, description, is_active) VALUES
('Tahun Baru', '2025-01-01', NULL, 'Tahun Baru Masehi', true),
('Hari Raya Idul Fitri', '2025-03-30', '2025-03-31', 'Lebaran', true),
('Hari Kemerdekaan', '2025-08-17', NULL, 'HUT RI ke-80', true),
('Natal', '2025-12-25', NULL, 'Hari Natal', true);
```

| Field | Deskripsi | Format |
|-------|-----------|--------|
| `name` | Nama hari libur | Text |
| `date` | Tanggal mulai | 'YYYY-MM-DD' |
| `end_date` | Tanggal selesai (jika >1 hari) | 'YYYY-MM-DD' atau NULL |
| `description` | Keterangan | Text |
| `is_active` | Status aktif | true/false |

### 4. Locations (Lokasi Kerja) - OPSIONAL

Untuk karyawan lapangan yang bekerja di beberapa lokasi.

```sql
INSERT INTO locations (name, address, latitude, longitude, radius_meters, is_active) VALUES
('Kantor Pusat', 'Jl. Sudirman No. 1, Jakarta', -6.200000, 106.816666, 100, true),
('Cabang Bandung', 'Jl. Asia Afrika No. 5, Bandung', -6.921000, 107.607000, 100, true),
('Gudang Cikarang', 'Jl. Industri Raya, Cikarang', -6.310000, 107.140000, 150, true);
```

### 5. User Pertama (Developer/Super Admin) - WAJIB

**Langkah 1**: Buat user melalui Supabase Auth

Di Supabase Dashboard → Authentication → Users → Add User:
- Email: `admin@internal.local` (atau email valid)
- Password: Password yang aman
- ✅ Auto Confirm User

**Langkah 2**: Update role menjadi Developer

```sql
-- Dapatkan user_id dari auth.users
-- Kemudian update role di user_roles
UPDATE user_roles 
SET role = 'developer' 
WHERE user_id = 'USER_ID_DARI_AUTH';

-- Update profile dengan company_id
UPDATE profiles 
SET 
  company_id = '6fbcdc6b-7558-45a8-8031-70a0eb46bda2',
  username = 'superadmin',
  role = 'developer'
WHERE user_id = 'USER_ID_DARI_AUTH';
```

> ⚠️ **PENTING**: Setelah developer pertama dibuat, semua user baru HARUS dibuat melalui menu Admin → Karyawan di aplikasi.

### 6. Ringkasan Data Minimum

| Tabel | Minimum Record | Keterangan |
|-------|----------------|------------|
| `companies` | 1 | Wajib ada minimal 1 perusahaan |
| `shifts` | 1 | Wajib ada minimal 1 shift |
| `profiles` | 1 | Developer/Admin pertama |
| `user_roles` | 1 | Role untuk user pertama |
| `holidays` | 0 | Opsional |
| `locations` | 0 | Opsional (untuk field workers) |

### 7. Verifikasi Setup

Jalankan query berikut untuk memastikan data sudah benar:

```sql
-- Cek companies
SELECT id, name, office_latitude, office_longitude, radius_meters FROM companies;

-- Cek shifts
SELECT id, name, start_time, end_time, working_days FROM shifts WHERE is_active = true;

-- Cek user pertama
SELECT p.full_name, p.username, p.email, ur.role, p.company_id 
FROM profiles p 
JOIN user_roles ur ON p.user_id = ur.user_id;

-- Cek storage buckets
-- (Ini dicek di Supabase Dashboard → Storage)
```

---

## 🗄️ Setup Lengkap SQL Supabase

Bagian ini berisi **SEMUA SQL** yang diperlukan untuk setup database GeoAttend dari nol. Jalankan di Supabase Dashboard → SQL Editor secara berurutan.

### 📋 Daftar Isi SQL Setup

1. [Enums & Types](#1-enums--types)
2. [Tabel Utama](#2-tabel-utama)
3. [Database Functions](#3-database-functions)
4. [Triggers](#4-triggers)
5. [Row Level Security (RLS)](#5-row-level-security-rls)
6. [Storage Buckets & Policies](#6-storage-buckets--policies)
7. [Data Awal (Seed)](#7-data-awal-seed)

---

### 1. Enums & Types

Jalankan ini **PERTAMA** sebelum membuat tabel:

```sql
-- ============================================================
-- ENUM DEFINITIONS
-- ============================================================

-- Role aplikasi
CREATE TYPE public.app_role AS ENUM ('admin', 'employee', 'developer');

-- Tipe karyawan
CREATE TYPE public.employee_type AS ENUM ('office', 'field');
```

---

### 2. Tabel Utama

Jalankan setelah enums dibuat:

```sql
-- ============================================================
-- TABLE: companies
-- Konfigurasi perusahaan
-- ============================================================
CREATE TABLE public.companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  office_latitude NUMERIC,
  office_longitude NUMERIC,
  radius_meters INTEGER NOT NULL DEFAULT 100,
  work_start_time TIME NOT NULL DEFAULT '08:00:00',
  grace_period_minutes INTEGER NOT NULL DEFAULT 0,
  annual_leave_quota INTEGER NOT NULL DEFAULT 12,
  overtime_start_after_minutes INTEGER NOT NULL DEFAULT 0,
  overtime_rate_per_hour INTEGER NOT NULL DEFAULT 0,
  early_leave_deduction_per_minute INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- TABLE: shifts
-- Jadwal kerja
-- ============================================================
CREATE TABLE public.shifts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  working_days INTEGER[] NOT NULL DEFAULT ARRAY[1,2,3,4,5],
  break_duration_minutes INTEGER NOT NULL DEFAULT 60,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- TABLE: profiles
-- Data profil karyawan
-- ============================================================
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  username TEXT,
  avatar_url TEXT,
  company_id UUID REFERENCES public.companies(id),
  shift_id UUID REFERENCES public.shifts(id),
  job_title TEXT,
  department TEXT,
  role public.app_role NOT NULL DEFAULT 'employee',
  employee_type public.employee_type NOT NULL DEFAULT 'office',
  requires_geofence BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  leave_balance INTEGER NOT NULL DEFAULT 12,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- TABLE: user_roles
-- Role terpisah untuk keamanan (mencegah privilege escalation)
-- ============================================================
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  role public.app_role NOT NULL DEFAULT 'employee',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- TABLE: locations
-- Lokasi kerja untuk field workers
-- ============================================================
CREATE TABLE public.locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  latitude NUMERIC NOT NULL,
  longitude NUMERIC NOT NULL,
  radius_meters INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- TABLE: attendance_records
-- Catatan absensi
-- ============================================================
CREATE TABLE public.attendance_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  location_id UUID REFERENCES public.locations(id),
  record_type TEXT NOT NULL, -- 'clock_in' atau 'clock_out'
  latitude NUMERIC NOT NULL,
  longitude NUMERIC NOT NULL,
  accuracy_meters NUMERIC,
  photo_url TEXT,
  notes TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- TABLE: leave_requests
-- Pengajuan cuti/izin
-- ============================================================
CREATE TABLE public.leave_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  leave_type TEXT NOT NULL, -- 'annual', 'sick', 'permission'
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  proof_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- TABLE: holidays
-- Hari libur
-- ============================================================
CREATE TABLE public.holidays (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  date DATE NOT NULL,
  end_date DATE,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- TABLE: audit_logs
-- Log aktivitas sistem
-- ============================================================
CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

### 3. Database Functions

Functions untuk keamanan dan helper:

```sql
-- ============================================================
-- FUNCTION: get_user_company_id
-- Mengambil company_id user (security definer untuk bypass RLS)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_user_company_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.profiles WHERE user_id = _user_id LIMIT 1
$$;

-- ============================================================
-- FUNCTION: get_user_role
-- Mengambil role user
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS public.app_role
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id LIMIT 1
$$;

-- ============================================================
-- FUNCTION: has_role
-- Cek apakah user memiliki role tertentu
-- ============================================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- ============================================================
-- FUNCTION: is_admin_or_developer
-- Cek apakah user adalah admin atau developer
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin_or_developer(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'developer')
  )
$$;

-- ============================================================
-- FUNCTION: is_developer
-- Cek apakah user adalah developer
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_developer(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'developer'
  )
$$;

-- ============================================================
-- FUNCTION: get_email_by_username
-- Lookup email dari username untuk proses login (bypass RLS)
-- ============================================================
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

-- ============================================================
-- FUNCTION: handle_new_user
-- Auto-create profile & role saat user baru register
-- ============================================================
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

-- ============================================================
-- FUNCTION: update_updated_at_column
-- Auto-update timestamp updated_at
-- ============================================================
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

-- ============================================================
-- FUNCTION: log_audit_event
-- Helper untuk insert audit log
-- ============================================================
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
```

---

### 4. Triggers

Triggers untuk automasi:

```sql
-- ============================================================
-- TRIGGER: Auto-create profile saat user baru di auth.users
-- ============================================================
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- TRIGGER: Auto-update updated_at pada profiles
-- ============================================================
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- TRIGGER: Auto-update updated_at pada companies
-- ============================================================
CREATE TRIGGER update_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- TRIGGER: Auto-update updated_at pada shifts
-- ============================================================
CREATE TRIGGER update_shifts_updated_at
  BEFORE UPDATE ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- TRIGGER: Auto-update updated_at pada locations
-- ============================================================
CREATE TRIGGER update_locations_updated_at
  BEFORE UPDATE ON public.locations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- TRIGGER: Auto-update updated_at pada leave_requests
-- ============================================================
CREATE TRIGGER update_leave_requests_updated_at
  BEFORE UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- TRIGGER: Auto-update updated_at pada holidays
-- ============================================================
CREATE TRIGGER update_holidays_updated_at
  BEFORE UPDATE ON public.holidays
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

---

### 5. Row Level Security (RLS)

**PENTING**: RLS memastikan data aman dan user hanya bisa akses data yang diizinkan.

```sql
-- ============================================================
-- ENABLE RLS PADA SEMUA TABEL
-- ============================================================
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS: companies
-- ============================================================
CREATE POLICY "Users can view their company"
  ON public.companies FOR SELECT
  USING (id = get_user_company_id(auth.uid()));

CREATE POLICY "Admins can manage their company"
  ON public.companies FOR ALL
  USING (has_role(auth.uid(), 'admin') AND id = get_user_company_id(auth.uid()));

CREATE POLICY "Developers can manage all companies"
  ON public.companies FOR ALL
  USING (has_role(auth.uid(), 'developer'));

-- ============================================================
-- RLS: shifts
-- ============================================================
CREATE POLICY "Authenticated users can view active shifts"
  ON public.shifts FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage shifts"
  ON public.shifts FOR ALL
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Developers can manage all shifts"
  ON public.shifts FOR ALL
  USING (has_role(auth.uid(), 'developer'));

-- ============================================================
-- RLS: profiles
-- ============================================================
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

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

-- ============================================================
-- RLS: user_roles
-- ============================================================
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles"
  ON public.user_roles FOR ALL
  USING (has_role(auth.uid(), 'admin'));

-- ============================================================
-- RLS: locations
-- ============================================================
CREATE POLICY "Authenticated users can view active locations"
  ON public.locations FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage locations"
  ON public.locations FOR ALL
  USING (has_role(auth.uid(), 'admin'));

-- ============================================================
-- RLS: attendance_records
-- ============================================================
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

-- ============================================================
-- RLS: leave_requests
-- ============================================================
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

-- ============================================================
-- RLS: holidays
-- ============================================================
CREATE POLICY "Authenticated users can view active holidays"
  ON public.holidays FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage holidays"
  ON public.holidays FOR ALL
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Developers can manage all holidays"
  ON public.holidays FOR ALL
  USING (has_role(auth.uid(), 'developer'));

-- ============================================================
-- RLS: audit_logs
-- ============================================================
CREATE POLICY "Authenticated users can insert audit logs"
  ON public.audit_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view company audit logs"
  ON public.audit_logs FOR SELECT
  USING (has_role(auth.uid(), 'admin') AND company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Developers can view all audit logs"
  ON public.audit_logs FOR SELECT
  USING (has_role(auth.uid(), 'developer'));
```

---

### 6. Storage Buckets & Policies

Setup storage untuk foto:

```sql
-- ============================================================
-- STORAGE BUCKETS
-- Jalankan di SQL Editor (bukan di Dashboard)
-- ============================================================

-- Bucket untuk foto absensi
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'attendance-photos', 
  'attendance-photos', 
  true,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

-- Bucket untuk foto profil
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars', 
  'avatars', 
  true,
  2097152, -- 2MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

-- Bucket untuk bukti cuti
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'leave-proofs', 
  'leave-proofs', 
  true,
  10485760, -- 10MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
) ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- STORAGE POLICIES
-- ============================================================

-- Policy: Semua bisa lihat file di attendance-photos
CREATE POLICY "Public can view attendance photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'attendance-photos');

-- Policy: Authenticated user bisa upload ke attendance-photos
CREATE POLICY "Authenticated users can upload attendance photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'attendance-photos' AND
    auth.role() = 'authenticated'
  );

-- Policy: Semua bisa lihat avatar
CREATE POLICY "Public can view avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- Policy: User bisa upload avatar sendiri
CREATE POLICY "Users can upload own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars' AND
    auth.role() = 'authenticated'
  );

-- Policy: User bisa update avatar sendiri
CREATE POLICY "Users can update own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars' AND
    auth.role() = 'authenticated'
  );

-- Policy: Semua bisa lihat bukti cuti
CREATE POLICY "Public can view leave proofs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'leave-proofs');

-- Policy: Authenticated user bisa upload bukti cuti
CREATE POLICY "Authenticated users can upload leave proofs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'leave-proofs' AND
    auth.role() = 'authenticated'
  );
```

---

### 7. Data Awal (Seed)

Setelah semua setup, jalankan seed data:

```sql
-- ============================================================
-- SEED: Company Default
-- ============================================================
INSERT INTO public.companies (
  id, name, office_latitude, office_longitude, 
  radius_meters, work_start_time, grace_period_minutes,
  annual_leave_quota, overtime_start_after_minutes,
  overtime_rate_per_hour, early_leave_deduction_per_minute
) VALUES (
  '6fbcdc6b-7558-45a8-8031-70a0eb46bda2',
  'Default Company',
  -6.200000,
  106.816666,
  100,
  '08:00:00',
  15,
  12,
  60,
  25000,
  1000
) ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  updated_at = now();

-- ============================================================
-- SEED: Shifts
-- ============================================================
INSERT INTO public.shifts (name, start_time, end_time, working_days, break_duration_minutes, is_active) VALUES
('Regular', '08:00:00', '17:00:00', ARRAY[1,2,3,4,5], 60, true),
('Shift Pagi', '06:00:00', '14:00:00', ARRAY[1,2,3,4,5,6], 60, true),
('Shift Siang', '14:00:00', '22:00:00', ARRAY[1,2,3,4,5,6], 60, true),
('Shift Malam', '22:00:00', '06:00:00', ARRAY[1,2,3,4,5,6], 60, true)
ON CONFLICT DO NOTHING;

-- ============================================================
-- SEED: Holidays 2025
-- ============================================================
INSERT INTO public.holidays (name, date, end_date, description, is_active) VALUES
('Tahun Baru Masehi', '2025-01-01', NULL, 'Tahun Baru 2025', true),
('Isra Mi''raj', '2025-01-27', NULL, 'Isra Mi''raj Nabi Muhammad SAW', true),
('Tahun Baru Imlek', '2025-01-29', NULL, 'Tahun Baru Imlek 2576', true),
('Hari Raya Nyepi', '2025-03-29', NULL, 'Tahun Baru Saka 1947', true),
('Wafat Isa Al-Masih', '2025-04-18', NULL, 'Jumat Agung', true),
('Hari Raya Idul Fitri', '2025-03-30', '2025-03-31', 'Idul Fitri 1446 H', true),
('Hari Buruh', '2025-05-01', NULL, 'Hari Buruh Internasional', true),
('Kenaikan Isa Al-Masih', '2025-05-29', NULL, 'Kenaikan Yesus Kristus', true),
('Hari Raya Waisak', '2025-05-12', NULL, 'Waisak 2569 BE', true),
('Hari Lahir Pancasila', '2025-06-01', NULL, 'Hari Lahir Pancasila', true),
('Hari Raya Idul Adha', '2025-06-06', NULL, 'Idul Adha 1446 H', true),
('Tahun Baru Islam', '2025-06-27', NULL, '1 Muharram 1447 H', true),
('Hari Kemerdekaan', '2025-08-17', NULL, 'HUT RI ke-80', true),
('Maulid Nabi Muhammad', '2025-09-05', NULL, 'Maulid Nabi Muhammad SAW', true),
('Hari Natal', '2025-12-25', NULL, 'Hari Raya Natal', true)
ON CONFLICT DO NOTHING;

-- ============================================================
-- SEED: Lokasi Contoh (Opsional)
-- ============================================================
INSERT INTO public.locations (name, address, latitude, longitude, radius_meters, is_active) VALUES
('Kantor Pusat', 'Jl. Sudirman No. 1, Jakarta Pusat', -6.200000, 106.816666, 100, true)
ON CONFLICT DO NOTHING;
```

---

### 🔐 Setup User Developer Pertama

Setelah semua SQL diatas dijalankan:

1. **Buat User di Supabase Auth**:
   - Buka Supabase Dashboard → Authentication → Users
   - Klik "Add User"
   - Email: `admin@internal.local`
   - Password: (min 6 karakter)
   - ✅ Centang "Auto Confirm User"
   - Salin **User ID (UUID)** yang muncul

2. **Jalankan SQL ini** (ganti UUID):

```sql
-- GANTI 'your-user-uuid-here' dengan UUID yang disalin!
DO $$
DECLARE
  v_user_id UUID := 'your-user-uuid-here';
  v_company_id UUID := '6fbcdc6b-7558-45a8-8031-70a0eb46bda2';
  v_shift_id UUID;
BEGIN
  -- Ambil shift Regular
  SELECT id INTO v_shift_id FROM shifts WHERE name = 'Regular' AND is_active = true LIMIT 1;
  
  -- Update role menjadi developer
  UPDATE user_roles SET role = 'developer' WHERE user_id = v_user_id;
  IF NOT FOUND THEN
    INSERT INTO user_roles (user_id, role) VALUES (v_user_id, 'developer');
  END IF;
  
  -- Update profile
  UPDATE profiles SET 
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
  
  RAISE NOTICE 'SUCCESS: Developer user configured!';
END $$;
```

3. **Verifikasi**:

```sql
-- Cek user developer
SELECT 
  p.username,
  p.full_name,
  p.email,
  ur.role,
  c.name as company
FROM profiles p
JOIN user_roles ur ON p.user_id = ur.user_id
JOIN companies c ON p.company_id = c.id
WHERE ur.role = 'developer';
```

---

### 📋 Checklist Lengkap SQL Setup

| No | Item | SQL Section | Status |
|----|------|-------------|--------|
| 1 | Enums (app_role, employee_type) | Section 1 | ☐ |
| 2 | Semua tabel (9 tabel) | Section 2 | ☐ |
| 3 | Database functions (8 functions) | Section 3 | ☐ |
| 4 | Triggers (7 triggers) | Section 4 | ☐ |
| 5 | RLS enabled semua tabel | Section 5 | ☐ |
| 6 | RLS policies semua tabel | Section 5 | ☐ |
| 7 | Storage buckets (3 buckets) | Section 6 | ☐ |
| 8 | Storage policies | Section 6 | ☐ |
| 9 | Seed data (company, shifts, holidays) | Section 7 | ☐ |
| 10 | User developer pertama | Setup User | ☐ |

---

## 🔧 Konfigurasi Supabase Production

### 1. Edge Functions

Edge functions akan otomatis di-deploy oleh Lovable. Untuk manual deployment:

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link ke project
supabase link --project-ref your-project-id

# Deploy semua functions
supabase functions deploy
```

### 2. Database Functions & Triggers

Pastikan semua database functions sudah ter-deploy:

- `handle_new_user()` - Auto-create profile saat user baru
- `get_user_role()` - Mengambil role user
- `is_admin_or_developer()` - Cek akses admin
- `log_audit_event()` - Logging aktivitas

### 3. Row Level Security (RLS)

Pastikan RLS sudah aktif di semua tabel untuk keamanan data.

### 4. Auth Configuration

Di Supabase Dashboard → Authentication → Settings:

- ✅ Enable email confirmations: **OFF** (untuk development)
- ✅ Enable email confirmations: **ON** (untuk production)
- ✅ Disable signup: **ON** (user hanya dibuat oleh admin)

---

## 🔐 Secrets yang Diperlukan

### Supabase Edge Functions Secrets

| Secret | Cara Mendapatkan |
|--------|------------------|
| `SUPABASE_URL` | Otomatis tersedia |
| `SUPABASE_ANON_KEY` | Otomatis tersedia |
| `SUPABASE_SERVICE_ROLE_KEY` | Otomatis tersedia |
| `RESEND_API_KEY` | Daftar di [resend.com](https://resend.com) |

### Cara Menambah Secret

1. Buka Supabase Dashboard
2. Pergi ke Edge Functions → Secrets
3. Klik "Add new secret"
4. Masukkan nama dan nilai

---

## 📱 Fitur yang Memerlukan HTTPS

Fitur berikut **WAJIB** menggunakan HTTPS di production:

- 📍 **Geolocation API** - Untuk mendapatkan lokasi GPS
- 📷 **Camera API** - Untuk capture foto absensi
- 🔒 **Secure Cookies** - Untuk autentikasi

> ⚠️ Di localhost, fitur ini akan tetap berfungsi tanpa HTTPS.

---

## 🧪 Testing

### Test Lokal

```bash
# Jalankan development server
npm run dev

# Build production
npm run build

# Preview production build
npm run preview
```

### Test Checklist

- [ ] Login dengan username/password
- [ ] Clock in dengan foto dan lokasi
- [ ] Clock out
- [ ] Lihat history absensi
- [ ] Submit leave request
- [ ] Admin: kelola karyawan
- [ ] Admin: approve/reject leave
- [ ] Admin: lihat audit logs

---

## 🐛 Troubleshooting

### Database & RLS Errors

#### Error: "infinite recursion detected in policy"

**Penyebab**: RLS policy memanggil tabel lain yang juga punya RLS, menyebabkan loop.

**Solusi**: Gunakan `security definer` function:
```sql
-- Buat function untuk ambil company_id tanpa trigger RLS
CREATE OR REPLACE FUNCTION public.get_user_company_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.profiles WHERE user_id = _user_id LIMIT 1
$$;
```

#### Error: "new row violates row-level security policy"

**Penyebab**: User mencoba insert/update data tanpa policy yang mengizinkan.

**Solusi**:
1. Cek apakah user sudah login (`auth.uid()` tidak null)
2. Pastikan RLS policy untuk INSERT/UPDATE sudah ada
3. Verifikasi `WITH CHECK` clause di policy

#### Error: "relation does not exist"

**Penyebab**: Tabel belum dibuat atau nama salah.

**Solusi**:
```bash
# Jalankan semua migrasi
supabase db push

# Atau jalankan manual di SQL Editor
```

---

### Authentication Errors

#### Error: "Invalid login credentials"

**Penyebab**: Email/password salah, atau user belum dikonfirmasi.

**Solusi**:
1. Cek email dan password sudah benar
2. Di Supabase Dashboard → Authentication → Users, pastikan user ada dan confirmed
3. Jika menggunakan username login, cek apakah username sudah ter-set di profiles

#### Error: "Email not confirmed"

**Penyebab**: Email confirmation aktif tapi user belum konfirmasi.

**Solusi** (Development):
```
Supabase Dashboard → Authentication → Settings → 
Email Auth → "Confirm email" → OFF
```

**Solusi** (Production):
- User harus klik link konfirmasi di email
- Atau admin konfirmasi manual di Dashboard

#### Error: "User already registered"

**Penyebab**: Email sudah terdaftar.

**Solusi**: Gunakan email lain, atau reset password untuk email tersebut.

#### Error: "requested path is invalid" saat login

**Penyebab**: Site URL atau Redirect URL belum dikonfigurasi.

**Solusi**:
1. Buka Supabase Dashboard → Authentication → URL Configuration
2. Set **Site URL**: `https://yourdomain.com` (atau URL preview Lovable)
3. Tambah **Redirect URLs**: 
   - `https://yourdomain.com/*`
   - `http://localhost:5173/*` (untuk development)

---

### Edge Function Errors

#### Error: "Function not found" (404)

**Penyebab**: Edge function belum di-deploy.

**Solusi**:
```bash
# Deploy semua functions
supabase functions deploy

# Atau deploy specific function
supabase functions deploy create-user
```

#### Error: "Internal Server Error" (500)

**Penyebab**: Error di dalam function code.

**Solusi**:
1. Cek logs di Supabase Dashboard → Edge Functions → Logs
2. Pastikan semua secrets sudah dikonfigurasi
3. Cek syntax error di function code

#### Error: Deploy gagal dengan "deno.lock incompatible"

**Penyebab**: Lockfile tidak kompatibel dengan edge-runtime.

**Solusi**:
```bash
# Hapus lockfile dan deploy ulang
rm supabase/functions/deno.lock
supabase functions deploy
```

#### Error: "Missing authorization header"

**Penyebab**: Request tidak menyertakan auth token.

**Solusi**:
- Pastikan user sudah login sebelum memanggil function
- Gunakan `supabase.functions.invoke()` yang otomatis menyertakan token

---

### Storage Errors

#### Error: "Bucket not found"

**Penyebab**: Storage bucket belum dibuat.

**Solusi**:
1. Buka Supabase Dashboard → Storage
2. Buat bucket yang diperlukan:
   - `attendance-photos` (Public)
   - `avatars` (Public)
   - `leave-proofs` (Public)

#### Error: "new row violates row-level security policy" saat upload

**Penyebab**: Storage policy belum dikonfigurasi.

**Solusi**: Tambahkan policy di SQL Editor:
```sql
-- Izinkan authenticated user upload ke folder mereka
CREATE POLICY "Users can upload to own folder"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'attendance-photos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);
```

---

### Geolocation & Camera Errors

#### Error: "Geolocation not available"

**Penyebab**: 
- Tidak menggunakan HTTPS (production)
- Browser tidak mengizinkan akses lokasi
- GPS device tidak aktif

**Solusi**:
1. Gunakan HTTPS di production
2. Cek permission browser (klik icon 🔒 di address bar)
3. Aktifkan GPS di device
4. Di Chrome: Settings → Privacy → Location Services → ON

#### Error: "Camera not available"

**Penyebab**:
- Tidak menggunakan HTTPS (production)
- Kamera sedang digunakan aplikasi lain
- Permission ditolak

**Solusi**:
1. Tutup aplikasi lain yang menggunakan kamera
2. Reset permission: klik icon 🔒 → Reset permissions
3. Refresh halaman

#### Error: "Permission denied" untuk lokasi/kamera

**Penyebab**: User menolak permission atau browser memblokir.

**Solusi**:
1. Klik icon 🔒 di address bar
2. Set Location/Camera ke "Allow"
3. Refresh halaman

---

### Build & Deploy Errors

#### Error: "Module not found"

**Penyebab**: Dependencies belum terinstall atau path import salah.

**Solusi**:
```bash
# Hapus node_modules dan reinstall
rm -rf node_modules
rm package-lock.json
npm install
```

#### Error: "Failed to resolve import"

**Penyebab**: Path alias (@/) tidak dikenali.

**Solusi**: Pastikan `vite.config.ts` dan `tsconfig.json` sudah benar:
```typescript
// vite.config.ts
resolve: {
  alias: {
    "@": path.resolve(__dirname, "./src"),
  },
}
```

#### Error: Build berhasil tapi halaman blank

**Penyebab**: SPA routing tidak dikonfigurasi di server.

**Solusi Nginx**:
```nginx
location / {
  try_files $uri $uri/ /index.html;
}
```

---

### Query Errors

#### Error: "PGRST116" atau "JSON object requested, multiple rows returned"

**Penyebab**: Menggunakan `.single()` tapi query mengembalikan lebih dari 1 row.

**Solusi**: Gunakan `.maybeSingle()` atau `.limit(1)`:
```typescript
// ❌ Salah
const { data } = await supabase
  .from('profiles')
  .select('*')
  .eq('department', 'IT')
  .single(); // Error jika ada banyak hasil

// ✅ Benar
const { data } = await supabase
  .from('profiles')
  .select('*')
  .eq('user_id', userId)
  .maybeSingle(); // Aman jika 0 atau 1 hasil
```

#### Error: "Could not find a relationship"

**Penyebab**: Mencoba join tabel tanpa foreign key.

**Solusi**: Pastikan foreign key ada, atau gunakan query terpisah.

---

### Common Setup Checklist

Jika masih ada masalah, verifikasi checklist ini:

- [ ] **Environment Variables**: `.env` sudah berisi URL dan key yang benar
- [ ] **Migrasi**: Semua file di `supabase/migrations/` sudah dijalankan
- [ ] **Seed Data**: `seed.sql` sudah dijalankan
- [ ] **User Pertama**: Developer user sudah dibuat dan dikonfigurasi
- [ ] **Storage Buckets**: 3 bucket sudah dibuat (attendance-photos, avatars, leave-proofs)
- [ ] **Secrets**: RESEND_API_KEY sudah ditambahkan di Edge Functions Secrets
- [ ] **Auth Settings**: Email confirmation dan signup sesuai kebutuhan
- [ ] **HTTPS**: Production menggunakan HTTPS untuk geolocation/camera

---

## 📊 Monitoring & Maintenance Production

### Monitoring Aplikasi

#### 1. Health Check Endpoint

Tambahkan monitoring sederhana dengan cek status berkala:

```bash
# Cek apakah aplikasi berjalan
curl -I https://yourdomain.com

# Expected: HTTP/2 200
```

#### 2. Uptime Monitoring (Gratis)

Gunakan layanan monitoring gratis:

| Layanan | Fitur | Link |
|---------|-------|------|
| **UptimeRobot** | 50 monitors gratis, 5 min interval | [uptimerobot.com](https://uptimerobot.com) |
| **Better Uptime** | 10 monitors gratis, incident management | [betteruptime.com](https://betteruptime.com) |
| **Freshping** | 50 monitors gratis, multi-location | [freshping.io](https://freshping.io) |

**Setup UptimeRobot:**
1. Daftar di uptimerobot.com
2. Add New Monitor → HTTP(s)
3. URL: `https://yourdomain.com`
4. Monitoring Interval: 5 minutes
5. Alert Contacts: email/Telegram/Slack

#### 3. Server Monitoring

```bash
# Install htop untuk monitoring real-time
sudo apt install htop

# Cek resource usage
htop

# Cek disk usage
df -h

# Cek memory
free -m

# Cek logs Nginx
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

#### 4. Database Monitoring (Supabase)

Monitoring via Supabase Dashboard:

| Metrik | Lokasi | Threshold Alert |
|--------|--------|-----------------|
| **Database Size** | Settings → Database | >70% storage |
| **Connection Count** | Reports → Database | >80 connections |
| **API Requests** | Reports → API | >100k/day (free tier) |
| **Auth Users** | Authentication | Monitor growth |
| **Storage Usage** | Storage | >70% quota |

**Query untuk cek database health:**

```sql
-- Cek ukuran tabel
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) as size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname || '.' || tablename) DESC;

-- Cek jumlah records per tabel
SELECT 'profiles' as table_name, count(*) FROM profiles
UNION ALL SELECT 'attendance_records', count(*) FROM attendance_records
UNION ALL SELECT 'leave_requests', count(*) FROM leave_requests
UNION ALL SELECT 'audit_logs', count(*) FROM audit_logs;

-- Cek index yang tidak terpakai
SELECT 
  schemaname || '.' || relname as table,
  indexrelname as index,
  idx_scan as times_used
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC;
```

---

### Maintenance Berkala

#### Daily Maintenance

```bash
# Cek status Nginx
sudo systemctl status nginx

# Cek disk space
df -h /var/www/geoattend

# Cek error logs
sudo tail -100 /var/log/nginx/error.log | grep -i error
```

#### Weekly Maintenance

```bash
# Update sistem (non-breaking)
sudo apt update
sudo apt list --upgradable

# Rotate logs jika perlu
sudo logrotate -f /etc/logrotate.conf

# Backup konfigurasi Nginx
sudo cp /etc/nginx/sites-available/geoattend /etc/nginx/sites-available/geoattend.bak
```

#### Monthly Maintenance

```bash
# Full system update
sudo apt update && sudo apt upgrade -y

# Cleanup unused packages
sudo apt autoremove -y

# Check SSL certificate expiry
sudo certbot certificates

# Renew SSL if needed
sudo certbot renew

# Check npm outdated packages
cd /var/www/geoattend
npm outdated
```

---

### Backup Strategy

#### 1. Database Backup (Supabase)

**Automatic Backup** (Pro Plan):
- Supabase Pro: Daily automatic backups, 7-day retention
- Point-in-time recovery tersedia

**Manual Backup** (Semua Plan):

```bash
# Export via Supabase CLI
supabase db dump -f backup_$(date +%Y%m%d).sql

# Atau via pg_dump (perlu connection string)
pg_dump "postgresql://postgres:[PASSWORD]@db.[PROJECT_ID].supabase.co:5432/postgres" > backup.sql
```

**Backup Schedule Recommendation:**

| Data | Frequency | Retention |
|------|-----------|-----------|
| Full Database | Daily | 30 hari |
| Attendance Records | Weekly archive | 1 tahun |
| Audit Logs | Monthly archive | 2 tahun |
| User Data | Daily | 30 hari |

#### 2. Application Backup

```bash
# Backup source code (jika tidak di Git)
tar -czf geoattend_backup_$(date +%Y%m%d).tar.gz /var/www/geoattend

# Backup .env file (PENTING - simpan di tempat aman!)
cp /var/www/geoattend/.env ~/backups/env_$(date +%Y%m%d).bak
```

#### 3. Storage Backup (Supabase Storage)

```bash
# Download semua file dari bucket (via Supabase CLI)
supabase storage download attendance-photos --output ./backup/attendance-photos
supabase storage download avatars --output ./backup/avatars
supabase storage download leave-proofs --output ./backup/leave-proofs
```

---

### Log Management

#### 1. Application Logs

Nginx access/error logs lokasi:
- Access: `/var/log/nginx/access.log`
- Error: `/var/log/nginx/error.log`

#### 2. Log Rotation

Buat config log rotation:

```bash
sudo nano /etc/logrotate.d/geoattend
```

```
/var/log/nginx/geoattend*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 www-data adm
    sharedscripts
    postrotate
        [ -f /var/run/nginx.pid ] && kill -USR1 `cat /var/run/nginx.pid`
    endscript
}
```

#### 3. Audit Log Cleanup (Database)

```sql
-- Hapus audit logs lebih dari 1 tahun
DELETE FROM audit_logs 
WHERE created_at < NOW() - INTERVAL '1 year';

-- Archive sebelum hapus (opsional)
CREATE TABLE audit_logs_archive AS
SELECT * FROM audit_logs 
WHERE created_at < NOW() - INTERVAL '1 year';
```

---

### Performance Optimization

#### 1. Database Optimization

```sql
-- Reindex tables (jalankan saat traffic rendah)
REINDEX TABLE attendance_records;
REINDEX TABLE profiles;
REINDEX TABLE audit_logs;

-- Vacuum untuk reclaim space
VACUUM ANALYZE attendance_records;
VACUUM ANALYZE profiles;

-- Check slow queries (via Supabase Dashboard → Logs → Postgres)
```

#### 2. Nginx Optimization

```nginx
# Tambahkan di nginx.conf untuk performance
worker_processes auto;
worker_connections 1024;

# Enable caching
proxy_cache_path /tmp/nginx_cache levels=1:2 keys_zone=my_cache:10m max_size=100m inactive=60m;

# Compression
gzip on;
gzip_vary on;
gzip_min_length 1024;
gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
```

#### 3. CDN (Optional)

Untuk static assets, gunakan CDN gratis:

| CDN | Fitur | Link |
|-----|-------|------|
| **Cloudflare** | Free tier, DDoS protection | [cloudflare.com](https://cloudflare.com) |
| **BunnyCDN** | Pay-as-you-go, murah | [bunny.net](https://bunny.net) |

---

### Security Maintenance

#### 1. Regular Security Checks

```bash
# Cek listening ports
sudo netstat -tlnp

# Cek failed login attempts
sudo grep "Failed password" /var/log/auth.log | tail -20

# Cek firewall status
sudo ufw status verbose
```

#### 2. Update Dependencies

```bash
cd /var/www/geoattend

# Check security vulnerabilities
npm audit

# Fix vulnerabilities
npm audit fix

# Update packages (hati-hati dengan breaking changes)
npm update
```

#### 3. SSL Certificate Check

```bash
# Cek expiry date
echo | openssl s_client -servername yourdomain.com -connect yourdomain.com:443 2>/dev/null | openssl x509 -noout -dates

# Auto-renew test
sudo certbot renew --dry-run
```

---

### Incident Response

#### 1. Common Issues & Quick Fixes

| Issue | Command | Action |
|-------|---------|--------|
| App down | `sudo systemctl restart nginx` | Restart Nginx |
| 502 Error | `sudo nginx -t && sudo systemctl reload nginx` | Test & reload config |
| Disk full | `df -h && sudo apt autoremove` | Free disk space |
| High CPU | `htop` | Identify process |
| SSL expired | `sudo certbot renew` | Renew certificate |

#### 2. Rollback Procedure

```bash
# Jika deployment gagal, rollback ke versi sebelumnya
cd /var/www/geoattend

# Lihat commit history
git log --oneline -10

# Rollback ke commit sebelumnya
git checkout [COMMIT_HASH]

# Rebuild
npm install
npm run build

# Jika perlu rollback database (HATI-HATI!)
# Restore dari backup terakhir
```

#### 3. Emergency Contacts Template

Buat file `/var/www/geoattend/EMERGENCY.md`:

```markdown
# Emergency Contacts

## Server Issues
- VPS Provider Support: [support ticket URL]
- Server Admin: [nama] - [phone/email]

## Database Issues
- Supabase Support: support@supabase.io
- DB Admin: [nama] - [phone/email]

## Application Issues
- Lead Developer: [nama] - [phone/email]
- Backup Developer: [nama] - [phone/email]

## Escalation Path
1. Check monitoring alerts
2. Try quick fixes (restart services)
3. Check logs for errors
4. Contact on-call developer
5. If critical, contact server admin
```

---

### Monitoring Checklist

#### Daily Checks (5 menit)
- [ ] Uptime monitoring green ✅
- [ ] No error alerts
- [ ] Users can login
- [ ] Attendance recording works

#### Weekly Checks (15 menit)
- [ ] Server resources < 70%
- [ ] Database size normal
- [ ] No security alerts
- [ ] Logs reviewed

#### Monthly Checks (1 jam)
- [ ] SSL certificate valid
- [ ] System updates applied
- [ ] Dependencies updated
- [ ] Backup verified
- [ ] Performance metrics reviewed
- [ ] Storage cleanup done

---

## 📞 Support

Jika mengalami masalah, silakan:

1. Cek dokumentasi di `FEATURES.md`
2. Buka issue di repository
3. Hubungi tim development

---

## 📄 Lisensi

Lihat file `LICENSE` untuk informasi lisensi.
