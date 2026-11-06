/**
 * Penyamaran teks bebas sebelum data keluar dari sistem sebagai berkas unduhan.
 *
 * Aturannya sama dengan Core Module (`api/_core/masking.py`): email, URL, alamat IP,
 * hostname, nomor panjang (rekening/ID), dan kredensial.
 */
/** Pasangan (pola regex, token pengganti) yang diterapkan berurutan, sama dengan `ATURAN` di Core Module. */
const RULES: [RegExp, string][] = [
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[EMAIL]"],
  [/https?:\/\/[^\s)]+/g, "[URL]"],
  [/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/g, "[IP]"],
  [/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:internal|local|lan|corp|co\.id|id|com|net)\b/gi, "[HOST]"],
  [/\b\d{8,}\b/g, "[NOMOR]"],
  [/\b(?:password|passwd|secret|token|apikey|api_key)\s*[:=]\s*\S+/gi, "[KREDENSIAL]"],
];

/**
 * Menyamarkan data sensitif pada teks bebas.
 *
 * Parameters
 * ----------
 * s : string | null | undefined
 *     Teks masukan; null/undefined diperlakukan sebagai string kosong.
 *
 * Returns
 * -------
 * string
 *     Teks dengan data sensitif diganti token seperti "[EMAIL]" atau "[IP]".
 */
export function maskText(s: string | null | undefined): string {
  let out = s ?? "";
  for (const [re, token] of RULES) out = out.replace(re, token);
  return out;
}
