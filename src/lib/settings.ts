import "server-only";
import { get, put } from "./db";
import type { AppSettings, ProviderId } from "./types";
import { DEFAULT_SETTINGS } from "./settings-defaults";
export { DEFAULT_SETTINGS, PROVIDER_LABEL, MODEL_SUGGESTIONS } from "./settings-defaults";

export function providerKeyConfigured(p: ProviderId) {
  if (p === "anthropic") return Boolean(process.env.ANTHROPIC_API_KEY);
  if (p === "openai") return Boolean(process.env.OPENAI_API_KEY);
  return Boolean(process.env.GEMINI_API_KEY);
}

export async function getSettings(): Promise<AppSettings> {
  const s = await get<AppSettings & { id: string }>("sa_settings", "app");
  return { ...DEFAULT_SETTINGS, ...(s ?? {}) };
}

export async function saveSettings(s: AppSettings) {
  await put("sa_settings", { id: "app", createdAt: "2026-01-01T00:00:00.000Z", ...s });
}
