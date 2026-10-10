/* ==========================================================
   PORTAL GURU — Absen Online (Terhubung ke Supabase)
   ==========================================================
   Menggantikan versi PHP/MySQL (api/*.php). Sekarang frontend
   bicara LANGSUNG ke Supabase (Auth + PostgREST), jadi halaman
   ini jalan di browser DAN di app Android (Capacitor) tanpa
   server PHP sama sekali.

   Keamanan:
   - Yang disimpan di sini hanya URL project + ANON key, memang
     dirancang untuk dipublikasikan di frontend. SERVICE ROLE key
     tidak boleh pernah masuk ke file ini.
   - Akses database dikendalikan Row Level Security (lihat
     supabase/01_schema_seed.sql): tanpa login, tidak bisa baca
     apa pun.
   ========================================================== */

/**
 * ==== KONFIGURASI SUPABASE — GANTI 2 BARIS DI BAWAH SAAT DEPLOY ====
 *
 * Ambil dari dashboard Supabase -> project kamu -> Project Settings -> API:
 *   - Project URL   : "API Settings" -> Project URL  (https://xxxx.supabase.co)
 *   - Anon key      : "API Settings" -> anon public
 *
 * Nilai di bawah adalah milik project asli pemilik proyek ini.
 * Kalau bikin project baru, timpa keduanya.
 */
const SUPABASE_URL = "https://baxcpneodfkoxtjjjiaf.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJheGNwbmVvZGZrb3h0ampqaWFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE1NzU2MDAsImV4cCI6MjEwNzE1MTYwMH0.iRQJyL88hO04R2Ol8xDIJry6_F21IlhOv5Jj_PPlEGk";

/**
 * Lokasi pustaka supabase-js (v2.117.3) yang sudah di-bundle jadi satu file
 * di folder ini — TIDAK diambil dari CDN, jadi tidak bergantung pada
 * layanan pihak ketiga dan tetap jalan di dalam app Android.
 * Cara memperbaruinya: lihat js/vendor/README.md
 */
const SUPABASE_LIB = "./vendor/supabase-bundle.js";

let supabase = null; // client Supabase (dibuat sekali, dipakai semua fitur)

/** Apakah konfigurasi sudah diisi (bukan masih placeholder)? */
function konfigurasiSiap() {
  return (
    /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(SUPABASE_URL.trim()) &&
    SUPABASE_ANON_KEY.trim().startsWith("eyJ") &&
    !SUPABASE_URL.includes("YOUR-PROJECT")
  );
}

/**
 * Buat client Supabase (sekali saja). Pustaka dimuat lewat dynamic import
 * supaya file ini tetap script biasa — tidak perlu bundler/build step.
 */
async function initSupabase() {
  if (supabase) return supabase;
  const mod = await import(SUPABASE_LIB);
  supabase = mod.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true, // sesi tersimpan di localStorage -> tidak perlu login ulang tiap buka
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: "absensi-supabase-auth",
    },
  });
  return supabase;
}

let userAktif = null; // { id, nama_lengkap, email, role, kelas_id }
let DATA_KELAS = {}; // Diisi dari tabel `kelas` di Supabase
let statusSiswa = {}; // { "id_siswa": "hadir" | "izin" | "sakit" | "alpa" }

const STATUS_LABEL = { hadir: "Hadir", izin: "Izin", sakit: "Sakit", alpa: "Alpa" };

const PESAN_KOSONG = {
  absen: "Semua siswa hadir.",
  izin: "Tidak ada yang izin.",
  sakit: "Tidak ada yang sakit.",
  alpa: "Tidak ada yang alpa.",
};

function hitungStatus(daftarStatus) {
  const hitung = { hadir: 0, izin: 0, sakit: 0, alpa: 0 };
  daftarStatus.forEach((s) => {
    if (s && hitung[s] !== undefined) hitung[s]++;
  });
  return hitung;
}

function el(id) {
  return document.getElementById(id);
}

function tanggalHariIni() {
  const d = new Date();
  const bulan = String(d.getMonth() + 1).padStart(2, "0");
  const hari = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${bulan}-${hari}`;
}

function escapeHtml(teks) {
  return String(teks || '').replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/** Tanggal dari input date; kalau kosong/rusak pakai hari ini. */
function tanggalAktif() {
  const v = (el("pilih-tanggal").value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : tanggalHariIni();
}

/** Ubah error Supabase/Auth jadi pesan yang pantas ditampilkan guru. */
function pesanError(error) {
  const msg = String((error && error.message) || "");
  if (msg.includes("Invalid login credentials")) return "Email atau kata sandi salah.";
  if (msg.includes("Email not confirmed")) {
    return "Email akun ini belum dikonfirmasi. Buka link verifikasi di email, "
      + "atau matikan opsi \"Confirm email\" di dashboard Supabase.";
  }
  if (msg.includes("fetch") || msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
    return "Gagal terhubung ke server. Periksa koneksi internet.";
  }
  if (msg.includes("new row violates") && msg.includes("policy")) {
    return "Akun ini tidak punya izin menulis ke database (cek RLS di Supabase).";
  }
  return msg || "Terjadi kesalahan yang tidak diketahui.";
}

// ---------- 1. LOGIN VIA SUPABASE AUTH ----------
async function login(event) {
  event.preventDefault();
  const email = el("login-email").value.trim().toLowerCase();
  const password = el("login-password").value;
  const errorBox = el("login-error");

  if (!konfigurasiSiap()) {
    errorBox.textContent = "Konfigurasi Supabase belum diisi. Isi SUPABASE_URL dan "
      + "SUPABASE_ANON_KEY di js/absen.js (lihat supabase/SETUP.md).";
    errorBox.classList.add("is-visible");
    return;
  }

  try {
    const sb = await initSupabase();
    const { data, error } = await sb.auth.signInWithPassword({ email, password });

    if (error) {
      errorBox.textContent = pesanError(error);
      errorBox.classList.add("is-visible");
      return;
    }

    const profil = await ambilProfil(data.user);
    if (profil.error) {
      errorBox.textContent = profil.error;
      errorBox.classList.add("is-visible");
      return;
    }

    errorBox.classList.remove("is-visible");
    userAktif = { id: data.user.id, ...profil.data }; // { id, nama_lengkap, email, role, kelas_id }
    await masukKeLayarAbsen();

  } catch (err) {
    console.error("Login gagal:", err);
    errorBox.textContent = "Gagal terhubung ke Supabase. Periksa koneksi internet.";
    errorBox.classList.add("is-visible");
  }
}

/** Ambil profil (nama, role, kelas) milik user yang baru login. */
async function ambilProfil(user) {
  const sb = await initSupabase();
  const { data, error } = await sb
    .from("profiles")
    .select("nama_lengkap, email, role, kelas_id")
    .eq("id", user.id)
    .maybeSingle();

  if (error) return { error: "Gagal membaca profil: " + pesanError(error) };
  if (!data) {
    return { error: "Profil akun ini belum terdaftar di database. "
      + "Jalankan supabase/02_set_account_roles.sql (lihat supabase/SETUP.md)." };
  }
  return { data };
}

/** Tampilkan layar absensi + muat data awal. Dipakai login & pemulihan sesi. */
async function masukKeLayarAbsen() {
  el("guru-name").textContent = userAktif.nama_lengkap;
  el("screen-login").style.display = "none";
  el("screen-absen").style.display = "flex";

  await loadDaftarKelas();
  setupPilihKelas();
  await loadSiswa();
}

async function logout() {
  try {
    const sb = await initSupabase();
    await sb.auth.signOut();
  } catch (e) {
    console.warn("SignOut gagal (diabaikan):", e);
  }
  userAktif = null;
  el("screen-absen").style.display = "none";
  el("screen-login").style.display = "flex";
  el("login-password").value = "";
}

// ---------- 2. AMBIL MASTER KELAS ----------
async function loadDaftarKelas() {
  try {
    const sb = await initSupabase();
    const { data, error } = await sb
      .from("kelas")
      .select("id, nama_kelas")
      .order("id", { ascending: true });

    if (error) {
      showToast("Gagal memuat daftar kelas: " + pesanError(error));
      return;
    }

    DATA_KELAS = {};
    (data || []).forEach((k) => {
      DATA_KELAS[k.id] = k.nama_kelas;
    });
    // Tanpa daftar kelas, dropdown kosong dan kelasAktifId() mengembalikan "".
    if (Object.keys(DATA_KELAS).length === 0) {
      showToast("Belum ada data kelas di database.");
    }
  } catch (e) {
    console.error("Gagal memuat kelas:", e);
    showToast("Gagal memuat daftar kelas dari server.");
  }
}

function setupPilihKelas() {
  const select = el("pilih-kelas");
  const wrapper = select.closest(".field");

  select.innerHTML = Object.entries(DATA_KELAS)
    .map(([id, nama]) => `<option value="${id}">${escapeHtml(nama)}</option>`)
    .join("");

  if (userAktif.role === "guru" && userAktif.kelas_id) {
    wrapper.style.display = "none";
    select.value = userAktif.kelas_id;
  } else {
    wrapper.style.display = "block";
    select.value = userAktif.kelas_id || "1";
  }
}

function kelasAktifId() {
  return (userAktif.role === "guru" && userAktif.kelas_id)
    ? userAktif.kelas_id
    : el("pilih-kelas").value;
}

// ---------- 3. AMBIL DATA SISWA DARI SUPABASE ----------
async function loadSiswa() {
  const kelasId = kelasAktifId();
  const namaKelas = DATA_KELAS[kelasId] || "Kelas";
  const tanggal = tanggalAktif();
  const list = el("siswa-list");

  list.innerHTML = `<div class="empty-state"><p>Memuat data siswa...</p></div>`;
  statusSiswa = {};

  el("nama-kelas-aktif").textContent = namaKelas;

  try {
    const sb = await initSupabase();

    // Dua query sekaligus: daftar siswa + status absensi hari itu.
    // (Di MySQL lama ini satu LEFT JOIN; di Postgres lebih jelas dipisah,
    //  karena filter resource embedded di PostgREST selalu jadi INNER JOIN.)
    const [qSiswa, qAbsen] = await Promise.all([
      sb.from("siswa")
        .select("id, nisn, nama_lengkap")
        .eq("kelas_id", kelasId)
        .order("nama_lengkap", { ascending: true }),
      sb.from("absensi")
        .select("siswa_id, status")
        .eq("kelas_id", kelasId)
        .eq("tanggal", tanggal),
    ]);

    if (qSiswa.error || qAbsen.error) {
      const pesan = pesanError(qSiswa.error || qAbsen.error);
      list.innerHTML = `
        <div class="empty-state">
          <p>Gagal memuat data siswa: ${escapeHtml(pesan)}</p>
        </div>`;
      updateSummary();
      return;
    }

    if (!qSiswa.data || qSiswa.data.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <p>Data siswa ${escapeHtml(namaKelas)} belum diinput ke database.</p>
        </div>`;
      updateSummary();
      return;
    }

    // Peta status hari ini: { id_siswa: status }
    const statusHariIni = {};
    (qAbsen.data || []).forEach((a) => {
      statusHariIni[a.siswa_id] = a.status;
    });

    list.innerHTML = "";
    qSiswa.data.forEach((s, i) => {
      // Ambil status absensi jika sudah ada di database, jika belum default: "hadir"
      const statusAwal = statusHariIni[s.id] || "hadir";
      statusSiswa[s.id] = statusAwal;

      const row = document.createElement("div");
      row.className = "siswa-row";
      row.innerHTML = `
        <div>
          <p class="siswa-row__no">No. ${i + 1}</p>
          <p class="siswa-row__name">${escapeHtml(s.nama_lengkap)}</p>
          <p class="siswa-row__nisn">${s.nisn ? "NISN " + escapeHtml(s.nisn) : "NISN belum terdaftar"}</p>
        </div>
        <div class="status-group" data-id="${s.id}">
          <button type="button" class="status-btn ${statusAwal === 'hadir' ? 'is-active' : ''}" data-status="hadir">Hadir</button>
          <button type="button" class="status-btn ${statusAwal === 'izin' ? 'is-active' : ''}" data-status="izin">Izin</button>
          <button type="button" class="status-btn ${statusAwal === 'sakit' ? 'is-active' : ''}" data-status="sakit">Sakit</button>
          <button type="button" class="status-btn ${statusAwal === 'alpa' ? 'is-active' : ''}" data-status="alpa">Alpa</button>
        </div>
      `;
      list.appendChild(row);
    });

    updateSummary();

  } catch (err) {
    console.error("Gagal memuat siswa:", err);
    list.innerHTML = `<div class="empty-state"><p>Gagal memuat data siswa dari server.</p></div>`;
  }
}

function handleStatusClick(event) {
  const btn = event.target.closest(".status-btn");
  if (!btn) return;

  const group = btn.closest(".status-group");
  const siswaId = group.dataset.id;
  const status = btn.dataset.status;

  statusSiswa[siswaId] = status;

  group.querySelectorAll(".status-btn").forEach((b) => {
    b.classList.toggle("is-active", b.dataset.status === status);
  });

  updateSummary();
}

function updateSummary() {
  const hitung = hitungStatus(Object.values(statusSiswa));

  el("count-hadir").textContent = hitung.hadir;
  el("count-izin").textContent = hitung.izin;
  el("count-sakit").textContent = hitung.sakit;
  el("count-alpa").textContent = hitung.alpa;

  const total = Object.keys(statusSiswa).length;
  el("progress-text").textContent =
    total === 0 ? "Belum ada data siswa" : `${total} siswa dicatat`;
}

// ---------- 4. SIMPAN ABSENSI KE SUPABASE ----------
async function simpanAbsensi() {
  const kelasId = Number(kelasAktifId());
  const tanggal = tanggalAktif();

  if (Object.keys(statusSiswa).length === 0) {
    showToast("Tidak ada data siswa untuk disimpan.");
    return;
  }

  const baris = Object.entries(statusSiswa).map(([siswaId, status]) => ({
    siswa_id: Number(siswaId),
    kelas_id: kelasId,
    tanggal: tanggal,
    status: status,
    created_by: userAktif.id,
  }));

  try {
    const sb = await initSupabase();

    // Upsert dengan ON CONFLICT (siswa_id, tanggal): kalau absensi hari itu
    // sudah ada, barisnya di-UPDATE (status + pembuat), bukan digandakan.
    // Syaratnya ada UNIQUE (siswa_id, tanggal) di tabel absensi.
    const { error } = await sb
      .from("absensi")
      .upsert(baris, { onConflict: "siswa_id,tanggal" });

    if (error) {
      showToast("Gagal menyimpan: " + pesanError(error));
      return;
    }

    showToast(`Absensi berhasil disimpan ke Supabase! (${baris.length} siswa)`);
  } catch (err) {
    console.error("Simpan absensi gagal:", err);
    showToast("Terjadi kesalahan koneksi ke server.");
  }
}

// ---------- 5. REKAPITULASI DARI DATABASE ----------
let rekapFilter = "semua";

function terapkanFilterRekap() {
  el("rekap-list").dataset.filter = rekapFilter;

  el("rekap-filter").querySelectorAll("[data-filter]").forEach((btn) => {
    const aktif = btn.dataset.filter === rekapFilter;
    btn.classList.toggle("is-active", aktif);
    btn.setAttribute("aria-pressed", String(aktif));
  });
}

function pilihFilterRekap(nilai) {
  rekapFilter = nilai;
  terapkanFilterRekap();

  el("rekap-list").querySelectorAll("details.rekap-detail").forEach((d) => {
    d.open = nilai !== "semua";
  });
}

async function bukaRekap() {
  rekapFilter = "semua";
  await renderRekap();
  el("screen-absen").style.display = "none";
  el("screen-rekap").style.display = "flex";
}

function tutupRekap() {
  el("screen-rekap").style.display = "none";
  el("screen-absen").style.display = "flex";
}

async function renderRekap() {
  const list = el("rekap-list");
  list.innerHTML = `<div class="empty-state"><p>Memuat rekapitulasi data...</p></div>`;

  try {
    const sb = await initSupabase();

    // !inner dipakai karena setiap baris absensi pasti punya kelas & siswa
    // (foreign key), jadi hasilnya identik dengan JOIN di versi MySQL.
    let query = sb
      .from("absensi")
      .select("tanggal, status, kelas!inner(nama_kelas), siswa!inner(nama_lengkap)");

    // Guru hanya melihat kelasnya sendiri; kepsek (role lain) melihat semua.
    if (userAktif.role === "guru" && userAktif.kelas_id) {
      query = query.eq("kelas_id", userAktif.kelas_id);
    }

    const { data, error } = await query.order("tanggal", { ascending: false });

    if (error) {
      el("rekap-filter").hidden = true;
      list.innerHTML = `
        <div class="empty-state">
          <p>Gagal mengambil data rekap: ${escapeHtml(pesanError(error))}</p>
        </div>`;
      return;
    }

    if (!data || data.length === 0) {
      el("rekap-filter").hidden = true;
      list.innerHTML = `
        <div class="empty-state">
          <p>Belum ada data absensi tersimpan di database.</p>
        </div>`;
      return;
    }

    // Kelompokkan per kelas + tanggal (persis seperti GROUP di PHP lama),
    // lalu urutkan nama siswa di dalam tiap grup A-Z.
    const grup = new Map();
    data.forEach((r) => {
      const key = r.kelas.nama_kelas + "_" + r.tanggal;
      if (!grup.has(key)) {
        grup.set(key, {
          nama_kelas: r.kelas.nama_kelas,
          tanggal: r.tanggal,
          detail: [],
        });
      }
      grup.get(key).detail.push({
        nama_lengkap: r.siswa.nama_lengkap,
        status: r.status,
      });
    });

    const rekapData = Array.from(grup.values()).map((g) => {
      g.detail.sort((a, b) => a.nama_lengkap.localeCompare(b.nama_lengkap, "id"));
      return g;
    });

    el("rekap-filter").hidden = false;
    terapkanFilterRekap();

    list.innerHTML = rekapData.map(renderKartuRekap).join("");

  } catch (err) {
    console.error("Gagal memuat rekap:", err);
    list.innerHTML = `<div class="empty-state"><p>Gagal mengambil data rekap dari database.</p></div>`;
  }
}

function renderKartuRekap(r) {
  const tanggalFormat = new Date(r.tanggal + "T00:00:00").toLocaleDateString("id-ID", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  const rekap = hitungStatus(r.detail.map((d) => d.status));

  const barisSiswa = r.detail
    .map(
      (d, i) => `
          <li class="rekap-siswa__row" data-status="${d.status}">
            <span class="siswa-row__no">${i + 1}</span>
            <span class="siswa-row__name">${escapeHtml(d.nama_lengkap)}</span>
            <span class="status-badge" data-status="${d.status}">${STATUS_LABEL[d.status] || d.status}</span>
          </li>`
    )
    .join("");

  const jumlahPerFilter = {
    absen: rekap.izin + rekap.sakit + rekap.alpa,
    izin: rekap.izin,
    sakit: rekap.sakit,
    alpa: rekap.alpa,
  };

  const pesanKosong = Object.entries(PESAN_KOSONG)
    .filter(([filter]) => jumlahPerFilter[filter] === 0)
    .map(([filter, teks]) => `
              <li class="rekap-siswa__kosong" data-kosong="${filter}">${teks}</li>`)
    .join("");

  return `
        <div class="rekap-card">
          <div class="rekap-card__head">
            <span class="rekap-card__tanggal">${escapeHtml(r.nama_kelas)} — ${tanggalFormat}</span>
            <span class="rekap-card__meta">${r.detail.length} siswa</span>
          </div>
          <div class="absen-summary">
            <span class="absen-summary__chip" data-status="hadir">Hadir <strong>${rekap.hadir}</strong></span>
            <span class="absen-summary__chip" data-status="izin">Izin <strong>${rekap.izin}</strong></span>
            <span class="absen-summary__chip" data-status="sakit">Sakit <strong>${rekap.sakit}</strong></span>
            <span class="absen-summary__chip" data-status="alpa">Alpa <strong>${rekap.alpa}</strong></span>
          </div>
          <details class="rekap-detail">
            <summary class="rekap-detail__toggle">
              Rincian per siswa
              <svg class="rekap-detail__chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </summary>
            <ul class="rekap-siswa">${barisSiswa}${pesanKosong}
            </ul>
          </details>
        </div>`;
}

let toastTimer;
function showToast(pesan) {
  const toast = el("dummy-toast");
  toast.textContent = pesan;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3200);
}

// ---------- PEMULIHAN SESI ----------
/**
 * Kalau guru sudah pernah login di perangkat ini, sesinya disimpan di
 * localStorage -> saat halaman dibuka lagi tidak perlu login ulang.
 * (Fitur baru; versi PHP dulu selalu minta login.)
 */
async function cobaPulihkanSesi() {
  if (!konfigurasiSiap()) return;
  try {
    const sb = await initSupabase();
    const { data } = await sb.auth.getSession();
    if (!data || !data.session) return;

    const profil = await ambilProfil(data.session.user);
    if (profil.error) {
      console.warn("Sesi ada tapi profil gagal dibaca:", profil.error);
      return;
    }

    userAktif = { id: data.session.user.id, ...profil.data };
    await masukKeLayarAbsen();
  } catch (e) {
    console.warn("Gagal memulihkan sesi (diabaikan):", e);
  }
}

// ---------- INITIATOR ----------
document.addEventListener("DOMContentLoaded", () => {
  el("login-form").addEventListener("submit", login);
  el("btn-logout").addEventListener("click", logout);
  el("pilih-kelas").addEventListener("change", loadSiswa);
  el("pilih-tanggal").addEventListener("change", loadSiswa);
  el("siswa-list").addEventListener("click", handleStatusClick);
  el("btn-simpan").addEventListener("click", simpanAbsensi);
  el("btn-buka-rekap").addEventListener("click", bukaRekap);
  el("btn-tutup-rekap").addEventListener("click", tutupRekap);
  el("rekap-filter").addEventListener("click", (event) => {
    const btn = event.target.closest("[data-filter]");
    if (btn) pilihFilterRekap(btn.dataset.filter);
  });

  el("pilih-tanggal").value = tanggalHariIni();

  // Kalau sebelumnya sudah login, langsung masuk (tanpa mengulang login).
  cobaPulihkanSesi();
});
