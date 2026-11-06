/**
 * API penerimaan hasil reproduksi dan penilaian mitigasi dari Core Module.
 */
import { NextResponse } from "next/server";
import { audit, currentUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import { getIncident } from "@/lib/data";
import { put } from "@/lib/db";
import { getSettings, saveSettings } from "@/lib/settings";
import { verifyCoreResult } from "@/lib/core-request";
import { transition } from "@/lib/domain";
import { sameOrigin } from "@/lib/stream";

export const dynamic = "force-dynamic";

/**
 * terimaHasilReproduksi(hasil) atau terimaVerdictOpsi(v), sesuai state machine KasusInsiden (Gambar 10.18).
 *
 * Reproduksi: Dalam Reproduksi -> Tereproduksi atau Belum Tereproduksi. Mitigasi: opsi ditambahkan,
 * dan verdict Lolos membawa kasus ke Mitigasi Ditemukan.
 *
 * Parameters
 * ----------
 * req : Request
 *     Body JSON { hasil: string, tanda: string }.
 * params : Promise<{ id: string }>
 *     Identitas insiden.
 *
 * Returns
 * -------
 * Promise<NextResponse>
 *     { ok: true } bila tersimpan; galat bila tanda tidak sah atau status tidak sesuai.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Permintaan ditolak." }, { status: 403 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sesi berakhir. Masuk kembali." }, { status: 401 });
  if (!can(user.role, "incident.manage")) return NextResponse.json({ error: "Peran Anda tidak dapat menilai insiden." }, { status: 403 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { hasil?: string; tanda?: string };
  const result = verifyCoreResult(String(body.hasil ?? ""), String(body.tanda ?? ""));
  if (!result) return NextResponse.json({ error: "Hasil analisis tidak sah atau sudah diubah." }, { status: 400 });
  const inc = await getIncident(id);
  if (!inc) return NextResponse.json({ error: "Insiden tidak ditemukan." }, { status: 404 });
  if (inc.pendingRequestId !== result.idPermintaan) {
    return NextResponse.json({ error: "Hasil ini tidak cocok dengan permintaan yang sedang berjalan." }, { status: 409 });
  }
  inc.pendingRequestId = undefined;

  if (result.mode === "ReproduksiInsiden" && inc.status === "DalamReproduksi") {
    inc.repro = result;
    if (result.statusReproduksi === "Tereproduksi") {
      inc.rootCauseAt = result.waktuSelesai;
      transition(inc, "Tereproduksi", "Core Module", "Kondisi insiden tereproduksi");
    } else {
      transition(inc, "BelumTereproduksi", "Core Module", result.statusReproduksi === "TidakDapatDinilai" ? "Tidak dapat dinilai" : "Gejala tidak tereproduksi");
    }
  } else if (result.mode === "Mitigasi" && inc.status === "UjiMitigasi" && result.mitigasi) {
    inc.mitigations = [
      ...inc.mitigations,
      { id: result.idPermintaan, label: result.mitigasi.label, changes: result.mitigasi.changes, result, createdAt: result.waktuSelesai },
    ];
    if (result.verdict.status === "Lolos") transition(inc, "MitigasiDitemukan", "Core Module", `Opsi lolos: ${result.mitigasi.label}`);
  } else {
    return NextResponse.json({ error: "Status insiden tidak sesuai untuk hasil ini." }, { status: 409 });
  }
  await put("sa_incidents", inc);
  if (result.metrikBaseline.sumber === "ELKLangsung") {
    const settings = await getSettings();
    await saveSettings({ ...settings, cachedBaselines: { ...settings.cachedBaselines, [inc.data.service]: result.metrikBaseline } });
  }
  await audit(user, result.mode === "Mitigasi" ? "Menerima verdict opsi mitigasi" : "Menerima hasil reproduksi", inc.code, `Verdict ${result.verdict.status}`);
  return NextResponse.json({ ok: true });
}
