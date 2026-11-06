import "server-only";
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import type { AlignmentSession, Incident, ReportEntry, SignoffDoc, AnalysisResult } from "./types";
import { VERDICT_LABEL } from "./verdict";
import { RESOURCE_LABEL } from "./core/twin";
import { INCIDENT_TYPE_LABEL, mttrMinutes } from "./domain";
import { maskText } from "./core/masking";
import { KIND_LABEL } from "./reports";

/** Font standar PDF hanya mendukung Latin-1; ganti simbol yang tidak tersedia. */
function t(s: string | number | null | undefined) {
  return String(s ?? "-")
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/×/g, "x")
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/[^\x00-\xFF]/g, "");
}

/** Penyamaran teks bebas sebelum keluar dari sistem dalam bentuk berkas. */
function m(s: string | undefined) {
  return t(maskText(s ?? "", { count: 0, kinds: [] }));
}

const fd = (iso?: string) =>
  iso ? new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }) + " WIB" : "-";

class Doc {
  pdf = new jsPDF({ unit: "pt", format: "a4" });
  y = 56;
  readonly x = 48;
  readonly w = 595 - 96;

  header(title: string, sub: string, restricted: boolean) {
    const p = this.pdf;
    p.setFillColor(45, 79, 216);
    p.rect(0, 0, 595, 6, "F");
    p.setFont("helvetica", "bold").setFontSize(10).setTextColor(45, 79, 216).text("ServerAgent", this.x, 36);
    if (restricted) {
      p.setFillColor(255, 240, 217);
      p.roundedRect(595 - 48 - 170, 24, 170, 18, 3, 3, "F");
      p.setTextColor(154, 88, 0).setFontSize(8.5).text("TERBATAS NDA - DATA AGREGAT TERSAMARKAN", 595 - 48 - 163, 36);
    }
    p.setTextColor(23, 32, 51).setFontSize(17).text(t(title), this.x, (this.y = 70));
    p.setFont("helvetica", "normal").setFontSize(9.5).setTextColor(102, 113, 138);
    const lines = p.splitTextToSize(t(sub), this.w);
    p.text(lines, this.x, (this.y += 16));
    this.y += lines.length * 12 + 8;
  }

  h(text: string) {
    this.ensure(40);
    this.y += 10;
    this.pdf.setFont("helvetica", "bold").setFontSize(11.5).setTextColor(23, 32, 51).text(t(text), this.x, this.y);
    this.y += 14;
  }

  p(text: string, color: [number, number, number] = [71, 83, 106]) {
    const lines = this.pdf.setFont("helvetica", "normal").setFontSize(9.5).setTextColor(...color).splitTextToSize(t(text), this.w);
    for (const line of lines) {
      this.ensure(14);
      this.pdf.text(line, this.x, this.y);
      this.y += 12.5;
    }
    this.y += 3;
  }

  kv(rows: [string, string][]) {
    autoTable(this.pdf, {
      startY: this.y,
      margin: { left: this.x, right: this.x },
      body: rows.map(([k, v]) => [t(k), t(v)]),
      theme: "plain",
      styles: { fontSize: 9.5, cellPadding: { top: 3, bottom: 3, left: 0, right: 8 }, textColor: [23, 32, 51] },
      columnStyles: { 0: { cellWidth: 150, textColor: [102, 113, 138] } },
    });
    this.y = (this.pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  }

  table(head: string[], body: (string | number)[][]) {
    autoTable(this.pdf, {
      startY: this.y,
      margin: { left: this.x, right: this.x },
      head: [head.map(t)],
      body: body.map((r) => r.map((c) => t(c))),
      theme: "grid",
      headStyles: { fillColor: [236, 239, 245], textColor: [23, 32, 51], fontStyle: "bold", fontSize: 9 },
      styles: { fontSize: 9, cellPadding: 4, lineColor: [221, 226, 234], lineWidth: 0.5 },
    });
    this.y = (this.pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  ensure(h: number) {
    if (this.y + h > 800) {
      this.pdf.addPage();
      this.y = 56;
    }
  }

  footer(note: string) {
    const n = this.pdf.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      this.pdf.setPage(i);
      this.pdf.setFont("helvetica", "normal").setFontSize(8).setTextColor(102, 113, 138);
      this.pdf.text(t(note), this.x, 822);
      this.pdf.text(`Halaman ${i} dari ${n}`, 595 - this.x, 822, { align: "right" });
    }
  }

  out() {
    return this.pdf.output("arraybuffer");
  }
}

function indicatorRows(r: AnalysisResult) {
  return r.scenarios.map((s) => [
    s.label,
    s.indicators ? `${s.indicators.cpuPct}%` : "-",
    s.indicators ? `${s.indicators.memPct}%` : "-",
    s.indicators ? `${s.indicators.threadSatPct}%` : "-",
    s.indicators ? `${s.indicators.p95Ms} ms` : "-",
    s.indicators ? `${s.indicators.errorRatePct}%` : "-",
    VERDICT_LABEL[s.status],
  ]);
}

function analysisBlock(d: Doc, r: AnalysisResult, restricted: boolean) {
  d.h("Verdict");
  d.kv([
    ["Verdict", VERDICT_LABEL[r.verdict]],
    ["Kapasitas maksimum", r.maxTps !== null ? `${r.maxTps} TPS` : "Tidak dihitung"],
    ["Sumber daya pembatas", r.limiting ? RESOURCE_LABEL[r.limiting] : "-"],
    ["Mode analisis", r.mode === "demo" ? "Demo (digital twin bawaan)" : `${r.provider} ${r.model}`],
  ]);
  d.p(r.narrative);
  if (r.reasons.length) {
    d.h("Alasan");
    r.reasons.forEach((x) => d.p(`- ${x}`));
  }
  if (r.conditions.length || r.manualVerification.length) {
    d.h("Syarat dan angka yang perlu verifikasi manual");
    [...r.conditions, ...r.manualVerification].forEach((x) => d.p(`- ${x}`, [154, 88, 0]));
  }
  d.h("Indikator sumber daya");
  if (restricted) d.p("Data dibatasi perjanjian kerahasiaan; hanya ringkasan agregat yang disertakan.");
  else d.table(["Skenario", "CPU", "Memori", "Thread pool", "p95", "Error", "Status"], indicatorRows(r));
}

export function alignmentPdf(s: AlignmentSession, rep: ReportEntry) {
  const d = new Doc();
  const r = s.runs.at(-1)!;
  d.header(`Laporan alignment ${s.release} cycle ${s.cycleNo}`, `${s.service}, release candidate ${s.releaseCandidate}, ${s.envSource} ke ${s.envTarget}. Alignment ${fd(s.scheduledAt)}.`, rep.restricted);
  d.h("Parameter analisis");
  const p = s.params!;
  d.kv([
    ["Beban", `Normal ${p.normalTps} TPS, puncak ${p.peakTps} TPS${p.whatIf.length ? `, what-if ${p.whatIf.map((x) => `${x}x`).join(", ")}` : ""}`],
    ["Versi layanan", p.serviceVersion],
    ["Perubahan", m(p.configChanges) || "-"],
    ["Kriteria", `p95 <= ${p.criteria.maxP95Ms} ms, error <= ${p.criteria.maxErrorRatePct}%, CPU <= ${p.criteria.maxCpuPct}%, memori <= ${p.criteria.maxMemPct}%`],
    ["Uji Dev", `${p.devSummary.testedTps} TPS, p95 ${p.devSummary.p95Ms} ms, CPU ${p.devSummary.cpuPct}%`],
    ["Spesifikasi Production", `${p.prodSpec.vcpu} vCPU, ${p.prodSpec.ramGb} GB, ${p.prodSpec.nodes} node`],
  ]);
  analysisBlock(d, r, rep.restricted);
  d.h("Keputusan cycle");
  d.kv([
    ["Keputusan", s.decision === "promosi" ? "Lanjut promosi ke Production" : "Kembali ke Dev"],
    ["Dicatat oleh", `${s.decidedBy ?? "-"}, ${fd(s.decidedAt)}`],
    ["Ringkasan", m(s.decisionNotes)],
  ]);
  (s.followUps ?? []).forEach((f) => d.p(`- ${m(f)}`));
  d.footer(`${rep.id} - Diunduh dari ServerAgent. Simulasi melengkapi, bukan menggantikan, SIT/UAT.`);
  return d.out();
}

export function signoffPdf(doc: SignoffDoc, rep: ReportEntry) {
  const d = new Doc();
  const s = doc.snapshot;
  d.header(
    `Dokumen sign-off ${doc.code} (v${doc.version})`,
    `${s.service}, ${s.release} cycle ${s.cycleNo}, release candidate ${s.releaseCandidate}, ${s.envSource} ke ${s.envTarget}.`,
    rep.restricted,
  );
  d.kv([
    ["Status", doc.status === "disetujui" ? "DISETUJUI" : doc.status === "ditolak" ? "DITOLAK" : "MENUNGGU"],
    ["Keputusan oleh", `${doc.decidedBy ?? "-"}, ${fd(doc.decidedAt)}`],
    ["Catatan", m(doc.pmNotes) || "-"],
    ["Dikunci", fd(doc.lockedAt)],
  ]);
  analysisBlock(d, s.result, rep.restricted);
  d.h("Sumber setiap angka");
  s.result.scenarios.forEach((x) => d.p(`- ${x.label}: ${x.route === "digital_twin" ? "digital twin" : x.route === "estimasi_penalaran" ? "estimasi penalaran" : x.route === "fallback_twin" ? "digital twin (fallback)" : "dihentikan"}`));
  d.h("Catatan tindak lanjut");
  d.p(m(s.decisionNotes));
  s.followUps.forEach((f) => d.p(`- ${m(f)}`));
  d.h("Keterbatasan simulasi");
  s.limitations.forEach((l) => d.p(`- ${l}`));
  d.footer(`${doc.code} v${doc.version} - Lampiran release approval. Eksekusi deployment tetap melalui pipeline yang berlaku.`);
  return d.out();
}

export function incidentPdf(inc: Incident, rep: ReportEntry) {
  const d = new Doc();
  const data = inc.data;
  const chosen = inc.mitigations.find((x) => x.id === inc.selectedMitigationId);
  d.header(`Laporan insiden ${inc.code}`, `${m(data.title)}. ${data.service}, rilis ${data.release}, tipe ${INCIDENT_TYPE_LABEL[data.type]}.`, rep.restricted);
  d.h("Data insiden");
  d.kv([
    ["Deskripsi", rep.restricted ? "Disamarkan (terbatas NDA)" : m(data.description)],
    ["Beban", `Puncak ${data.peakRps} RPS, rata-rata ${data.avgRps} RPS, ${data.durationMin} menit`],
    ["Spesifikasi", `${data.spec.vcpu} vCPU, ${data.spec.ramGb} GB, ${data.spec.nodes} node`],
    ["Status reproduksi", inc.notReproduced ? "Belum tereproduksi, perlu kalibrasi ulang model" : "Tereproduksi pada spesifikasi saat ini"],
    ["Sumber daya pembatas", inc.repro?.limiting ? RESOURCE_LABEL[inc.repro.limiting] : "-"],
  ]);
  if (inc.repro?.rootCauses.length) {
    d.h("Kemungkinan akar masalah");
    inc.repro.rootCauses.forEach((c) => d.p(`- ${c}`));
  }
  d.h("Verdict sebelum dan sesudah mitigasi");
  d.table(
    ["Kondisi", "Verdict", "CPU", "Memori", "p95"],
    [
      ["Spesifikasi saat ini", inc.repro ? VERDICT_LABEL[inc.repro.verdict] : "-", rep.restricted ? "agregat" : `${inc.repro?.indicators?.cpuPct ?? "-"}%`, rep.restricted ? "agregat" : `${inc.repro?.indicators?.memPct ?? "-"}%`, rep.restricted ? "agregat" : `${inc.repro?.indicators?.p95Ms ?? "-"} ms`],
      ...inc.mitigations.map((x) => [
        `${x.label}${x.id === inc.selectedMitigationId ? " (terpilih)" : ""}`,
        x.result ? VERDICT_LABEL[x.result.verdict] : "-",
        `${x.result?.indicators?.cpuPct ?? "-"}%`,
        `${x.result?.indicators?.memPct ?? "-"}%`,
        `${x.result?.indicators?.p95Ms ?? "-"} ms`,
      ]),
    ],
  );
  d.kv([
    ["Mitigasi terpilih", chosen?.label ?? "-"],
    ["Perlu eskalasi", inc.needsEscalation ? "Ya, ke Technical Lead" : "Tidak"],
    ["Waktu deteksi", fd(data.detectedAt)],
    ["Akar masalah teridentifikasi", fd(inc.rootCauseAt)],
    ["MTTR (deteksi ke akar masalah)", mttrMinutes(inc) ? `${mttrMinutes(inc)} menit` : "-"],
  ]);
  d.footer(`${inc.code} - Diunduh dari ServerAgent.`);
  return d.out();
}

export function reportsCsv(rows: ReportEntry[]) {
  const head = ["id", "jenis", "judul", "layanan", "rilis", "cycle", "verdict", "status", "cpu_puncak_pct", "memori_puncak_pct", "p95_puncak_ms", "kapasitas_maks_tps", "mttr_menit", "terbatas_nda", "tanggal"];
  const esc = (v: unknown) => {
    const s = v === undefined || v === null ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((r) =>
    [
      r.id,
      KIND_LABEL[r.kind],
      r.title,
      r.service,
      r.release,
      r.cycleNo,
      r.verdict ? VERDICT_LABEL[r.verdict] : "",
      r.status,
      // Baris terbatas NDA hanya menyertakan data agregat tersamarkan.
      r.restricted ? "" : r.metrics.cpuPct,
      r.restricted ? "" : r.metrics.memPct,
      r.restricted ? "" : r.metrics.p95Ms,
      r.metrics.maxTps,
      r.metrics.mttrMin,
      r.restricted ? "ya" : "tidak",
      r.createdAt,
    ]
      .map(esc)
      .join(","),
  );
  return "﻿" + [head.join(","), ...lines].join("\n");
}
