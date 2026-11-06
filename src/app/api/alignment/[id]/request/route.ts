/**
 * API pengajuan analisis alignment.
 */
import { NextResponse } from "next/server";
import { audit, currentUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import { getSession } from "@/lib/data";
import { put } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { alignmentRequest, signCoreToken } from "@/lib/core-request";
import { transition } from "@/lib/domain";
import { sameOrigin } from "@/lib/stream";

export const dynamic = "force-dynamic";

/**
 * Langkah ajukan(): Pengisian Parameter [lengkap] -> Menunggu Hasil, lalu menerbitkan PermintaanAnalisis bertanda tangan.
 *
 * Parameters
 * ----------
 * req : Request
 *     Permintaan dari peramban (asal yang sama).
 * params : Promise<{ id: string }>
 *     Identitas sesi.
 *
 * Returns
 * -------
 * Promise<NextResponse>
 *     { token, coreUrl } bila berhasil; 401, 403, 404, atau 409 bila sesi tidak dapat diajukan.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Permintaan ditolak." }, { status: 403 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sesi berakhir. Masuk kembali." }, { status: 401 });
  if (!can(user.role, "alignment.run")) return NextResponse.json({ error: "Peran Anda tidak dapat menjalankan analisis." }, { status: 403 });
  const { id } = await params;
  const s = await getSession(id);
  if (!s) return NextResponse.json({ error: "Sesi tidak ditemukan." }, { status: 404 });
  if (!s.params) return NextResponse.json({ error: "Isi parameter analisis terlebih dahulu." }, { status: 400 });
  if (s.status !== "PengisianParameter" && s.status !== "MenungguHasil") {
    return NextResponse.json({ error: "Analisis hanya dapat diajukan saat sesi berada pada tahap Pengisian Parameter." }, { status: 409 });
  }
  const settings = await getSettings();
  const requestId = crypto.randomUUID();
  const token = await signCoreToken("analisis", { permintaan: alignmentRequest(s, settings, requestId) });
  if (s.status === "PengisianParameter") transition(s, "MenungguHasil", user.name, "Parameter lengkap; permintaan analisis diajukan");
  s.pendingRequestId = requestId;
  await put("sa_sessions", s);
  await audit(user, "Mengajukan permintaan analisis", s.code, settings.mode === "llm" ? `Mode LLM ${settings.provider}` : "Mode demo");
  return NextResponse.json({ token, coreUrl: "/api/py/analisis" });
}
