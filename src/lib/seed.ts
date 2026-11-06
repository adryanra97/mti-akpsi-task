import type { AlignmentParams, AlignmentSession, AuditEntry, Incident, SignoffDoc } from "./types";
import { DEFAULT_SETTINGS } from "./settings-defaults";
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

  const pg = "Payment Gateway API";
  const ca = "Core Account Service";
  const ns = "Notification Service";
  const fs = "Fraud Scoring Service";

  const plans: Plan[] = [
    // R3.7 Core Account Service: lima cycle, cycle 5 dipromosikan dan sign-off disetujui
    { service: ca, release: "R3.7", rc: "3.7.0-rc1", cycleNo: 1, daysAgo: 96, p: params(ca, { normalTps: 6, peakTps: 38, serviceVersion: "3.7.0-rc1", configChanges: "Upgrade driver JDBC; batas koneksi db-core-01.internal dinaikkan", dev: { testedTps: 35, p95Ms: 1350, cpuPct: 84, memPct: 71 } }), decision: "kembali_dev", notes: "Query saldo tanpa indeks memicu p95 tinggi.", followUps: ["Tambahkan indeks pada tabel mutasi", "Ulang performance test di Dev"] },
    { service: ca, release: "R3.7", rc: "3.7.0-rc2", cycleNo: 2, daysAgo: 82, p: params(ca, { normalTps: 6, peakTps: 38, serviceVersion: "3.7.0-rc2", configChanges: "Indeks mutasi ditambahkan", dev: { testedTps: 35, p95Ms: 1250, cpuPct: 74, memPct: 66 } }), decision: "kembali_dev", notes: "p95 turun, tetapi masih di atas batas pada beban puncak.", followUps: ["Aktifkan cache saldo 30 detik"] },
    { service: ca, release: "R3.7", rc: "3.7.0-rc3", cycleNo: 3, daysAgo: 68, p: params(ca, { normalTps: 6, peakTps: 38, serviceVersion: "3.7.0-rc3", configChanges: "Cache saldo aktif", prodSpec: { ...serviceModel(ca)!.defaultSpec, ramGb: 6 }, dev: { testedTps: 35, p95Ms: 610, cpuPct: 63, memPct: 62 } }), decision: "kembali_dev", notes: "Headroom memori tipis karena cache saldo; RAM Production perlu dinaikkan.", followUps: ["Konfirmasi alokasi RAM Production ke tim infrastruktur"] },
    { service: ca, release: "R3.7", rc: "3.7.0-rc4", cycleNo: 4, daysAgo: 54, p: params(ca, { normalTps: 6, peakTps: 38, serviceVersion: "3.7.0-rc4", dev: { testedTps: 35, p95Ms: 520, cpuPct: 58, memPct: 60 } }), decision: "kembali_dev", notes: "Menunggu hasil UAT modul transfer.", followUps: ["Selesaikan UAT modul transfer"] },
    { service: ca, release: "R3.7", rc: "3.7.0", cycleNo: 5, daysAgo: 40, p: params(ca, { normalTps: 6, peakTps: 38, serviceVersion: "3.7.0", prodSpec: { ...serviceModel(ca)!.defaultSpec, threadPool: 200 }, dev: { testedTps: 35, p95Ms: 470, cpuPct: 52, memPct: 58 } }), decision: "promosi", notes: "Semua indikator dalam kriteria. Disepakati lanjut ke Production.", followUps: ["Pantau p95 transfer 7 hari pertama"] },

    // R3.8 Payment Gateway API: cycle 4 menunggu sign-off
    { service: pg, release: "R3.8", rc: "3.8.0-rc1", cycleNo: 1, daysAgo: 42, p: params(pg, { normalTps: 9, peakTps: 52, serviceVersion: "3.8.0-rc1", configChanges: "Integrasi QRIS baru ke https://qris.partner.co.id/api", dev: { testedTps: 40, p95Ms: 1200, cpuPct: 88, memPct: 70, payloadKb: 9 } }), decision: "kembali_dev", notes: "Signature verification memakan CPU berlebih.", followUps: ["Cache public key partner", "Profiling ulang endpoint /pay"] },
    { service: pg, release: "R3.8", rc: "3.8.0-rc2", cycleNo: 2, daysAgo: 28, p: params(pg, { normalTps: 9, peakTps: 52, serviceVersion: "3.8.0-rc2", configChanges: "Cache public key partner", dev: { testedTps: 40, p95Ms: 760, cpuPct: 74, memPct: 64, payloadKb: 9 } }), decision: "kembali_dev", notes: "Verdict lolos, tetapi promosi ditunda sampai perbaikan connection pool selesai diuji di UAT.", followUps: ["Naikkan connection pool ke 80"] },
    { service: pg, release: "R3.8", rc: "3.8.0-rc3", cycleNo: 3, daysAgo: 14, p: params(pg, { normalTps: 9, peakTps: 52, whatIf: [2], serviceVersion: "3.8.0-rc3", configChanges: "Connection pool 80", prodSpec: { ...serviceModel(pg)!.defaultSpec, connPool: 80 }, dev: { testedTps: 40, p95Ms: 520, cpuPct: 60, memPct: 60, payloadKb: 9 } }), decision: "kembali_dev", notes: "What-if 2× masih berbasis estimasi; tambah node untuk periode promo akhir tahun.", followUps: ["Tambah 1 node untuk periode promo"] },
    { service: pg, release: "R3.8", rc: "3.8.0", cycleNo: 4, daysAgo: 1, p: params(pg, { normalTps: 9, peakTps: 52, whatIf: [2], serviceVersion: "3.8.0", configChanges: "Connection pool 80; 4 node", prodSpec: { ...serviceModel(pg)!.defaultSpec, connPool: 80, nodes: 4 }, dev: { testedTps: 40, p95Ms: 500, cpuPct: 58, memPct: 59, payloadKb: 9 } }), decision: "promosi", notes: "Verdict disepakati. Lanjut promosi ke Production pada jadwal deployment Senin.", followUps: ["Siapkan runbook rollback", "Pantau CPU saat promo 11.11"] },

    // R2.4 Notification Service: cycle 2 menunggu parameter dari QA
    { service: ns, release: "R2.4", rc: "2.4.0-rc1", cycleNo: 1, daysAgo: 12, p: params(ns, { normalTps: 10, peakTps: 55, serviceVersion: "2.4.0-rc1", configChanges: "Template push notification baru", dev: { testedTps: 45, p95Ms: 380, cpuPct: 70, memPct: 64, payloadKb: 4 } }), decision: "kembali_dev", notes: "Error rate naik saat burst; retry ke provider SMS perlu backoff.", followUps: ["Tambahkan exponential backoff"] },
    { service: ns, release: "R2.4", rc: "2.4.0-rc2", cycleNo: 2, daysAgo: -1, status: "menunggu_parameter" },

    // R1.0 Fraud Scoring Service: parameter sudah diisi, siap dianalisis (belum ada model twin)
    { service: fs, release: "R1.0", rc: "1.0.0-rc1", cycleNo: 1, daysAgo: 0, status: "siap_dianalisis", p: params(fs, { normalTps: 5, peakTps: 33, serviceVersion: "1.0.0-rc1", configChanges: "Model scoring v1 di scoring-01.internal", dev: { testedTps: 30, p95Ms: 450, cpuPct: 66, memPct: 61 } }) },
  ];

  const sessions: AlignmentSession[] = [];
  let n = 1;
  for (const pl of plans) {
    const when = at(pl.daysAgo);
    const id = `aln-${pl.service.split(" ")[0].toLowerCase()}-${pl.release.toLowerCase()}-c${pl.cycleNo}`;
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
    const approved = s.release === "R3.7";
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
      description: "Timeout pada endpoint /pay pukul 12.05–12.40 setelah rollout 3.7.2. Alert dari monitor api-gw-02.internal.",
      service: pg,
      release: "R3.7",
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
      release: "R3.7",
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
      title: "Memori naik terus setelah rollout 2.3.5",
      description: "Pod notification di cluster prod-jkt restart OOM tiap ±10 jam sejak rollout.",
      service: ns,
      release: "R2.3",
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
    { id: "aud-1", createdAt: at(30, 14).toISOString(), user: "Tim Support dan Monitoring", role: "SUP", action: "Unduh laporan (CSV)", target: "Riwayat R3.7" },
    { id: "aud-2", createdAt: at(39, 9).toISOString(), user: "Project/Technical Manager", role: "PM", action: "Menyetujui sign-off", target: "SO-001" },
  ];
  for (const a of audits) await insert("sa_audit", a.id, a, a.createdAt);

  await insert("sa_settings", "app", { id: "app", createdAt: "2026-01-01T00:00:00.000Z", ...settings, piiScrubbed: true }, "2026-01-01T00:00:00.000Z");
}
