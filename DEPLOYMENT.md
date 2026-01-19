# GeoAttend - Self-Hosted Deployment Guide

Panduan lengkap untuk deploy GeoAttend ke VPS dengan Self-Hosted Supabase.

---

## 📋 DAFTAR ISI

1. [Environment Variables](#1-environment-variables)
2. [Edge Functions](#2-edge-functions)
3. [Langkah Deployment](#3-langkah-deployment)
4. [Troubleshooting](#4-troubleshooting)

---

## 1. ENVIRONMENT VARIABLES

### 1.1 Frontend (Vite)

File `.env` di root project (untuk build frontend):

```env
# WAJIB - Supabase Connection
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# OPTIONAL - Project ID (untuk debugging)
VITE_SUPABASE_PROJECT_ID=your-project-id
```

**Catatan:**
- `VITE_SUPABASE_URL` = URL Supabase project Anda
- `VITE_SUPABASE_PUBLISHABLE_KEY` = Anon key (public, aman untuk frontend)
- **TIDAK ADA** Google Maps API key - aplikasi menggunakan Leaflet + OpenStreetMap (gratis)

### 1.2 Backend (Edge Functions)

Secrets yang harus di-set di Supabase Dashboard → Settings → Edge Functions → Secrets:

| Secret Name | Deskripsi | Wajib? |
|-------------|-----------|--------|
| `SUPABASE_URL` | URL Supabase project | ✅ Ya (auto dari Supabase) |
| `SUPABASE_ANON_KEY` | Anon/Public key | ✅ Ya (auto dari Supabase) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service Role key (admin) | ✅ Ya (auto dari Supabase) |
| `RESEND_API_KEY` | API key dari Resend.com untuk email | ⚠️ Opsional (untuk reset password) |

**Catatan:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, dan `SUPABASE_SERVICE_ROLE_KEY` biasanya sudah otomatis tersedia di Edge Functions Supabase.

---

## 2. EDGE FUNCTIONS

### 2.1 Daftar Edge Functions

Aplikasi ini menggunakan **5 Edge Functions** yang harus di-deploy:

| Function Name | Lokasi File | Fungsi |
|---------------|-------------|--------|
| `bootstrap-admin` | `supabase/functions/bootstrap-admin/index.ts` | Buat admin pertama saat setup awal |
| `clock-attendance` | `supabase/functions/clock-attendance/index.ts` | Clock in/out dengan validasi geofence |
| `create-user` | `supabase/functions/create-user/index.ts` | Admin membuat user baru |
| `delete-user` | `supabase/functions/delete-user/index.ts` | Admin menghapus user |
| `send-reset-password` | `supabase/functions/send-reset-password/index.ts` | Kirim email reset password (pakai Resend) |

### 2.2 Source Code Edge Functions

Semua source code ada di folder `supabase/functions/`. Berikut ringkasan masing-masing:

---

#### 📁 `bootstrap-admin/index.ts`

**Fungsi:** Membuat admin/developer pertama saat setup awal.

**Endpoint:** `POST /functions/v1/bootstrap-admin`

**Auth:** Tidak perlu auth (hanya bisa dipanggil 1x jika belum ada admin)

**Body (optional):**
```json
{
  "username": "admin",
  "password": "YourPassword123!",
  "fullName": "Super Admin"
}
```

**Default credentials (jika body kosong):**
- Username: `superadmin`
- Password: `Admin123!`
- Full Name: `Super Admin`

---

#### 📁 `clock-attendance/index.ts`

**Fungsi:** Mencatat absensi (clock in/out, break) dengan validasi:
- Geofence (jarak ke kantor)
- Akurasi GPS
- Duplikasi absensi
- Server-side timestamp

**Endpoint:** `POST /functions/v1/clock-attendance`

**Auth:** Bearer token (user harus login)

**Body:**
```json
{
  "record_type": "clock_in",
  "latitude": -6.200000,
  "longitude": 106.816666,
  "accuracy_meters": 10,
  "photo_url": "https://...supabase.co/storage/v1/object/public/attendance-photos/..."
}
```

**record_type values:** `clock_in`, `clock_out`, `break_out`, `break_in`

---

#### 📁 `create-user/index.ts`

**Fungsi:** Admin/Developer membuat user baru.

**Endpoint:** `POST /functions/v1/create-user`

**Auth:** Bearer token (harus admin/developer)

**Body:**
```json
{
  "fullName": "John Doe",
  "password": "Password123",
  "role": "employee"
}
```

**role values:** `employee`, `admin` (developer tidak bisa dibuat via API)

---

#### 📁 `delete-user/index.ts`

**Fungsi:** Admin/Developer menghapus user.

**Endpoint:** `POST /functions/v1/delete-user`

**Auth:** Bearer token (harus admin/developer)

**Body:**
```json
{
  "userId": "uuid-of-user-to-delete"
}
```

---

#### 📁 `send-reset-password/index.ts`

**Fungsi:** Mengirim email reset password via Resend.

**Endpoint:** `POST /functions/v1/send-reset-password`

**Auth:** Tidak perlu auth

**Body:**
```json
{
  "email": "user@example.com",
  "redirectTo": "https://yourapp.com/auth"
}
```

**Requirement:** `RESEND_API_KEY` harus di-set di secrets.

---

## 3. LANGKAH DEPLOYMENT

### 3.1 Setup Database

1. Buat project Supabase baru (atau self-hosted)
2. Buka SQL Editor
3. Jalankan file `supabase/external-setup.sql`
4. Verifikasi dengan query di Section 23

### 3.2 Deploy Edge Functions

**Via Supabase CLI:**

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link project
supabase link --project-ref YOUR_PROJECT_REF

# Deploy semua functions
supabase functions deploy bootstrap-admin
supabase functions deploy clock-attendance
supabase functions deploy create-user
supabase functions deploy delete-user
supabase functions deploy send-reset-password
```

**Atau deploy manual:**
1. Buka Supabase Dashboard → Edge Functions
2. Create function dengan nama sesuai
3. Copy-paste source code dari masing-masing file

### 3.3 Set Secrets

```bash
# Via CLI
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxx

# Atau via Dashboard
# Settings → Edge Functions → Secrets
```

### 3.4 Build Frontend

```bash
# Install dependencies
npm install

# Build production
npm run build

# Output di folder 'dist/'
```

### 3.5 Deploy Frontend ke VPS

**Dengan Nginx:**

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    root /var/www/geoattend/dist;
    index index.html;

    # SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

**PENTING:** Aplikasi HARUS di-serve via **HTTPS** agar Geolocation API dan Camera API berfungsi!

### 3.6 Buat Admin Pertama

**Via curl:**

```bash
curl -X POST \
  'https://YOUR_PROJECT.supabase.co/functions/v1/bootstrap-admin' \
  -H 'Content-Type: application/json' \
  -d '{
    "username": "admin",
    "password": "YourSecurePassword123!",
    "fullName": "Administrator"
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Admin berhasil dibuat! Login dengan username: admin",
  "credentials": {
    "username": "admin",
    "password": "YourSecurePassword123!",
    "note": "GANTI PASSWORD SEGERA SETELAH LOGIN!"
  }
}
```

---

## 4. TROUBLESHOOTING

### Error: "Geolocation not available"
- Pastikan app di-serve via HTTPS
- User harus izinkan akses lokasi di browser

### Error: "Edge function returned 500"
- Cek logs: Supabase Dashboard → Edge Functions → Logs
- Pastikan semua secrets sudah di-set
- Pastikan database sudah di-setup dengan benar

### Error: "RLS policy violation"
- User belum login
- User tidak punya akses ke resource tersebut
- Cek RLS policies di database

### Error: "Photo upload failed"
- Cek storage bucket RLS policies
- Pastikan bucket `attendance-photos` ada dan public

### Email reset password tidak terkirim
- Pastikan `RESEND_API_KEY` sudah di-set
- Verifikasi domain di Resend (untuk production)

---

## 📁 FILE STRUKTUR

```
supabase/
├── config.toml                     # Supabase config
├── external-setup.sql              # Full database setup SQL
├── seed.sql                        # Seed data
└── functions/
    ├── bootstrap-admin/
    │   └── index.ts
    ├── clock-attendance/
    │   ├── config.toml
    │   └── index.ts
    ├── create-user/
    │   └── index.ts
    ├── delete-user/
    │   └── index.ts
    └── send-reset-password/
        └── index.ts
```

---

## 🔐 SECURITY CHECKLIST

- [ ] Ganti password admin default setelah setup
- [ ] Pastikan HTTPS enabled untuk frontend
- [ ] Set `RESEND_API_KEY` untuk production email
- [ ] Review RLS policies untuk kebutuhan spesifik
- [ ] Enable audit logs untuk monitoring
- [ ] Backup database secara berkala

---

## 📞 SUPPORT

Jika ada masalah, cek:
1. `INSTALLATION.md` - Panduan instalasi detail
2. `FEATURES.md` - Daftar fitur lengkap
3. Console browser (F12) - Error frontend
4. Supabase Dashboard → Logs - Error backend
