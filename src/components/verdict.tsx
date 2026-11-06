import { CircleCheck, CircleHelp, OctagonX, TriangleAlert } from "lucide-react";
import type { Criteria, Indicators, ScenarioResult, TraceStep, Verdict } from "@/lib/types";
import { VERDICT_HELP, VERDICT_LABEL } from "@/lib/verdict";
import { cx } from "./ui";
import { fmtNum } from "@/lib/format";

export const VERDICT_TONE: Record<Verdict, { text: string; bg: string; border: string; varName: string }> = {
  LOLOS: { text: "text-pass", bg: "bg-pass-soft", border: "border-pass/40", varName: "--pass" },
  LOLOS_BERSYARAT: { text: "text-cond", bg: "bg-cond-soft", border: "border-cond/40", varName: "--cond" },
  TIDAK_LOLOS: { text: "text-fail", bg: "bg-fail-soft", border: "border-fail/40", varName: "--fail" },
  TIDAK_DAPAT_DINILAI: { text: "text-na", bg: "bg-na-soft", border: "border-na/40", varName: "--na" },
};

export function VerdictIcon({ verdict, className }: { verdict: Verdict; className?: string }) {
  const Icon = { LOLOS: CircleCheck, LOLOS_BERSYARAT: TriangleAlert, TIDAK_LOLOS: OctagonX, TIDAK_DAPAT_DINILAI: CircleHelp }[verdict];
  return <Icon className={className} aria-hidden />;
}

export function VerdictBadge({ verdict, size = "md" }: { verdict: Verdict | null; size?: "sm" | "md" }) {
  if (!verdict) return <span className="text-ink-3">–</span>;
  const t = VERDICT_TONE[verdict];
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md font-medium",
        t.bg,
        t.text,
        size === "sm" ? "px-1.5 py-0.5 text-[12.5px]" : "px-2 py-1 text-[13.5px]",
      )}
      title={VERDICT_HELP[verdict]}
    >
      <VerdictIcon verdict={verdict} className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
      {VERDICT_LABEL[verdict]}
    </span>
  );
}

/** Lintasan kapasitas: posisi tiap skenario beban terhadap kapasitas transaksi maksimum. */
export function CapacityRunway({ scenarios, maxTps }: { scenarios: ScenarioResult[]; maxTps: number | null }) {
  const highest = Math.max(...scenarios.map((s) => s.tps), maxTps ?? 0);
  const scale = Math.max(highest * 1.12, 1);
  const pct = (v: number) => Math.min((v / scale) * 100, 100);
  const pos = (v: number) => `${pct(v)}%`;
  /** Label di dekat tepi ditambatkan ke dalam agar tidak terpotong. */
  const anchor = (v: number) => (pct(v) > 82 ? "-translate-x-full" : pct(v) < 12 ? "translate-x-0" : "-translate-x-1/2");
  const short = (s: ScenarioResult) => (s.kind === "normal" ? "Normal" : s.kind === "puncak" ? "Puncak" : s.label.split(" ")[1]);

  return (
    <figure className="w-full">
      <div className="relative h-[86px]">
        <div className="absolute inset-x-0 top-[34px] h-[18px] overflow-hidden rounded-md bg-sunken">
          {maxTps !== null && maxTps > 0 && (
            <>
              <div className="absolute inset-y-0 left-0 bg-pass-soft" style={{ width: pos(maxTps) }} />
              <div
                className="absolute inset-y-0 right-0"
                style={{
                  left: pos(maxTps),
                  background: "repeating-linear-gradient(135deg, var(--fail-soft) 0 6px, transparent 6px 12px)",
                }}
              />
            </>
          )}
        </div>
        {maxTps !== null && maxTps > 0 && (
          <div className="absolute top-[26px] h-[34px] w-0.5 bg-ink" style={{ left: pos(maxTps) }}>
            <span className={cx("absolute -top-[26px] whitespace-nowrap text-[12.5px] font-semibold", anchor(maxTps))}>
              Maks {fmtNum(maxTps)} TPS
            </span>
          </div>
        )}
        {scenarios.map((s, i) => {
          const t = VERDICT_TONE[s.status];
          const below = i % 2 === 1 || s.kind === "puncak";
          return (
            <div key={s.key} className="absolute top-[30px]" style={{ left: pos(s.tps) }}>
              <span
                className="absolute h-[26px] w-[3px] -translate-x-1/2 rounded-full"
                style={{ background: `var(${t.varName})` }}
                aria-hidden
              />
              <span
                className={cx(
                  "absolute whitespace-nowrap text-[12px]",
                  anchor(s.tps),
                  below ? "top-[30px]" : "-top-[24px]",
                  t.text,
                )}
              >
                {short(s)} {fmtNum(s.tps)}
              </span>
            </div>
          );
        })}
      </div>
      <figcaption className="mt-1 text-[12.5px] text-ink-3">
        Area hijau: beban yang masih memenuhi kriteria penerimaan. Area arsir: melewati kapasitas maksimum.
      </figcaption>
    </figure>
  );
}

const ROWS: { key: keyof Indicators; label: string; unit: string; limit?: (c: Criteria) => number; util?: boolean }[] = [
  { key: "cpuPct", label: "Kebutuhan CPU", unit: "%", limit: (c) => c.maxCpuPct, util: true },
  { key: "memPct", label: "Memori", unit: "%", limit: (c) => c.maxMemPct, util: true },
  { key: "threadSatPct", label: "Kejenuhan thread pool", unit: "%", limit: () => 100, util: true },
  { key: "connSatPct", label: "Kejenuhan connection pool", unit: "%", limit: () => 100, util: true },
  { key: "netPct", label: "Jaringan", unit: "%", limit: () => 90, util: true },
  { key: "p95Ms", label: "Response time p95", unit: " ms", limit: (c) => c.maxP95Ms },
  { key: "errorRatePct", label: "Error rate", unit: "%", limit: (c) => c.maxErrorRatePct },
];

export function IndicatorTable({ scenarios, criteria, useLabels }: { scenarios: ScenarioResult[]; criteria: Criteria; useLabels?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-[14px]">
        <caption className="sr-only">Indikator sumber daya per skenario beban dibanding batas kriteria</caption>
        <thead>
          <tr className="border-b border-line text-left text-[13px] text-ink-3">
            <th scope="col" className="py-2 pr-3 font-medium">Indikator</th>
            {scenarios.map((s) => (
              <th key={s.key} scope="col" className="px-3 py-2 text-right font-medium">
                {useLabels ? s.label : s.kind === "normal" ? "Normal" : s.kind === "puncak" ? "Puncak" : s.label.split(" (")[0]}
                <span className="block font-normal">{fmtNum(s.tps)} TPS</span>
              </th>
            ))}
            <th scope="col" className="py-2 pl-3 text-right font-medium">Batas</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => {
            const limit = r.limit?.(criteria);
            return (
              <tr key={r.key} className="border-b border-line last:border-0">
                <th scope="row" className="py-2 pr-3 text-left font-normal text-ink-2">{r.label}</th>
                {scenarios.map((s) => {
                  const v = s.indicators?.[r.key];
                  const over = v !== undefined && limit !== undefined && v > limit;
                  const near = !over && r.util && v !== undefined && v > 75;
                  return (
                    <td key={s.key} className="px-3 py-2 text-right">
                      {v === undefined ? (
                        <span className="text-ink-3">tidak dihitung</span>
                      ) : (
                        <span className={cx(over && "font-semibold text-fail", near && "text-cond")}>
                          {fmtNum(v, r.key === "errorRatePct" ? 2 : 1)}
                          {r.unit}
                          {over && <span className="sr-only"> (melebihi batas)</span>}
                        </span>
                      )}
                      {r.util && v !== undefined && (
                        <span className="mt-1 ml-auto block h-1 w-20 overflow-hidden rounded-full bg-sunken" aria-hidden>
                          <span
                            className={cx("block h-full rounded-full", over ? "bg-fail" : near ? "bg-cond" : "bg-pass")}
                            style={{ width: `${Math.min(v, 100)}%` }}
                          />
                        </span>
                      )}
                    </td>
                  );
                })}
                <td className="py-2 pl-3 text-right text-ink-3">
                  {limit !== undefined ? `≤ ${fmtNum(limit, 2)}${r.unit}` : "–"}
                </td>
              </tr>
            );
          })}
          <tr>
            <th scope="row" className="py-2 pr-3 text-left font-normal text-ink-2">Jalur analisis</th>
            {scenarios.map((s) => (
              <td key={s.key} className="px-3 py-2 text-right text-[13px]">
                <RouteTag route={s.route} />
              </td>
            ))}
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export const ROUTE_LABEL: Record<string, string> = {
  digital_twin: "Digital twin",
  estimasi_penalaran: "Estimasi penalaran",
  fallback_twin: "Fallback ke twin",
  dihentikan: "Dihentikan",
  sistem: "Sistem",
  llm: "Layanan LLM",
};

export function RouteTag({ route }: { route: string }) {
  const tone =
    route === "estimasi_penalaran"
      ? "bg-cond-soft text-cond"
      : route === "dihentikan"
        ? "bg-na-soft text-na"
        : route === "fallback_twin"
          ? "bg-accent-soft text-accent"
          : route === "llm"
            ? "bg-accent-soft text-accent"
            : "bg-sunken text-ink-2";
  return <span className={cx("inline-block rounded px-1.5 py-0.5 text-[12px] font-medium", tone)}>{ROUTE_LABEL[route] ?? route}</span>;
}

export function TraceList({ trace }: { trace: TraceStep[] }) {
  return (
    <ol className="grid gap-0">
      {trace.map((t, i) => (
        <li key={t.id + i} className="grid grid-cols-[28px_1fr] gap-3 border-b border-line py-2.5 last:border-0">
          <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-sunken text-[12px] text-ink-2">{i + 1}</span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[14px] font-medium">{t.label}</span>
              <RouteTag route={t.route} />
              {t.confidence !== undefined && (
                <span className="text-[12.5px] text-ink-3">keyakinan {Math.round(t.confidence * 100)}%</span>
              )}
              {t.sampleAgreement !== undefined && (
                <span className="text-[12.5px] text-ink-3">kesepakatan sampel {Math.round(t.sampleAgreement * 100)}%</span>
              )}
            </div>
            <p className="mt-0.5 text-[13.5px] text-ink-2">{t.note}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function VerdictHero({
  verdict,
  reasons,
  conditions,
  narrative,
  meta,
}: {
  verdict: Verdict;
  reasons: string[];
  conditions: string[];
  narrative: string;
  meta?: React.ReactNode;
}) {
  const t = VERDICT_TONE[verdict];
  return (
    <section className={cx("verdict-reveal overflow-hidden rounded-xl border bg-surface", t.border)} aria-labelledby="verdict-title">
      <div className={cx("flex flex-wrap items-center gap-4 px-5 py-5 sm:px-6", t.bg)}>
        <VerdictIcon verdict={verdict} className={cx("h-11 w-11 shrink-0", t.text)} />
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] text-ink-2">Verdict Core Module</p>
          <h2 id="verdict-title" className={cx("text-[30px] font-bold leading-tight sm:text-[36px]", t.text)}>
            {VERDICT_LABEL[verdict]}
          </h2>
        </div>
        {meta && <div className="text-[13px] text-ink-2">{meta}</div>}
      </div>
      <div className="grid gap-5 px-5 py-5 sm:px-6 md:grid-cols-[1.3fr_1fr]">
        <div>
          <h3 className="text-[14px] font-semibold">Cara verdict diperoleh</h3>
          <p className="mt-1.5 max-w-prose text-[14.5px] leading-relaxed text-ink-2">{narrative}</p>
        </div>
        <div className="grid content-start gap-4">
          <div>
            <h3 className="text-[14px] font-semibold">Alasan</h3>
            <ul className="mt-1.5 grid gap-1 text-[14px] text-ink-2">
              {reasons.map((r, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-ink-3" aria-hidden />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
          {conditions.length > 0 && (
            <div>
              <h3 className="text-[14px] font-semibold">Syarat</h3>
              <ul className="mt-1.5 grid gap-1 text-[14px] text-ink-2">
                {conditions.map((r, i) => (
                  <li key={i} className="flex gap-2">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-cond" aria-hidden />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
