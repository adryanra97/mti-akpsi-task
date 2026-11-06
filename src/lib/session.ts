/**
 * Sesi login berbasis JWT HS256 di cookie httpOnly.
 *
 * Dipakai juga oleh middleware (Edge runtime), sehingga hanya memakai Web Crypto melalui `jose`.
 */
import { SignJWT, jwtVerify } from "jose";
import type { Role } from "./types";

export const COOKIE = "sa_session";

export interface SessionPayload {
  uid: string;
  name: string;
  role: Role;
}

const isProd = process.env.NODE_ENV === "production";
// Hanya untuk pengembangan lokal. Di Production, AUTH_SECRET wajib diatur dan nilai ini tidak pernah dipakai.
const DEV_SECRET = "dev-only-secret-tidak-dipakai-di-production-000000";

/**
 * Kunci penandatangan bersama untuk sesi dan permintaan ke Core Module.
 *
 * Returns
 * -------
 * Uint8Array | null
 *     `AUTH_SECRET` bila minimal 32 karakter; kunci pengembangan di luar Production;
 *     null di Production bila belum diatur.
 */
export function secret(): Uint8Array | null {
  const s = process.env.AUTH_SECRET;
  if (s && s.length >= 32) return new TextEncoder().encode(s);
  if (isProd) return null;
  return new TextEncoder().encode(DEV_SECRET);
}

/**
 * Memeriksa apakah kunci penandatangan tersedia.
 *
 * Returns
 * -------
 * boolean
 *     true bila `secret()` tidak null.
 */
export function authSecretReady() {
  return secret() !== null;
}

/**
 * Membuat token sesi yang berlaku 8 jam.
 *
 * Parameters
 * ----------
 * p : SessionPayload
 *     Identitas pengguna: uid, nama, dan peran.
 *
 * Returns
 * -------
 * Promise<string>
 *     JWT HS256.
 *
 * Raises
 * ------
 * Error
 *     Bila `AUTH_SECRET` belum diatur.
 */
export async function signSession(p: SessionPayload) {
  const key = secret();
  if (!key) throw new Error("AUTH_SECRET belum diatur.");
  return new SignJWT({ ...p })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(key);
}

/**
 * Memverifikasi token sesi.
 *
 * Parameters
 * ----------
 * token : string | undefined
 *     Nilai cookie sesi.
 *
 * Returns
 * -------
 * Promise<SessionPayload | null>
 *     Identitas pengguna, atau null bila token kosong, kedaluwarsa, atau tidak sah.
 */
export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  const key = secret();
  if (!token || !key) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    return { uid: String(payload.uid), name: String(payload.name), role: payload.role as Role };
  } catch {
    return null;
  }
}
