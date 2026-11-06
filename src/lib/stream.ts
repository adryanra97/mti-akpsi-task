import "server-only";
import type { EngineEvent } from "./core/engine";

/** Membuat respons NDJSON yang mengalirkan progres langkah Core Module ke Dashboard. */
export function ndjsonStream(work: (emit: (e: EngineEvent) => void) => Promise<unknown>) {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: EngineEvent) => controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      try {
        const payload = await work(emit);
        emit({ type: "done", payload });
      } catch (err) {
        emit({ type: "error", message: (err as Error).message || "Analisis gagal dijalankan." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" },
  });
}

/** Menolak permintaan lintas situs pada API yang mengubah data (pertahanan tambahan selain cookie SameSite). */
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(req.url).host || origin === `https://${req.headers.get("host")}`;
  } catch {
    return false;
  }
}
