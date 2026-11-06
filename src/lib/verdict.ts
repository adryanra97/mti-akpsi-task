import type { CycleDecision, IncidentStatus, Limiting, RequestStatus, Route, SessionStatus, SignoffStatus, Verdict } from "./types";

export const VERDICT_LABEL: Record<Verdict, string> = {
  Lolos: "Lolos",
  LolosBersyarat: "Lolos Bersyarat",
  TidakLolos: "Tidak Lolos",
  TidakDapatDinilai: "Tidak Dapat Dinilai",
};

export const VERDICT_HELP: Record<Verdict, string> = {
  Lolos: "Seluruh indikator memenuhi kriteria penerimaan dengan headroom cukup.",
  LolosBersyarat: "Memenuhi kriteria, tetapi ada syarat: headroom tipis atau angka estimasi penalaran yang perlu verifikasi manual.",
  TidakLolos: "Minimal satu indikator melanggar kriteria penerimaan.",
  TidakDapatDinilai: "Parameter di luar rentang terkalibrasi atau tidak ada model digital twin aktif.",
};

/** Label StatusSesi (Gambar 10.16) */
export const SESSION_STATUS_LABEL: Record<SessionStatus, string> = {
  Terjadwal: "Terjadwal",
  PengisianParameter: "Pengisian Parameter",
  MenungguHasil: "Menunggu Hasil",
  Peninjauan: "Peninjauan",
  Diputuskan: "Diputuskan",
  Ditutup: "Ditutup",
};

export const DECISION_LABEL: Record<CycleDecision, string> = {
  LanjutPromosi: "Lanjut promosi ke Production",
  KembaliKeDev: "Kembali ke Dev",
};

/** Label StatusInsiden (Gambar 10.18) */
export const INCIDENT_STATUS_LABEL: Record<IncidentStatus, string> = {
  Dicatat: "Dicatat",
  DalamReproduksi: "Dalam Reproduksi",
  Tereproduksi: "Tereproduksi",
  BelumTereproduksi: "Belum Tereproduksi",
  UjiMitigasi: "Uji Mitigasi",
  MitigasiDitemukan: "Mitigasi Ditemukan",
  PerluEskalasi: "Perlu Eskalasi",
  Terdokumentasi: "Terdokumentasi",
};

/** Label StatusDokumen (Gambar 10.19) */
export const SIGNOFF_STATUS_LABEL: Record<SignoffStatus, string> = {
  Draf: "Draf",
  MenungguKeputusan: "Menunggu Keputusan",
  Disetujui: "Disetujui",
  Ditolak: "Ditolak",
};

/** Label StatusPermintaan (Gambar 10.17) */
export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  Diterima: "Diterima",
  Disamarkan: "Disamarkan",
  Direncanakan: "Direncanakan",
  Dijalankan: "Dijalankan",
  Dihentikan: "Dihentikan",
  Dinilai: "Dinilai",
  Selesai: "Selesai",
};

export const ROUTE_LABEL: Record<Route | "Sistem" | "LayananLLM" | "Dihentikan", string> = {
  DigitalTwin: "Digital twin",
  EstimasiPenalaran: "Estimasi penalaran",
  FallbackDigitalTwin: "Fallback digital twin",
  Sistem: "Sistem",
  LayananLLM: "Layanan LLM",
  Dihentikan: "Dihentikan",
};

export const LIMITING_LABEL: Record<Limiting, string> = {
  CPU: "CPU",
  Memori: "Memori",
  Jaringan: "Jaringan",
  ThreadPool: "Thread pool",
  ConnectionPool: "Connection pool",
  Database: "Waktu respons database",
  DependensiEksternal: "Dependensi eksternal",
};
