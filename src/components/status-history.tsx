import type { StatusEvent } from "@/lib/types";
import { History } from "lucide-react";
import { cx } from "./ui";
import { fmtDate } from "@/lib/format";

/** Riwayat transisi state machine (Bab 10.3): status, waktu, pelaku, dan event pemicunya. */
export function StatusHistory<S extends string>({
  history,
  labels,
  states,
  title,
}: {
  history: StatusEvent<S>[];
  labels: Record<S, string>;
  states: S[];
  title: string;
}) {
  const current = history.at(-1)?.status;
  // Ringkas secara bawaan: status saat ini sudah tampil di header dan stepper, jadi detail state machine
  // dan riwayatnya baru tampil saat dibuka (progressive disclosure, tanpa informasi ganda).
  return (
    <details className="group">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded text-[13.5px] text-accent hover:underline">
        <History className="h-3.5 w-3.5" aria-hidden />
        <span className="group-open:hidden">{title}: lihat riwayat ({history.length} perubahan)</span>
        <span className="hidden group-open:inline">Sembunyikan riwayat {title.toLowerCase()}</span>
      </summary>
      <div className="mt-2 rounded-xl border border-line bg-surface px-5 py-4">
        <ol className="flex flex-wrap gap-1" aria-label="Status pada state machine">
          {states.map((s) => {
            const reached = history.some((h) => h.status === s);
            return (
              <li
                key={s}
                className={cx(
                  "rounded px-1.5 py-0.5 text-[12px] font-medium",
                  s === current ? "bg-primary text-primary-ink" : reached ? "bg-sunken text-ink-2" : "border border-dashed border-line text-ink-3",
                )}
                aria-current={s === current ? "true" : undefined}
              >
                {labels[s]}
              </li>
            );
          })}
        </ol>
        <ol className="mt-3 border-t border-line pt-2">
          {history.map((h, i) => (
            <li key={i} className="grid grid-cols-[110px_1fr] gap-3 py-1.5 text-[13.5px] sm:grid-cols-[150px_1fr]">
              <span className="text-ink-3">{fmtDate(h.at, true)}</span>
              <span>
                <span className="font-medium">{labels[h.status]}</span>
                <span className="text-ink-2">
                  {" "}
                  oleh {h.by}
                  {h.note ? `. ${h.note}` : ""}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </details>
  );
}
