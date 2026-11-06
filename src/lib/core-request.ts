import "server-only";
/**
 * Pintu masuk tunggal ke Core Module (PermintaanAnalisis.ajukan(), Subbab 9.2.1).
 *
 * Dashboard menandatangani paket masukan sebagai JWT; Core Module Python memverifikasinya,
 * menjalankan analisis, lalu menandatangani hasil dengan HMAC-SHA256 yang diverifikasi di sini.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { SignJWT } from "jose";
import { secret } from "./session";
import type { AlignmentSession, AnalysisResult, AppSettings, Incident, MitigationChanges } from "./types";

/**
 * Menandatangani token permintaan untuk Core Module.
 *
 * Parameters
 * ----------
 * tujuan : "analisis" | "uji-koneksi"
 *     Endpoint tujuan; dicek Core Module agar token tidak dipakai di endpoint lain.
 * claims : Record<string, unknown>
 *     Isi permintaan, misalnya PermintaanAnalisis atau penyedia dan model untuk uji koneksi.
 * ttl : string, default "10m"
 *     Masa berlaku token dalam format `jose`, misalnya "1m".
 *
 * Returns
 * -------
 * Promise<string>
 *     JWT HS256 dengan audiens "serveragent-core".
 *
 * Raises
 * ------
 * Error
 *     Bila `AUTH_SECRET` belum diatur.
 */
export async function signCoreToken(tujuan: "analisis" | "uji-koneksi", claims: Record<string, unknown>, ttl = "10m") {
  const key = secret();
  if (!key) throw new Error("AUTH_SECRET belum diatur.");
  return new SignJWT({ ...claims, tujuan })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience("serveragent-core")
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(key);
}

/**
 * Memverifikasi hasil dari Core Module lalu mem-parsing-nya.
 *
 * Parameters
 * ----------
 * text : string
 *     HasilAnalisis dalam bentuk string JSON, persis seperti yang ditandatangani.
 * signature : string
 *     Tanda HMAC-SHA256 dalam heksadesimal (64 karakter).
 *
 * Returns
 * -------
 * AnalysisResult | null
 *     Hasil yang sah, atau null bila tanda tidak cocok atau JSON tidak valid.
 */
export function verifyCoreResult(text: string, signature: string): AnalysisResult | null {
  const key = secret();
  if (!key || typeof text !== "string" || typeof signature !== "string" || !/^[0-9a-f]{64}$/.test(signature)) return null;
  const expected = createHmac("sha256", Buffer.from(key)).update(text, "utf8").digest();
  const got = Buffer.from(signature, "hex");
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;
  try {
    return JSON.parse(text) as AnalysisResult;
  } catch {
    return null;
  }
}

/**
 * Bagian pengaturan pada PermintaanAnalisis.
 *
 * Parameters
 * ----------
 * s : AppSettings
 *     Pengaturan aplikasi.
 * service : string
 *     Nama layanan, untuk mengambil baseline tersimpan terakhir.
 *
 * Returns
 * -------
 * Record<string, unknown>
 *     Mode, penyedia, model, harga, kurs, ambang keyakinan, jumlah sampel, simulasi ELK
 *     tidak tersedia, baseline tersimpan, dan hasil kalibrasi ulang model digital twin.
 */
function settingsClaims(s: AppSettings, service: string) {
  return {
    mode: s.mode,
    provider: s.provider,
    model: s.models[s.provider],
    harga: s.prices[s.provider],
    kurs: s.usdToIdr,
    ambang: s.confidenceThreshold,
    sampel: s.samples,
    simulasiElkMati: s.simulateElkDown,
    baselineTersimpan: s.cachedBaselines[service] ?? null,
    // Hasil kalibrasi ulang model (bila ada); ditandatangani bersama permintaan sehingga tepercaya.
    modelDigitalTwin: s.twinOverrides?.[service] ?? null,
  };
}

/**
 * Membentuk PermintaanAnalisis mode Alignment.
 *
 * Parameters
 * ----------
 * session : AlignmentSession
 *     Sesi dengan parameter analisis tersimpan.
 * settings : AppSettings
 *     Pengaturan aplikasi.
 * id : string
 *     Identitas permintaan.
 *
 * Returns
 * -------
 * Record<string, unknown>
 *     Paket permintaan untuk ditandatangani.
 */
export function alignmentRequest(session: AlignmentSession, settings: AppSettings, id: string) {
  return {
    idPermintaan: id,
    mode: "Alignment",
    layanan: session.service,
    rilis: session.release,
    versiUji: session.releaseCandidate,
    cycle: session.cycleNo,
    parameter: session.params,
    pengaturan: settingsClaims(settings, session.service),
  };
}

/**
 * Membentuk PermintaanAnalisis mode ReproduksiInsiden atau Mitigasi.
 *
 * Parameters
 * ----------
 * inc : Incident
 *     Kasus insiden.
 * settings : AppSettings
 *     Pengaturan aplikasi.
 * id : string
 *     Identitas permintaan.
 * mitigation : { label: string; changes: MitigationChanges }, optional
 *     Opsi mitigasi yang dinilai; tanpa ini permintaan berupa reproduksi insiden.
 *
 * Returns
 * -------
 * Record<string, unknown>
 *     Paket permintaan untuk ditandatangani.
 */
export function incidentRequest(
  inc: Incident,
  settings: AppSettings,
  id: string,
  mitigation?: { label: string; changes: MitigationChanges },
) {
  return {
    idPermintaan: id,
    mode: mitigation ? "Mitigasi" : "ReproduksiInsiden",
    layanan: inc.data.service,
    rilis: inc.data.release,
    insiden: inc.data,
    mitigasi: mitigation ?? null,
    pengaturan: settingsClaims(settings, inc.data.service),
  };
}
