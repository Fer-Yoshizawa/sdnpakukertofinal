# SETUP SUPABASE — Portal Absensi SDN Pakukerto II

Database absensi sekarang hosted di **Supabase** (PostgreSQL + Auth),
menggantikan MariaDB lokal + `api/*.php`. Frontend (`js/absen.js`) bicara
langsung ke Supabase, jadi halaman `absen.html` jalan di **browser dan app
Android** tanpa server PHP.

Status konfigurasi kode:

- `js/absen.js` **sudah diisi** URL project + anon key milik project
  `https://baxcpneodfkoxtjjjiaf.supabase.co` (keduanya memang aman untuk
  frontend; yang rahasia hanya *service_role* key — jangan pernah
  masuk ke file ini / repo).
- Yang belum: **schema & akun** — kerjakan langkah 1-4 di bawah sekali saja.

---

## 1. Jalankan skema + data awal

1. Buka dashboard Supabase → project kamu → **SQL Editor** → **New query**.
2. Paste **seluruh isi** `supabase/01_schema_seed.sql` → klik **Run**.
   (Bisa juga drag-drop filenya.)
3. Cek di SQL Editor:

```sql
SELECT (SELECT COUNT(*) FROM kelas)   AS kelas,
       (SELECT COUNT(*) FROM siswa)   AS siswa,
       (SELECT COUNT(*) FROM absensi) AS absensi;
```

Harus balik **kelas 6, siswa 37, absensi 37** (riwayat 10 Okt 2026 ikut
pindah dari MariaDB lokal).

## 2. Buat 2 akun login di Supabase Auth

Dashboard → **Authentication** → **Users** → **Add user** → **Create new user**.

| Email | Password | Nama (untuk catatan) |
|---|---|---|
| `kepsek@sekolah.sim` | `kepsek123` | Endi Yulianto, S.Pd.I. |
| `guru1@sekolah.sim` | `guru123` | Eka Zahrotul Mufidah, S.Pd. |

Centang **Auto Confirm User** (agar tidak perlu verifikasi email).

> Kalau lupa mencentang: matikan konfirmasi email di
> **Authentication → Sign In / Providers → Email** (toggle
> *Confirm email* = off), atau klik link verifikasi di email masing-masing.

Password di atas sama dengan yang lama dan memang tampil sebagai bantuan di
halaman login — **ganti** setelah pemakaian nyata, caranya: pilih user →
*Reset password*, atau jalankan `supabase/02_set_account_roles.sql` lagi
setelah mengganti nama/role (script-nya idempoten).

## 3. Setel role & nama akun

Masih di SQL Editor, jalankan `supabase/02_set_account_roles.sql`.

Ini menyetel: Endi = `kepsek` (bebas pilih kelas, rekap semua kelas),
Eka = `guru` + Kelas 1 (dropdown terkunci), dan menautkan riwayat absensi
lama ke akun Eka (`created_by`).

## 4. Uji

1. Buka `absen.html` lewat browser (server statis apa pun, mis.
   `python3 -m http.server`) → login `guru1@sekolah.sim` / `guru123`.
2. Pastikan daftar 37 siswa Kelas 1 muncul, ubah beberapa status, **Simpan**,
   lalu buka **Rekap** → perubahan tersimpan permanen.
3. Cek juga di dashboard Supabase → **Table Editor** → tabel `absensi`.

Kalau sudah oke, rebuild app Android:

```bash
npm run android:sync
cd android && JAVA_HOME=~/.local/opt/jdk-21.0.12.1+1 ./gradlew assembleDebug
```

(URL Supabase sudah HTTPS — aman dipakai dari WebView Android yang memblokir
cleartext.)

---

## Struktur tabel

| Tabel | Isi | Dibaca | Ditulis aplikasi |
|---|---|---|---|
| `kelas` | Kelas 1-6 | login | ❌ (lewat SQL Editor) |
| `siswa` | 37 siswa Kelas 1 | login | ❌ |
| `absensi` | per siswa per tanggal, unik `(siswa_id, tanggal)` | login | ✅ insert/update |
| `profiles` | nama, role, kelas per akun | login (milik sendiri) | ❌ (otomatis via trigger) |

RLS aktif di semua tabel: **anon key tanpa login tidak bisa membaca apa pun.**
Kelas 2-6 sengaja kosong — datanya memang belum ada (jangan dikarang).

Menambah siswa/kelas baru cukup lewat **Table Editor** di dashboard
(tidak perlu ubah kode). Kalau nanti mau menambah guru baru: Add user di
Auth (metadata opsional `{"nama_lengkap":"...","role":"guru","kelas_id":1}`),
lalu rapikan `profiles` lewat SQL Editor bila perlu.

## Catatan keamanan (opsional)

- Policy absensi saat ini membolehkan **guru mana pun** menulis kelas mana
  pun (sama seperti perilaku PHP lama; pembatasannya di UI). Mau dikunci di
  level database? Ganti policy insert/update di `01_schema_seed.sql` dengan
  versi ini lalu jalankan ulang:

```sql
DROP POLICY IF EXISTS absensi_insert ON public.absensi;
DROP POLICY IF EXISTS absensi_update ON public.absensi;
CREATE POLICY absensi_insert ON public.absensi FOR INSERT TO AUTHENTICATED
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) <> 'guru'
    OR kelas_id = (SELECT kelas_id FROM public.profiles WHERE id = auth.uid())
  );
CREATE POLICY absensi_update ON public.absensi FOR UPDATE TO AUTHENTICATED
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) <> 'guru'
    OR kelas_id = (SELECT kelas_id FROM public.profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) <> 'guru'
    OR kelas_id = (SELECT kelas_id FROM public.profiles WHERE id = auth.uid())
  );
```

- Tidak ada policy **DELETE** → riwayat absensi tidak bisa dihapus dari
  aplikasi; hapus manual dari Table Editor bila perlu.
- Simpan `service_role` key (Settings → API) hanya di tempat aman —
  tidak pernah di HP, tidak pernah di repo.

## Apa yang ditinggalkan

- `api/*.php` + `api/db_absensi.sql` = **legacy**, tidak dipanggil lagi oleh
  situs/app. Dibiarkan sebagai arsip; boleh dihapus kalau sudah yakin.
- MariaDB lokal di mesin ini sudah tidak dipakai fitur absensi.
