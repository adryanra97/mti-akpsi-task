import { Check } from "lucide-react";
import { cx } from "./ui";

/** Penunjuk posisi dalam alur use case, agar pengguna tahu langkah yang sudah dan belum dilalui. */
export function Stepper({ steps, current }: { steps: { label: string; detail?: string }[]; current: number }) {
  return (
    <nav aria-label="Tahapan alur">
      <ol className="grid grid-cols-2 gap-2 sm:flex sm:gap-0">
        {steps.map((s, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={s.label} className="flex flex-1 items-center gap-2.5 sm:pr-3" aria-current={active ? "step" : undefined}>
              <span
                className={cx(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[13px] font-semibold",
                  done && "border-pass bg-pass text-white dark:text-bg",
                  active && "border-accent bg-accent text-accent-ink",
                  !done && !active && "border-line-strong text-ink-3",
                )}
              >
                {done ? <Check className="h-4 w-4" aria-label="Selesai" /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className={cx("block text-[14px] leading-tight", active ? "font-semibold" : done ? "text-ink" : "text-ink-3")}>{s.label}</span>
                {s.detail && <span className="block truncate text-[12.5px] text-ink-3">{s.detail}</span>}
              </span>
              {i < steps.length - 1 && <span className="ml-auto hidden h-px min-w-4 flex-1 bg-line-strong sm:block" aria-hidden />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
