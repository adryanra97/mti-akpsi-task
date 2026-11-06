import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE, verifySession, type SessionPayload } from "./session";
import { can, type Permission } from "./roles";
import { put } from "./db";
import type { AuditEntry } from "./types";

export async function currentUser(): Promise<SessionPayload | null> {
  const jar = await cookies();
  return verifySession(jar.get(COOKIE)?.value);
}

export async function requireUser(): Promise<SessionPayload> {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}

export class ForbiddenError extends Error {}

export async function requirePermission(perm: Permission): Promise<SessionPayload> {
  const u = await requireUser();
  if (!can(u.role, perm)) throw new ForbiddenError("Peran Anda tidak memiliki akses untuk tindakan ini.");
  return u;
}

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
