# GeoAttend - Dokumentasi Fitur

## Daftar Isi

1. [Autentikasi](#autentikasi)
2. [Dashboard Karyawan](#dashboard-karyawan)
3. [Sistem Lokasi & Geofencing](#sistem-lokasi--geofencing)
4. [Sistem Kamera & Foto](#sistem-kamera--foto)
5. [Pengajuan Cuti](#pengajuan-cuti)
6. [Panel Admin](#panel-admin)
7. [Audit Log](#audit-log)
8. [Keamanan](#keamanan)

---

## Autentikasi

### Login
- Email dan password authentication
- Auto-confirm email signup (tidak perlu verifikasi email)
- Session management dengan Supabase Auth

### Role System
| Role | Akses |
|------|-------|
| `employee` | Dashboard, profil, pengajuan cuti |
| `admin` | Semua fitur employee + panel admin |
| `developer` | Akses penuh ke semua data dan fitur |

---

## Dashboard Karyawan

### Status Kehadiran
- Menampilkan status: Belum Clock In, Sudah Clock In, Sudah Clock Out
- Informasi shift yang ditugaskan
- Indikator keterlambatan jika clock in setelah waktu mulai shift

### Tombol Absensi
- **Clock In**: Tersedia saat belum melakukan clock in hari ini
- **Clock Out**: Tersedia setelah clock in

### Riwayat Terbaru
- Menampilkan 5 record kehadiran terakhir
- Informasi waktu, tipe, dan lokasi

---

## Sistem Lokasi & Geofencing

### Arsitektur

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Browser API   │────▶│  Frontend Check  │────▶│ Backend Validate│
│ (Geolocation)   │     │  (Quick Filter)  │     │ (Final Decision)│
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

### Detail Teknis - Frontend (`src/lib/geolocation.ts`)

#### Fungsi `getCurrentPosition()`
```typescript
// Konfigurasi GPS
const options = {
  enableHighAccuracy: true,    // Gunakan GPS hardware
  timeout: 15000,              // Timeout 15 detik
  maximumAge: 60000            // Cache lokasi max 1 menit
};
```

#### Validasi Akurasi Frontend
- **Batas akurasi**: 100 meter
- Jika akurasi > 100m, akan ditolak dengan pesan error

#### Error Handling
| Kode Error | Pesan |
|------------|-------|
| `PERMISSION_DENIED` | Akses lokasi ditolak. Izinkan di pengaturan browser. |
| `POSITION_UNAVAILABLE` | Lokasi tidak tersedia. Pastikan GPS aktif. |
| `TIMEOUT` | Waktu habis mendapatkan lokasi. Coba lagi. |
| `LOW_ACCURACY` | Akurasi GPS terlalu rendah ({accuracy}m). Coba di tempat terbuka. |

### Detail Teknis - Backend (`supabase/functions/clock-attendance/index.ts`)

#### Validasi Akurasi Backend
```typescript
// LEBIH KETAT dari frontend
const MAX_ACCURACY_METERS = 100;

if (accuracy_meters > MAX_ACCURACY_METERS) {
  return Response({ 
    error: `Akurasi GPS terlalu rendah (${accuracy_meters}m)`,
    code: 'LOW_ACCURACY'
  }, { status: 400 });
}
```

#### Perhitungan Jarak (Haversine Formula)
```typescript
function calculateDistance(lat1, lng1, lat2, lng2): number {
  const R = 6371000; // Radius bumi dalam meter
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // Jarak dalam meter
}
```

#### Validasi Geofence
```typescript
// Ambil lokasi kantor dari database
const { data: company } = await supabaseAdmin
  .from('companies')
  .select('office_latitude, office_longitude, radius_meters')
  .eq('id', profile.company_id)
  .single();

// Hitung jarak dari kantor
const distance = calculateDistance(
  latitude, longitude,
  company.office_latitude, company.office_longitude
);

// Validasi dalam radius
if (distance > company.radius_meters) {
  return Response({
    error: `Anda berada ${Math.round(distance)}m dari kantor. Maksimal ${company.radius_meters}m.`,
    code: 'OUTSIDE_GEOFENCE'
  }, { status: 400 });
}
```

#### Deteksi Lokasi Mencurigakan
```typescript
// Flag jika akurasi sangat tinggi tapi tepat di batas geofence
const distanceFromEdge = Math.abs(distance - company.radius_meters);
if (accuracy_meters < 10 && distanceFromEdge < 5) {
  // Catat sebagai suspicious dalam audit log
  await supabaseAdmin.rpc('log_audit_event', {
    p_action: 'suspicious_location',
    p_details: { 
      distance, 
      accuracy: accuracy_meters,
      reason: 'High accuracy at geofence edge'
    }
  });
}
```

### Tipe Karyawan & Geofence

| Tipe | `requires_geofence` | Validasi Lokasi |
|------|---------------------|-----------------|
| `office` | `true` | Wajib dalam radius kantor |
| `field` | `false` | Tidak ada validasi lokasi |

### Komponen UI Lokasi

#### `LocationStatus.tsx`
Menampilkan status lokasi:
- ⏳ Loading: "Detecting your location..."
- ❌ Error: Pesan error dengan tombol retry
- ✅ Dalam radius: "You are at the location" + nama lokasi
- ⚠️ Diluar radius: "Outside allowed area" + jarak

#### `LocationMap.tsx`
Peta interaktif menggunakan Leaflet:
- Marker posisi user
- Circle akurasi GPS (radius biru transparan)
- OpenStreetMap tiles
- Zoom level 16 (detail jalan)

---

## Sistem Kamera & Foto

### Arsitektur

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────────┐
│   Camera    │────▶│   Capture    │────▶│  Watermark  │────▶│   Upload     │
│   Stream    │     │   to Canvas  │     │   Overlay   │     │   Storage    │
└─────────────┘     └──────────────┘     └─────────────┘     └──────────────┘
```

### Detail Teknis (`src/components/attendance/CameraCapture.tsx`)

#### Inisialisasi Kamera
```typescript
const startCamera = async () => {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: 'user',      // Kamera depan (selfie)
      width: { ideal: 1280 },  // Resolusi ideal
      height: { ideal: 720 }
    },
    audio: false               // Tanpa audio
  });
  
  videoRef.current.srcObject = stream;
  streamRef.current = stream;
};
```

#### Proses Capture Foto
```typescript
const capturePhoto = () => {
  const canvas = canvasRef.current;
  const video = videoRef.current;
  const ctx = canvas.getContext('2d');
  
  // Set ukuran canvas sesuai video
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  
  // Gambar frame video ke canvas
  ctx.drawImage(video, 0, 0);
  
  // Tambahkan watermark
  addWatermark(ctx, canvas.width, canvas.height);
  
  // Convert ke data URL
  const photoDataUrl = canvas.toDataURL('image/jpeg', 0.8);
  onCapture(photoDataUrl);
};
```

#### Watermark System

Watermark ditambahkan langsung ke foto (bukan overlay terpisah):

```typescript
const addWatermark = (ctx, width, height) => {
  // Background semi-transparan di bagian bawah
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(0, height - 100, width, 100);
  
  // Text watermark
  ctx.fillStyle = 'white';
  ctx.font = 'bold 16px Arial';
  
  // Baris 1: Nama karyawan
  ctx.fillText(`👤 ${employeeName}`, 10, height - 75);
  
  // Baris 2: Tipe record (Clock In / Clock Out)
  ctx.fillText(`📋 ${recordType}`, 10, height - 55);
  
  // Baris 3: Timestamp
  const timestamp = new Date().toLocaleString('id-ID', {
    dateStyle: 'full',
    timeStyle: 'medium'
  });
  ctx.fillText(`🕐 ${timestamp}`, 10, height - 35);
  
  // Baris 4: Koordinat GPS
  ctx.fillText(`📍 ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`, 10, height - 15);
};
```

#### Informasi Watermark

| Elemen | Format | Contoh |
|--------|--------|--------|
| Nama | `👤 {full_name}` | 👤 John Doe |
| Tipe | `📋 {record_type}` | 📋 Clock In |
| Waktu | `🕐 {datetime}` | 🕐 Sabtu, 28 Desember 2024, 08.00.00 |
| GPS | `📍 {lat}, {lng}` | 📍 -6.200000, 106.816666 |

### Upload Foto ke Storage

```typescript
// Convert data URL ke blob
const response = await fetch(photoDataUrl);
const blob = await response.blob();

// Generate filename unik
const fileName = `${userId}/${Date.now()}_${recordType}.jpg`;

// Upload ke Supabase Storage
const { data, error } = await supabase.storage
  .from('attendance-photos')
  .upload(fileName, blob, {
    contentType: 'image/jpeg',
    upsert: false
  });

// Dapatkan public URL
const { data: { publicUrl } } = supabase.storage
  .from('attendance-photos')
  .getPublicUrl(fileName);
```

### Storage Bucket: `attendance-photos`

| Property | Value |
|----------|-------|
| Nama | `attendance-photos` |
| Public | ✅ Yes |
| Format | JPEG |
| Max Size | ~500KB (compressed) |
| Struktur Path | `{user_id}/{timestamp}_{record_type}.jpg` |

---

## Pengajuan Cuti

### Tipe Cuti
- Cuti Tahunan
- Sakit
- Izin
- Lainnya

### Workflow

```
┌──────────┐     ┌─────────┐     ┌──────────┐
│ Karyawan │────▶│ Pending │────▶│  Admin   │
│  Submit  │     │         │     │  Review  │
└──────────┘     └─────────┘     └──────────┘
                                       │
                      ┌────────────────┴────────────────┐
                      ▼                                 ▼
               ┌──────────┐                      ┌──────────┐
               │ Approved │                      │ Rejected │
               └──────────┘                      └──────────┘
```

### Field Pengajuan
- Tipe cuti
- Tanggal mulai
- Tanggal selesai
- Alasan
- Bukti pendukung (upload file, opsional)

---

## Panel Admin

### Daftar Karyawan (`/admin/employees`)
- Lihat semua karyawan dalam perusahaan
- Edit profil karyawan
- Assign shift
- Set tipe karyawan (office/field)
- Toggle requires_geofence

### Monitor Harian (`/admin/daily-monitor`)
- Lihat kehadiran hari ini
- Filter berdasarkan status
- Export ke Excel dengan watermark

### Laporan Kehadiran (`/admin`)
- Filter berdasarkan periode
- Filter berdasarkan karyawan
- Export ke Excel dengan:
  - Header watermark (nama perusahaan, exporter, tanggal)
  - Audit log export event

### Pengaturan Perusahaan (`/admin/settings`)
- Nama perusahaan
- Lokasi kantor (latitude, longitude)
- Radius geofence
- Waktu mulai kerja

### Manajemen Hari Libur (`/admin/holidays`)
- Tambah hari libur
- Edit hari libur
- Nonaktifkan hari libur

### Manajemen Shift (`/admin/settings`)
- Nama shift
- Waktu mulai
- Waktu selesai

---

## Audit Log

### Events yang Dicatat

| Action | Resource Type | Trigger |
|--------|---------------|---------|
| `clock_in` | `attendance` | Saat clock in berhasil |
| `clock_out` | `attendance` | Saat clock out berhasil |
| `approve_leave` | `leave_request` | Admin approve cuti |
| `reject_leave` | `leave_request` | Admin reject cuti |
| `export_data` | `attendance_report` | Export data ke Excel |
| `suspicious_location` | `attendance` | Lokasi mencurigakan terdeteksi |

### Data yang Disimpan
```typescript
{
  user_id: string,          // ID user yang melakukan aksi
  user_email: string,       // Email user
  user_role: string,        // Role user
  company_id: string,       // ID perusahaan
  action: string,           // Nama aksi
  resource_type: string,    // Tipe resource
  resource_id: string,      // ID resource (opsional)
  details: object,          // Detail tambahan (JSON)
  ip_address: string,       // IP address (jika tersedia)
  user_agent: string,       // Browser info (jika tersedia)
  created_at: timestamp     // Waktu kejadian
}
```

### Akses Audit Log
- **Admin**: Hanya log perusahaan sendiri
- **Developer**: Semua log

---

## Keamanan

### Row Level Security (RLS)

Semua tabel dilindungi RLS dengan pola:
- Users hanya bisa akses data sendiri
- Admin bisa akses data perusahaan sendiri
- Developer bisa akses semua data

### Validasi Backend

| Check | Lokasi | Aksi jika Gagal |
|-------|--------|-----------------|
| Autentikasi | Edge Function | 401 Unauthorized |
| Akurasi GPS | Edge Function | 400 LOW_ACCURACY |
| Geofence | Edge Function | 400 OUTSIDE_GEOFENCE |
| Duplikat | Edge Function | 400 DUPLICATE_RECORD |
| Profile aktif | Edge Function | 403 Forbidden |

### Proteksi Foto

- Watermark embedded (tidak bisa dihapus)
- Timestamp dari server (tidak bisa dimanipulasi)
- Koordinat GPS tersimpan di database

---

## Diagram Alur Clock In

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER KLIK CLOCK IN                        │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    AMBIL LOKASI GPS (Frontend)                   │
│  • enableHighAccuracy: true                                      │
│  • timeout: 15 detik                                             │
└─────────────────────────────────────────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    │                       │
                    ▼                       ▼
            ┌───────────┐           ┌───────────────┐
            │  Sukses   │           │    Gagal      │
            └───────────┘           │ (error/timeout)│
                    │               └───────────────┘
                    │                       │
                    ▼                       ▼
┌─────────────────────────────┐     ┌─────────────────┐
│   CEK AKURASI < 100m?       │     │  TAMPILKAN      │
└─────────────────────────────┘     │  ERROR MESSAGE  │
            │                       └─────────────────┘
    ┌───────┴───────┐
    │               │
    ▼               ▼
┌───────┐      ┌────────────┐
│  Ya   │      │   Tidak    │
└───────┘      └────────────┘
    │                  │
    ▼                  ▼
┌─────────────┐  ┌─────────────────────┐
│ CEK GEOFENCE│  │ ERROR: Low Accuracy │
│ (Frontend)  │  └─────────────────────┘
└─────────────┘
    │
    ├── Dalam radius ──▶ BUKA KAMERA
    │
    └── Luar radius ───▶ TAMPILKAN WARNING
                         (masih bisa lanjut jika field employee)
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                       BUKA KAMERA                                │
│  • facingMode: 'user' (kamera depan)                             │
│  • Tampilkan preview video                                       │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    USER AMBIL FOTO                               │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                 TAMBAH WATERMARK KE FOTO                         │
│  • Nama karyawan                                                 │
│  • Tipe: Clock In                                                │
│  • Timestamp                                                     │
│  • Koordinat GPS                                                 │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                 UPLOAD FOTO KE STORAGE                           │
│  • Bucket: attendance-photos                                     │
│  • Path: {user_id}/{timestamp}_clock_in.jpg                      │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│              KIRIM KE EDGE FUNCTION (Backend)                    │
│  POST /clock-attendance                                          │
│  Body: { record_type, latitude, longitude, accuracy, photo_url } │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                  VALIDASI BACKEND                                │
│  1. Verifikasi auth token                                        │
│  2. Cek profil user aktif                                        │
│  3. Validasi akurasi GPS < 100m                                  │
│  4. Validasi geofence (jika requires_geofence = true)            │
│  5. Cek duplikat hari ini                                        │
│  6. Deteksi lokasi mencurigakan                                  │
└─────────────────────────────────────────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    │                       │
                    ▼                       ▼
            ┌───────────┐           ┌───────────────┐
            │  Sukses   │           │    Gagal      │
            └───────────┘           └───────────────┘
                    │                       │
                    ▼                       ▼
┌─────────────────────────────┐     ┌─────────────────┐
│  INSERT attendance_records  │     │  RETURN ERROR   │
│  LOG audit_event            │     │  (400/401/403)  │
└─────────────────────────────┘     └─────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                    TAMPILKAN SUKSES                              │
│  • Toast notification                                            │
│  • Refresh status kehadiran                                      │
│  • Update UI                                                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Konfigurasi Database

### Tabel Utama

| Tabel | Deskripsi |
|-------|-----------|
| `profiles` | Data profil karyawan |
| `companies` | Data perusahaan |
| `shifts` | Pengaturan shift kerja |
| `locations` | Lokasi kantor (multi-location support) |
| `attendance_records` | Record kehadiran |
| `leave_requests` | Pengajuan cuti |
| `holidays` | Hari libur |
| `audit_logs` | Log aktivitas |
| `user_roles` | Role assignment |

### Storage Buckets

| Bucket | Public | Kegunaan |
|--------|--------|----------|
| `attendance-photos` | ✅ | Foto absensi |
| `avatars` | ✅ | Foto profil |
| `leave-proofs` | ✅ | Bukti cuti |

---

## Environment Variables

| Variable | Deskripsi |
|----------|-----------|
| `VITE_SUPABASE_URL` | URL Supabase project |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Anon key untuk client |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (edge functions) |

---

*Dokumentasi ini dibuat otomatis berdasarkan kode sumber GeoAttend.*
