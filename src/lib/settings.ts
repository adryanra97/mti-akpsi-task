import "server-only";
/**
 * Pengaturan aplikasi (mode analisis, penyedia LLM, harga, ambang) yang disimpan di database.
 *
 * Hanya untuk server; API key tidak pernah disimpan di sini dan hanya dibaca dari environment variable.
 */
import { get, put } from "./db";
import type { AppSettings, ProviderId } from "./types";
import { DEFAULT_SETTINGS } from "./settings-defaults";
export { DEFAULT_SETTINGS, PROVIDER_LABEL, MODEL_SUGGESTIONS } from "./settings-defaults";

/**
 * Memeriksa apakah API key penyedia LLM sudah diatur di environment variable.
 *
 * Parameters
 * ----------
 * p : ProviderId
 *     Penyedia: "anthropic", "openai", atau "gemini".
 *
 * Returns
 * -------
 * boolean
 *     true bila environment variable API key-nya tidak kosong.
 */
export function providerKeyConfigured(p: ProviderId) {
  if (p === "anthropic") return Boolean(process.env.ANTHROPIC_API_KEY);
  if (p === "openai") return Boolean(process.env.OPENAI_API_KEY);
  return Boolean(process.env.GEMINI_API_KEY);
}

/**
 * Membaca pengaturan aplikasi, digabung dengan nilai bawaan.
 *
 * Returns
 * -------
 * Promise<AppSettings>
 *     Pengaturan lengkap.
 */
export async function getSettings(): Promise<AppSettings> {
  const s = await get<AppSettings & { id: string }>("sa_settings", "app");
  return { ...DEFAULT_SETTINGS, ...(s ?? {}) };
}

/**
 * Menyimpan pengaturan aplikasi.
 *
 * Parameters
 * ----------
 * s : AppSettings
 *     Pengaturan lengkap yang akan disimpan.
 *
 * Returns
 * -------
 * Promise<void>
 */
export async function saveSettings(s: AppSettings) {
  await put("sa_settings", { id: "app", createdAt: "2026-01-01T00:00:00.000Z", ...s });
}
