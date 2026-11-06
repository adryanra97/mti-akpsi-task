"use server";

import { revalidatePath } from "next/cache";
import { audit, requirePermission } from "@/lib/auth";
import { getSettings, providerKeyConfigured, saveSettings, PROVIDER_LABEL } from "@/lib/settings";
import { callLlm } from "@/lib/core/llm";
import { resetAll } from "@/lib/db";
import type { ProviderId } from "@/lib/types";

export interface SettingsState {
  ok?: string;
  error?: string;
  errors?: Record<string, string>;
}

const PROVIDERS: ProviderId[] = ["anthropic", "openai", "gemini"];
const ENV_NAME: Record<ProviderId, string> = { anthropic: "ANTHROPIC_API_KEY", openai: "OPENAI_API_KEY", gemini: "GEMINI_API_KEY" };

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

export async function testConnection(provider: ProviderId, model: string): Promise<{ ok: boolean; message: string }> {
  await requirePermission("settings.manage");
  if (!PROVIDERS.includes(provider)) return { ok: false, message: "Penyedia tidak dikenal." };
  if (!providerKeyConfigured(provider)) return { ok: false, message: `${ENV_NAME[provider]} belum diisi di environment variable.` };
  const t0 = Date.now();
  try {
    const r = await callLlm(provider, model, "Jawab sangat singkat.", 'Balas persis dengan kata: "siap"', 20);
    return { ok: true, message: `Tersambung dalam ${((Date.now() - t0) / 1000).toFixed(1)} detik. Jawaban model: "${r.text.trim().slice(0, 40)}"` };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

export async function resetDemoData(): Promise<{ ok: boolean; message: string }> {
  const user = await requirePermission("settings.manage");
  await resetAll();
  await audit(user, "Mengembalikan data contoh", "Database");
  revalidatePath("/", "layout");
  return { ok: true, message: "Data contoh sudah dipulihkan." };
}
