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

/** Mengembalikan kunci penandatangan sesi, atau null bila konfigurasi Production belum lengkap. */
export function secret(): Uint8Array | null {
  const s = process.env.AUTH_SECRET;
  if (s && s.length >= 32) return new TextEncoder().encode(s);
  if (isProd) return null;
  return new TextEncoder().encode(DEV_SECRET);
}

export function authSecretReady() {
  return secret() !== null;
}

export async function signSession(p: SessionPayload) {
  const key = secret();
  if (!key) throw new Error("AUTH_SECRET belum diatur.");
  return new SignJWT({ ...p })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(key);
}

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
