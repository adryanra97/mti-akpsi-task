/**
 * API penerimaan hasil analisis alignment dari Core Module.
 */
import { NextResponse } from "next/server";
import { audit, currentUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import { getSession } from "@/lib/data";
import { put } from "@/lib/db";
import { getSettings, saveSettings } from "@/lib/settings";
import { verifyCoreResult } from "@/lib/core-request";
import { transition } from "@/lib/domain";
import { sameOrigin } from "@/lib/stream";

export const dynamic = "force-dynamic";

/**
 * terimaHasil(hasil): Menunggu Hasil -> Peninjauan.
 *
 * Hasil hanya diterima bila tanda HMAC Core Module sah dan id permintaan cocok; baseline
 * terbaru disimpan sebagai cadangan bila ELK tidak tersedia.
 *
 * Parameters
 * ----------
 * req : Request
 *     Body JSON { hasil: string, tanda: string }.
 * params : Promise<{ id: string }>
 *     Identitas sesi.
 *
 * Returns
 * -------
 * Promise<NextResponse>
 *     { ok: true } bila tersimpan; 400, 401, 403, 404, atau 409 bila ditolak.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Permintaan ditolak." }, { status: 403 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sesi berakhir. Masuk kembali." }, { status: 401 });
  if (!can(user.role, "alignment.run")) return NextResponse.json({ error: "Peran Anda tidak dapat menjalankan analisis." }, { status: 403 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { hasil?: string; tanda?: string };
  const result = verifyCoreResult(String(body.hasil ?? ""), String(body.tanda ?? ""));
  if (!result) return NextResponse.json({ error: "Hasil analisis tidak sah atau sudah diubah." }, { status: 400 });
  const s = await getSession(id);
  if (!s) return NextResponse.json({ error: "Sesi tidak ditemukan." }, { status: 404 });
  if (s.status !== "MenungguHasil" || s.pendingRequestId !== result.idPermintaan || result.mode !== "Alignment") {
    return NextResponse.json({ error: "Hasil ini tidak cocok dengan permintaan analisis yang sedang berjalan." }, { status: 409 });
  }
  s.runs = [...s.runs, { id: result.idPermintaan, createdAt: result.waktuSelesai, createdBy: user.name, params: s.params!, result }];
  s.pendingRequestId = undefined;
  transition(s, "Peninjauan", "Core Module", `Hasil analisis diterima: ${result.verdict.status}`);
  await put("sa_sessions", s);
  if (result.metrikBaseline.sumber === "ELKLangsung") {
    const settings = await getSettings();
    await saveSettings({ ...settings, cachedBaselines: { ...settings.cachedBaselines, [s.service]: result.metrikBaseline } });
  }
  await audit(user, "Menerima hasil analisis Core Module", s.code, `Verdict ${result.verdict.status}`);
  return NextResponse.json({ ok: true, verdict: result.verdict.status });
}
