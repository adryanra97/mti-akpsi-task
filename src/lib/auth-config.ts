import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { authSecretReady } from "./session";

const isProd = process.env.NODE_ENV === "production";
const DEV_PASSWORD = "dev-local-only";

/** Daftar konfigurasi yang belum lengkap. Kosong berarti login siap dipakai. */
export function authConfigProblems(): string[] {
  const out: string[] = [];
  if (!authSecretReady()) out.push("AUTH_SECRET (minimal 32 karakter)");
  const pw = process.env.DEMO_PASSWORD;
  if (isProd && (!pw || pw.length < 12)) out.push("DEMO_PASSWORD (minimal 12 karakter)");
  return out;
}

function expectedPassword() {
  const pw = process.env.DEMO_PASSWORD;
  if (pw && pw.length >= 12) return pw;
  return isProd ? null : DEV_PASSWORD;
}

/** Perbandingan waktu-konstan agar panjang dan isi kata sandi tidak bocor lewat waktu respons. */
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

export function loginBlockedFor(key: string): number {
  const a = attempts.get(key);
  if (!a) return 0;
  if (Date.now() > a.until) {
    attempts.delete(key);
    return 0;
  }
  return a.count >= MAX_FAIL ? Math.ceil((a.until - Date.now()) / 60000) : 0;
}

export function recordLoginFailure(key: string) {
  const a = attempts.get(key);
  if (!a || Date.now() > a.until) attempts.set(key, { count: 1, until: Date.now() + WINDOW_MS });
  else a.count++;
  if (attempts.size > 5000) attempts.clear();
}

export function clearLoginFailures(key: string) {
  attempts.delete(key);
}
