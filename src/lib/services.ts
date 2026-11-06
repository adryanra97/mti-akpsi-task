/**
 * Registri layanan dan ModelDigitalTwin untuk Dashboard.
 *
 * Dibaca dari `api/_core/registry.json`, berkas yang sama dengan Core Module Python, agar
 * spesifikasi dan rentang kalibrasi selalu sinkron.
 */
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

/**
 * Mencari entri layanan pada registri.
 *
 * Parameters
 * ----------
 * name : string
 *     Nama layanan.
 *
 * Returns
 * -------
 * ServiceEntry | undefined
 *     Entri layanan, atau undefined bila tidak terdaftar.
 */
export function serviceEntry(name: string) {
  return SERVICES.find((s) => s.nama === name);
}

/** Cakupan komponen bawaan untuk model yang baru diaktifkan lewat kalibrasi ulang. */
export const DEFAULT_COVERAGE = ["CPU", "memori", "jaringan", "thread pool", "connection pool", "database", "dependensi eksternal", "payload"];

/**
 * ModelDigitalTwin yang berlaku untuk sebuah layanan: nilai registri ditimpa hasil kalibrasi ulang.
 *
 * Parameters
 * ----------
 * name : string
 *     Nama layanan.
 * overrides : Record<string, Partial<DigitalTwinModel>> | undefined
 *     Hasil kalibrasi ulang dari pengaturan aplikasi.
 *
 * Returns
 * -------
 * DigitalTwinModel | null
 *     Model yang berlaku, atau null bila layanan tidak terdaftar.
 */
export function effectiveModel(name: string, overrides?: Record<string, Partial<DigitalTwinModel>>): DigitalTwinModel | null {
  const base = serviceEntry(name)?.model;
  if (!base) return null;
  return { ...base, ...(overrides?.[name] ?? {}) };
}

/**
 * Versi model berikutnya setelah kalibrasi ulang.
 *
 * Parameters
 * ----------
 * version : string
 *     Versi saat ini, misalnya "dt-notifikasi-1.2".
 * activating : boolean
 *     Model sebelumnya tidak aktif; versi dinaikkan ke rilis mayor berikutnya.
 *
 * Returns
 * -------
 * string
 *     Contoh "dt-notifikasi-1.3", atau "dt-fraud-1.0" saat model diaktifkan.
 */
export function nextModelVersion(version: string, activating: boolean): string {
  const m = version.match(/^(.*-)(\d+)\.(\d+)$/);
  if (!m) return `${version}-r1`;
  const [, prefix, major, minor] = m;
  return activating ? `${prefix}${Number(major) + 1}.0` : `${prefix}${major}.${Number(minor) + 1}`;
}
