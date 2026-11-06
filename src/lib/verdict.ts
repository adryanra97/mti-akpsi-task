import type { Verdict } from "./types";

export const VERDICT_LABEL: Record<Verdict, string> = {
  LOLOS: "Lolos",
  LOLOS_BERSYARAT: "Lolos Bersyarat",
  TIDAK_LOLOS: "Tidak Lolos",
  TIDAK_DAPAT_DINILAI: "Tidak Dapat Dinilai",
};

export const VERDICT_HELP: Record<Verdict, string> = {
  LOLOS: "Seluruh indikator memenuhi kriteria penerimaan dengan headroom cukup.",
  LOLOS_BERSYARAT: "Memenuhi kriteria, tetapi ada syarat: headroom tipis atau angka estimasi yang perlu verifikasi manual.",
  TIDAK_LOLOS: "Minimal satu indikator melanggar kriteria penerimaan.",
  TIDAK_DAPAT_DINILAI: "Parameter di luar rentang terkalibrasi atau tidak ada model digital twin aktif.",
};
