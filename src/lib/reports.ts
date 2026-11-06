/**
 * Filter daftar laporan dan konversinya dari dan ke query string URL.
 */
import type { ReportEntry, ReportKind } from "./types";

export interface ReportFilter {
  kind?: ReportKind | "";
  service?: string;
  release?: string;
  from?: string;
  to?: string;
}

export const KIND_LABEL: Record<ReportKind, string> = {
  alignment: "Laporan alignment",
  signoff: "Dokumen sign-off",
  insiden: "Laporan insiden",
};

/**
 * Menyaring daftar laporan.
 *
 * Parameters
 * ----------
 * list : ReportEntry[]
 *     Seluruh laporan.
 * f : ReportFilter
 *     Filter jenis, layanan, rilis, dan rentang tanggal (YYYY-MM-DD, inklusif).
 *
 * Returns
 * -------
 * ReportEntry[]
 *     Laporan yang cocok.
 */
export function applyFilter(list: ReportEntry[], f: ReportFilter) {
  return list.filter((r) => {
    if (f.kind && r.kind !== f.kind) return false;
    if (f.service && r.service !== f.service) return false;
    if (f.release && r.release !== f.release) return false;
    const day = r.createdAt.slice(0, 10);
    if (f.from && day < f.from) return false;
    if (f.to && day > f.to) return false;
    return true;
  });
}

/**
 * Membaca filter laporan dari parameter URL.
 *
 * Parameters
 * ----------
 * sp : Record<string, string | undefined>
 *     Parameter pencarian: jenis, layanan, rilis, dari, sampai.
 *
 * Returns
 * -------
 * ReportFilter
 *     Filter yang sudah divalidasi; jenis tidak dikenal diabaikan.
 */
export function filterFromParams(sp: Record<string, string | undefined>): ReportFilter {
  const kind = sp.jenis as ReportKind | undefined;
  return {
    kind: kind && kind in KIND_LABEL ? kind : "",
    service: sp.layanan || "",
    release: sp.rilis || "",
    from: sp.dari || "",
    to: sp.sampai || "",
  };
}

/**
 * Mengubah filter laporan menjadi query string.
 *
 * Parameters
 * ----------
 * f : ReportFilter
 *     Filter laporan.
 *
 * Returns
 * -------
 * string
 *     Query string tanpa tanda tanya, hanya berisi filter yang terisi.
 */
export function filterToQuery(f: ReportFilter) {
  const q = new URLSearchParams();
  if (f.kind) q.set("jenis", f.kind);
  if (f.service) q.set("layanan", f.service);
  if (f.release) q.set("rilis", f.release);
  if (f.from) q.set("dari", f.from);
  if (f.to) q.set("sampai", f.to);
  return q.toString();
}
