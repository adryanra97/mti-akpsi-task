"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { audit, requirePermission } from "@/lib/auth";
import { put } from "@/lib/db";
import { getIncident, listIncidents } from "@/lib/data";
import { reportFromIncident } from "@/lib/domain";
import { SERVICES } from "@/lib/core/twin";
import type { Incident, IncidentType } from "@/lib/types";

export interface IncFormState {
  error?: string;
  errors?: Record<string, string>;
  values?: Record<string, string>;
}

const TYPES: IncidentType[] = ["traffic_spike", "memory_leak", "batch_overlap", "lainnya"];

function echo(f: FormData) {
  const out: Record<string, string> = {};
  for (const [k, v] of f.entries()) if (!k.startsWith("$")) out[k] = String(v);
  return out;
}

export async function createIncident(_: IncFormState, f: FormData): Promise<IncFormState> {
  const user = await requirePermission("incident.manage");
  const errors: Record<string, string> = {};
  const n = (k: string, label: string, allowZero = false) => {
    const v = Number(String(f.get(k) ?? "").replace(",", "."));
    const raw = String(f.get(k) ?? "").trim();
    if (raw === "" || Number.isNaN(v)) errors[k] = `Isi ${label}.`;
    else if (allowZero ? v < 0 : v <= 0) errors[k] = `${label[0].toUpperCase() + label.slice(1)} harus ${allowZero ? "0 atau lebih" : "lebih dari 0"}.`;
    return v;
  };
  const type = String(f.get("type") ?? "") as IncidentType;
  const service = String(f.get("service") ?? "");
  const title = String(f.get("title") ?? "").trim();
  const description = String(f.get("description") ?? "").trim();
  const release = String(f.get("release") ?? "").trim();
  const detected = String(f.get("detectedAt") ?? "");
  const elk = f.get("elkDataAvailable") === "on";
  const manual = String(f.get("manualSymptoms") ?? "").trim();

  if (!TYPES.includes(type)) errors.type = "Pilih tipe insiden.";
  if (!SERVICES.some((s) => s.name === service)) errors.service = "Pilih layanan terkait.";
  if (!title) errors.title = "Tulis judul singkat insiden.";
  if (!description) errors.description = "Jelaskan apa yang terjadi.";
  if (!release) errors.release = "Isi rilis atau rollout terkait.";
  if (!detected) errors.detectedAt = "Isi waktu deteksi.";
  if (!elk && !manual) errors.manualSymptoms = "Data ELK tidak tersedia, jadi gambaran gejala wajib diisi.";

  const data: Incident["data"] = {
    type,
    title,
    description,
    service,
    release,
    peakRps: n("peakRps", "beban puncak"),
    avgRps: n("avgRps", "beban rata-rata"),
    durationMin: n("durationMin", "durasi"),
    detectedAt: detected ? new Date(`${detected}:00+07:00`).toISOString() : "",
    payloadKb: n("payloadKb", "ukuran payload"),
    memGrowthMbPerHour: type === "memory_leak" ? n("memGrowthMbPerHour", "laju kenaikan memori") : 0,
    batchCpuPct: type === "batch_overlap" ? n("batchCpuPct", "beban CPU batch job") : 0,
    spec: {
      vcpu: n("vcpu", "vCPU"),
      ramGb: n("ramGb", "RAM"),
      nodes: n("nodes", "jumlah node"),
      threadPool: n("threadPool", "thread pool"),
      connPool: n("connPool", "connection pool"),
      bandwidthMbps: n("bandwidthMbps", "bandwidth"),
    },
    manualSymptoms: manual,
    elkDataAvailable: elk,
  };
  if (Object.keys(errors).length)
    return { errors, values: echo(f), error: `${Object.keys(errors).length} isian perlu dilengkapi atau diperbaiki.` };

  const list = await listIncidents();
  const inc: Incident = {
    id: crypto.randomUUID(),
    code: `INC-${String(list.length + 1).padStart(3, "0")}`,
    createdAt: new Date().toISOString(),
    createdBy: user.name,
    status: "baru",
    data,
    repro: null,
    mitigations: [],
    needsEscalation: false,
    notReproduced: false,
  };
  await put("sa_incidents", inc);
  await audit(user, "Membuka kasus insiden", inc.code, title);
  revalidatePath("/", "layout");
  redirect(`/incidents/${inc.id}`);
}

export async function markAllTested(id: string) {
  const user = await requirePermission("incident.manage");
  const inc = await getIncident(id);
  if (!inc) return;
  const pass = inc.mitigations.some((m) => m.result?.verdict === "LOLOS");
  inc.needsEscalation = !pass;
  await put("sa_incidents", inc);
  if (!pass) await audit(user, "Menandai laporan perlu eskalasi ke Technical Lead", inc.code);
  revalidatePath("/", "layout");
}

export async function finalizeIncident(id: string, _: IncFormState, f: FormData): Promise<IncFormState> {
  const user = await requirePermission("incident.manage");
  const inc = await getIncident(id);
  if (!inc) return { error: "Insiden tidak ditemukan." };
  if (!inc.repro) return { error: "Nilai kondisi insiden terlebih dahulu." };
  const selected = String(f.get("mitigation") ?? "");
  if (!inc.notReproduced) {
    if (!inc.mitigations.length) return { error: "Uji minimal satu opsi mitigasi sebelum menyusun laporan." };
    if (!inc.mitigations.some((m) => m.id === selected)) return { errors: { mitigation: "Pilih mitigasi yang direkomendasikan." } };
    inc.selectedMitigationId = selected;
    const chosen = inc.mitigations.find((m) => m.id === selected)!;
    if (chosen.result?.verdict !== "LOLOS" && !inc.mitigations.some((m) => m.result?.verdict === "LOLOS")) inc.needsEscalation = true;
  }
  inc.status = "selesai";
  inc.closedAt = new Date().toISOString();
  inc.rootCauseAt ??= inc.repro.createdAt;
  inc.reportId = `rpt-${inc.id}`;
  await put("sa_incidents", inc);
  await put("sa_reports", reportFromIncident(inc));
  await audit(user, "Menyimpan laporan insiden", inc.code);
  revalidatePath("/", "layout");
  redirect(`/incidents/${inc.id}?laporan=1`);
}
