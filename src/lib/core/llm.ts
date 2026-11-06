import type { AppSettings, CostInfo, ProviderId } from "../types";

export interface LlmResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export class LlmError extends Error {}

async function postJson(url: string, headers: Record<string, string>, body: unknown, timeoutMs = 45000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      let msg = text.slice(0, 300);
      try {
        const j = JSON.parse(text);
        msg = j?.error?.message ?? j?.message ?? msg;
      } catch {}
      throw new LlmError(`HTTP ${res.status}: ${msg}`);
    }
    return JSON.parse(text);
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new LlmError("Waktu tunggu Layanan LLM habis (45 detik).");
    throw e instanceof LlmError ? e : new LlmError((e as Error).message);
  } finally {
    clearTimeout(t);
  }
}

export async function callLlm(
  provider: ProviderId,
  model: string,
  system: string,
  prompt: string,
  maxTokens = 900,
): Promise<LlmResponse> {
  if (provider === "anthropic") {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new LlmError("ANTHROPIC_API_KEY belum diisi di environment variable.");
    const j = await postJson(
      "https://api.anthropic.com/v1/messages",
      { "x-api-key": key, "anthropic-version": "2023-06-01" },
      { model, max_tokens: maxTokens, system, messages: [{ role: "user", content: prompt }] },
    );
    const text = (j.content ?? []).map((c: { type: string; text?: string }) => (c.type === "text" ? c.text : "")).join("");
    return { text, inputTokens: j.usage?.input_tokens ?? 0, outputTokens: j.usage?.output_tokens ?? 0 };
  }
  if (provider === "openai") {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new LlmError("OPENAI_API_KEY belum diisi di environment variable.");
    const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
    const j = await postJson(
      `${base}/chat/completions`,
      { authorization: `Bearer ${key}` },
      {
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
      },
    );
    return {
      text: j.choices?.[0]?.message?.content ?? "",
      inputTokens: j.usage?.prompt_tokens ?? 0,
      outputTokens: j.usage?.completion_tokens ?? 0,
    };
  }
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new LlmError("GEMINI_API_KEY belum diisi di environment variable.");
  const j = await postJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    { "x-goog-api-key": key },
    {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens * 3 },
    },
  );
  const text = (j.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
  return {
    text,
    inputTokens: j.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: j.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

/** Mengambil objek JSON pertama dari teks jawaban LLM. */
export function extractJson<T>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

export class CostMeter {
  cost: CostInfo = { calls: 0, inputTokens: 0, outputTokens: 0, usd: 0, idr: 0 };
  constructor(private settings: AppSettings) {}
  add(r: LlmResponse) {
    const price = this.settings.prices[this.settings.provider];
    this.cost.calls++;
    this.cost.inputTokens += r.inputTokens;
    this.cost.outputTokens += r.outputTokens;
    this.cost.usd = (this.cost.inputTokens * price.input + this.cost.outputTokens * price.output) / 1_000_000;
    this.cost.idr = Math.round(this.cost.usd * this.settings.usdToIdr);
  }
}

export const SYSTEM_PROMPT = `Anda adalah agen analisis performa pada ServerAgent Core Module.
Anda membantu menilai kesiapan performa release candidate sebelum dipromosikan dari environment Dev ke Production,
dan menilai insiden performa pasca go-live. Data yang Anda terima sudah disamarkan; jangan mencoba menebak nilai aslinya.
Jawab dalam Bahasa Indonesia yang ringkas dan teknis. Bila diminta JSON, balas HANYA dengan satu objek JSON yang valid tanpa teks lain.`;
