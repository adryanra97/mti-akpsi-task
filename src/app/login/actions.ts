"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { USERS } from "@/lib/roles";
import { COOKIE, signSession } from "@/lib/session";
import { audit } from "@/lib/auth";
import { authConfigProblems, clearLoginFailures, loginBlockedFor, passwordMatches, recordLoginFailure } from "@/lib/auth-config";

export interface LoginState {
  error?: string;
  username?: string;
}

const GENERIC = "Nama pengguna atau kata sandi tidak cocok. Periksa lalu coba lagi.";

export async function login(_: LoginState, form: FormData): Promise<LoginState> {
  const username = String(form.get("username") ?? "").trim().toLowerCase().slice(0, 64);
  const password = String(form.get("password") ?? "").slice(0, 256);
  const next = String(form.get("next") ?? "/");

  if (authConfigProblems().length) {
    return { error: "Login belum dapat dipakai karena konfigurasi server belum lengkap.", username };
  }
  if (!username || !password) return { error: "Isi nama pengguna dan kata sandi.", username };

  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || "lokal";
  const key = `${ip}|${username}`;
  const wait = loginBlockedFor(key);
  if (wait) return { error: `Terlalu banyak percobaan gagal. Coba lagi dalam ${wait} menit.`, username };

  const user = USERS.find((u) => u.username === username);
  const ok = passwordMatches(password);
  if (!user || !ok) {
    recordLoginFailure(key);
    return { error: GENERIC, username };
  }
  clearLoginFailures(key);

  const token = await signSession({ uid: user.id, name: user.name, role: user.role });
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  try {
    await audit({ uid: user.id, name: user.name, role: user.role }, "Masuk", "Dashboard");
  } catch {
    // log audit tidak boleh menghalangi login
  }
  redirect(next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/");
}

export async function logout() {
  const jar = await cookies();
  jar.delete(COOKIE);
  redirect("/login");
}
