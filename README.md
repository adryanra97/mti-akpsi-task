# ServerAgent Dashboard

Implementasi Dashboard «MVP» ServerAgent (Skenario 3) dari dokumen *C6 Functional Models v1.3*: dashboard untuk menilai kesiapan performa release candidate sebelum promosi dari Dev ke Production, menangani insiden pasca go-live, menerbitkan dokumen sign-off, dan mengunduh laporan untuk analisis tren.

Dibangun dengan Next.js 15 (App Router), Tailwind CSS 4, dan Postgres (Neon). Siap di-deploy ke Vercel.

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

## Mode analisis (Core Module)

Core Module diperlakukan sebagai kotak hitam dengan dua mode yang dipilih Technical Lead di **Pengaturan**:

- **Demo**: digital twin bawaan (model antrean sederhana yang dikalibrasi dari hasil uji Dev), estimasi penalaran dan narasi deterministik. Tanpa API key dan tanpa biaya. Masukan yang sama selalu memberi hasil sama.
- **LLM**: rencana analisis, estimasi penalaran (dengan beberapa sampel untuk mengukur kesepakatan), dan narasi verdict disusun oleh model pilihan:
  - Claude (Anthropic): `ANTHROPIC_API_KEY`
  - OpenAI atau layanan kompatibel OpenAI (OpenRouter, Groq, dll.): `OPENAI_API_KEY`, opsional `OPENAI_BASE_URL`
  - Gemini (Google): `GEMINI_API_KEY`

Data sensitif (host, IP, email, nomor panjang, nama layanan) disamarkan sebelum dikirim ke penyedia LLM. Bila panggilan LLM gagal, Core Module memakai fallback deterministik dan mencatatnya pada hasil. Estimasi biaya per permintaan dihitung dari token dan harga per model yang bisa diatur.

Aturan penjurusan: beban sampai 2,5× titik uji Dev memakai digital twin; 2,5× sampai 5× memakai estimasi penalaran bila skor keyakinan memenuhi ambang (bila tidak, kembali ke digital twin); di atas 5× atau tanpa model twin aktif berstatus **Tidak Dapat Dinilai**.

## Deploy ke Vercel

1. Import repo ini di Vercel (framework terdeteksi otomatis sebagai Next.js).
2. **Database**: tab **Storage**, lalu **Create Database**, pilih **Neon (Serverless Postgres)**, lalu sambungkan ke project. `DATABASE_URL` terisi otomatis. Tabel dan data contoh dibuat otomatis saat aplikasi pertama kali dibuka.
3. **Environment variables** (Settings, lalu Environment Variables):
   - `AUTH_SECRET` (wajib): minimal 32 karakter acak, misalnya hasil `openssl rand -base64 48`.
   - `DEMO_PASSWORD` (wajib): kata sandi akun pengujian, minimal 12 karakter.
   - Tanpa keduanya, halaman login menampilkan pesan bahwa konfigurasi belum lengkap dan login ditolak.
   - `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY`: opsional, untuk mode LLM.
4. Redeploy setelah mengubah environment variable.

Tanpa `DATABASE_URL`, aplikasi tetap berjalan memakai Postgres sementara di memori (PGlite). Akan muncul banner peringatan karena data bisa hilang saat server dimulai ulang.

## Menjalankan secara lokal

```bash
npm install
cp .env.example .env.local   # opsional
npm run dev                  # http://localhost:3000
```

Di mode pengembangan lokal tanpa `.env.local`, kata sandi pengujian adalah `dev-local-only`. Nilai ini tidak pernah berlaku di Production.

## Keamanan

- **Rahasia hanya dari environment variable.** Production menolak login bila `AUTH_SECRET` atau `DEMO_PASSWORD` belum diatur; tidak ada nilai bawaan yang berlaku di Production.
- **Tanpa PII.** Akun dan data contoh memakai nama peran, bukan nama orang. Data contoh versi lama yang masih memuat nama orang otomatis diganti saat aplikasi dimulai.
- **Sesi.** JWT HS256 di cookie `httpOnly`, `secure`, `SameSite=Lax`, berlaku 8 jam.
- **Login.** Perbandingan kata sandi waktu-konstan, pesan galat yang sama untuk pengguna atau kata sandi salah, dan pembatasan 5 percobaan gagal per 10 menit (per instans server).
- **Otorisasi.** Akses halaman diperiksa middleware; setiap server action dan API memeriksa izin peran di server.
- **Header.** Content-Security-Policy berbasis nonce, `X-Frame-Options: DENY`, HSTS, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP/CORP.
- **Data keluar.** Teks bebas disamarkan sebelum dikirim ke penyedia LLM dan sebelum masuk berkas unduhan; laporan berlabel NDA hanya memuat data agregat; setiap unduhan tercatat di log audit.
- **API key LLM** hanya dibaca di server dan tidak pernah dikirim ke browser.

## Prinsip UI (heuristik Nielsen Norman Group)

- **Visibility of system status**: stepper posisi alur, progres langkah Core Module secara langsung, banner status database, mode analisis aktif di sidebar.
- **Match with the real world**: istilah dari dokumen (sprint cycle, release candidate, verdict, sign-off), bahasa Indonesia.
- **User control and freedom**: ubah parameter dan uji varian lain kapan saja sebelum keputusan; tombol Batal dan "Periksa lagi".
- **Consistency and standards**: empat verdict selalu dengan warna, ikon, dan label yang sama di semua halaman.
- **Error prevention**: konfirmasi sebelum keputusan yang mengunci data; opsi promosi dinonaktifkan untuk verdict Tidak Lolos/Tidak Dapat Dinilai; mode LLM tidak bisa disimpan tanpa API key.
- **Recognition rather than recall**: pilih peran di halaman login, parameter terisi dari cycle sebelumnya, spesifikasi terisi dari layanan.
- **Flexibility and efficiency**: "Simpan dan jalankan analisis" sekali klik, filter laporan lewat URL.
- **Aesthetic and minimalist design**: jejak keputusan agen disembunyikan di bagian yang bisa dibuka.
- **Help users recover from errors**: ringkasan kesalahan dengan tautan ke isian yang bermasalah; isian tidak hilang saat validasi gagal.
- **Help and documentation**: petunjuk singkat di setiap isian (rentang TPS, aturan penyamaran, arti verdict).

Aksesibel: kontras warna sesuai WCAG AA, fokus keyboard terlihat, teks alternatif untuk status, mode gelap, dan tata letak responsif sampai lebar ponsel.

## Struktur

```
src/
  app/
    login/                 halaman masuk dan server action login
    (app)/                 halaman setelah login (alignment, incidents, signoff, reports, settings)
    api/                   analisis streaming (NDJSON) dan unduhan laporan
  lib/
    core/                  Core Module: digital twin, penyamaran, ELK (simulasi), LLM, engine
    db.ts                  Postgres (Neon) atau PGlite di memori, bootstrap tabel dan seed
    seed.ts                data contoh dari riwayat rilis dan insiden
    pdf.ts                 pembuatan PDF/CSV laporan
  middleware.ts            pemeriksaan sesi dan akses per peran
```
