import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { SignJWT } from "jose";
import { secret } from "./session";
import type { AlignmentSession, AnalysisResult, AppSettings, Incident, MitigationChanges } from "./types";

/**
 * Pintu masuk tunggal ke Core Module (PermintaanAnalisis.ajukan(), Subbab 9.2.1).
 * Dashboard menandatangani paket masukan; Core Module Python memverifikasinya, lalu menandatangani hasil.
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

/** Memastikan hasil berasal dari Core Module dan tidak diubah di perjalanan. */
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
  };
}

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
