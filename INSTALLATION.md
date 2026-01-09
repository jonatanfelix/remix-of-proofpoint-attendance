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

## 📞 Support

Jika mengalami masalah, silakan:

1. Cek dokumentasi di `FEATURES.md`
2. Buka issue di repository
3. Hubungi tim development

---

## 📄 Lisensi

Lihat file `LICENSE` untuk informasi lisensi.
