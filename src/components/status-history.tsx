import type { StatusEvent } from "@/lib/types";
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
  return (
    <details className="group rounded-xl border border-line bg-surface">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3.5">
        <span className="font-semibold">{title}</span>
        <ol className="flex flex-1 flex-wrap gap-1" aria-label="Status pada state machine">
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
        <span className="text-[13.5px] text-accent group-open:hidden">Riwayat</span>
        <span className="hidden text-[13.5px] text-accent group-open:inline">Sembunyikan</span>
      </summary>
      <ol className="border-t border-line px-5 py-3">
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
    </details>
  );
}
