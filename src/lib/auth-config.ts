import "server-only";
/**
 * Konfigurasi login: kesiapan rahasia, pencocokan kata sandi, dan pembatas percobaan gagal.
 *
 * Kata sandi pengujian berasal dari environment variable `DEMO_PASSWORD` (satu kata sandi untuk
 * semua peran) dan tidak pernah ditulis di kode. Di Production tidak ada nilai bawaan.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { authSecretReady } from "./session";

const isProd = process.env.NODE_ENV === "production";
const DEV_PASSWORD = "dev-local-only";

/**
 * Daftar konfigurasi login yang belum lengkap.
 *
 * Returns
 * -------
 * string[]
 *     Nama environment variable yang perlu diatur; array kosong berarti login siap dipakai.
 */
export function authConfigProblems(): string[] {
  const out: string[] = [];
  if (!authSecretReady()) out.push("AUTH_SECRET (minimal 32 karakter)");
  const pw = process.env.DEMO_PASSWORD;
  if (isProd && (!pw || pw.length < 8)) out.push("DEMO_PASSWORD (minimal 8 karakter)");
  return out;
}

/**
 * Kata sandi yang diharapkan untuk semua akun pengujian.
 *
 * Returns
 * -------
 * string | null
 *     `DEMO_PASSWORD` bila minimal 8 karakter; kata sandi pengembangan lokal di luar
 *     Production; null di Production bila belum diatur.
 */
function expectedPassword() {
  const pw = process.env.DEMO_PASSWORD;
  if (pw && pw.length >= 8) return pw;
  return isProd ? null : DEV_PASSWORD;
}

/**
 * Mencocokkan kata sandi dengan perbandingan waktu-konstan.
 *
 * Kedua nilai di-hash SHA-256 lebih dulu agar panjang dan isi kata sandi tidak bocor lewat
 * waktu respons.
 *
 * Parameters
 * ----------
 * input : string
 *     Kata sandi yang dimasukkan pengguna.
 *
 * Returns
 * -------
 * boolean
 *     true bila cocok.
 */
export function passwordMatches(input: string) {
  const expected = expectedPassword();
  if (!expected) return false;
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

// Pembatas percobaan login sederhana per instans server.
const attempts = new Map<string, { count: number; until: number }>();
const MAX_FAIL = 5;
const WINDOW_MS = 10 * 60 * 1000;

/**
 * Sisa waktu blokir login untuk satu kunci (IP dan nama pengguna).
 *
 * Parameters
 * ----------
 * key : string
 *     Kunci pembatas, berbentuk "ip|username".
 *
 * Returns
 * -------
 * number
 *     Sisa menit blokir; 0 bila tidak diblokir.
 */
export function loginBlockedFor(key: string): number {
  const a = attempts.get(key);
  if (!a) return 0;
  if (Date.now() > a.until) {
    attempts.delete(key);
    return 0;
  }
  return a.count >= MAX_FAIL ? Math.ceil((a.until - Date.now()) / 60000) : 0;
}

/**
 * Mencatat satu percobaan login gagal.
 *
 * Setelah 5 kegagalan dalam 10 menit, kunci diblokir sampai jendela waktunya habis.
 *
 * Parameters
 * ----------
 * key : string
 *     Kunci pembatas, berbentuk "ip|username".
 */
export function recordLoginFailure(key: string) {
  const a = attempts.get(key);
  if (!a || Date.now() > a.until) attempts.set(key, { count: 1, until: Date.now() + WINDOW_MS });
  else a.count++;
  if (attempts.size > 5000) attempts.clear();
}

/**
 * Menghapus catatan kegagalan setelah login berhasil.
 *
 * Parameters
 * ----------
 * key : string
 *     Kunci pembatas, berbentuk "ip|username".
 */
export function clearLoginFailures(key: string) {
  attempts.delete(key);
}
