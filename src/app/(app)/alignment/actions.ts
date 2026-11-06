"use server";

/**
 * Server action UC-01 Jalankan Alignment Rilis Terjadwal: penjadwalan sesi, pembukaan sesi,
 * penyimpanan parameter analisis, dan pencatatan keputusan cycle (state machine Gambar 10.16).
 */
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { audit, requirePermission } from "@/lib/auth";
import { put } from "@/lib/db";
import { getSession, listSessions, listSignoffs } from "@/lib/data";
import { defaultParams, latestResult, limitationsFor, reportFromSession, transition } from "@/lib/domain";
import type { AlignmentParams, AlignmentSession, CycleDecision, SignoffDoc } from "@/lib/types";
import { SERVICES } from "@/lib/services";

export interface FormState {
  ok?: boolean;
  intent?: string;
  error?: string;
  errors?: Record<string, string>;
  savedAt?: number;
  values?: Record<string, string>;
}

/**
 * Nilai formulir yang dikirim, dikembalikan saat validasi gagal agar isian pengguna tidak hilang.
 *
 * Parameters
 * ----------
 * f : FormData
 *     Data formulir; field internal React (berawalan "$") diabaikan dan nilai ganda digabung koma.
 *
 * Returns
 * -------
 * Record<string, string>
 */
function echo(f: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of f.entries()) {
    if (k.startsWith("$")) continue;
    out[k] = out[k] !== undefined ? `${out[k]},${v}` : String(v);
  }
  return out;
}

/**
 * Membaca angka dari formulir; koma diterima sebagai pemisah desimal.
 *
 * Parameters
 * ----------
 * f : FormData
 *     Data formulir.
 * k : string
 *     Nama field.
 *
 * Returns
 * -------
 * number
 *     NaN bila kosong atau bukan angka.
 */
const num = (f: FormData, k: string) => {
  const raw = String(f.get(k) ?? "").replace(",", ".").trim();
  return raw === "" ? NaN : Number(raw);
};

/**
 * Membaca dan memvalidasi error rate hasil uji Dev.
 *
 * Parameters
 * ----------
 * f : FormData
 *     Data formulir.
 * errors : Record<string, string>
 *     Kumpulan galat; diisi bila nilai tidak valid.
 *
 * Returns
 * -------
 * number
 *     Error rate dalam persen, atau 0 bila tidak valid.
 */
function devError(f: FormData, errors: Record<string, string>) {
  const v = num(f, "devErrorRatePct");
  if (Number.isNaN(v) || v < 0) {
    errors.devErrorRatePct = "Isi error rate hasil uji Dev (0 atau lebih).";
    return 0;
  }
  return v;
}

/**
 * Menjadwalkan sesi alignment baru berstatus Terjadwal (khusus Technical Lead).
 *
 * Parameters
 * ----------
 * _ : FormState
 *     State sebelumnya dari useActionState (tidak dipakai).
 * f : FormData
 *     Layanan, nama rilis, versi uji, nomor cycle, dan jadwal.
 *
 * Returns
 * -------
 * Promise<FormState>
 *     Galat validasi; bila berhasil, dialihkan ke halaman sesi.
 */
export async function scheduleSession(_: FormState, f: FormData): Promise<FormState> {
  const user = await requirePermission("alignment.schedule");
  const service = String(f.get("service") ?? "");
  const release = String(f.get("release") ?? "").trim();
  const rc = String(f.get("releaseCandidate") ?? "").trim();
  const cycleNo = num(f, "cycleNo");
  const date = String(f.get("scheduledAt") ?? "");
  const errors: Record<string, string> = {};
  if (!SERVICES.some((s) => s.nama === service)) errors.service = "Pilih layanan.";
  if (!release) errors.release = "Isi nama rilis, misalnya Rilis Dompet Digital.";
  if (!rc) errors.releaseCandidate = "Isi versi yang diuji, misalnya Kandidat 1 (v3.9).";
  if (!Number.isInteger(cycleNo) || cycleNo < 1) errors.cycleNo = "Nomor cycle harus bilangan bulat 1 atau lebih.";
  if (!date) errors.scheduledAt = "Pilih tanggal dan jam alignment meeting.";
  const sessions = await listSessions();
  if (!errors.cycleNo && sessions.some((s) => s.release === release && s.service === service && s.cycleNo === cycleNo)) {
    errors.cycleNo = `Cycle ${cycleNo} untuk ${release} sudah dijadwalkan.`;
  }
  if (Object.keys(errors).length) return { errors, values: echo(f) };

  const prev = sessions
    .filter((s) => s.service === service && s.params)
    .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))[0];
  const s: AlignmentSession = {
    id: crypto.randomUUID(),
    code: `ALN-${String(sessions.length + 1).padStart(3, "0")}`,
    service,
    release,
    releaseCandidate: rc,
    cycleNo,
    envSource: "Dev",
    envTarget: "Production",
    scheduledAt: new Date(`${date}:00+07:00`).toISOString(),
    createdAt: new Date().toISOString(),
    status: "Terjadwal",
    history: [],
    params: null,
    runs: [],
  };
  transition(s, "Terjadwal", user.name, "Jadwal sesi dibuat");
  // Parameter cycle sebelumnya disimpan sebagai draf agar QA cukup memperbarui yang berubah.
  if (prev?.params) s.draftFrom = prev.id;
  await put("sa_sessions", s);
  await audit(user, "Menjadwalkan sesi alignment", s.code, `${release} cycle ${cycleNo}`);
  redirect(`/alignment/${s.id}`);
}

/**
 * Membuka sesi lebih awal (bukaSesi()): Terjadwal -> Pengisian Parameter.
 *
 * Sesi juga terbuka otomatis saat jadwal akhir sprint cycle tiba.
 *
 * Parameters
 * ----------
 * sessionId : string
 *     Identitas sesi.
 *
 * Returns
 * -------
 * Promise<void>
 */
export async function openSession(sessionId: string) {
  const user = await requirePermission("alignment.schedule");
  const s = await getSession(sessionId);
  if (!s || s.status !== "Terjadwal") return;
  transition(s, "PengisianParameter", user.name, "Sesi dibuka lebih awal");
  await put("sa_sessions", s);
  await audit(user, "Membuka sesi alignment", s.code);
  revalidatePath("/", "layout");
}

/**
 * Menyimpan ParameterAnalisis sesi (QA/Performance Tester atau Technical Lead).
 *
 * Parameter hanya dapat diubah pada Pengisian Parameter atau Peninjauan. Mengubah parameter
 * saat Peninjauan ("uji varian lain") mengembalikan sesi ke Pengisian Parameter dan menaikkan
 * versi parameter.
 *
 * Parameters
 * ----------
 * sessionId : string
 *     Identitas sesi (diikat dengan bind).
 * _ : FormState
 *     State sebelumnya (tidak dipakai).
 * f : FormData
 *     Isian parameter dan field "intent" ("save" atau "run").
 *
 * Returns
 * -------
 * Promise<FormState>
 *     ok dan intent bila tersimpan, atau galat validasi per field beserta nilai yang dikirim.
 */
export async function saveParams(sessionId: string, _: FormState, f: FormData): Promise<FormState> {
  const user = await requirePermission("alignment.params");
  const s = await getSession(sessionId);
  if (!s) return { error: "Sesi tidak ditemukan." };
  if (s.status === "Terjadwal") return { error: "Sesi belum dibuka. Parameter dapat diisi saat jadwal akhir sprint cycle tiba." };
  if (s.status === "Diputuskan" || s.status === "Ditutup") return { error: "Sesi sudah diputuskan; parameter tidak dapat diubah." };
  if (s.status === "MenungguHasil") return { error: "Analisis sedang berjalan. Tunggu hasilnya sebelum mengubah parameter." };

  const base = s.params ?? defaultParams(s.service);
  const errors: Record<string, string> = {};
  const need = (k: string, label: string, min = 0, int = false) => {
    const v = num(f, k);
    if (Number.isNaN(v)) errors[k] = `Isi ${label}.`;
    else if (v <= min) errors[k] = `${label[0].toUpperCase() + label.slice(1)} harus lebih dari ${min}.`;
    else if (int && !Number.isInteger(v)) errors[k] = `${label[0].toUpperCase() + label.slice(1)} harus bilangan bulat.`;
    return v;
  };

  const p: AlignmentParams = {
    normalTps: need("normalTps", "beban normal"),
    peakTps: need("peakTps", "beban puncak"),
    whatIf: f.getAll("whatIf").map(Number).filter((n) => n > 1).sort((a, b) => a - b),
    serviceVersion: String(f.get("serviceVersion") ?? "").trim(),
    configChanges: String(f.get("configChanges") ?? "").trim(),
    criteria: {
      maxP95Ms: need("maxP95Ms", "batas p95"),
      maxErrorRatePct: need("maxErrorRatePct", "batas error rate"),
      maxCpuPct: need("maxCpuPct", "batas CPU"),
      maxMemPct: need("maxMemPct", "batas memori"),
    },
    devSummary: {
      testedTps: need("testedTps", "TPS yang diuji di Dev"),
      p95Ms: need("devP95Ms", "p95 hasil uji Dev"),
      cpuPct: need("devCpuPct", "CPU hasil uji Dev"),
      memPct: need("devMemPct", "memori hasil uji Dev"),
      errorRatePct: devError(f, errors),
      payloadKb: need("payloadKb", "ukuran payload"),
      notes: String(f.get("devNotes") ?? "").trim(),
    },
    devSpec: {
      vcpu: need("devVcpu", "vCPU Dev", 0, true),
      ramGb: need("devRamGb", "RAM Dev"),
      nodes: need("devNodes", "jumlah node Dev", 0, true),
      threadPool: base.devSpec.threadPool,
      connPool: base.devSpec.connPool,
      bandwidthMbps: base.devSpec.bandwidthMbps,
      timeoutMs: base.devSpec.timeoutMs ?? 3000,
    },
    prodSpec: {
      vcpu: need("prodVcpu", "vCPU Production", 0, true),
      ramGb: need("prodRamGb", "RAM Production"),
      nodes: need("prodNodes", "jumlah node Production", 0, true),
      threadPool: need("prodThreadPool", "thread pool", 0, true),
      connPool: need("prodConnPool", "connection pool", 0, true),
      bandwidthMbps: need("prodBandwidth", "bandwidth"),
      timeoutMs: need("prodTimeoutMs", "timeout", 0, true),
    },
  };
  if (!p.serviceVersion) errors.serviceVersion = "Isi versi layanan yang diuji.";
  if (!errors.peakTps && !errors.normalTps && p.peakTps < p.normalTps) errors.peakTps = "Beban puncak tidak boleh lebih kecil dari beban normal.";
  for (const k of ["devCpuPct", "devMemPct", "maxCpuPct", "maxMemPct"] as const) {
    if (!errors[k] && num(f, k) > 100) errors[k] = "Nilai persentase maksimal 100.";
  }
  if (Object.keys(errors).length)
    return { errors, values: echo(f), error: `${Object.keys(errors).length} isian perlu dilengkapi atau diperbaiki.` };

  s.params = p;
  s.paramsBy = user.name;
  s.paramVersion = (s.paramVersion ?? 0) + 1;
  // masukkanParameter() [perlu uji varian lain]: Peninjauan -> Pengisian Parameter (Gambar 10.16).
  if (s.status === "Peninjauan") transition(s, "PengisianParameter", user.name, "Uji varian lain");
  await put("sa_sessions", s);
  await audit(user, "Menyimpan parameter analisis", s.code);
  revalidatePath(`/alignment/${s.id}`);
  return { ok: true, intent: String(f.get("intent") ?? "save"), savedAt: Date.now() };
}

/**
 * Mencatat keputusan cycle (khusus Technical Lead): Peninjauan -> Diputuskan -> Ditutup.
 *
 * Keputusan Lanjut Promosi ditolak untuk verdict Tidak Lolos dan Tidak Dapat Dinilai. Lanjut
 * Promosi membuat dokumen sign-off (Draf -> Menunggu Keputusan); keduanya menyimpan laporan alignment.
 *
 * Parameters
 * ----------
 * sessionId : string
 *     Identitas sesi (diikat dengan bind).
 * _ : FormState
 *     State sebelumnya (tidak dipakai).
 * f : FormData
 *     decision ("LanjutPromosi" atau "KembaliKeDev"), notes, dan followUps (satu per baris).
 *
 * Returns
 * -------
 * Promise<FormState>
 *     Galat validasi; bila berhasil, dialihkan ke halaman sesi dengan penanda keputusan.
 */
export async function decideCycle(sessionId: string, _: FormState, f: FormData): Promise<FormState> {
  const user = await requirePermission("alignment.decide");
  const s = await getSession(sessionId);
  if (!s) return { error: "Sesi tidak ditemukan." };
  const run = latestResult(s);
  if (!run || s.status !== "Peninjauan") return { error: "Keputusan dicatat saat sesi berada pada tahap Peninjauan." };
  const decision = String(f.get("decision") ?? "");
  const notes = String(f.get("notes") ?? "").trim();
  const followUps = String(f.get("followUps") ?? "")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
  const errors: Record<string, string> = {};
  if (decision !== "LanjutPromosi" && decision !== "KembaliKeDev") errors.decision = "Pilih keputusan cycle.";
  if (decision === "LanjutPromosi" && (run.verdict.status === "TidakLolos" || run.verdict.status === "TidakDapatDinilai")) {
    errors.decision = "Verdict ini tidak mengizinkan promosi ke Production. Pilih kembali ke Dev.";
  }
  if (!notes) errors.notes = "Tulis ringkasan keputusan dari alignment meeting.";
  if (decision === "KembaliKeDev" && followUps.length === 0) errors.followUps = "Tulis minimal satu tindak lanjut untuk sprint cycle berikutnya.";
  if (Object.keys(errors).length) return { errors, values: echo(f) };

  // catatKeputusan(keputusan, catatan): Peninjauan -> Diputuskan; simpanLaporan(): Diputuskan -> Ditutup.
  s.decision = decision as CycleDecision;
  s.decisionNotes = notes;
  s.followUps = followUps;
  s.decidedBy = user.name;
  s.decidedAt = new Date().toISOString();
  transition(s, "Diputuskan", user.name, decision === "LanjutPromosi" ? "Lanjut promosi" : "Kembali ke Dev");
  s.reportId = `rpt-${s.id}`;
  await put("sa_reports", reportFromSession(s));
  transition(s, "Ditutup", user.name, decision === "LanjutPromosi" ? "Laporan disimpan; ajukanSignOff()" : "Laporan disimpan");

  if (decision === "LanjutPromosi") {
    const signoffs = await listSignoffs();
    const version = signoffs.filter((d) => d.sessionId === s.id).length + 1;
    const doc: SignoffDoc = {
      id: crypto.randomUUID(),
      code: `SO-${String(signoffs.length + 1).padStart(3, "0")}`,
      sessionId: s.id,
      version,
      status: "Draf",
      history: [],
      createdAt: new Date().toISOString(),
      requestedBy: user.name,
      snapshot: {
        service: s.service,
        release: s.release,
        releaseCandidate: s.releaseCandidate,
        cycleNo: s.cycleNo,
        envSource: s.envSource,
        envTarget: s.envTarget,
        params: s.params!,
        result: run,
        decisionNotes: notes,
        followUps,
        limitations: limitationsFor(run),
      },
    };
    // Gambar 10.19: Draf (cantumkanSyarat) -> kirimPermintaanSignOff() -> Menunggu Keputusan.
    transition(doc, "Draf", "Sistem", run.verdict.status === "LolosBersyarat" ? "Draf disusun; syarat Lolos Bersyarat dicantumkan" : "Draf disusun dari laporan alignment");
    transition(doc, "MenungguKeputusan", user.name, "Permintaan sign-off dikirim");
    await put("sa_signoffs", doc);
    s.signoffId = doc.id;
    await audit(user, "Mengirim permintaan sign-off", doc.code, `${s.release} cycle ${s.cycleNo}`);
  }
  await put("sa_sessions", s);
  await audit(user, decision === "LanjutPromosi" ? "Memutuskan lanjut promosi" : "Memutuskan kembali ke Dev", s.code);
  revalidatePath("/", "layout");
  redirect(`/alignment/${s.id}?keputusan=1`);
}
