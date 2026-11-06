import type { AppSettings, Baseline } from "../types";
import { hash01, serviceModel } from "./twin";

/**
 * Konektor ELK Stack (simulasi). Pada MVP ini metrik baseline dibangkitkan secara deterministik
 * dari profil layanan. Bila ELK tidak dapat diakses, dipakai baseline tersimpan terakhir (alur 5a / 3a).
 */
export function fetchBaseline(
  service: string,
  settings: AppSettings,
  now = new Date(),
): { baseline: Baseline; elkDown: boolean } {
  const m = serviceModel(service);
  const b = m?.baseline ?? { avgTps: 5, peakTps: 35, cpuPct: 28, memPct: 55, p95Ms: 240, errorRatePct: 0.1 };

  if (settings.simulateElkDown) {
    const cached = settings.cachedBaselines[service];
    const fallback: Baseline = cached ?? {
      source: "cache",
      takenAt: "2026-10-01T02:00:00.000Z",
      window: "7 hari",
      ...b,
    };
    return { baseline: { ...fallback, source: "cache" }, elkDown: true };
  }

  const j = hash01(service + now.toISOString().slice(0, 10)) - 0.5;
  const baseline: Baseline = {
    source: "elk",
    takenAt: now.toISOString(),
    window: "7 hari terakhir",
    avgTps: Math.round(b.avgTps * (1 + j * 0.1) * 10) / 10,
    peakTps: Math.round(b.peakTps * (1 + j * 0.08) * 10) / 10,
    cpuPct: Math.round(b.cpuPct * (1 + j * 0.1) * 10) / 10,
    memPct: Math.round(b.memPct * (1 + j * 0.05) * 10) / 10,
    p95Ms: Math.round(b.p95Ms * (1 + j * 0.1)),
    errorRatePct: Math.round(b.errorRatePct * (1 + j * 0.2) * 100) / 100,
  };
  return { baseline, elkDown: false };
}
