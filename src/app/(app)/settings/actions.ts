"use server";

/**
 * Server action Pengaturan (khusus Technical Lead): mode analisis, penyedia LLM, uji koneksi, dan reset data contoh.
 */
import { revalidatePath } from "next/cache";
import { audit, requirePermission } from "@/lib/auth";
import { getSettings, providerKeyConfigured, saveSettings, PROVIDER_LABEL } from "@/lib/settings";
import { signCoreToken } from "@/lib/core-request";
import { resetAll } from "@/lib/db";
import type { ProviderId } from "@/lib/types";

export interface SettingsState {
  ok?: string;
  error?: string;
  errors?: Record<string, string>;
}

const PROVIDERS: ProviderId[] = ["anthropic", "openai", "gemini"];
const ENV_NAME: Record<ProviderId, string> = { anthropic: "ANTHROPIC_API_KEY", openai: "OPENAI_API_KEY", gemini: "GEMINI_API_KEY" };

/**
 * Menyimpan pengaturan Core Module.
 *
 * Mode LLM ditolak bila API key penyedia belum diatur di environment variable.
 *
 * Parameters
 * ----------
 * _ : SettingsState
 *     State sebelumnya (tidak dipakai).
 * f : FormData
 *     mode, provider, model, priceIn, priceOut, confidenceThreshold, samples, usdToIdr, simulateElkDown.
 *
 * Returns
 * -------
 * Promise<SettingsState>
 *     Pesan berhasil atau galat validasi per field.
 */
export async function updateSettings(_: SettingsState, f: FormData): Promise<SettingsState> {
  const user = await requirePermission("settings.manage");
  const s = await getSettings();
  const mode = f.get("mode") === "llm" ? "llm" : "demo";
  const provider = String(f.get("provider") ?? s.provider) as ProviderId;
  const errors: Record<string, string> = {};
  if (!PROVIDERS.includes(provider)) errors.provider = "Pilih penyedia LLM.";
  const model = String(f.get("model") ?? "").trim();
  const num = (k: string) => Number(String(f.get(k) ?? "").replace(",", "."));
  const priceIn = num("priceIn");
  const priceOut = num("priceOut");
  const threshold = num("confidenceThreshold");
  const samples = num("samples");
  const rate = num("usdToIdr");

  if (mode === "llm" && !errors.provider && !providerKeyConfigured(provider)) {
    errors.provider = `${ENV_NAME[provider]} belum diisi. Tambahkan di Vercel (Settings, lalu Environment Variables), lalu redeploy.`;
  }
  if (!model) errors.model = "Isi nama model.";
  if (!(priceIn >= 0)) errors.priceIn = "Isi harga input (0 atau lebih).";
  if (!(priceOut >= 0)) errors.priceOut = "Isi harga output (0 atau lebih).";
  if (!(threshold >= 0.3 && threshold <= 0.99)) errors.confidenceThreshold = "Ambang keyakinan antara 0,30 dan 0,99.";
  if (!(Number.isInteger(samples) && samples >= 1 && samples <= 5)) errors.samples = "Jumlah sampel 1 sampai 5.";
  if (!(rate > 0)) errors.usdToIdr = "Isi kurs lebih dari 0.";
  if (Object.keys(errors).length) return { errors, error: "Pengaturan belum disimpan. Periksa isian yang ditandai." };

  await saveSettings({
    ...s,
    mode,
    provider,
    models: { ...s.models, [provider]: model },
    prices: { ...s.prices, [provider]: { input: priceIn, output: priceOut } },
    confidenceThreshold: threshold,
    samples,
    usdToIdr: rate,
    simulateElkDown: f.get("simulateElkDown") === "on",
  });
  await audit(user, "Mengubah pengaturan", "Mode analisis", mode === "llm" ? `${PROVIDER_LABEL[provider]} ${model}` : "Demo");
  revalidatePath("/", "layout");
  return { ok: mode === "llm" ? `Tersimpan. Analisis berikutnya memakai ${PROVIDER_LABEL[provider]} (${model}).` : "Tersimpan. Analisis berikutnya memakai mode demo." };
}

/**
 * Menerbitkan token singkat untuk uji koneksi LLM oleh Core Module (/api/py/uji-koneksi).
 *
 * Parameters
 * ----------
 * provider : ProviderId
 *     Penyedia LLM.
 * model : string
 *     Nama model.
 *
 * Returns
 * -------
 * Promise<{ ok: boolean; message?: string; token?: string }>
 *     Token berlaku 1 menit, atau pesan bila penyedia tidak dikenal, API key kosong, atau nama model tidak valid.
 */
export async function testConnectionToken(provider: ProviderId, model: string): Promise<{ ok: boolean; message?: string; token?: string }> {
  await requirePermission("settings.manage");
  if (!PROVIDERS.includes(provider)) return { ok: false, message: "Penyedia tidak dikenal." };
  if (!providerKeyConfigured(provider)) return { ok: false, message: `${ENV_NAME[provider]} belum diisi di environment variable.` };
  if (!/^[\w.:\-/]{1,80}$/.test(model)) return { ok: false, message: "Nama model tidak valid." };
  return { ok: true, token: await signCoreToken("uji-koneksi", { provider, model }, "1m") };
}

/**
 * Menghapus seluruh data lalu mengisi ulang data contoh.
 *
 * Returns
 * -------
 * Promise<{ ok: boolean; message: string }>
 */
export async function resetDemoData(): Promise<{ ok: boolean; message: string }> {
  const user = await requirePermission("settings.manage");
  await resetAll();
  await audit(user, "Mengembalikan data contoh", "Database");
  revalidatePath("/", "layout");
  return { ok: true, message: "Data contoh sudah dipulihkan." };
}
