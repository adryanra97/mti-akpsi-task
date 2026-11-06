/**
 * Pengisi data contoh dari `seed-data.json` yang dibangkitkan Core Module Python.
 *
 * Tanda waktu digeser relatif terhadap hari ini agar data contoh selalu tampak baru, lalu
 * riwayat status, dokumen sign-off, laporan, dan log audit dibentuk sesuai state machine.
 */
import type {
  AlignmentParams,
  AlignmentSession,
  AnalysisResult,
  AuditEntry,
  CycleDecision,
  Incident,
  IncidentData,
  SessionStatus,
  SignoffDoc,
  SignoffStatus,
} from "./types";
import { DEFAULT_SETTINGS } from "./settings-defaults";
import { limitationsFor, reportFromIncident, reportFromSession, reportFromSignoff, transition } from "./domain";
import data from "./seed-data.json";

/** Samakan dengan SEED_VERSION di db.ts. Data contoh dibangkitkan oleh scripts/buat_data_contoh.py (Core Module Python). */
const SEED_VERSION = 3;

type Insert = (table: string, id: string, data: unknown, createdAt: string) => Promise<void>;

interface SeedSession {
  kunci: string;
  service: string;
  release: string;
  rc: string;
  cycleNo: number;
  daysAgo: number;
  status?: SessionStatus;
  params?: AlignmentParams;
  decision?: CycleDecision;
  notes?: string;
  followUps?: string[];
  signoff?: SignoffStatus;
  hasil?: AnalysisResult;
}

interface SeedIncident {
  kunci: string;
  code: string;
  daysAgo: number;
  final: "MitigasiDitemukan" | "BelumTereproduksi" | null;
  data: IncidentData;
  repro?: AnalysisResult;
  mitigasi: { id: string; label: string; changes: Record<string, number>; result: AnalysisResult }[];
}

const DAY = 86400000;
const MIN = 60000;
const TL = "Technical Lead";
const QA = "QA/Performance Tester";
const IE = "Integration Engineer";
const PM = "Project/Technical Manager";

/**
 * Tanggal beberapa hari yang lalu pada jam WIB tertentu.
 *
 * Parameters
 * ----------
 * daysAgo : number
 *     Jumlah hari sebelum hari ini; negatif untuk hari mendatang.
 * hourWib : number, default 10
 *     Jam pada zona WIB.
 *
 * Returns
 * -------
 * Date
 */
function at(daysAgo: number, hourWib = 10) {
  const d = new Date(Date.now() - daysAgo * DAY);
  d.setUTCHours(hourWib - 7, 0, 0, 0);
  return d;
}

/**
 * Menambah menit ke sebuah tanggal.
 *
 * Parameters
 * ----------
 * d : Date
 *     Tanggal awal.
 * minutes : number
 *     Jumlah menit.
 *
 * Returns
 * -------
 * string
 *     Tanggal hasil dalam ISO 8601.
 */
const plus = (d: Date, minutes: number) => new Date(d.getTime() + minutes * MIN).toISOString();

/**
 * Menggeser seluruh tanda waktu hasil analisis ke waktu sesi.
 *
 * Parameters
 * ----------
 * r : AnalysisResult
 *     Hasil Core Module dari data contoh.
 * when : Date
 *     Waktu analisis yang baru.
 *
 * Returns
 * -------
 * AnalysisResult
 *     Salinan hasil dengan waktu diterima, selesai, rencana, verdict, jejak, dan periode baseline baru.
 */
function retime(r: AnalysisResult, when: Date): AnalysisResult {
  const iso = when.toISOString();
  const end = plus(when, 1);
  const day = iso.slice(0, 10);
  return {
    ...r,
    waktuDiterima: iso,
    waktuSelesai: end,
    rencana: { ...r.rencana, waktuDisusun: iso },
    verdict: { ...r.verdict, waktuDitetapkan: end },
    jejak: { ...r.jejak, waktuMulai: iso, waktuSelesai: end },
    metrikBaseline:
      r.metrikBaseline.sumber === "ELKLangsung"
        ? { ...r.metrikBaseline, tanggalPengambilan: day, periodeSelesai: iso, periodeMulai: new Date(when.getTime() - 7 * DAY).toISOString() }
        : r.metrikBaseline,
  };
}

/**
 * Mengisi seluruh tabel dengan data contoh.
 *
 * Parameters
 * ----------
 * insert : Insert
 *     Fungsi penyimpan baris (tabel, id, data, createdAt) dari lapisan database.
 *
 * Returns
 * -------
 * Promise<void>
 */
export async function seed(insert: Insert) {
  const settings = { ...DEFAULT_SETTINGS };
  const sessions: AlignmentSession[] = [];
  const signoffs: SignoffDoc[] = [];
  const slug = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  (data.sesi as unknown as SeedSession[]).forEach((pl, idx) => {
    const when = at(pl.daysAgo, 14);
    const created = new Date(when.getTime() - 5 * DAY);
    const s: AlignmentSession = {
      id: `aln-${slug(pl.release)}-c${pl.cycleNo}`,
      code: `ALN-${String(idx + 1).padStart(3, "0")}`,
      service: pl.service,
      release: pl.release,
      releaseCandidate: pl.rc,
      cycleNo: pl.cycleNo,
      envSource: "Dev",
      envTarget: "Production",
      scheduledAt: when.toISOString(),
      createdAt: created.toISOString(),
      status: "Terjadwal",
      history: [],
      params: pl.params ?? null,
      runs: [],
    };
    transition(s, "Terjadwal", TL, "Jadwal sesi dibuat", created.toISOString());
    if (pl.status === "Terjadwal") {
      sessions.push(s);
      return;
    }
    transition(s, "PengisianParameter", TL, "Akhir sprint cycle tiba", plus(when, -180));
    if (pl.params) {
      s.paramsBy = QA;
      s.paramVersion = 1;
    }
    if (pl.hasil && pl.decision) {
      const result = retime(pl.hasil, new Date(plus(when, -30)));
      transition(s, "MenungguHasil", QA, "Parameter lengkap; permintaan analisis diajukan", plus(when, -31));
      s.runs.push({ id: result.idPermintaan, createdAt: result.waktuSelesai, createdBy: QA, params: pl.params!, result });
      transition(s, "Peninjauan", "Core Module", "Hasil analisis diterima", result.waktuSelesai);
      s.decision = pl.decision;
      s.decisionNotes = pl.notes;
      s.followUps = pl.followUps;
      s.decidedBy = TL;
      s.decidedAt = plus(when, 90);
      transition(s, "Diputuskan", TL, pl.decision === "LanjutPromosi" ? "Lanjut promosi" : "Kembali ke Dev", s.decidedAt);
      transition(s, "Ditutup", TL, "Laporan alignment disimpan", s.decidedAt);
      s.reportId = `rpt-${s.id}`;
      if (pl.decision === "LanjutPromosi" && pl.signoff) {
        const createdSo = new Date(plus(when, 95));
        const d: SignoffDoc = {
          id: `so-${s.id}`,
          code: `SO-${String(signoffs.length + 1).padStart(3, "0")}`,
          sessionId: s.id,
          version: 1,
          status: "Draf",
          history: [],
          createdAt: createdSo.toISOString(),
          requestedBy: TL,
          snapshot: {
            service: s.service,
            release: s.release,
            releaseCandidate: s.releaseCandidate,
            cycleNo: s.cycleNo,
            envSource: s.envSource,
            envTarget: s.envTarget,
            params: pl.params!,
            result,
            decisionNotes: pl.notes ?? "",
            followUps: pl.followUps ?? [],
            limitations: limitationsFor(result),
          },
        };
        transition(d, "Draf", "Sistem", "Draf disusun dari laporan alignment", createdSo.toISOString());
        transition(d, "MenungguKeputusan", TL, "Permintaan sign-off dikirim", plus(createdSo, 1));
        if (pl.signoff === "Disetujui") {
          d.pmNotes = "Disetujui. Lampirkan pada release approval minggu ini bersama hasil UAT.";
          d.decidedBy = PM;
          d.decidedAt = plus(createdSo, 24 * 60);
          d.lockedAt = d.decidedAt;
          d.reportId = `rpt-${d.id}`;
          transition(d, "Disetujui", PM, "Dokumen dikunci", d.decidedAt);
        }
        s.signoffId = d.id;
        signoffs.push(d);
      }
    }
    sessions.push(s);
  });

  for (const s of sessions) {
    await insert("sa_sessions", s.id, s, s.createdAt);
    if (s.reportId) await insert("sa_reports", s.reportId, reportFromSession(s), s.decidedAt!);
  }
  for (const d of signoffs) {
    await insert("sa_signoffs", d.id, d, d.createdAt);
    if (d.reportId) await insert("sa_reports", d.reportId, reportFromSignoff(d), d.decidedAt!);
  }

  for (const pl of data.insiden as unknown as SeedIncident[]) {
    const detected = at(pl.daysAgo, pl.daysAgo === 0 ? 6 : 12);
    const opened = new Date(detected.getTime() + 15 * MIN);
    const inc: Incident = {
      id: pl.kunci,
      code: pl.code,
      createdAt: opened.toISOString(),
      createdBy: IE,
      status: "Dicatat",
      history: [],
      data: { ...pl.data, detectedAt: detected.toISOString() },
      repro: null,
      mitigations: [],
      needsEscalation: false,
    };
    transition(inc, "Dicatat", IE, "Kasus insiden dibuka", opened.toISOString());
    if (pl.repro) {
      transition(inc, "DalamReproduksi", IE, "Reproduksi diajukan", plus(opened, 5));
      inc.repro = retime(pl.repro, new Date(plus(opened, 6)));
      const reproduced = inc.repro.statusReproduksi === "Tereproduksi";
      transition(inc, reproduced ? "Tereproduksi" : "BelumTereproduksi", "Core Module", "Hasil reproduksi diterima", plus(opened, 25));
      if (reproduced) inc.rootCauseAt = plus(opened, 25);
      pl.mitigasi.forEach((m, i) => {
        const r = retime(m.result, new Date(plus(opened, 35 + i * 12)));
        if (i === 0) transition(inc, "UjiMitigasi", IE, `Opsi ditambahkan: ${m.label}`, plus(opened, 34));
        inc.mitigations.push({ id: m.id, label: m.label, changes: m.changes, result: r, createdAt: r.waktuSelesai });
        if (r.verdict.status === "Lolos" && inc.status === "UjiMitigasi") transition(inc, "MitigasiDitemukan", "Core Module", `Opsi lolos: ${m.label}`, r.waktuSelesai);
      });
      if (pl.final) {
        const pass = inc.mitigations.find((m) => m.result.verdict.status === "Lolos");
        if (pass) inc.selectedMitigationId = pass.id;
        inc.closedAt = plus(opened, 70);
        inc.reportId = `rpt-${inc.id}`;
        transition(inc, "Terdokumentasi", IE, "Laporan insiden disusun", inc.closedAt);
      }
    }
    await insert("sa_incidents", inc.id, inc, inc.createdAt);
    if (inc.reportId) await insert("sa_reports", inc.reportId, reportFromIncident(inc), inc.closedAt!);
  }

  const audits: AuditEntry[] = [
    { id: "aud-1", createdAt: at(30, 14).toISOString(), user: "Tim Support dan Monitoring", role: "SUP", action: "Unduh laporan (CSV)", target: "Riwayat Rilis Mutasi" },
    { id: "aud-2", createdAt: at(39, 9).toISOString(), user: PM, role: "PM", action: "Menyetujui sign-off", target: "SO-001" },
  ];
  for (const a of audits) await insert("sa_audit", a.id, a, a.createdAt);

  await insert("sa_settings", "app", { id: "app", createdAt: "2026-01-01T00:00:00.000Z", ...settings, seedVersion: SEED_VERSION }, "2026-01-01T00:00:00.000Z");
}
