import { NextResponse } from "next/server";
import { audit, currentUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import { getIncident } from "@/lib/data";
import { put } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { incidentRequest, signCoreToken } from "@/lib/core-request";
import { transition } from "@/lib/domain";
import { sameOrigin } from "@/lib/stream";
import type { MitigationChanges } from "@/lib/types";

export const dynamic = "force-dynamic";

const KEYS: (keyof MitigationChanges)[] = ["vcpu", "ramGb", "nodes", "threadPool", "connPool", "timeoutMs"];

/** ajukanReproduksi() atau tambahOpsiMitigasi(perubahan), lalu menerbitkan PermintaanAnalisis bertanda tangan. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Permintaan ditolak." }, { status: 403 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sesi berakhir. Masuk kembali." }, { status: 401 });
  if (!can(user.role, "incident.manage")) return NextResponse.json({ error: "Peran Anda tidak dapat menilai insiden." }, { status: 403 });
  const { id } = await params;
  const inc = await getIncident(id);
  if (!inc) return NextResponse.json({ error: "Insiden tidak ditemukan." }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { kind?: string; label?: string; changes?: Record<string, unknown> };
  const settings = await getSettings();
  const requestId = crypto.randomUUID();

  if (body.kind === "mitigasi") {
    if (!["Tereproduksi", "UjiMitigasi"].includes(inc.status)) {
      return NextResponse.json({ error: "Opsi mitigasi hanya dapat diuji setelah insiden tereproduksi." }, { status: 409 });
    }
    const changes: MitigationChanges = {};
    for (const k of KEYS) {
      const v = Number(body.changes?.[k]);
      if (body.changes?.[k] !== undefined && body.changes?.[k] !== "" && Number.isFinite(v) && v > 0) changes[k] = v;
    }
    if (!Object.keys(changes).length) return NextResponse.json({ error: "Ubah minimal satu nilai spesifikasi untuk opsi mitigasi." }, { status: 400 });
    const label = String(body.label ?? "").trim().slice(0, 120) || `Opsi ${inc.mitigations.length + 1}`;
    const token = await signCoreToken("analisis", { permintaan: incidentRequest(inc, settings, requestId, { label, changes }) });
    if (inc.status === "Tereproduksi") transition(inc, "UjiMitigasi", user.name, `Opsi ditambahkan: ${label}`);
    inc.pendingRequestId = requestId;
    await put("sa_incidents", inc);
    await audit(user, "Mengajukan penilaian opsi mitigasi", inc.code, label);
    return NextResponse.json({ token, coreUrl: "/api/py/analisis" });
  }

  if (!["Dicatat", "DalamReproduksi"].includes(inc.status)) {
    return NextResponse.json({ error: "Reproduksi hanya dapat diajukan untuk insiden berstatus Dicatat." }, { status: 409 });
  }
  const token = await signCoreToken("analisis", { permintaan: incidentRequest(inc, settings, requestId) });
  if (inc.status === "Dicatat") transition(inc, "DalamReproduksi", user.name, "Reproduksi diajukan");
  inc.pendingRequestId = requestId;
  await put("sa_incidents", inc);
  await audit(user, "Mengajukan reproduksi insiden", inc.code);
  return NextResponse.json({ token, coreUrl: "/api/py/analisis" });
}
