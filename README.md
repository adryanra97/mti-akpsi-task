# ServerAgent

Implementasi ServerAgent (Kelompok C6, Skenario 3) dari dokumen desain AKPSI: sistem untuk menilai kesiapan performa release candidate sebelum promosi dari Dev ke Production, menangani insiden pasca go-live, menerbitkan dokumen sign-off, dan mengunduh laporan untuk analisis tren.

Satu project Vercel berisi dua bagian:

| Bagian | Teknologi | Lokasi |
|---|---|---|
| **Dashboard** «MVP» | Next.js 15 (App Router), React 19, Tailwind CSS 4, Postgres (Neon) | `src/` |
| **Core Module** (agen analisis) | Python 3, FastAPI, SimPy (digital twin), LangChain (Claude / OpenAI / Gemini) | `api/` |

## Akun demo

Login memakai satu akun pengujian per aktor manusia di dokumen. Akun sengaja tidak memakai nama orang (tanpa PII). Kata sandi tidak disimpan di repo maupun ditampilkan di web: kata sandi diatur lewat environment variable `DEMO_PASSWORD` dan dibagikan admin lewat kanal yang aman.

| Nama pengguna | Peran | Akses utama |
|---|---|---|
| `techlead` | Technical Lead | Jadwalkan sesi, jalankan analisis, catat keputusan cycle, pengaturan |
| `qa` | QA/Performance Tester | Isi parameter analisis, jalankan analisis, uji what-if |
| `engineer` | Integration Engineer | Buka kasus insiden, reproduksi, uji mitigasi |
| `manager` | Project/Technical Manager | Setujui atau tolak dokumen sign-off |
| `support` | Tim Support dan Monitoring | Report, ringkasan tren, unduhan PDF/CSV |

Hak akses diperiksa di server (middleware untuk halaman, pemeriksaan izin di setiap server action dan API).

## Pemetaan use case ke halaman

| Use case | Halaman | Catatan |
|---|---|---|
| UC-01 Jalankan Alignment Rilis Terjadwal | `/alignment`, `/alignment/[id]` | Parameter, analisis bertahap (progres per langkah Core Module), verdict, perbandingan cycle sebelumnya, what-if bertingkat, keputusan cycle. Alur 3a, 5a, 7a, 7b, 13a, 13b tercakup. |
| UC-02 Tangani Respons Insiden | `/incidents`, `/incidents/[id]` | Mode reproduksi dan mode mitigasi, eskalasi bila tidak ada opsi lolos (7a), insiden belum tereproduksi (4a), data MTTR, salin ringkasan. |
| UC-03 Unduh Laporan dan Riwayat | `/reports` | Filter, ringkasan tren, unduhan PDF/CSV, pemeriksaan hak akses, penyamaran, penanda NDA (5a), log audit. |
| UC-04 Terbitkan Dokumen Sign-Off | `/signoff`, `/signoff/[id]` | Draf otomatis saat keputusan "lanjut promosi", bagian syarat untuk Lolos Bersyarat (1a), setujui/tolak, dokumen dikunci dengan versi dan tanda waktu. |

## Core Module (Python)

Core Module berjalan sebagai Vercel Python Function (`api/index.py`) dan hanya menerima **PermintaanAnalisis** yang ditandatangani Dashboard.

```
Browser ──(1) ajukan──▶ Dashboard  /api/alignment/[id]/request   status sesi: Pengisian Parameter → Menunggu Hasil
        ◀─ token JWT (HS256, AUTH_SECRET, berlaku 10 menit)
Browser ──(2) token──▶ Core Module /api/py/analisis              NDJSON: status permintaan, langkah, hasil
        ◀─ hasil + tanda HMAC-SHA256
Browser ──(3) hasil──▶ Dashboard  /api/alignment/[id]/result     verifikasi tanda → simpan → Peninjauan
```

Isi Core Module (`api/_core/`):

- `twin.py`: **digital twin** berbasis simulasi kejadian diskret **SimPy** (thread pool, CPU, connection pool per node, antrean, timeout). Model dikalibrasi dari hasil uji Dev dan baseline ELK, lalu menghasilkan ringkasan indikator dan deret waktu (trajektori CPU, memori, thread pool, p95). Kapasitas maksimum dihitung per sumber daya dan dengan **Little's Law** (L = λ × W).
- `agent.py`: **AgenAnalisis** (LangChain StructuredTool: `kueri_metrik_elk`, `jalankan_serversim`, `estimasi_serverbrief`). Agen menyusun rencana, menjuruskan setiap langkah, menetapkan verdict, menyusun narasi dan rencana uji, serta mencatat jejak keputusan.
- `llm.py`: LayananLLM melalui LangChain (`langchain-anthropic`, `langchain-openai`, `langchain-google-genai`) dengan structured output dan estimasi biaya per permintaan.
- `masking.py`: penyamaran data sensitif sebelum paket keluar ke LLM.
- `elk.py`: metrik ELK (simulasi), dengan cadangan baseline tersimpan terakhir bila ELK tidak tersedia.
- `registry.json`: layanan, model digital twin (versi, tanggal kalibrasi, rentang TPS terkalibrasi), dan komponen di luar cakupan model.

Aturan penjurusan (JalurPenjurusan):

- Langkah dalam cakupan model memakai **DigitalTwin**.
- Komponen di luar cakupan model (misalnya Kafka atau Redis pada perubahan konfigurasi, atau insiden tipe lain) memakai **EstimasiPenalaran** bila skor keyakinan dan kesepakatan sampel memenuhi ambang. Angkanya ditandai perlu verifikasi manual dan verdict paling tinggi Lolos Bersyarat. Bila ambang tidak terpenuhi, langkah kembali ke **FallbackDigitalTwin**.
- Beban normal atau puncak di luar rentang TPS terkalibrasi, atau model tidak aktif, menghentikan analisis dengan verdict **Tidak Dapat Dinilai**. Varian what-if di luar rentang hanya menandai varian itu sendiri sebagai Tidak Dapat Dinilai; beban normal dan puncak tetap dinilai.
- Uji what-if adalah pengali beban **normal** (2×, 3×, 5×, 10×).

Setiap hasil menampilkan versi dan tanggal kalibrasi model, dan verdict, sumber daya pembatas, serta narasi tampil paling atas.

### Mode analisis

Dipilih Technical Lead di **Pengaturan**:

- **Demo**: digital twin SimPy tetap berjalan; rencana, estimasi penalaran, dan narasi memakai templat deterministik. Tanpa API key dan tanpa biaya. Masukan yang sama selalu memberi hasil sama.
- **LLM**: rencana analisis, estimasi penalaran (beberapa sampel untuk mengukur kesepakatan), dan narasi verdict disusun model pilihan melalui LangChain:
  - Claude (Anthropic): `ANTHROPIC_API_KEY`
  - OpenAI atau layanan kompatibel OpenAI: `OPENAI_API_KEY`, opsional `OPENAI_BASE_URL`
  - Gemini (Google): `GEMINI_API_KEY`

Tombol **Uji koneksi** di Pengaturan memanggil Core Module untuk memastikan API key dan nama model valid.

### Status (Tabel 9.30 dan state machine Bab 10)

| Objek | Status |
|---|---|
| Sesi alignment | Terjadwal → Pengisian Parameter → Menunggu Hasil → Peninjauan → Diputuskan → Ditutup |
| Kasus insiden | Dicatat → Dalam Reproduksi → Tereproduksi / Belum Tereproduksi → Uji Mitigasi → Mitigasi Ditemukan / Perlu Eskalasi → Terdokumentasi |
| Dokumen sign-off | Draf → Menunggu Keputusan → Disetujui / Ditolak |
| Permintaan analisis | Diterima → Disamarkan → Direncanakan → Dijalankan / Dihentikan → Dinilai → Selesai |
| Verdict | Lolos, Lolos Bersyarat, Tidak Lolos, Tidak Dapat Dinilai |

Setiap perpindahan status tercatat di riwayat (siapa, kapan, catatan) dan bisa dibuka dari tombol **Riwayat**.

## Deploy ke Vercel

1. Import repo ini di Vercel (framework terdeteksi otomatis sebagai Next.js). Vercel juga membangun `api/index.py` sebagai Python Function dari `requirements.txt`; `vercel.json` mengatur batas waktunya 60 detik.
2. **Database**: tab **Storage**, lalu **Create Database**, pilih **Neon (Serverless Postgres)**, lalu sambungkan ke project. `DATABASE_URL` terisi otomatis. Tabel dan data contoh dibuat otomatis saat aplikasi pertama kali dibuka.
3. **Environment variables** (Settings, lalu Environment Variables):
   - `AUTH_SECRET` (wajib): minimal 32 karakter acak, misalnya hasil `openssl rand -base64 48`. Nilai yang sama dipakai Dashboard dan Core Module untuk menandatangani permintaan dan hasil.
   - `DEMO_PASSWORD` (wajib): kata sandi akun pengujian (satu kata sandi untuk semua peran), minimal 8 karakter.
   - Tanpa keduanya, halaman login menampilkan pesan bahwa konfigurasi belum lengkap dan login ditolak.
   - `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY`: opsional, untuk mode LLM.
4. Redeploy setelah mengubah environment variable.

Tanpa `DATABASE_URL`, aplikasi tetap berjalan memakai Postgres sementara di memori (PGlite). Akan muncul banner peringatan karena data bisa hilang saat server dimulai ulang.

## Menjalankan secara lokal

```bash
npm install
pip install -r requirements.txt uvicorn

# Terminal 1: Core Module
python -m uvicorn api.index:app --port 8000

# Terminal 2: Dashboard (rewrite /api/py/* ke uvicorn)
CORE_MODULE_DEV_URL=http://localhost:8000 npm run dev   # http://localhost:3000
```

Data contoh dibuat ulang dengan menjalankan Core Module mode demo: `python scripts/buat_data_contoh.py` (menulis `src/lib/seed-data.json`).

Di mode pengembangan lokal tanpa `.env.local`, kata sandi pengujian adalah `dev-local-only`. Nilai ini tidak pernah berlaku di Production.

## Keamanan

- **Rahasia hanya dari environment variable.** Production menolak login bila `AUTH_SECRET` atau `DEMO_PASSWORD` belum diatur; tidak ada nilai bawaan yang berlaku di Production.
- **Tanpa PII.** Akun dan data contoh memakai nama peran, bukan nama orang. Data contoh versi lama yang masih memuat nama orang otomatis diganti saat aplikasi dimulai.
- **Sesi.** JWT HS256 di cookie `httpOnly`, `secure`, `SameSite=Lax`, berlaku 8 jam.
- **Login.** Perbandingan kata sandi waktu-konstan, pesan galat yang sama untuk pengguna atau kata sandi salah, dan pembatasan 5 percobaan gagal per 10 menit (per instans server).
- **Otorisasi.** Akses halaman diperiksa middleware; setiap server action dan API memeriksa izin peran di server.
- **Header.** Content-Security-Policy berbasis nonce, `X-Frame-Options: DENY`, HSTS, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP/CORP.
- **Data keluar.** Teks bebas disamarkan sebelum dikirim ke penyedia LLM dan sebelum masuk berkas unduhan; laporan berlabel NDA hanya memuat data agregat; setiap unduhan tercatat di log audit.
- **Core Module tertutup.** Endpoint Python hanya menerima token JWT bertanda tangan dengan audiens dan tujuan tertentu, berlaku singkat, dan hanya untuk pengguna yang sudah login. Hasil ditandatangani HMAC-SHA256 dan diverifikasi waktu-konstan sebelum disimpan, sehingga hasil tidak bisa dipalsukan dari browser.
- **API key LLM** hanya dibaca di server (Python Function) dan tidak pernah dikirim ke browser.

## Prinsip UI (heuristik Nielsen Norman Group)

- **Visibility of system status**: stepper posisi alur, progres langkah Core Module secara langsung, banner status database, mode analisis aktif di sidebar.
- **Match with the real world**: istilah dari dokumen (sprint cycle, release candidate, verdict, sign-off), bahasa Indonesia.
- **User control and freedom**: ubah parameter dan uji varian lain kapan saja sebelum keputusan; tombol Batal dan "Periksa lagi".
- **Consistency and standards**: empat verdict selalu dengan warna, ikon, dan label yang sama di semua halaman.
- **Error prevention**: konfirmasi sebelum keputusan yang mengunci data; opsi promosi dinonaktifkan untuk verdict Tidak Lolos/Tidak Dapat Dinilai; mode LLM tidak bisa disimpan tanpa API key.
- **Recognition rather than recall**: pilih peran di halaman login, parameter terisi dari cycle sebelumnya, spesifikasi terisi dari layanan.
- **Flexibility and efficiency**: "Simpan dan ajukan analisis" sekali klik, filter laporan lewat URL.
- **Aesthetic and minimalist design**: jejak keputusan agen disembunyikan di bagian yang bisa dibuka.
- **Help users recover from errors**: ringkasan kesalahan dengan tautan ke isian yang bermasalah; isian tidak hilang saat validasi gagal.
- **Help and documentation**: petunjuk singkat di setiap isian (rentang TPS, aturan penyamaran, arti verdict).

Aksesibel: kontras warna sesuai WCAG AA, fokus keyboard terlihat, teks alternatif untuk status, mode gelap, dan tata letak responsif sampai lebar ponsel.

## Konvensi dokumentasi kode

Setiap modul, kelas, dan fungsi memiliki docstring bergaya **NumPy** (bagian `Parameters`, `Returns`, `Yields`, `Raises`, `Attributes`, `Notes`):

- Python (`api/`, `scripts/`): docstring biasa (`"""..."""`), bisa dibaca dengan `help()`.
- TypeScript (`src/`): format yang sama di dalam blok JSDoc `/** ... */`, sehingga tampil saat hover di editor.

## Struktur

```
api/
  index.py                 Core Module (FastAPI): /api/py/sehat, /api/py/analisis, /api/py/uji-koneksi
  _core/                   digital twin SimPy, agen LangChain, LLM, penyamaran, ELK, registri model
scripts/
  buat_data_contoh.py      membuat data contoh dengan menjalankan Core Module
src/
  app/
    login/                 halaman masuk dan server action login
    (app)/                 halaman setelah login (alignment, incidents, signoff, reports, settings)
    api/                   pengajuan permintaan, penerimaan hasil bertanda tangan, unduhan laporan
  lib/
    core-request.ts        token permintaan dan verifikasi hasil Core Module
    db.ts                  Postgres (Neon) atau PGlite di memori, bootstrap tabel dan seed
    seed.ts                data contoh dari riwayat rilis dan insiden
    pdf.ts                 pembuatan PDF/CSV laporan
  middleware.ts            pemeriksaan sesi dan akses per peran
requirements.txt           dependensi Python Function
vercel.json                konfigurasi Python Function
```
