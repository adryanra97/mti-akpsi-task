import { NextResponse } from "next/server";
import { audit, currentUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import { getIncident } from "@/lib/data";
import { put } from "@/lib/db";
import { getSettings, saveSettings } from "@/lib/settings";
import { assessIncident } from "@/lib/core/engine";
import { ndjsonStream, sameOrigin } from "@/lib/stream";
import type { MitigationChanges } from "@/lib/types";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const KEYS: (keyof MitigationChanges)[] = ["vcpu", "ramGb", "nodes", "threadPool", "connPool", "timeoutMs"];

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Permintaan ditolak." }, { status: 403 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sesi berakhir. Masuk kembali." }, { status: 401 });
  if (!can(user.role, "incident.manage")) return NextResponse.json({ error: "Peran Anda tidak dapat menilai insiden." }, { status: 403 });
  const { id } = await params;
  const inc = await getIncident(id);
  if (!inc) return NextResponse.json({ error: "Insiden tidak ditemukan." }, { status: 404 });
  if (inc.status === "selesai") return NextResponse.json({ error: "Insiden sudah ditutup." }, { status: 409 });

  const body = (await req.json().catch(() => ({}))) as { kind?: string; label?: string; changes?: Record<string, unknown> };
  const kind = body.kind === "mitigasi" ? "mitigasi" : "reproduksi";
  let changes: MitigationChanges | undefined;
  if (kind === "mitigasi") {
    if (!inc.repro) return NextResponse.json({ error: "Nilai kondisi insiden terlebih dahulu." }, { status: 400 });
    changes = {};
    for (const k of KEYS) {
      const v = Number(body.changes?.[k]);
      if (body.changes?.[k] !== undefined && body.changes?.[k] !== "" && Number.isFinite(v) && v > 0) changes[k] = v;
    }
    if (!Object.keys(changes).length) return NextResponse.json({ error: "Ubah minimal satu nilai spesifikasi untuk opsi mitigasi." }, { status: 400 });
  }

  const settings = await getSettings();
  return ndjsonStream(async (emit) => {
    const { result, baselineToCache } = await assessIncident(inc, kind, changes, { settings, userName: user.name, emit, pace: settings.mode === "demo" });
    const fresh = (await getIncident(id)) ?? inc;
    if (kind === "reproduksi") {
      fresh.repro = result;
      fresh.status = "dinilai";
      fresh.notReproduced = result.reproduced !== true;
      if (result.reproduced) fresh.rootCauseAt = result.createdAt;
    } else {
      fresh.mitigations = [
        ...fresh.mitigations,
        {
          id: crypto.randomUUID(),
          label: String(body.label ?? "").trim() || `Opsi ${fresh.mitigations.length + 1}`,
          changes: changes!,
          result,
          createdAt: result.createdAt,
        },
      ];
      fresh.status = "mitigasi";
    }
    await put("sa_incidents", fresh);
    if (baselineToCache) {
      await saveSettings({ ...settings, cachedBaselines: { ...settings.cachedBaselines, [inc.data.service]: { ...baselineToCache, source: "cache" } } });
    }
    await audit(user, kind === "reproduksi" ? "Menilai kondisi insiden" : "Menilai opsi mitigasi", inc.code, `Verdict ${result.verdict}`);
    return { verdict: result.verdict };
  });
}
