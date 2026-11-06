/**
 * Nilai bawaan pengaturan aplikasi, label penyedia LLM, dan saran nama model.
 *
 * Dipisah dari settings.ts agar dapat diimpor komponen klien tanpa kode server.
 */
import type { AppSettings, ProviderId } from "./types";

export const DEFAULT_SETTINGS: AppSettings = {
  mode: "demo",
  provider: "anthropic",
  models: {
    anthropic: "claude-sonnet-5-5",
    openai: "gpt-5-mini",
    gemini: "gemini-3.8-flash",
  },
  prices: {
    anthropic: { input: 3, output: 15 },
    openai: { input: 0.25, output: 2 },
    gemini: { input: 0.375, output: 1.88 },
  },
  confidenceThreshold: 0.7,
  samples: 3,
  simulateElkDown: false,
  usdToIdr: 16500,
  cachedBaselines: {},
};

export const PROVIDER_LABEL: Record<ProviderId, string> = {
  anthropic: "Claude (Anthropic)",
  openai: "OpenAI / kompatibel OpenAI",
  gemini: "Gemini (Google)",
};

export const MODEL_SUGGESTIONS: Record<ProviderId, string[]> = {
  anthropic: ["claude-sonnet-5-5", "claude-sonnet-5", "claude-opus-5-5", "claude-haiku-5-5"],
  openai: ["gpt-5-mini", "gpt-5", "gpt-5.6-sol"],
  gemini: ["gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-3.1-pro"],
};


/**
 * Model yang sudah dihentikan penyedianya, beserta penggantinya.
 *
 * Dipakai saat membaca pengaturan tersimpan agar pengaturan lama tidak terus memanggil
 * model yang sudah tidak tersedia (misalnya Gemini mengembalikan 404 NOT_FOUND).
 */
export const RETIRED_MODELS: Record<string, { model: string; price: { input: number; output: number } }> = {
  "gemini-2.5-flash": { model: "gemini-3.8-flash", price: { input: 0.375, output: 1.88 } },
  "gemini-2.5-flash-lite": { model: "gemini-3.5-flash-lite", price: { input: 0.15, output: 1.25 } },
  "gemini-2.0-flash": { model: "gemini-3.8-flash", price: { input: 0.375, output: 1.88 } },
  "gemini-2.5-pro": { model: "gemini-3.1-pro", price: { input: 2, output: 12 } },
};
