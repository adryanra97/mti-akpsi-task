/**
 * Petunjuk tindak lanjut saat hasil (atau sebagian varian) berstatus Tidak Dapat Dinilai.
 */
import Link from "next/link";
import { Gauge } from "lucide-react";
import type { AnalysisResult } from "@/lib/types";
import { Notice } from "./ui";

/**
 * Mengarahkan ke kalibrasi ulang model bila ada langkah yang tidak dapat dinilai.
 *
 * Parameters
 * ----------
 * result : AnalysisResult
 *     Hasil Core Module.
 * canManage : boolean
 *     Pengguna boleh mengkalibrasi ulang model (Technical Lead).
 *
 * Returns
 * -------
 * JSX.Element | null
 *     null bila semua langkah dapat dinilai.
 */
export function RecalibrateHint({ result, canManage }: { result: AnalysisResult; canManage: boolean }) {
  const whole = result.verdict.status === "TidakDapatDinilai";
  const partial = result.langkah.filter((l) => l.status === "TidakDapatDinilai" && l.kunci.startsWith("whatif"));
  if (!whole && partial.length === 0) return null;
  const m = result.modelDigitalTwin;
  const what = !m?.statusAktif
    ? "Layanan ini belum memiliki model digital twin aktif."
    : whole
      ? `Beban yang dinilai berada di luar rentang model ${m.versiModel} (${m.tpsMinTerkalibrasi} sampai ${m.tpsMaksTerkalibrasi} TPS).`
      : `${partial.map((l) => l.deskripsi).join(", ")} berada di luar rentang model ${m.versiModel} (${m.tpsMinTerkalibrasi} sampai ${m.tpsMaksTerkalibrasi} TPS).`;
  return (
    <Notice tone="warn" icon={<Gauge className="h-4 w-4 text-cond" />} title={whole ? "Agar dapat dinilai, model perlu dikalibrasi ulang" : "Sebagian varian belum dapat dinilai"}>
      {what}{" "}
      {canManage ? (
        <>
          <Link href="/settings#model-digital-twin" className="font-medium text-accent underline-offset-2 hover:underline">
            {m?.statusAktif ? "Kalibrasi ulang model" : "Aktifkan model"} di Pengaturan
          </Link>
          , lalu ajukan analisis lagi.
        </>
      ) : (
        "Minta Technical Lead mengkalibrasi ulang model di Pengaturan, lalu ajukan analisis lagi."
      )}
    </Notice>
  );
}
