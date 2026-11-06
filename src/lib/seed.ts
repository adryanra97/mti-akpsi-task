import type { AlignmentParams, AlignmentSession, AuditEntry, Incident, SignoffDoc } from "./types";
import { DEFAULT_SETTINGS } from "./settings-defaults";

const SEED_VERSION = 2; // samakan dengan SEED_VERSION di db.ts
import { assessIncident, runAlignment } from "./core/engine";
import { defaultParams, limitationsFor, reportFromIncident, reportFromSession, reportFromSignoff } from "./domain";
import { serviceModel } from "./core/twin";

type Insert = (table: string, id: string, data: unknown, createdAt: string) => Promise<void>;

const DAY = 86400000;

function at(daysAgo: number, hour = 10) {
  const d = new Date(Date.now() - daysAgo * DAY);
  d.setUTCHours(hour - 7, 0, 0, 0);
  return d;
}

function params(service: string, o: Partial<AlignmentParams> & { dev?: Partial<AlignmentParams["devSummary"]> }): AlignmentParams {
  const base = defaultParams(service);
  return {
    ...base,
    ...o,
    devSummary: { ...base.devSummary, ...(o.dev ?? {}) },
    prodSpec: { ...base.prodSpec, ...(o.prodSpec ?? {}) },
  };
}

interface Plan {
  service: string;
  release: string;
  rc: string;
  cycleNo: number;
  daysAgo: number;
  p?: AlignmentParams;
  decision?: "promosi" | "kembali_dev";
  notes?: string;
  followUps?: string[];
  status?: AlignmentSession["status"];
}

export async function seed(insert: Insert) {
  const settings = { ...DEFAULT_SETTINGS };
  const ctx = (now: Date, userName: string) => ({ settings, userName, now });

  const pg = "Layanan Pembayaran";
  const ca = "Layanan Rekening";
  const ns = "Layanan Notifikasi";
  const fs = "Layanan Deteksi Fraud";

  const plans: Plan[] = [
    // Rilis Mutasi (Layanan Rekening): lima cycle, cycle 5 dipromosikan dan sign-off disetujui
    { service: ca, release: "Rilis Mutasi", rc: "Kandidat 1 (v3.7)", cycleNo: 1, daysAgo: 96, p: params(ca, { normalTps: 6, peakTps: 38, serviceVersion: "Kandidat 1 (v3.7)", configChanges: "Upgrade driver JDBC; batas koneksi db-core-01.internal dinaikkan", dev: { testedTps: 35, p95Ms: 1350, cpuPct: 84, memPct: 71 } }), decision: "kembali_dev", notes: "Query saldo tanpa indeks memicu p95 tinggi.", followUps: ["Tambahkan indeks pada tabel mutasi", "Ulang performance test di Dev"] },
    { service: ca, release: "Rilis Mutasi", rc: "Kandidat 2 (v3.7)", cycleNo: 2, daysAgo: 82, p: params(ca, { normalTps: 6, peakTps: 38, serviceVersion: "Kandidat 2 (v3.7)", configChanges: "Indeks mutasi ditambahkan", dev: { testedTps: 35, p95Ms: 1250, cpuPct: 74, memPct: 66 } }), decision: "kembali_dev", notes: "p95 turun, tetapi masih di atas batas pada beban puncak.", followUps: ["Aktifkan cache saldo 30 detik"] },
    { service: ca, release: "Rilis Mutasi", rc: "Kandidat 3 (v3.7)", cycleNo: 3, daysAgo: 68, p: params(ca, { normalTps: 6, peakTps: 38, serviceVersion: "Kandidat 3 (v3.7)", configChanges: "Cache saldo aktif", prodSpec: { ...serviceModel(ca)!.defaultSpec, ramGb: 6 }, dev: { testedTps: 35, p95Ms: 610, cpuPct: 63, memPct: 62 } }), decision: "kembali_dev", notes: "Headroom memori tipis karena cache saldo; RAM Production perlu dinaikkan.", followUps: ["Konfirmasi alokasi RAM Production ke tim infrastruktur"] },
    { service: ca, release: "Rilis Mutasi", rc: "Kandidat 4 (v3.7)", cycleNo: 4, daysAgo: 54, p: params(ca, { normalTps: 6, peakTps: 38, serviceVersion: "Kandidat 4 (v3.7)", dev: { testedTps: 35, p95Ms: 520, cpuPct: 58, memPct: 60 } }), decision: "kembali_dev", notes: "Menunggu hasil UAT modul transfer.", followUps: ["Selesaikan UAT modul transfer"] },
    { service: ca, release: "Rilis Mutasi", rc: "Final (v3.7)", cycleNo: 5, daysAgo: 40, p: params(ca, { normalTps: 6, peakTps: 38, serviceVersion: "Final (v3.7)", prodSpec: { ...serviceModel(ca)!.defaultSpec, threadPool: 200 }, dev: { testedTps: 35, p95Ms: 470, cpuPct: 52, memPct: 58 } }), decision: "promosi", notes: "Semua indikator dalam kriteria. Disepakati lanjut ke Production.", followUps: ["Pantau p95 transfer 7 hari pertama"] },

    // Rilis QRIS (Layanan Pembayaran): cycle 4 menunggu sign-off
    { service: pg, release: "Rilis QRIS", rc: "Kandidat 1 (v3.8)", cycleNo: 1, daysAgo: 42, p: params(pg, { normalTps: 9, peakTps: 52, serviceVersion: "Kandidat 1 (v3.8)", configChanges: "Integrasi QRIS baru ke https://qris.partner.co.id/api", dev: { testedTps: 40, p95Ms: 1200, cpuPct: 88, memPct: 70, payloadKb: 9 } }), decision: "kembali_dev", notes: "Signature verification memakan CPU berlebih.", followUps: ["Cache public key partner", "Profiling ulang endpoint /pay"] },
    { service: pg, release: "Rilis QRIS", rc: "Kandidat 2 (v3.8)", cycleNo: 2, daysAgo: 28, p: params(pg, { normalTps: 9, peakTps: 52, serviceVersion: "Kandidat 2 (v3.8)", configChanges: "Cache public key partner", dev: { testedTps: 40, p95Ms: 760, cpuPct: 74, memPct: 64, payloadKb: 9 } }), decision: "kembali_dev", notes: "Verdict lolos, tetapi promosi ditunda sampai perbaikan connection pool selesai diuji di UAT.", followUps: ["Naikkan connection pool ke 80"] },
    { service: pg, release: "Rilis QRIS", rc: "Kandidat 3 (v3.8)", cycleNo: 3, daysAgo: 14, p: params(pg, { normalTps: 9, peakTps: 52, whatIf: [2], serviceVersion: "Kandidat 3 (v3.8)", configChanges: "Connection pool 80", prodSpec: { ...serviceModel(pg)!.defaultSpec, connPool: 80 }, dev: { testedTps: 40, p95Ms: 520, cpuPct: 60, memPct: 60, payloadKb: 9 } }), decision: "kembali_dev", notes: "What-if 2× masih berbasis estimasi; tambah node untuk periode promo akhir tahun.", followUps: ["Tambah 1 node untuk periode promo"] },
    { service: pg, release: "Rilis QRIS", rc: "Final (v3.8)", cycleNo: 4, daysAgo: 1, p: params(pg, { normalTps: 9, peakTps: 52, whatIf: [2], serviceVersion: "Final (v3.8)", configChanges: "Connection pool 80; 4 node", prodSpec: { ...serviceModel(pg)!.defaultSpec, connPool: 80, nodes: 4 }, dev: { testedTps: 40, p95Ms: 500, cpuPct: 58, memPct: 59, payloadKb: 9 } }), decision: "promosi", notes: "Verdict disepakati. Lanjut promosi ke Production pada jadwal deployment Senin.", followUps: ["Siapkan runbook rollback", "Pantau CPU saat promo 11.11"] },

    // Rilis Notifikasi: cycle 2 menunggu parameter dari QA
    { service: ns, release: "Rilis Notifikasi", rc: "Kandidat 1 (v2.4)", cycleNo: 1, daysAgo: 12, p: params(ns, { normalTps: 10, peakTps: 55, serviceVersion: "Kandidat 1 (v2.4)", configChanges: "Template push notification baru", dev: { testedTps: 45, p95Ms: 380, cpuPct: 70, memPct: 64, payloadKb: 4 } }), decision: "kembali_dev", notes: "Error rate naik saat burst; retry ke provider SMS perlu backoff.", followUps: ["Tambahkan exponential backoff"] },
    { service: ns, release: "Rilis Notifikasi", rc: "Kandidat 2 (v2.4)", cycleNo: 2, daysAgo: -1, status: "menunggu_parameter" },

    // Rilis Deteksi Fraud: parameter sudah diisi, siap dianalisis (belum ada model twin)
    { service: fs, release: "Rilis Deteksi Fraud", rc: "Kandidat 1 (v1.0)", cycleNo: 1, daysAgo: 0, status: "siap_dianalisis", p: params(fs, { normalTps: 5, peakTps: 33, serviceVersion: "Kandidat 1 (v1.0)", configChanges: "Model scoring v1 di scoring-01.internal", dev: { testedTps: 30, p95Ms: 450, cpuPct: 66, memPct: 61 } }) },
  ];

  const sessions: AlignmentSession[] = [];
  let n = 1;
  for (const pl of plans) {
    const when = at(pl.daysAgo);
    const slug = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const id = `aln-${slug(pl.release)}-c${pl.cycleNo}`;
    const s: AlignmentSession = {
      id,
      code: `ALN-${String(n++).padStart(3, "0")}`,
      service: pl.service,
      release: pl.release,
      releaseCandidate: pl.rc,
      cycleNo: pl.cycleNo,
      envSource: "Dev",
      envTarget: "Production",
      scheduledAt: when.toISOString(),
      createdAt: new Date(when.getTime() - 3 * DAY).toISOString(),
      status: pl.status ?? "diputuskan",
      params: pl.p ?? null,
      paramsBy: pl.p ? "QA/Performance Tester" : undefined,
      runs: [],
    };
    if (pl.decision && pl.p) {
      const { result } = await runAlignment(s, pl.p, ctx(when, "QA/Performance Tester"));
      s.runs.push(result);
      s.decision = pl.decision;
      s.decisionNotes = pl.notes;
      s.followUps = pl.followUps;
      s.decidedBy = "Technical Lead";
      s.decidedAt = new Date(when.getTime() + 90 * 60000).toISOString();
      s.reportId = `rpt-${s.id}`;
      await insert("sa_reports", s.reportId, reportFromSession(s), s.decidedAt);
    }
    sessions.push(s);
  }

  // Dokumen sign-off
  const signoffs: SignoffDoc[] = [];
  let so = 1;
  for (const s of sessions.filter((x) => x.decision === "promosi")) {
    const approved = s.release === "Rilis Mutasi";
    const created = new Date(new Date(s.decidedAt!).getTime() + 10 * 60000);
    const d: SignoffDoc = {
      id: `so-${s.id}`,
      code: `SO-${String(so++).padStart(3, "0")}`,
      sessionId: s.id,
      version: 1,
      status: approved ? "disetujui" : "menunggu",
      createdAt: created.toISOString(),
      requestedBy: "Technical Lead",
      snapshot: {
        service: s.service,
        release: s.release,
        releaseCandidate: s.releaseCandidate,
        cycleNo: s.cycleNo,
        envSource: s.envSource,
        envTarget: s.envTarget,
        params: s.params!,
        result: s.runs.at(-1)!,
        decisionNotes: s.decisionNotes ?? "",
        followUps: s.followUps ?? [],
        limitations: limitationsFor(s),
      },
    };
    if (approved) {
      d.pmNotes = "Disetujui. Lampirkan pada CAB minggu ini bersama hasil UAT.";
      d.decidedBy = "Project/Technical Manager";
      d.decidedAt = new Date(created.getTime() + DAY).toISOString();
      d.lockedAt = d.decidedAt;
      d.reportId = `rpt-${d.id}`;
      await insert("sa_reports", d.reportId, reportFromSignoff(d), d.decidedAt);
    }
    s.signoffId = d.id;
    signoffs.push(d);
  }

  for (const s of sessions) await insert("sa_sessions", s.id, s, s.createdAt);
  for (const d of signoffs) await insert("sa_signoffs", d.id, d, d.createdAt);

  // Insiden
  const inc1: Incident = {
    id: "inc-001",
    code: "INC-001",
    createdAt: at(33, 9).toISOString(),
    createdBy: "Integration Engineer",
    status: "selesai",
    needsEscalation: false,
    notReproduced: false,
    mitigations: [],
    repro: null,
    data: {
      type: "traffic_spike",
      title: "Lonjakan trafik saat payday",
      description: "Timeout pada endpoint /pay pukul 12.05–12.40 setelah pembaruan Agustus. Alert dari monitor api-gw-02.internal.",
      service: pg,
      release: "Rilis Pembayaran Agustus",
      peakRps: 96,
      avgRps: 7,
      durationMin: 35,
      detectedAt: at(33, 12).toISOString(),
      payloadKb: 9,
      memGrowthMbPerHour: 0,
      batchCpuPct: 0,
      spec: { ...serviceModel(pg)!.defaultSpec },
      manualSymptoms: "",
      elkDataAvailable: true,
    },
  };
  const inc2: Incident = {
    id: "inc-002",
    code: "INC-002",
    createdAt: at(19, 9).toISOString(),
    createdBy: "Integration Engineer",
    status: "selesai",
    needsEscalation: false,
    notReproduced: true,
    mitigations: [],
    repro: null,
    data: {
      type: "batch_overlap",
      title: "Latensi naik saat rekonsiliasi malam",
      description: "p95 naik sesaat ketika batch rekonsiliasi berjalan bersamaan dengan trafik malam.",
      service: ca,
      release: "Rilis Mutasi",
      peakRps: 14,
      avgRps: 4,
      durationMin: 20,
      detectedAt: at(19, 1).toISOString(),
      payloadKb: 6,
      memGrowthMbPerHour: 0,
      batchCpuPct: 15,
      spec: { ...serviceModel(ca)!.defaultSpec, threadPool: 200 },
      manualSymptoms: "Data ELK periode insiden tertutup perjanjian kerahasiaan; gejala: p95 naik ke ±900 ms selama 20 menit.",
      elkDataAvailable: false,
    },
  };
  const inc3: Incident = {
    id: "inc-003",
    code: "INC-003",
    createdAt: at(0, 8).toISOString(),
    createdBy: "Integration Engineer",
    status: "baru",
    needsEscalation: false,
    notReproduced: false,
    mitigations: [],
    repro: null,
    data: {
      type: "memory_leak",
      title: "Memori naik terus setelah pembaruan Oktober",
      description: "Pod notification di cluster prod-jkt restart OOM tiap ±10 jam sejak pembaruan Oktober.",
      service: ns,
      release: "Rilis Notifikasi Oktober",
      peakRps: 40,
      avgRps: 8,
      durationMin: 600,
      detectedAt: at(0, 6).toISOString(),
      payloadKb: 4,
      memGrowthMbPerHour: 520,
      batchCpuPct: 0,
      spec: { ...serviceModel(ns)!.defaultSpec },
      manualSymptoms: "",
      elkDataAvailable: true,
    },
  };

  // INC-001: reproduksi lalu dua opsi mitigasi
  {
    const t = new Date(inc1.data.detectedAt);
    inc1.repro = (await assessIncident(inc1, "reproduksi", undefined, ctx(new Date(t.getTime() + 25 * 60000), "Integration Engineer"))).result;
    const opts = [
      { id: "mit-1", label: "Naikkan thread pool ke 300", changes: { threadPool: 300 } },
      { id: "mit-2", label: "Tambah 2 node dan connection pool 90", changes: { nodes: 5, connPool: 90 } },
    ];
    for (const [i, o] of opts.entries()) {
      const r = await assessIncident(inc1, "mitigasi", o.changes, ctx(new Date(t.getTime() + (40 + i * 15) * 60000), "Integration Engineer"));
      inc1.mitigations.push({ ...o, result: r.result, createdAt: r.result.createdAt });
    }
    const pass = inc1.mitigations.find((m) => m.result?.verdict === "LOLOS" || m.result?.verdict === "LOLOS_BERSYARAT");
    inc1.selectedMitigationId = pass?.id ?? inc1.mitigations.at(-1)!.id;
    inc1.needsEscalation = !pass;
    inc1.rootCauseAt = new Date(t.getTime() + 47 * 60000).toISOString();
    inc1.closedAt = new Date(t.getTime() + 80 * 60000).toISOString();
    inc1.reportId = "rpt-inc-001";
  }
  {
    const t = new Date(inc2.data.detectedAt);
    inc2.repro = (await assessIncident(inc2, "reproduksi", undefined, ctx(new Date(t.getTime() + 40 * 60000), "Integration Engineer"))).result;
    inc2.notReproduced = inc2.repro.reproduced !== true;
    inc2.rootCauseAt = new Date(t.getTime() + 55 * 60000).toISOString();
    inc2.closedAt = new Date(t.getTime() + 70 * 60000).toISOString();
    inc2.reportId = "rpt-inc-002";
  }
  for (const inc of [inc1, inc2, inc3]) {
    await insert("sa_incidents", inc.id, inc, inc.createdAt);
    if (inc.reportId) await insert("sa_reports", inc.reportId, reportFromIncident(inc), inc.closedAt!);
  }

  const audits: AuditEntry[] = [
    { id: "aud-1", createdAt: at(30, 14).toISOString(), user: "Tim Support dan Monitoring", role: "SUP", action: "Unduh laporan (CSV)", target: "Riwayat Rilis Mutasi" },
    { id: "aud-2", createdAt: at(39, 9).toISOString(), user: "Project/Technical Manager", role: "PM", action: "Menyetujui sign-off", target: "SO-001" },
  ];
  for (const a of audits) await insert("sa_audit", a.id, a, a.createdAt);

  await insert("sa_settings", "app", { id: "app", createdAt: "2026-01-01T00:00:00.000Z", ...settings, seedVersion: SEED_VERSION }, "2026-01-01T00:00:00.000Z");
}
