/**
 * Tipe domain mengikuti structural model (Bab 9) dan enumerasi Tabel 9.30 dokumen AKPSI Kelompok C6.
 *
 * Nama field hasil Core Module (AnalysisResult dan turunannya) sengaja sama dengan keluaran
 * Python agar JSON dapat dipakai langsung tanpa pemetaan.
 */

export type Role = "TL" | "QA" | "IE" | "PM" | "SUP";

/** StatusVerdict (Tabel 9.30) */
export type Verdict = "Lolos" | "LolosBersyarat" | "TidakLolos" | "TidakDapatDinilai";

/** StatusSesi (Tabel 9.30, Gambar 10.16) */
export type SessionStatus = "Terjadwal" | "PengisianParameter" | "MenungguHasil" | "Peninjauan" | "Diputuskan" | "Ditutup";

/** KeputusanCycle (Tabel 9.30) */
export type CycleDecision = "LanjutPromosi" | "KembaliKeDev";

/** TipeInsiden (Tabel 9.30) */
export type IncidentType = "traffic_spike" | "memory_leak" | "batch_overlap" | "lainnya";

/** StatusInsiden (Tabel 9.30, Gambar 10.18) */
export type IncidentStatus =
  | "Dicatat"
  | "DalamReproduksi"
  | "Tereproduksi"
  | "BelumTereproduksi"
  | "UjiMitigasi"
  | "MitigasiDitemukan"
  | "PerluEskalasi"
  | "Terdokumentasi";

/** StatusDokumen (Tabel 9.30, Gambar 10.19) */
export type SignoffStatus = "Draf" | "MenungguKeputusan" | "Disetujui" | "Ditolak";

/** StatusPermintaan (Tabel 9.30, Gambar 10.17) */
export type RequestStatus = "Diterima" | "Disamarkan" | "Direncanakan" | "Dijalankan" | "Dihentikan" | "Dinilai" | "Selesai";

/** JalurPenjurusan (Tabel 9.30) */
export type Route = "DigitalTwin" | "EstimasiPenalaran" | "FallbackDigitalTwin";

/** ModeAnalisis (Tabel 9.30) */
export type AnalysisMode = "Alignment" | "ReproduksiInsiden" | "Mitigasi";

export type Limiting = "CPU" | "Memori" | "Jaringan" | "ThreadPool" | "ConnectionPool" | "Database" | "DependensiEksternal";

export interface StatusEvent<S extends string> {
  status: S;
  at: string;
  by: string;
  note?: string;
}

/** SpesifikasiSistem */
export interface Spec {
  vcpu: number;
  ramGb: number;
  nodes: number;
  threadPool: number;
  connPool: number;
  bandwidthMbps: number;
  timeoutMs?: number;
}

export interface Criteria {
  maxP95Ms: number;
  maxErrorRatePct: number;
  maxCpuPct: number;
  maxMemPct: number;
}

export interface DevSummary {
  testedTps: number;
  p95Ms: number;
  cpuPct: number;
  memPct: number;
  errorRatePct: number;
  payloadKb: number;
  notes: string;
}

/** ParameterAnalisis */
export interface AlignmentParams {
  normalTps: number;
  peakTps: number;
  whatIf: number[]; // pengali dari beban normal (FR-03, NFR-04)
  serviceVersion: string;
  configChanges: string;
  criteria: Criteria;
  devSpec: Spec;
  devSummary: DevSummary;
  prodSpec: Spec;
}

/** Ringkasan satu jalan simulasi pada ModelDigitalTwin (atau hasil estimasi). */
export interface StepSummary {
  tps: number;
  throughputTps?: number;
  cpuPct: number;
  memPct: number;
  netPct: number;
  threadPct: number;
  connPct: number;
  p50Ms?: number;
  p95Ms: number;
  p99Ms?: number;
  rataLatensiMs?: number;
  errorRatePct: number;
  timeoutPct?: number;
  jumlahRequest?: number;
}

export interface SeriesPoint {
  t: number;
  cpu: number;
  mem: number;
  net: number;
  thread: number;
  conn: number;
  p95: number | null;
}

/** SkenarioBeban */
export interface LoadScenario {
  namaSkenario: string;
  tpsDasar: number;
  pengali: number;
  tpsTarget: number;
  polaBeban: string;
  durasiMenit: number;
  campuranTransaksi: string;
}

/** LangkahAnalisis */
export interface AnalysisStep {
  urutan: number;
  kunci: string;
  deskripsi: string;
  alat: string;
  skenario: LoadScenario | null;
  dalamCakupanModel: boolean;
  jalurPenjurusan: Route | null;
  skorKeyakinan: number | null;
  kesepakatanSampel: number | null;
  statusLangkah: "Menunggu" | "Selesai" | "Dihentikan";
  perluVerifikasiManual: boolean;
  estimasiBiaya: number;
  ringkasan: StepSummary | null;
  deretWaktu: SeriesPoint[];
  komponenLatensiMs: Record<string, number>;
  pelanggaran: string[];
  status: Verdict | null;
  catatan: string;
}

/** IndikatorSumberDaya */
export interface ResourceIndicator {
  jenis: "CPU" | "Memori" | "Jaringan" | "ThreadPool" | "KapasitasTransaksiMaks" | "ErrorRate" | "ResponseTime";
  label: string;
  nilai: number;
  satuan: string;
  kapasitasSpesifikasi: string;
  rasioUtilisasi: number | null;
  sumberAngka: Route;
  perluVerifikasiManual: boolean;
}

/** MetrikBaseline */
export interface Baseline {
  environment: string;
  jenisPeriode: "Baseline" | "PeriodeInsiden";
  periodeMulai?: string;
  periodeSelesai?: string;
  cpuRataPersen: number;
  memoriRataPersen: number;
  throughputTps: number;
  puncakTps: number;
  errorRatePersen: number;
  responseTimeP95Ms: number;
  sumber: "ELKLangsung" | "TersimpanTerakhir";
  tanggalPengambilan: string;
}

export interface DigitalTwinModel {
  versiModel: string;
  statusAktif: boolean;
  tanggalKalibrasi: string | null;
  tpsMinTerkalibrasi: number;
  tpsMaksTerkalibrasi: number;
  cakupanKomponen: string[];
}

export interface Capacity {
  kapasitasMaksTps: number;
  pembatas: Limiting;
  perSumberDaya: { sumber: Limiting; kapasitasTps: number; rumus: string }[];
  littlesLaw: { lambdaTps: number; wDetik: number; lRequest: number; threadTersediaPerNode: number; threadDisarankanPerNode: number };
}

export interface TestPlanStep {
  urutan: number;
  nama: string;
  profilBeban: string;
  durasiMenit: number;
  kriteriaLulus: string;
  alasan: string;
}

export interface TraceEntry {
  id: string;
  label: string;
  jalur: string;
  catatan: string;
  skorKeyakinan: number | null;
  kesepakatanSampel: number | null;
  durasiMs: number;
}

/** HasilAnalisis beserta Verdict, RencanaAnalisis, dan JejakKeputusan dari satu PermintaanAnalisis. */
export interface AnalysisResult {
  idPermintaan: string;
  mode: AnalysisMode;
  modeAnalisis: "demo" | "llm";
  provider: string | null;
  model: string | null;
  statusPermintaan: RequestStatus;
  alasanDihentikan: string | null;
  waktuDiterima: string;
  waktuSelesai: string;
  penyamaran: { jumlah: number; jenis: string[] };
  metrikBaseline: Baseline;
  metrikPeriodeInsiden: Record<string, unknown> | null;
  modelDigitalTwin: DigitalTwinModel | null;
  kalibrasi: {
    acuanTps: number;
    acuanP95Ms: number;
    p95SimulasiMs: number;
    galatPersen: number;
    cpuMsPerRequest: number;
    tungguDatabaseMs: number;
    tungguEksternalMs: number;
    sumber: string;
  } | null;
  spesifikasi: Spec | null;
  kriteria: Criteria;
  rencana: { ringkasanTujuan: string; waktuDisusun: string; langkah: { urutan: number; deskripsi: string; alat: string; acuan: string; catatanLLM?: string }[] };
  langkah: AnalysisStep[];
  indikator: ResourceIndicator[];
  kapasitas: Capacity | null;
  sumberDayaPembatas: Limiting | null;
  penyebabBottleneck: string[];
  statusReproduksi: "Tereproduksi" | "TidakTereproduksi" | "TidakDapatDinilai" | null;
  kemungkinanAkarMasalah: string[];
  adaAngkaEstimasi: boolean;
  verdict: { status: Verdict; alasan: string[]; syarat: string[]; narasi: string; waktuDitetapkan: string };
  rencanaUji: TestPlanStep[];
  jejak: {
    idJejak: string;
    waktuMulai: string;
    waktuSelesai: string;
    durasiProsesMs: number;
    versiModelDigitalTwin: string | null;
    versiModelLLM: string | null;
    versiPrompt: string;
    jumlahPengirimanKeLLM: number;
    biaya: { pengiriman: number; tokenMasuk: number; tokenKeluar: number; usd: number; idr: number };
    langkah: TraceEntry[];
  };
  peringatan: string[];
  mitigasi: { label: string; changes: MitigationChanges } | null;
}

/** Satu jalan analisis yang tersimpan pada sesi, beserta versi parameter yang dipakai. */
export interface AnalysisRun {
  id: string;
  createdAt: string;
  createdBy: string;
  params: AlignmentParams;
  result: AnalysisResult;
}

/** SesiAlignment */
export interface AlignmentSession {
  id: string;
  code: string;
  service: string;
  release: string;
  releaseCandidate: string;
  cycleNo: number;
  envSource: string;
  envTarget: string;
  scheduledAt: string;
  createdAt: string;
  status: SessionStatus;
  history: StatusEvent<SessionStatus>[];
  params: AlignmentParams | null;
  paramsBy?: string;
  paramVersion?: number;
  pendingRequestId?: string;
  runs: AnalysisRun[];
  decision?: CycleDecision;
  decisionNotes?: string;
  followUps?: string[];
  decidedBy?: string;
  decidedAt?: string;
  reportId?: string;
  signoffId?: string;
  draftFrom?: string;
}

export interface IncidentData {
  type: IncidentType;
  title: string;
  description: string;
  service: string;
  release: string;
  peakRps: number;
  avgRps: number;
  durationMin: number;
  detectedAt: string;
  payloadKb: number;
  memGrowthMbPerHour: number;
  batchCpuPct: number;
  spec: Spec;
  manualSymptoms: string;
  elkDataAvailable: boolean;
}

export interface MitigationChanges {
  vcpu?: number;
  ramGb?: number;
  nodes?: number;
  threadPool?: number;
  connPool?: number;
  timeoutMs?: number;
}

/** OpsiMitigasi */
export interface Mitigation {
  id: string;
  label: string;
  changes: MitigationChanges;
  result: AnalysisResult;
  createdAt: string;
}

/** KasusInsiden */
export interface Incident {
  id: string;
  code: string;
  createdAt: string;
  createdBy: string;
  status: IncidentStatus;
  history: StatusEvent<IncidentStatus>[];
  data: IncidentData;
  pendingRequestId?: string;
  repro: AnalysisResult | null;
  mitigations: Mitigation[];
  selectedMitigationId?: string;
  needsEscalation: boolean;
  rootCauseAt?: string;
  closedAt?: string;
  reportId?: string;
}

/** DokumenSignOff */
export interface SignoffDoc {
  id: string;
  code: string;
  sessionId: string;
  version: number;
  status: SignoffStatus;
  history: StatusEvent<SignoffStatus>[];
  createdAt: string;
  requestedBy: string;
  snapshot: {
    service: string;
    release: string;
    releaseCandidate: string;
    cycleNo: number;
    envSource: string;
    envTarget: string;
    params: AlignmentParams;
    result: AnalysisResult;
    decisionNotes: string;
    followUps: string[];
    limitations: string[];
  };
  pmNotes?: string;
  decidedBy?: string;
  decidedAt?: string;
  lockedAt?: string;
  reportId?: string;
}

export type ReportKind = "alignment" | "signoff" | "insiden";

export interface ReportEntry {
  id: string;
  kind: ReportKind;
  refId: string;
  title: string;
  service: string;
  release: string;
  cycleNo: number | null;
  verdict: Verdict | null;
  status: string;
  restricted: boolean;
  createdAt: string;
  metrics: { cpuPct?: number; memPct?: number; p95Ms?: number; maxTps?: number | null; mttrMin?: number };
}

export interface AuditEntry {
  id: string;
  createdAt: string;
  user: string;
  role: Role;
  action: string;
  target: string;
  detail?: string;
}

export type ProviderId = "anthropic" | "openai" | "gemini";

export interface AppSettings {
  mode: "demo" | "llm";
  provider: ProviderId;
  models: Record<ProviderId, string>;
  prices: Record<ProviderId, { input: number; output: number }>; // USD per 1 juta token
  confidenceThreshold: number;
  samples: number;
  simulateElkDown: boolean;
  usdToIdr: number;
  cachedBaselines: Record<string, Baseline>;
  /** Versi data contoh; data contoh lama diganti otomatis bila versinya lebih rendah. */
  seedVersion?: number;
}
