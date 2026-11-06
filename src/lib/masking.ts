/** Aturan penyamaran yang sama dengan Core Module (api/_core/masking.py), dipakai sebelum data keluar sebagai berkas. */
const RULES: [RegExp, string][] = [
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[EMAIL]"],
  [/https?:\/\/[^\s)]+/g, "[URL]"],
  [/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/g, "[IP]"],
  [/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:internal|local|lan|corp|co\.id|id|com|net)\b/gi, "[HOST]"],
  [/\b\d{8,}\b/g, "[NOMOR]"],
  [/\b(?:password|passwd|secret|token|apikey|api_key)\s*[:=]\s*\S+/gi, "[KREDENSIAL]"],
];

export function maskText(s: string | null | undefined): string {
  let out = s ?? "";
  for (const [re, token] of RULES) out = out.replace(re, token);
  return out;
}
