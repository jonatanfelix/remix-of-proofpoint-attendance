# GeoAttend - Self-Hosted Deployment Guide

Panduan lengkap untuk deploy GeoAttend ke VPS dengan Self-Hosted Supabase.

**Versi:** 1.0.0  
**Last Updated:** Januari 2025

---

## 📋 DAFTAR ISI

1. [Persyaratan Sistem](#1-persyaratan-sistem)
2. [Environment Variables](#2-environment-variables)
3. [Edge Functions](#3-edge-functions)
4. [Database Setup](#4-database-setup)
5. [Frontend Routing & Build](#5-frontend-routing--build)
6. [Nginx Configuration](#6-nginx-configuration)
7. [SSL/HTTPS Setup](#7-sslhttps-setup)
8. [Deploy Edge Functions](#8-deploy-edge-functions)
9. [Post-Deployment Setup](#9-post-deployment-setup)
10. [Troubleshooting](#10-troubleshooting)
11. [Security Checklist](#11-security-checklist)

---

## 1. PERSYARATAN SISTEM

### 1.1 VPS Minimum Requirements

| Komponen | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 1 Core | 2+ Cores |
| RAM | 1 GB | 2+ GB |
| Storage | 10 GB | 20+ GB |
| OS | Ubuntu 20.04+ | Ubuntu 22.04 LTS |

### 1.2 Software Requirements

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install required packages
sudo apt install -y nginx certbot python3-certbot-nginx curl git

# Install Node.js 18+ (via NodeSource)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installations
node --version    # Should be v18+
npm --version     # Should be 9+
nginx -v          # Should be 1.18+
```

### 1.3 Domain Requirements

- Domain sudah pointing ke IP VPS (A Record)
- Contoh: `absenajadlu.my.id` → `123.456.789.10`

---

## 2. ENVIRONMENT VARIABLES

### 2.1 Frontend Environment Variables

Buat file `.env` di root project sebelum build:

```env
# ============================================
# FRONTEND ENVIRONMENT VARIABLES
# ============================================

# WAJIB - Supabase Connection
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# OPTIONAL - For debugging
VITE_SUPABASE_PROJECT_ID=your-project-ref
```

| Variable | Deskripsi | Contoh |
|----------|-----------|--------|
| `VITE_SUPABASE_URL` | URL Supabase project Anda | `https://abcdefgh.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Anon/Public key (aman untuk frontend) | `eyJhbGci...` |
| `VITE_SUPABASE_PROJECT_ID` | Project reference ID | `abcdefgh` |

**📍 Catatan Penting:**
- **TIDAK ADA Google Maps API key** - Aplikasi menggunakan **Leaflet + OpenStreetMap** (gratis, tanpa API key)
- Semua `VITE_*` variables akan di-embed saat build, jadi set sebelum `npm run build`

### 2.2 Backend Environment Variables (Edge Functions)

Secrets yang harus di-set di Supabase Dashboard → Settings → Edge Functions → Secrets:

| Secret Name | Deskripsi | Wajib? | Auto-Set? |
|-------------|-----------|--------|-----------|
| `SUPABASE_URL` | URL Supabase project | ✅ Ya | ✅ Ya |
| `SUPABASE_ANON_KEY` | Anon/Public key | ✅ Ya | ✅ Ya |
| `SUPABASE_SERVICE_ROLE_KEY` | Service Role key (admin) | ✅ Ya | ✅ Ya |
| `RESEND_API_KEY` | API key dari Resend.com | ⚠️ Opsional | ❌ Manual |

**Cara mendapatkan keys:**
1. Buka Supabase Dashboard
2. Pergi ke Settings → API
3. Copy "Project URL" → `SUPABASE_URL`
4. Copy "anon public" → `SUPABASE_ANON_KEY`
5. Copy "service_role" → `SUPABASE_SERVICE_ROLE_KEY`

**Untuk RESEND_API_KEY (opsional, untuk reset password email):**
1. Daftar di https://resend.com
2. Buat API key
3. Set di Supabase Secrets

---

## 3. EDGE FUNCTIONS

### 3.1 Daftar Edge Functions

Aplikasi ini menggunakan **5 Edge Functions**:

| # | Function Name | File Path | Fungsi |
|---|---------------|-----------|--------|
| 1 | `bootstrap-admin` | `supabase/functions/bootstrap-admin/index.ts` | Buat admin pertama saat setup awal |
| 2 | `clock-attendance` | `supabase/functions/clock-attendance/index.ts` | Clock in/out dengan validasi geofence |
| 3 | `create-user` | `supabase/functions/create-user/index.ts` | Admin membuat user baru |
| 4 | `delete-user` | `supabase/functions/delete-user/index.ts` | Admin menghapus user |
| 5 | `send-reset-password` | `supabase/functions/send-reset-password/index.ts` | Kirim email reset password |

### 3.2 Detail Setiap Edge Function

---

#### 📁 Function 1: `bootstrap-admin`

**Tujuan:** Membuat admin/developer pertama saat setup awal.

**Endpoint:** 
```
POST https://[PROJECT_REF].supabase.co/functions/v1/bootstrap-admin
```

**Authorization:** Tidak perlu (hanya bisa dipanggil 1x jika belum ada admin)

**Request Body (optional):**
```json
{
  "username": "admin",
  "password": "YourSecurePassword123!",
  "fullName": "Super Admin"
}
```

**Default Credentials (jika body kosong):**
| Field | Default Value |
|-------|---------------|
| Username | `superadmin` |
| Password | `Admin123!` |
| Full Name | `Super Admin` |

**Response Success:**
```json
{
  "success": true,
  "message": "Admin berhasil dibuat! Login dengan username: admin",
  "credentials": {
    "username": "admin",
    "password": "YourSecurePassword123!",
    "note": "GANTI PASSWORD SEGERA SETELAH LOGIN!"
  },
  "user": {
    "id": "uuid-here",
    "username": "admin",
    "role": "developer"
  }
}
```

---

#### 📁 Function 2: `clock-attendance`

**Tujuan:** Mencatat absensi dengan validasi server-side.

**Validasi yang dilakukan:**
- ✅ Geofence (jarak ke kantor)
- ✅ Akurasi GPS (max 50km untuk desktop, idealnya 100m untuk mobile)
- ✅ Duplikasi absensi (tidak bisa clock-in 2x)
- ✅ Server-side timestamp (anti manipulasi waktu)
- ✅ Foto wajib

**Endpoint:**
```
POST https://[PROJECT_REF].supabase.co/functions/v1/clock-attendance
```

**Authorization:** Bearer token (user harus login)

**Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json
```

**Request Body:**
```json
{
  "record_type": "clock_in",
  "latitude": -6.200000,
  "longitude": 106.816666,
  "accuracy_meters": 10,
  "photo_url": "https://[PROJECT_REF].supabase.co/storage/v1/object/public/attendance-photos/user-id/photo.jpg"
}
```

**record_type values:**

| Value | Deskripsi |
|-------|-----------|
| `clock_in` | Masuk kerja |
| `clock_out` | Pulang kerja |
| `break_out` | Mulai istirahat |
| `break_in` | Selesai istirahat |

**Response Success:**
```json
{
  "success": true,
  "message": "Berhasil Clock In!",
  "record": {
    "id": "uuid",
    "user_id": "uuid",
    "record_type": "clock_in",
    "recorded_at": "2025-01-19T08:00:00Z",
    "latitude": -6.200000,
    "longitude": 106.816666
  }
}
```

**Response Error (Geofence):**
```json
{
  "error": "Anda berada 500m dari kantor. Maksimal 100m untuk absen.",
  "code": "OUTSIDE_GEOFENCE",
  "distance": 500,
  "max_distance": 100
}
```

---

#### 📁 Function 3: `create-user`

**Tujuan:** Admin/Developer membuat user baru.

**Endpoint:**
```
POST https://[PROJECT_REF].supabase.co/functions/v1/create-user
```

**Authorization:** Bearer token (harus role admin/developer)

**Request Body:**
```json
{
  "fullName": "John Doe",
  "password": "Password123",
  "role": "employee"
}
```

**Role values:**
| Value | Bisa dibuat oleh |
|-------|------------------|
| `employee` | Admin atau Developer |
| `admin` | Developer only |
| `developer` | ❌ Tidak bisa via API |

**Response Success:**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "username": "john.doe",
    "role": "employee",
    "company_id": "uuid"
  }
}
```

---

#### 📁 Function 4: `delete-user`

**Tujuan:** Admin/Developer menghapus user.

**Endpoint:**
```
POST https://[PROJECT_REF].supabase.co/functions/v1/delete-user
```

**Authorization:** Bearer token (harus role admin/developer)

**Request Body:**
```json
{
  "userId": "uuid-of-user-to-delete"
}
```

**Restrictions:**
- ❌ Tidak bisa menghapus diri sendiri
- ❌ Employee tidak bisa menghapus siapapun

---

#### 📁 Function 5: `send-reset-password`

**Tujuan:** Mengirim email reset password.

**Endpoint:**
```
POST https://[PROJECT_REF].supabase.co/functions/v1/send-reset-password
```

**Authorization:** Tidak perlu

**Requirement:** `RESEND_API_KEY` harus di-set di secrets

**Request Body:**
```json
{
  "email": "user@example.com",
  "redirectTo": "https://absenajadlu.my.id/auth"
}
```

**Response Success:**
```json
{
  "success": true,
  "message": "Reset password email sent"
}
```

---

## 4. DATABASE SETUP

### 4.1 Menjalankan SQL Setup

1. Buka Supabase Dashboard
2. Pergi ke SQL Editor
3. Copy seluruh isi file `supabase/external-setup.sql`
4. Paste dan Run

### 4.2 Verifikasi Setup

Jalankan query berikut untuk memastikan setup berhasil:

```sql
-- Check tables created
SELECT tablename FROM pg_tables WHERE schemaname = 'public';

-- Expected: companies, shifts, profiles, user_roles, locations, 
--           attendance_records, holidays, leave_requests, audit_logs

-- Check company exists
SELECT id, name FROM public.companies;

-- Check shifts exist
SELECT name, start_time, end_time FROM public.shifts WHERE is_active = true;

-- Check storage buckets
SELECT id, name, public FROM storage.buckets;

-- Expected: attendance-photos, avatars, leave-proofs

-- Check RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND rowsecurity = true;
```

---

## 5. FRONTEND ROUTING & BUILD

### 5.1 Routing Configuration

**Current Setup:**

| Aspek | Nilai | Keterangan |
|-------|-------|------------|
| **Router** | `BrowserRouter` | HTML5 History Mode |
| **Base Path** | `/` (Root) | Default, deploy di root domain |
| **Config File** | `vite.config.ts` | Tidak ada `base` setting = root |

**Daftar Routes:**

| Route | Page | Access |
|-------|------|--------|
| `/` | Dashboard | 🔒 Protected |
| `/auth` | Login | 🌐 Public |
| `/clock` | Clock In/Out | 🔒 Protected |
| `/history` | Attendance History | 🔒 Protected |
| `/profile` | User Profile | 🔒 Protected |
| `/leave-request` | Leave Request | 🔒 Protected |
| `/admin` | Admin Dashboard | 🔒 Protected (Admin) |
| `/admin/settings` | Company Settings | 🔒 Protected (Admin) |
| `/admin/employees` | Employee Management | 🔒 Protected (Admin) |
| `/admin/leaves` | Leave Approvals | 🔒 Protected (Admin) |
| `/admin/holidays` | Holiday Management | 🔒 Protected (Admin) |
| `/admin/daily` | Daily Monitor | 🔒 Protected (Admin) |
| `/admin/reports` | Reports | 🔒 Protected (Admin) |
| `/admin/payroll` | Payroll | 🔒 Protected (Admin) |
| `/admin/analytics` | Analytics | 🔒 Protected (Admin) |
| `/admin/audit-logs` | Audit Logs | 🔒 Protected (Admin) |
| `*` | 404 Not Found | 🌐 Public |

### 5.2 Build Frontend

```bash
# Clone repository
git clone https://github.com/your-repo/geoattend.git
cd geoattend

# Install dependencies
npm install

# Create .env file
cat > .env << EOF
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key-here
EOF

# Build for production
npm run build

# Output folder: dist/
ls -la dist/
```

### 5.3 Deploy di Subfolder (Opsional)

Jika ingin deploy di subfolder (misal `https://domain.com/absen/`):

**1. Update `vite.config.ts`:**

```typescript
export default defineConfig(({ mode }) => ({
  base: '/absen/',  // Tambahkan ini
  server: {
    host: "::",
    port: 8080,
  },
  // ... rest of config
}));
```

**2. Rebuild:**
```bash
npm run build
```

---

## 6. NGINX CONFIGURATION

### 6.1 Deploy di Root Domain

**File:** `/etc/nginx/sites-available/geoattend`

```nginx
# ============================================
# GeoAttend - Nginx Configuration
# Deploy at: https://absenajadlu.my.id/
# ============================================

server {
    listen 80;
    listen [::]:80;
    server_name absenajadlu.my.id www.absenajadlu.my.id;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name absenajadlu.my.id www.absenajadlu.my.id;

    # ========================================
    # SSL Configuration (Let's Encrypt)
    # ========================================
    ssl_certificate /etc/letsencrypt/live/absenajadlu.my.id/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/absenajadlu.my.id/privkey.pem;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_session_tickets off;

    # Modern SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # HSTS (optional but recommended)
    add_header Strict-Transport-Security "max-age=63072000" always;

    # ========================================
    # Document Root
    # ========================================
    root /var/www/geoattend/dist;
    index index.html;

    # ========================================
    # Security Headers
    # ========================================
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # ========================================
    # CRITICAL: SPA History Mode Routing
    # ========================================
    # Semua route yang tidak match file fisik akan di-redirect ke index.html
    # Ini WAJIB untuk React Router BrowserRouter
    
    location / {
        try_files $uri $uri/ /index.html;
    }

    # ========================================
    # Static Assets Caching
    # ========================================
    # JavaScript dan CSS (hashed filenames)
    location ~* \.(?:css|js)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # Images dan fonts
    location ~* \.(?:jpg|jpeg|png|gif|ico|svg|webp|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # ========================================
    # Gzip Compression
    # ========================================
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/json
        application/javascript
        application/xml
        application/xml+rss
        application/x-javascript
        image/svg+xml;

    # ========================================
    # Error Pages
    # ========================================
    error_page 404 /index.html;
    error_page 500 502 503 504 /index.html;

    # ========================================
    # Deny access to hidden files
    # ========================================
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }

    # ========================================
    # Logging
    # ========================================
    access_log /var/log/nginx/geoattend.access.log;
    error_log /var/log/nginx/geoattend.error.log;
}
```

### 6.2 Deploy di Subfolder

**File:** `/etc/nginx/sites-available/geoattend-subfolder`

```nginx
# ============================================
# GeoAttend - Nginx Configuration (Subfolder)
# Deploy at: https://domain.com/absen/
# ============================================

server {
    listen 443 ssl http2;
    server_name domain.com;

    # SSL config...

    # Other locations for main site...

    # ========================================
    # GeoAttend App at /absen/
    # ========================================
    location /absen/ {
        alias /var/www/geoattend/dist/;
        index index.html;
        
        # SPA routing for subfolder
        try_files $uri $uri/ /absen/index.html;
    }

    # Static assets for /absen/
    location ~* ^/absen/.*\.(?:css|js|jpg|jpeg|png|gif|ico|svg|webp|woff|woff2)$ {
        alias /var/www/geoattend/dist/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### 6.3 Enable Site & Reload Nginx

```bash
# Create symlink to enable site
sudo ln -s /etc/nginx/sites-available/geoattend /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# If test OK, reload nginx
sudo systemctl reload nginx

# Check status
sudo systemctl status nginx
```

---

## 7. SSL/HTTPS SETUP

### 7.1 Install SSL dengan Certbot

```bash
# Install certbot for nginx
sudo apt install certbot python3-certbot-nginx -y

# Get SSL certificate
sudo certbot --nginx -d absenajadlu.my.id -d www.absenajadlu.my.id

# Follow prompts:
# - Enter email
# - Agree to terms
# - Choose redirect HTTP to HTTPS (recommended)
```

### 7.2 Auto-Renewal

Certbot otomatis setup cron job untuk renewal. Verify:

```bash
# Test renewal
sudo certbot renew --dry-run

# Check cron/timer
sudo systemctl status certbot.timer
```

### 7.3 Kenapa HTTPS Wajib?

| API | Tanpa HTTPS | Dengan HTTPS |
|-----|-------------|--------------|
| Geolocation API | ❌ Blocked | ✅ Works |
| Camera/MediaDevices API | ❌ Blocked | ✅ Works |
| Service Workers | ❌ Blocked | ✅ Works |
| Secure Cookies | ❌ Not sent | ✅ Works |

**⚠️ PENTING:** Aplikasi ini memerlukan GPS dan Kamera, yang HANYA berfungsi di HTTPS!

---

## 8. DEPLOY EDGE FUNCTIONS

### 8.1 Via Supabase CLI

```bash
# Install Supabase CLI (if not installed)
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref YOUR_PROJECT_REF

# Deploy all functions
supabase functions deploy bootstrap-admin
supabase functions deploy clock-attendance
supabase functions deploy create-user
supabase functions deploy delete-user
supabase functions deploy send-reset-password

# Verify deployment
supabase functions list
```

### 8.2 Via Dashboard (Manual)

1. Buka Supabase Dashboard
2. Pergi ke Edge Functions
3. Click "New Function"
4. Masukkan nama function (e.g., `bootstrap-admin`)
5. Copy-paste code dari file `supabase/functions/[name]/index.ts`
6. Click Deploy
7. Ulangi untuk semua 5 functions

### 8.3 Set Secrets

```bash
# Set RESEND_API_KEY (optional, for email)
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxx

# List secrets
supabase secrets list
```

Atau via Dashboard: Settings → Edge Functions → Secrets

---

## 9. POST-DEPLOYMENT SETUP

### 9.1 Deploy Files ke VPS

```bash
# On your local machine
npm run build
scp -r dist/* user@your-vps:/var/www/geoattend/dist/

# Or via rsync (recommended)
rsync -avz --delete dist/ user@your-vps:/var/www/geoattend/dist/
```

### 9.2 Set Permissions

```bash
# On VPS
sudo chown -R www-data:www-data /var/www/geoattend
sudo chmod -R 755 /var/www/geoattend
```

### 9.3 Buat Admin Pertama

```bash
# Via curl
curl -X POST \
  'https://YOUR_PROJECT_REF.supabase.co/functions/v1/bootstrap-admin' \
  -H 'Content-Type: application/json' \
  -d '{
    "username": "admin",
    "password": "YourSecurePassword123!",
    "fullName": "Administrator"
  }'
```

**Atau tanpa body (pakai default credentials):**
```bash
curl -X POST 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/bootstrap-admin'
```

### 9.4 Test Login

1. Buka `https://absenajadlu.my.id/auth`
2. Login dengan username dan password yang dibuat
3. Verifikasi bisa masuk ke dashboard

### 9.5 Update Company Settings

1. Login sebagai admin
2. Pergi ke Admin → Settings
3. Update:
   - Nama perusahaan
   - Koordinat kantor (latitude, longitude)
   - Radius geofence
   - Jam kerja

---

## 10. TROUBLESHOOTING

### 10.1 Frontend Issues

| Problem | Penyebab | Solusi |
|---------|----------|--------|
| Blank page | JS error | Cek browser console (F12) |
| 404 on refresh | Nginx tidak handle SPA | Pastikan `try_files` ada |
| "Not Secure" warning | No HTTPS | Setup SSL dengan certbot |
| Geolocation blocked | HTTP only | HARUS pakai HTTPS |
| Camera blocked | HTTP only | HARUS pakai HTTPS |

### 10.2 Backend/Edge Function Issues

| Problem | Penyebab | Solusi |
|---------|----------|--------|
| 500 Internal Error | Code error | Cek logs di Supabase Dashboard |
| 401 Unauthorized | Token invalid | Re-login, cek auth |
| 403 Forbidden | Role tidak sesuai | Cek user_roles table |
| CORS error | Missing headers | Pastikan corsHeaders ada |
| Reset email tidak terkirim | RESEND_API_KEY tidak ada | Set secret |

### 10.3 Database Issues

| Problem | Penyebab | Solusi |
|---------|----------|--------|
| RLS policy violation | User tidak punya akses | Cek RLS policies |
| Profile not found | Trigger gagal | Manual insert profile |
| Company not found | Seed data belum dirun | Run seed.sql |

### 10.4 Useful Commands

```bash
# Check nginx error logs
sudo tail -f /var/log/nginx/geoattend.error.log

# Check nginx access logs
sudo tail -f /var/log/nginx/geoattend.access.log

# Test nginx config
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx

# Check SSL certificate expiry
sudo certbot certificates

# Check disk space
df -h

# Check memory usage
free -m
```

---

## 11. SECURITY CHECKLIST

### 11.1 Pre-Deployment

- [ ] Generate strong password untuk admin
- [ ] Review RLS policies sesuai kebutuhan
- [ ] Pastikan service_role key TIDAK exposed di frontend

### 11.2 Post-Deployment

- [ ] ✅ HTTPS enabled (wajib untuk GPS/Camera)
- [ ] ✅ Ganti password admin default
- [ ] ✅ Setup firewall (UFW)
- [ ] ✅ Disable SSH password login (gunakan key)
- [ ] ✅ Setup fail2ban untuk brute force protection
- [ ] ✅ Regular security updates

### 11.3 Firewall Setup (UFW)

```bash
# Enable UFW
sudo ufw enable

# Allow SSH, HTTP, HTTPS
sudo ufw allow ssh
sudo ufw allow http
sudo ufw allow https

# Check status
sudo ufw status
```

### 11.4 Regular Maintenance

```bash
# Weekly: Update system
sudo apt update && sudo apt upgrade -y

# Monthly: Check disk usage
df -h

# Monthly: Review audit logs di app
# Admin → Audit Logs

# Quarterly: Rotate nginx logs
sudo logrotate /etc/logrotate.d/nginx
```

---

## 📁 FILE STRUCTURE REFERENCE

```
project-root/
├── .env                            # Frontend env vars (create before build)
├── dist/                           # Build output (deploy this folder)
├── src/                            # Source code
│   ├── App.tsx                     # Main app with routes
│   ├── pages/                      # Page components
│   └── ...
├── supabase/
│   ├── config.toml                 # Supabase CLI config
│   ├── external-setup.sql          # Complete DB setup SQL
│   ├── seed.sql                    # Seed data
│   └── functions/
│       ├── bootstrap-admin/
│       │   └── index.ts
│       ├── clock-attendance/
│       │   ├── config.toml
│       │   └── index.ts
│       ├── create-user/
│       │   └── index.ts
│       ├── delete-user/
│       │   └── index.ts
│       └── send-reset-password/
│           └── index.ts
├── vite.config.ts                  # Vite build config
├── DEPLOYMENT.md                   # This file
├── INSTALLATION.md                 # Installation guide
├── FEATURES.md                     # Feature list
└── README.md                       # Project readme
```

---

## 📞 QUICK REFERENCE

### URLs

| Service | URL |
|---------|-----|
| App | `https://absenajadlu.my.id/` |
| Supabase Dashboard | `https://supabase.com/dashboard/project/YOUR_REF` |
| Edge Functions | `https://YOUR_REF.supabase.co/functions/v1/[name]` |
| Storage | `https://YOUR_REF.supabase.co/storage/v1/object/public/[bucket]/` |

### Important Files

| File | Purpose |
|------|---------|
| `supabase/external-setup.sql` | Complete database setup |
| `supabase/functions/*/index.ts` | Edge function source code |
| `.env` | Frontend environment variables |
| `/etc/nginx/sites-available/geoattend` | Nginx configuration |

---

**🎉 Deployment Complete!**

Jika ada masalah, cek:
1. Browser Console (F12) - Frontend errors
2. Supabase Dashboard → Logs - Backend errors
3. `/var/log/nginx/geoattend.error.log` - Nginx errors
