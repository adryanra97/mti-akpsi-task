import registry from "../../api/_core/registry.json";
import type { DigitalTwinModel, Spec } from "./types";

/** Registri layanan dan ModelDigitalTwin, dibaca dari berkas yang sama dengan Core Module Python. */
export interface ServiceEntry {
  nama: string;
  model: DigitalTwinModel;
  baseline: { avgTps: number; peakTps: number; cpuPct: number; memPct: number; p95Ms: number; errorRatePct: number };
  spesifikasi: Spec;
}

export const SERVICES: ServiceEntry[] = registry.layanan as ServiceEntry[];

export function serviceEntry(name: string) {
  return SERVICES.find((s) => s.nama === name);
}
