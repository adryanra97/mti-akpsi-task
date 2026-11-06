import "server-only";
/**
 * Otentikasi dan otorisasi di server: pengguna aktif, pemeriksaan izin, dan log audit.
 */
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE, verifySession, type SessionPayload } from "./session";
import { can, type Permission } from "./roles";
import { put } from "./db";
import type { AuditEntry } from "./types";

/**
 * Pengguna yang sedang login berdasarkan cookie sesi.
 *
 * Returns
 * -------
 * Promise<SessionPayload | null>
 *     Identitas pengguna, atau null bila belum login.
 */
export const currentUser = cache(async function currentUser(): Promise<SessionPayload | null> {
  const jar = await cookies();
  return verifySession(jar.get(COOKIE)?.value);
});

/**
 * Pengguna yang sedang login; mengalihkan ke /login bila belum login.
 *
 * Returns
 * -------
 * Promise<SessionPayload>
 *     Identitas pengguna.
 */
export async function requireUser(): Promise<SessionPayload> {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}

/**
 * Galat saat peran pengguna tidak memiliki izin untuk suatu tindakan.
 */
export class ForbiddenError extends Error {}

/**
 * Memastikan pengguna login dan memiliki izin tertentu.
 *
 * Parameters
 * ----------
 * perm : Permission
 *     Izin yang dibutuhkan.
 *
 * Returns
 * -------
 * Promise<SessionPayload>
 *     Identitas pengguna.
 *
 * Raises
 * ------
 * ForbiddenError
 *     Bila peran pengguna tidak memiliki izin tersebut.
 */
export async function requirePermission(perm: Permission): Promise<SessionPayload> {
  const u = await requireUser();
  if (!can(u.role, perm)) throw new ForbiddenError("Peran Anda tidak memiliki akses untuk tindakan ini.");
  return u;
}

/**
 * Mencatat satu entri log audit.
 *
 * Parameters
 * ----------
 * user : SessionPayload
 *     Pengguna yang melakukan tindakan.
 * action : string
 *     Nama tindakan, misalnya "Unduh laporan (PDF)".
 * target : string
 *     Objek tindakan, misalnya kode laporan.
 * detail : string, optional
 *     Keterangan tambahan.
 *
 * Returns
 * -------
 * Promise<void>
 */
export async function audit(user: SessionPayload, action: string, target: string, detail?: string) {
  const entry: AuditEntry = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    user: user.name,
    role: user.role,
    action,
    target,
    detail,
  };
  await put("sa_audit", entry);
}
