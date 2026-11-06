import type {
  AlignmentParams,
  AlignmentSession,
  Incident,
  ReportEntry,
  SignoffDoc,
} from "./types";
import { serviceModel } from "./core/twin";

export function defaultParams(service: string): AlignmentParams {
  const m = serviceModel(service);
  const spec = m?.defaultSpec ?? { vcpu: 8, ramGb: 16, nodes: 2, threadPool: 150, connPool: 40, bandwidthMbps: 1000 };
  return {
    normalTps: 8,
    peakTps: 45,
    whatIf: [],
    serviceVersion: "",
    configChanges: "",
    criteria: { maxP95Ms: 800, maxErrorRatePct: 1, maxCpuPct: 80, maxMemPct: 85 },
    devSpec: { vcpu: 4, ramGb: 8, nodes: 2, threadPool: 100, connPool: 30, bandwidthMbps: 1000 },
    devSummary: { testedTps: 40, p95Ms: 420, cpuPct: 62, memPct: 58, errorRatePct: 0.1, payloadKb: 6, notes: "" },
    prodSpec: { ...spec },
  };
}

export function limitationsFor(session: AlignmentSession): string[] {
  const run = session.runs.at(-1);
  const m = serviceModel(session.service);
  const out = [
    "Simulasi melengkapi, bukan menggantikan, hasil SIT/UAT dan performance test di environment Dev. Hasil SIT/UAT tetap menjadi acuan pengujian.",
    m?.calibratedAt
      ? `Model digital twin ${session.service} dikalibrasi pada ${new Date(m.calibratedAt).toLocaleDateString("id-ID", { dateStyle: "long" })}; akurasi menurun di atas 2,5× titik kalibrasi.`
      : `Belum ada model digital twin aktif untuk ${session.service}.`,
  ];
  if (run) {
    out.push(
      run.baseline.source === "elk"
        ? `Metrik baseline diambil dari ELK Stack pada ${new Date(run.baseline.takenAt).toLocaleDateString("id-ID", { dateStyle: "long" })}.`
        : `ELK Stack tidak dapat diakses saat analisis; baseline memakai data tersimpan ${new Date(run.baseline.takenAt).toLocaleDateString("id-ID", { dateStyle: "long" })}.`,
      `${run.masking.count} item data sensitif disamarkan sebelum dikirim ke Layanan LLM.`,
    );
  }
  return out;
}

export function reportFromSession(s: AlignmentSession): ReportEntry {
  const run = s.runs.at(-1)!;
  const peak = run.scenarios.find((x) => x.key === "puncak")?.indicators;
  return {
    id: s.reportId ?? `rpt-${s.id}`,
    kind: "alignment",
    refId: s.id,
    title: `Laporan alignment ${s.release} cycle ${s.cycleNo}`,
    service: s.service,
    release: s.release,
    cycleNo: s.cycleNo,
    verdict: run.verdict,
    status: s.decision === "promosi" ? "Lanjut promosi ke Production" : "Kembali ke Dev",
    restricted: false,
    createdAt: s.decidedAt ?? new Date().toISOString(),
    metrics: { cpuPct: peak?.cpuPct, memPct: peak?.memPct, p95Ms: peak?.p95Ms, maxTps: run.maxTps },
  };
}

export function reportFromSignoff(d: SignoffDoc): ReportEntry {
  const peak = d.snapshot.result.scenarios.find((x) => x.key === "puncak")?.indicators;
  return {
    id: d.reportId ?? `rpt-${d.id}`,
    kind: "signoff",
    refId: d.id,
    title: `Dokumen sign-off ${d.snapshot.release} cycle ${d.snapshot.cycleNo} v${d.version}`,
    service: d.snapshot.service,
    release: d.snapshot.release,
    cycleNo: d.snapshot.cycleNo,
    verdict: d.snapshot.result.verdict,
    status: d.status === "disetujui" ? "Disetujui" : d.status === "ditolak" ? "Ditolak" : "Menunggu",
    restricted: false,
    createdAt: d.decidedAt ?? d.createdAt,
    metrics: { cpuPct: peak?.cpuPct, memPct: peak?.memPct, p95Ms: peak?.p95Ms, maxTps: d.snapshot.result.maxTps },
  };
}

export function mttrMinutes(inc: Incident): number | undefined {
  if (!inc.rootCauseAt) return undefined;
  return Math.max(1, Math.round((new Date(inc.rootCauseAt).getTime() - new Date(inc.data.detectedAt).getTime()) / 60000));
}

export function reportFromIncident(inc: Incident): ReportEntry {
  const final = inc.mitigations.find((m) => m.id === inc.selectedMitigationId)?.result ?? inc.repro;
  return {
    id: inc.reportId ?? `rpt-${inc.id}`,
    kind: "insiden",
    refId: inc.id,
    title: `Laporan insiden ${inc.code}: ${inc.data.title}`,
    service: inc.data.service,
    release: inc.data.release,
    cycleNo: null,
    verdict: final?.verdict ?? null,
    status: inc.notReproduced ? "Belum tereproduksi" : inc.needsEscalation ? "Perlu eskalasi" : "Mitigasi terpilih",
    restricted: !inc.data.elkDataAvailable,
    createdAt: inc.closedAt ?? inc.createdAt,
    metrics: {
      cpuPct: inc.repro?.indicators?.cpuPct,
      memPct: inc.repro?.indicators?.memPct,
      p95Ms: inc.repro?.indicators?.p95Ms,
      mttrMin: mttrMinutes(inc),
    },
  };
}

export const INCIDENT_TYPE_LABEL: Record<Incident["data"]["type"], string> = {
  traffic_spike: "Traffic spike",
  memory_leak: "Memory leak",
  batch_overlap: "Batch job overlap",
  lainnya: "Lainnya",
};

export const SESSION_STATUS_LABEL: Record<AlignmentSession["status"], string> = {
  menunggu_parameter: "Menunggu parameter",
  siap_dianalisis: "Siap dianalisis",
  dianalisis: "Menunggu keputusan",
  diputuskan: "Diputuskan",
};
