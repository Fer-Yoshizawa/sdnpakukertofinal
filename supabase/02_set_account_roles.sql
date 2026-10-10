-- =============================================================================
-- 02_set_account_roles.sql — setel role & nama untuk 2 akun login
--
-- >>> JALANKAN SETELAH 01_schema_seed.sql DAN SETELAH 2 AKUN DIBUAT <<<
-- di Supabase Auth (Authentication -> Users -> Add user). Langkah lengkap
-- ada di supabase/SETUP.md.
--
-- Kenapa perlu script terpisah?
--   Saat kamu menambahkan akun di dashboard Supabase Auth, trigger
--   handle_new_user() (lihat 01_schema_seed.sql) otomatis membuat baris di
--   tabel profiles — tapi hanya dengan nilai DEFAULT: nama = bagian sebelum
--   @ di email, role = 'guru', kelas_id = NULL.
--   Script ini melengkapi: nama lengkap asli, role kepsek/guru, kelas guru,
--   plus menautkan riwayat absensi lama ke akun pembuatnya.
--
-- Akun yang diharapkan sudah dibuat (password sama dengan yang lama):
--   kepsek@sekolah.sim / kepsek123  -> Endi Yulianto, S.Pd.I.  (Kepala Sekolah)
--   guru1@sekolah.sim  / guru123    -> Eka Zahrotul Mufidah, S.Pd. (Guru Kelas 1)
--
-- IDEMPOTENT: aman dijalankan berulang.
-- =============================================================================

-- 1. Kepala Sekolah: role 'kepsek' supaya bisa memilih kelas apa pun & melihat
--    rekap semua kelas (perilaku absen.js: userAktif.role !== "guru").
UPDATE public.profiles
   SET nama_lengkap = 'Endi Yulianto, S.Pd.I.',
       role         = 'kepsek',
       kelas_id     = NULL
 WHERE email = 'kepsek@sekolah.sim';


-- 2. Guru Kelas 1: role 'guru' + kelas_id = Kelas 1 -> dropdown kelas terkunci.
UPDATE public.profiles
   SET nama_lengkap = 'Eka Zahrotul Mufidah, S.Pd.',
       role         = 'guru',
       kelas_id     = (SELECT id FROM public.kelas WHERE nama_kelas = 'Kelas 1')
 WHERE email = 'guru1@sekolah.sim';


-- 3. Tautkan riwayat absensi yang diimpor (created_by masih NULL) ke akun guru
--    yang dulu menyimpannya di MariaDB lokal (users.id = 2 -> guru1).
--    Baris yang created_by-nya sudah terisi TIDAK disentuh.
UPDATE public.absensi
   SET created_by = (SELECT id FROM public.profiles WHERE email = 'guru1@sekolah.sim')
 WHERE created_by IS NULL;


-- -----------------------------------------------------------------------------
-- Verifikasi (harus balik 1 baris per query, role sesuai):
--   SELECT email, nama_lengkap, role, kelas_id FROM public.profiles ORDER BY email;
--   SELECT COUNT(*) AS absensi_tanpa_pembuat FROM public.absensi WHERE created_by IS NULL;
--   -> absensi_tanpa_pembuat = 0
-- -----------------------------------------------------------------------------
