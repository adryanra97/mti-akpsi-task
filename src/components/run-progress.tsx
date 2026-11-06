"use client";

/**
 * Klien Core Module: mengajukan PermintaanAnalisis, membaca aliran progres NDJSON, dan
 * menampilkan status permintaan serta langkah analisis secara langsung.
 */
import { useCallback, useState } from "react";
import { CircleCheck, CircleDashed, CircleMinus, LoaderCircle, TriangleAlert } from "lucide-react";
import { cx } from "./ui";
import type { RequestStatus } from "@/lib/types";
import { REQUEST_STATUS_LABEL } from "@/lib/verdict";

export interface StepState {
  id: string;
  label: string;
  state: "run" | "done" | "warn" | "skip";
  note?: string;
}

const ORDER: RequestStatus[] = ["Diterima", "Disamarkan", "Direncanakan", "Dijalankan", "Dinilai", "Selesai"];

/**
 * Membaca JSON dari respons, atau melempar galat dengan pesan dari server.
 *
 * Parameters
 * ----------
 * res : Response
 *     Respons fetch.
 *
 * Returns
 * -------
 * Promise<any>
 *     Isi JSON bila status OK.
 *
 * Raises
 * ------
 * Error
 *     Bila status tidak OK; pesan diambil dari field "error" bila ada.
 */
async function jsonOrError(res: Response) {
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? j.detail ?? `Permintaan gagal (HTTP ${res.status}).`);
  return j;
}

/**
 * Hook untuk menjalankan satu PermintaanAnalisis dari awal sampai hasil tersimpan.
 *
 * Alur: Dashboard menerbitkan token (requestUrl), Core Module Python mengalirkan progres,
 * lalu hasil bertanda tangan dikirim kembali ke Dashboard (resultUrl) untuk diverifikasi dan disimpan.
 *
 * Returns
 * -------
 * { steps, statuses, running, error, start }
 *     steps : StepState[]
 *         Langkah analisis terbaru, diperbarui setiap event.
 *     statuses : RequestStatus[]
 *         Status permintaan yang sudah dilalui.
 *     running : boolean
 *         true selama analisis berjalan.
 *     error : string | null
 *         Pesan galat terakhir.
 *     start : (requestUrl: string, resultUrl: string, body?: unknown) => Promise<boolean>
 *         Menjalankan analisis; bernilai true bila hasil berhasil disimpan.
 */
export function useCoreRun() {
  const [steps, setSteps] = useState<StepState[]>([]);
  const [statuses, setStatuses] = useState<RequestStatus[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async (requestUrl: string, resultUrl: string, body?: unknown) => {
    setSteps([]);
    setStatuses([]);
    setError(null);
    setRunning(true);
    try {
      const { token, coreUrl } = await jsonOrError(
        await fetch(requestUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) }),
      );
      const res = await fetch(coreUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.detail ?? j.error ?? `Core Module tidak dapat dihubungi (HTTP ${res.status}).`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let final: { hasil: string; tanda: string } | null = null;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
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
          } else if (ev.type === "status") setStatuses((p) => [...p, ev.status]);
          else if (ev.type === "error") throw new Error(ev.message);
          else if (ev.type === "done") final = { hasil: ev.hasil, tanda: ev.tanda };
        }
      }
      if (!final) throw new Error("Koneksi ke Core Module terputus sebelum analisis selesai. Klik ajukan ulang; bila memakai mode LLM dan terus terulang, kurangi varian what-if atau beralih ke mode demo di Pengaturan.");
      await jsonOrError(
        await fetch(resultUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(final) }),
      );
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setRunning(false);
    }
  }, []);

  return { steps, statuses, running, error, start };
}

/**
 * Jalur status PermintaanAnalisis (Diterima sampai Selesai) dengan penanda status yang sudah dilalui.
 *
 * Parameters
 * ----------
 * statuses : RequestStatus[]
 *     Status yang sudah dilalui; "Dihentikan" ditandai khusus.
 *
 * Returns
 * -------
 * JSX.Element
 */
function StatusTrack({ statuses }: { statuses: RequestStatus[] }) {
  const stopped = statuses.includes("Dihentikan");
  const order = stopped ? (["Diterima", "Disamarkan", "Direncanakan", "Dijalankan", "Dihentikan", "Dinilai", "Selesai"] as RequestStatus[]) : ORDER;
  const current = statuses.at(-1);
  return (
    <ol className="mb-3 flex flex-wrap gap-1.5" aria-label="Status permintaan analisis">
      {order.map((s) => {
        const reached = statuses.includes(s);
        return (
          <li
            key={s}
            className={cx(
              "rounded-md px-2 py-0.5 text-[12.5px] font-medium",
              s === current ? "bg-primary text-primary-ink" : reached ? (s === "Dihentikan" ? "bg-na-soft text-na" : "bg-pass-soft text-pass") : "bg-sunken text-ink-3",
            )}
            aria-current={s === current ? "step" : undefined}
          >
            {REQUEST_STATUS_LABEL[s]}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Daftar langkah analisis dengan ikon status (berjalan, selesai, peringatan, dilewati).
 *
 * Parameters
 * ----------
 * steps : StepState[]
 *     Langkah dari event Core Module.
 *
 * Returns
 * -------
 * JSX.Element
 */
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
              <CircleMinus className="h-4 w-4 text-na" aria-label="Dihentikan" />
            )}
          </span>
          <span className="min-w-0">
            <span className={cx(s.state === "run" && "font-medium")}>{s.label}</span>
            {s.note && <span className="block text-[13px] text-ink-3">{s.note}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Panel progres analisis untuk ditampilkan selama dan sesudah permintaan berjalan.
 *
 * Parameters
 * ----------
 * steps : StepState[]
 *     Langkah analisis.
 * statuses : RequestStatus[]
 *     Status permintaan yang sudah dilalui.
 * running : boolean
 *     true selama analisis berjalan.
 *
 * Returns
 * -------
 * JSX.Element | null
 *     null bila belum ada langkah.
 */
export function RunProgress({ steps, statuses, running }: { steps: StepState[]; statuses: RequestStatus[]; running: boolean }) {
  if (!steps.length && !running) return null;
  if (!running) {
    const warn = steps.filter((s) => s.state === "warn" || s.state === "skip").length;
    return (
      <details className="rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-[14px]">
        <summary className="cursor-pointer">
          <span className="inline-flex items-center gap-2">
            <CircleCheck className="h-4 w-4 text-pass" aria-hidden />
            Permintaan analisis selesai: {steps.length} langkah{warn ? `, ${warn} dengan catatan` : ""}
          </span>
        </summary>
        <div className="mt-3">
          <StatusTrack statuses={statuses} />
          <StepList steps={steps} />
        </div>
      </details>
    );
  }
  return (
    <div className="rounded-lg border border-line bg-surface-2 p-4" aria-live="polite">
      <p className="mb-2 text-[13.5px] font-medium">Core Module sedang memproses permintaan analisis…</p>
      <StatusTrack statuses={statuses} />
      <StepList steps={steps} />
      {steps.every((s) => s.state !== "run") && (
        <p className="mt-1.5 flex gap-2.5 text-[14px] text-ink-3">
          <CircleDashed className="running-dot mt-0.5 h-4 w-4" aria-hidden /> {steps.length ? "Menyiapkan langkah berikutnya…" : "Menghubungi Core Module…"}
        </p>
      )}
    </div>
  );
}
