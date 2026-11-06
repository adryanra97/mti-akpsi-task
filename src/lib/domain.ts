import type {
  AlignmentParams,
  AlignmentSession,
  AnalysisResult,
  Incident,
  IncidentStatus,
  ReportEntry,
  SessionStatus,
  SignoffDoc,
  SignoffStatus,
  StatusEvent,
} from "./types";
import { serviceEntry } from "./services";

/** Transisi state machine: mengubah status dan mencatat riwayatnya (event, waktu, pelaku). */
export function transition<S extends SessionStatus | IncidentStatus | SignoffStatus>(
  obj: { status: S; history: StatusEvent<S>[] },
  status: S,
  by: string,
  note?: string,
  at = new Date().toISOString(),
) {
  obj.status = status;
  obj.history = [...(obj.history ?? []), { status, at, by, ...(note ? { note } : {}) }];
}

export function defaultParams(service: string): AlignmentParams {
  const spec = serviceEntry(service)?.spesifikasi ?? { vcpu: 8, ramGb: 16, nodes: 2, threadPool: 150, connPool: 40, bandwidthMbps: 1000, timeoutMs: 3000 };
  return {
    normalTps: 8,
    peakTps: 45,
    whatIf: [2, 3],
    serviceVersion: "",
    configChanges: "",
    criteria: { maxP95Ms: 800, maxErrorRatePct: 1, maxCpuPct: 80, maxMemPct: 85 },
    devSpec: { vcpu: 4, ramGb: 8, nodes: 2, threadPool: 100, connPool: 30, bandwidthMbps: 1000, timeoutMs: spec.timeoutMs ?? 3000 },
    devSummary: { testedTps: 40, p95Ms: 420, cpuPct: 62, memPct: 58, errorRatePct: 0.1, payloadKb: 6, notes: "" },
    prodSpec: { ...spec },
  };
}

export const latestResult = (s: AlignmentSession) => s.runs.at(-1)?.result;

/** Indikator langkah beban puncak (atau langkah insiden) dari hasil Core Module. */
export function peakSummary(r: AnalysisResult | undefined | null) {
  return r?.langkah.find((l) => l.kunci === "puncak" || l.kunci === "insiden")?.ringkasan ?? null;
}

export function limitationsFor(r: AnalysisResult): string[] {
  const m = r.modelDigitalTwin;
  const tgl = (s: string) => new Date(s).toLocaleDateString("id-ID", { dateStyle: "long" });
  const out = [
    "Simulasi melengkapi, bukan menggantikan, hasil SIT/UAT dan performance test di environment Dev. Eksekusi deployment tetap melalui pipeline yang berlaku.",
    m?.statusAktif && m.tanggalKalibrasi
      ? `Model digital twin ${m.versiModel} dikalibrasi pada ${tgl(m.tanggalKalibrasi)}, dengan rentang terkalibrasi ${m.tpsMinTerkalibrasi} sampai ${m.tpsMaksTerkalibrasi} TPS.`
      : "Belum ada model digital twin aktif untuk layanan ini.",
    r.metrikBaseline.sumber === "ELKLangsung"
      ? `Metrik baseline diambil dari ELK Stack pada ${tgl(r.metrikBaseline.tanggalPengambilan)}.`
      : `ELK Stack tidak dapat diakses saat analisis; baseline memakai data tersimpan ${tgl(r.metrikBaseline.tanggalPengambilan)}.`,
    `${r.penyamaran.jumlah} item data sensitif disamarkan sebelum dikirim ke Layanan LLM.`,
  ];
  if (r.kalibrasi) out.push(`Galat kalibrasi p95 terhadap ${r.kalibrasi.sumber}: ${r.kalibrasi.galatPersen}%.`);
  return out;
}

export function reportFromSession(s: AlignmentSession): ReportEntry {
  const r = latestResult(s)!;
  const peak = peakSummary(r);
  return {
    id: s.reportId ?? `rpt-${s.id}`,
    kind: "alignment",
    refId: s.id,
    title: `Laporan alignment ${s.release} cycle ${s.cycleNo}`,
    service: s.service,
    release: s.release,
    cycleNo: s.cycleNo,
    verdict: r.verdict.status,
    status: s.decision === "LanjutPromosi" ? "Lanjut promosi ke Production" : "Kembali ke Dev",
    restricted: false,
    createdAt: s.decidedAt ?? new Date().toISOString(),
    metrics: { cpuPct: peak?.cpuPct, memPct: peak?.memPct, p95Ms: peak?.p95Ms, maxTps: r.kapasitas?.kapasitasMaksTps ?? null },
  };
}

export function reportFromSignoff(d: SignoffDoc): ReportEntry {
  const r = d.snapshot.result;
  const peak = peakSummary(r);
  return {
    id: d.reportId ?? `rpt-${d.id}`,
    kind: "signoff",
    refId: d.id,
    title: `Dokumen sign-off ${d.snapshot.release} cycle ${d.snapshot.cycleNo} v${d.version}`,
    service: d.snapshot.service,
    release: d.snapshot.release,
    cycleNo: d.snapshot.cycleNo,
    verdict: r.verdict.status,
    status: d.status === "Disetujui" ? "Disetujui" : d.status === "Ditolak" ? "Ditolak" : "Menunggu keputusan",
    restricted: false,
    createdAt: d.decidedAt ?? d.createdAt,
    metrics: { cpuPct: peak?.cpuPct, memPct: peak?.memPct, p95Ms: peak?.p95Ms, maxTps: r.kapasitas?.kapasitasMaksTps ?? null },
  };
}

export function mttrMinutes(inc: Incident): number | undefined {
  if (!inc.rootCauseAt) return undefined;
  return Math.max(1, Math.round((new Date(inc.rootCauseAt).getTime() - new Date(inc.data.detectedAt).getTime()) / 60000));
}

export function selectedMitigation(inc: Incident) {
  return inc.mitigations.find((m) => m.id === inc.selectedMitigationId);
}

export function reportFromIncident(inc: Incident): ReportEntry {
  const after = selectedMitigation(inc)?.result;
  const peak = peakSummary(inc.repro);
  const finalPath = inc.history.at(-2)?.status;
  return {
    id: inc.reportId ?? `rpt-${inc.id}`,
    kind: "insiden",
    refId: inc.id,
    title: `Laporan insiden ${inc.code}: ${inc.data.title}`,
    service: inc.data.service,
    release: inc.data.release,
    cycleNo: null,
    verdict: (after ?? inc.repro)?.verdict.status ?? null,
    status: finalPath === "BelumTereproduksi" ? "Belum tereproduksi" : inc.needsEscalation ? "Perlu eskalasi" : "Mitigasi ditemukan",
    restricted: !inc.data.elkDataAvailable,
    createdAt: inc.closedAt ?? inc.createdAt,
    metrics: { cpuPct: peak?.cpuPct, memPct: peak?.memPct, p95Ms: peak?.p95Ms, mttrMin: mttrMinutes(inc) },
  };
}

export const INCIDENT_TYPE_LABEL: Record<Incident["data"]["type"], string> = {
  traffic_spike: "Traffic spike",
  memory_leak: "Memory leak",
  batch_overlap: "Batch job overlap",
  lainnya: "Lainnya",
};
