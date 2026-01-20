# Alur Sistem Delete Karyawan

Dokumentasi lengkap mengenai proses penghapusan karyawan di sistem GeoAttend.

---

## 📋 Overview

Proses delete karyawan melibatkan **2 komponen utama**:
1. **Frontend** (`src/pages/AdminEmployees.tsx`) - UI dan trigger
2. **Edge Function** (`supabase/functions/delete-user/index.ts`) - Backend logic

---

## 🔄 Alur Lengkap

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                        │
│                     (AdminEmployees.tsx)                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. User klik tombol "Hapus" di baris karyawan                              │
│                         ↓                                                    │
│  2. Muncul dialog konfirmasi (window.confirm)                               │
│     "Apakah Anda yakin ingin MENGHAPUS user 'X'?..."                        │
│                         ↓                                                    │
│  3. Jika user konfirmasi → handleDeleteUser() dipanggil                     │
│                         ↓                                                    │
│  4. Tampilkan toast loading "Menghapus user..."                             │
│                         ↓                                                    │
│  5. Panggil Edge Function via supabase.functions.invoke('delete-user')      │
│     Body: { userId: string }                                                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EDGE FUNCTION                                      │
│                  (supabase/functions/delete-user/index.ts)                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. CORS Check                                                               │
│     └─ Jika method = OPTIONS → return CORS headers                          │
│                         ↓                                                    │
│  2. Buat Supabase Admin Client (dengan SERVICE_ROLE_KEY)                    │
│                         ↓                                                    │
│  3. VALIDASI AUTHORIZATION                                                   │
│     └─ Cek header 'Authorization' ada atau tidak                            │
│     └─ Jika tidak ada → return 401 Unauthorized                             │
│                         ↓                                                    │
│  4. VERIFIKASI USER YANG REQUEST                                            │
│     └─ Buat client dengan token user                                        │
│     └─ Panggil supabase.auth.getUser()                                      │
│     └─ Jika gagal → return 401 Unauthorized                                 │
│                         ↓                                                    │
│  5. CEK ROLE REQUESTOR                                                       │
│     └─ Query ke tabel user_roles                                            │
│     └─ Ambil role dari user yang request                                    │
│     └─ Jika BUKAN 'admin' atau 'developer'                                  │
│        → return 403 Forbidden                                                │
│                         ↓                                                    │
│  6. VALIDASI REQUEST BODY                                                    │
│     └─ Parse JSON body untuk ambil userId                                   │
│     └─ Jika userId kosong → return 400 Bad Request                          │
│                         ↓                                                    │
│  7. CEK SELF-DELETE                                                          │
│     └─ Jika userId == requestingUser.id                                     │
│        → return 400 "Cannot delete yourself"                                 │
│                         ↓                                                    │
│  8. HAPUS USER DARI AUTH                                                     │
│     └─ supabaseAdmin.auth.admin.deleteUser(userId)                          │
│     └─ Ini akan CASCADE delete ke tabel terkait                             │
│        (profiles, user_roles, dll - jika FK dengan ON DELETE CASCADE)       │
│                         ↓                                                    │
│  9. RETURN RESPONSE                                                          │
│     └─ Sukses → { success: true, message: 'User deleted successfully' }     │
│     └─ Error → { error: 'error message' }                                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         KEMBALI KE FRONTEND                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. Terima response dari Edge Function                                       │
│                         ↓                                                    │
│  2. Jika SUKSES:                                                             │
│     └─ Tampilkan toast.success "User 'X' berhasil dihapus"                  │
│     └─ Invalidate query 'admin-employees' → refresh data tabel              │
│                         ↓                                                    │
│  3. Jika ERROR:                                                              │
│     └─ Log error ke console                                                  │
│     └─ Tampilkan toast.error dengan pesan error                             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔐 Security Checks

| No | Check | Location | Response jika Gagal |
|----|-------|----------|---------------------|
| 1 | Authorization header exists | Edge Function | 401 Unauthorized |
| 2 | Valid JWT token | Edge Function | 401 Unauthorized |
| 3 | Requestor is Admin/Developer | Edge Function | 403 Forbidden |
| 4 | userId provided in body | Edge Function | 400 Bad Request |
| 5 | Cannot delete self | Edge Function | 400 Bad Request |

---

## 📁 File Terkait

### Frontend
```
src/pages/AdminEmployees.tsx
├── handleDeleteUser() [Line 340-360]
│   ├── Konfirmasi dialog
│   ├── Toast loading
│   ├── supabase.functions.invoke('delete-user')
│   └── Handle response (success/error)
```

### Backend (Edge Function)
```
supabase/functions/delete-user/index.ts
├── CORS handling
├── Create admin client (SERVICE_ROLE_KEY)
├── Verify requesting user
├── Check requestor role (admin/developer)
├── Validate userId
├── Prevent self-delete
└── supabaseAdmin.auth.admin.deleteUser()
```

---

## 🗃️ Database Impact

Ketika user dihapus dari `auth.users`:

| Tabel | Aksi | FK Constraint | Catatan |
|-------|------|---------------|---------|
| `auth.users` | **DELETED** | - | Primary deletion oleh Supabase Admin API |
| `profiles` | **CASCADE DELETE** | `ON DELETE CASCADE` | Otomatis terhapus |
| `user_roles` | **CASCADE DELETE** | `ON DELETE CASCADE` | Otomatis terhapus |
| `attendance_records` | **CASCADE DELETE** | `ON DELETE CASCADE` | Otomatis terhapus |
| `leave_requests` | **CASCADE DELETE** | `ON DELETE CASCADE` | Otomatis terhapus |

---

## 🗄️ SQL Flow - Foreign Key Constraints

### Struktur Foreign Key di Database

```sql
-- profiles table
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE

-- user_roles table  
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE

-- attendance_records table
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL

-- leave_requests table
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
FOREIGN KEY (reviewed_by) REFERENCES auth.users(id)  -- NO ACTION (default)
```

### Diagram Cascade Delete

```
                    ┌─────────────────┐
                    │   auth.users    │
                    │  (PRIMARY)      │
                    └────────┬────────┘
                             │
          ┌──────────────────┼──────────────────┬──────────────────┐
          │ ON DELETE        │ ON DELETE        │ ON DELETE        │
          │ CASCADE          │ CASCADE          │ CASCADE          │
          ▼                  ▼                  ▼                  ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│    profiles     │ │   user_roles    │ │attendance_records│ │ leave_requests  │
│                 │ │                 │ │                 │ │                 │
│ user_id (FK) ───┘ │ user_id (FK) ───┘ │ user_id (FK) ───┘ │ user_id (FK) ───┘
│ company_id (FK)   │                   │ location_id (FK)  │ reviewed_by(FK)* │
│ shift_id (FK)     │                   │                   │                  │
└─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘

* reviewed_by tidak CASCADE - jika admin yang review dihapus, 
  leave_requests TETAP ADA tapi reviewed_by jadi NULL constraint violation
```

### SQL Execution Order (Internal PostgreSQL)

Ketika `supabaseAdmin.auth.admin.deleteUser(userId)` dipanggil:

```sql
-- 1. PostgreSQL mulai transaction
BEGIN;

-- 2. Delete dari auth.users (triggered by Supabase Admin API)
DELETE FROM auth.users WHERE id = 'user-uuid';

-- 3. PostgreSQL AUTOMATICALLY cascade ke tabel dengan ON DELETE CASCADE:

-- 3a. Delete dari profiles
DELETE FROM public.profiles WHERE user_id = 'user-uuid';

-- 3b. Delete dari user_roles  
DELETE FROM public.user_roles WHERE user_id = 'user-uuid';

-- 3c. Delete dari attendance_records
DELETE FROM public.attendance_records WHERE user_id = 'user-uuid';

-- 3d. Delete dari leave_requests (yang user_id = deleted user)
DELETE FROM public.leave_requests WHERE user_id = 'user-uuid';

-- 4. Commit transaction
COMMIT;
```

### Potential Issue: reviewed_by Foreign Key

```sql
-- leave_requests.reviewed_by mereferensi auth.users TANPA CASCADE
FOREIGN KEY (reviewed_by) REFERENCES auth.users(id)
-- Default behavior: NO ACTION

-- Artinya: Jika admin yang me-review leave request dihapus,
-- akan terjadi FOREIGN KEY VIOLATION jika masih ada leave_requests
-- dengan reviewed_by = admin tersebut
```

**Solusi jika terjadi error:**
```sql
-- Option 1: Set NULL sebelum delete (manual)
UPDATE public.leave_requests 
SET reviewed_by = NULL 
WHERE reviewed_by = 'admin-uuid-to-delete';

-- Option 2: Alter FK menjadi ON DELETE SET NULL
ALTER TABLE public.leave_requests 
DROP CONSTRAINT leave_requests_reviewed_by_fkey;

ALTER TABLE public.leave_requests
ADD CONSTRAINT leave_requests_reviewed_by_fkey
FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
```

---

## 🔧 Kode Detail

### Frontend - handleDeleteUser()
```typescript
const handleDeleteUser = async (userId: string, userName: string) => {
  // 1. Konfirmasi dialog
  if (!confirm(`Apakah Anda yakin ingin MENGHAPUS user "${userName}"?...`)) {
    return;
  }

  // 2. Loading toast
  const toastId = toast.loading('Menghapus user...');
  
  try {
    // 3. Panggil edge function
    const { data, error } = await supabase.functions.invoke('delete-user', {
      body: { userId },
    });

    if (error) throw error;
    if (data.error) throw new Error(data.error);

    // 4. Success
    toast.success(`User "${userName}" berhasil dihapus`, { id: toastId });
    queryClient.invalidateQueries({ queryKey: ['admin-employees'] });
  } catch (error: any) {
    // 5. Error handling
    console.error('Delete user error:', error);
    toast.error(error.message || 'Gagal menghapus user', { id: toastId });
  }
};
```

### Backend - Edge Function
```typescript
// Validasi role requestor
const { data: roleData } = await supabaseAdmin
  .from('user_roles')
  .select('role')
  .eq('user_id', requestingUser.id)
  .maybeSingle();

const requestingRole = roleData?.role;
if (requestingRole !== 'admin' && requestingRole !== 'developer') {
  return new Response(
    JSON.stringify({ error: 'Forbidden: Only Admin/Developer can delete users' }),
    { status: 403, headers: corsHeaders }
  );
}

// Delete user
const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
```

---

## ⚠️ Catatan Penting

1. **Hanya Admin dan Developer** yang bisa menghapus user
2. **Tidak bisa menghapus diri sendiri** (self-delete protection)
3. **Tindakan PERMANEN** - tidak bisa di-undo
4. **Data historis** (attendance, leave requests) **tetap ada** di database
5. Menggunakan **SERVICE_ROLE_KEY** untuk bypass RLS saat delete
