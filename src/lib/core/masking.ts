/** Penyamaran data sensitif sebelum konteks dikirim ke Layanan LLM eksternal (NDA dan UU PDP). */
const RULES: { kind: string; re: RegExp; token: string }[] = [
  { kind: "email", re: /[\w.+-]+@[\w-]+\.[\w.-]+/g, token: "[EMAIL]" },
  { kind: "url", re: /https?:\/\/[^\s)]+/g, token: "[URL]" },
  { kind: "alamat IP", re: /\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/g, token: "[IP]" },
  {
    kind: "hostname",
    re: /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:internal|local|lan|corp|co\.id|id|com|net)\b/gi,
    token: "[HOST]",
  },
  { kind: "nomor rekening/ID", re: /\b\d{8,}\b/g, token: "[NOMOR]" },
  { kind: "kredensial", re: /\b(?:password|passwd|secret|token|apikey|api_key)\s*[:=]\s*\S+/gi, token: "[KREDENSIAL]" },
];

export interface MaskReport {
  count: number;
  kinds: string[];
}

export function maskText(input: string, report: MaskReport): string {
  let out = input ?? "";
  for (const r of RULES) {
    out = out.replace(r.re, () => {
      report.count++;
      if (!report.kinds.includes(r.kind)) report.kinds.push(r.kind);
      return r.token;
    });
  }
  return out;
}

export function aliasService(name: string, report: MaskReport) {
  report.count++;
  if (!report.kinds.includes("nama layanan")) report.kinds.push("nama layanan");
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `LAYANAN-${String.fromCharCode(65 + (h % 26))}${(h % 90) + 10}`;
}
