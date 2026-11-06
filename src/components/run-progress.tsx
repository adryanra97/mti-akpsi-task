"use client";

import { useCallback, useState } from "react";
import { CircleCheck, CircleDashed, CircleMinus, LoaderCircle, TriangleAlert } from "lucide-react";
import { cx } from "./ui";

export interface StepState {
  id: string;
  label: string;
  state: "run" | "done" | "warn" | "skip";
  note?: string;
}

export function useStreamRun() {
  const [steps, setSteps] = useState<StepState[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const start = useCallback(async (url: string, body?: unknown) => {
    setSteps([]);
    setError(null);
    setDone(false);
    setRunning(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Permintaan gagal (HTTP ${res.status}).`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let ok = false;
      for (;;) {
        const { value, done: end } = await reader.read();
        if (end) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line);
          if (ev.type === "step") {
            setSteps((prev) => {
              const i = prev.findIndex((p) => p.id === ev.id);
              if (i < 0) return [...prev, ev];
              const next = [...prev];
              next[i] = ev;
              return next;
            });
          } else if (ev.type === "error") throw new Error(ev.message);
          else if (ev.type === "done") ok = true;
        }
      }
      if (!ok) throw new Error("Koneksi terputus sebelum analisis selesai. Jalankan ulang analisis.");
      setDone(true);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setRunning(false);
    }
  }, []);

  return { steps, running, error, done, start };
}

export function RunProgress({ steps, running }: { steps: StepState[]; running: boolean }) {
  if (!steps.length && !running) return null;
  if (!running) {
    const warn = steps.filter((s) => s.state === "warn" || s.state === "skip").length;
    return (
      <details className="rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-[14px]">
        <summary className="cursor-pointer">
          <span className="inline-flex items-center gap-2">
            <CircleCheck className="h-4 w-4 text-pass" aria-hidden />
            Analisis selesai: {steps.length} langkah{warn ? `, ${warn} dengan catatan` : ""}
          </span>
        </summary>
        <div className="mt-2">
          <StepList steps={steps} />
        </div>
      </details>
    );
  }
  return (
    <div className="rounded-lg border border-line bg-surface-2 p-4" aria-live="polite">
      <p className="mb-2 text-[13.5px] font-medium">
        {running ? "Core Module sedang bekerja…" : "Langkah Core Module"}
      </p>
      <StepList steps={steps} />
      {steps.every((s) => s.state !== "run") && (
        <p className="mt-1.5 flex gap-2.5 text-[14px] text-ink-3">
          <CircleDashed className="running-dot mt-0.5 h-4 w-4" aria-hidden /> Menyiapkan langkah berikutnya…
        </p>
      )}
    </div>
  );
}

function StepList({ steps }: { steps: StepState[] }) {
  return (
      <ol className="grid gap-1.5">
        {steps.map((s) => (
          <li key={s.id} className="flex gap-2.5 text-[14px]">
            <span className="mt-0.5 shrink-0">
              {s.state === "run" ? (
                <LoaderCircle className="h-4 w-4 animate-spin text-accent" aria-label="Berjalan" />
              ) : s.state === "done" ? (
                <CircleCheck className="h-4 w-4 text-pass" aria-label="Selesai" />
              ) : s.state === "warn" ? (
                <TriangleAlert className="h-4 w-4 text-cond" aria-label="Selesai dengan catatan" />
              ) : (
                <CircleMinus className="h-4 w-4 text-na" aria-label="Dilewati" />
              )}
            </span>
            <span className="min-w-0">
              <span className={cx(s.state === "run" ? "font-medium" : "text-ink")}>{s.label}</span>
              {s.note && <span className="block text-[13px] text-ink-3">{s.note}</span>}
            </span>
          </li>
        ))}
      </ol>
  );
}
