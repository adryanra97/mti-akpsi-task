import { CircleCheck, CircleHelp, OctagonX, TriangleAlert } from "lucide-react";
import type { AnalysisResult, AnalysisStep, Criteria, StepSummary, TraceEntry, Verdict } from "@/lib/types";
import { LIMITING_LABEL, ROUTE_LABEL, VERDICT_HELP, VERDICT_LABEL } from "@/lib/verdict";
import { cx } from "./ui";
import { fmtDate, fmtNum } from "@/lib/format";

export const VERDICT_TONE: Record<Verdict, { text: string; bg: string; border: string; varName: string }> = {
  Lolos: { text: "text-pass", bg: "bg-pass-soft", border: "border-pass/40", varName: "--pass" },
  LolosBersyarat: { text: "text-cond", bg: "bg-cond-soft", border: "border-cond/40", varName: "--cond" },
  TidakLolos: { text: "text-fail", bg: "bg-fail-soft", border: "border-fail/40", varName: "--fail" },
  TidakDapatDinilai: { text: "text-na", bg: "bg-na-soft", border: "border-na/40", varName: "--na" },
};

export function VerdictIcon({ verdict, className }: { verdict: Verdict; className?: string }) {
  const Icon = { Lolos: CircleCheck, LolosBersyarat: TriangleAlert, TidakLolos: OctagonX, TidakDapatDinilai: CircleHelp }[verdict];
  return <Icon className={className} aria-hidden />;
}

export function VerdictBadge({ verdict, size = "md" }: { verdict: Verdict | null | undefined; size?: "sm" | "md" }) {
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

const shortLabel = (s: AnalysisStep) =>
  s.kunci === "normal" ? "Normal" : s.kunci === "puncak" ? "Puncak" : s.kunci.startsWith("whatif") ? `${s.skenario?.pengali}× normal` : s.kunci === "insiden" ? "Insiden" : "Dampak";

/** Lintasan kapasitas: posisi tiap skenario beban terhadap kapasitas transaksi maksimum (Little's Law). */
export function CapacityRunway({ steps, maxTps }: { steps: AnalysisStep[]; maxTps: number | null }) {
  const sc = steps.filter((s) => s.skenario && s.ringkasan);
  const highest = Math.max(...sc.map((s) => s.skenario!.tpsTarget), maxTps ?? 0);
  const scale = Math.max(highest * 1.12, 1);
  const pct = (v: number) => Math.min((v / scale) * 100, 100);
  const pos = (v: number) => `${pct(v)}%`;
  const anchor = (v: number) => (pct(v) > 82 ? "-translate-x-full" : pct(v) < 12 ? "translate-x-0" : "-translate-x-1/2");

  return (
    <figure className="w-full">
      <div className="relative h-[86px]">
        <div className="absolute inset-x-0 top-[34px] h-[18px] overflow-hidden rounded-md bg-sunken">
          {maxTps !== null && maxTps > 0 && (
            <>
              <div className="absolute inset-y-0 left-0 bg-pass-soft" style={{ width: pos(maxTps) }} />
              <div
                className="absolute inset-y-0 right-0"
                style={{ left: pos(maxTps), background: "repeating-linear-gradient(135deg, var(--fail-soft) 0 6px, transparent 6px 12px)" }}
              />
            </>
          )}
        </div>
        {maxTps !== null && maxTps > 0 && (
          <div className="absolute top-[26px] h-[34px] w-0.5 bg-ink" style={{ left: pos(maxTps) }}>
            <span className={cx("absolute -top-[26px] whitespace-nowrap text-[12.5px] font-semibold", anchor(maxTps))}>Maks {fmtNum(maxTps)} TPS</span>
          </div>
        )}
        {sc.map((s, i) => {
          const tone = VERDICT_TONE[s.status ?? "TidakDapatDinilai"];
          const below = i % 2 === 1;
          const v = s.skenario!.tpsTarget;
          return (
            <div key={s.kunci} className="absolute top-[30px]" style={{ left: pos(v) }}>
              <span className="absolute h-[26px] w-[3px] -translate-x-1/2 rounded-full" style={{ background: `var(${tone.varName})` }} aria-hidden />
              <span className={cx("absolute whitespace-nowrap text-[12px]", below ? "top-[30px]" : "-top-[24px]", anchor(v), tone.text)}>
                {shortLabel(s)} {fmtNum(v)}
              </span>
            </div>
          );
        })}
      </div>
      <figcaption className="mt-1 text-[12.5px] text-ink-3">
        Area hijau: beban yang masih dapat dilayani menurut capacity planning Little&apos;s Law. Area arsir: melewati kapasitas maksimum.
      </figcaption>
    </figure>
  );
}

const ROWS: { key: keyof StepSummary; label: string; unit: string; limit?: (c: Criteria) => number; util?: boolean; digits?: number }[] = [
  { key: "cpuPct", label: "Utilisasi CPU", unit: "%", limit: (c) => c.maxCpuPct, util: true },
  { key: "memPct", label: "Utilisasi memori", unit: "%", limit: (c) => c.maxMemPct, util: true },
  { key: "threadPct", label: "Kejenuhan thread pool", unit: "%", limit: () => 95, util: true },
  { key: "connPct", label: "Kejenuhan connection pool", unit: "%", util: true },
  { key: "netPct", label: "Utilisasi jaringan", unit: "%", util: true, digits: 2 },
  { key: "p95Ms", label: "Response time p95", unit: " ms", limit: (c) => c.maxP95Ms },
  { key: "errorRatePct", label: "Error rate", unit: "%", limit: (c) => c.maxErrorRatePct, digits: 2 },
  { key: "timeoutPct", label: "Kemungkinan timeout", unit: "%", digits: 2 },
  { key: "throughputTps", label: "Throughput terlayani", unit: " TPS" },
];

export function IndicatorTable({ steps, criteria, useLabels }: { steps: AnalysisStep[]; criteria: Criteria; useLabels?: boolean }) {
  const cols = steps.filter((s) => s.skenario || s.ringkasan);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-[14px]">
        <caption className="sr-only">Indikator sumber daya per langkah analisis dibanding batas kriteria</caption>
        <thead>
          <tr className="border-b border-line text-left text-[13px] text-ink-3">
            <th scope="col" className="py-2 pr-3 font-medium">Indikator</th>
            {cols.map((s) => (
              <th key={s.kunci} scope="col" className="px-3 py-2 text-right font-medium">
                {useLabels ? s.deskripsi : shortLabel(s)}
                {s.skenario && <span className="block font-normal">{fmtNum(s.skenario.tpsTarget)} TPS</span>}
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
                {cols.map((s) => {
                  const v = s.ringkasan?.[r.key] as number | undefined;
                  const over = v !== undefined && limit !== undefined && v > limit;
                  const near = !over && r.util && v !== undefined && v > 75;
                  return (
                    <td key={s.kunci} className="px-3 py-2 text-right">
                      {v === undefined || v === null ? (
                        <span className="text-ink-3">{s.statusLangkah === "Dihentikan" ? "tidak dihitung" : "–"}</span>
                      ) : (
                        <span className={cx(over && "font-semibold text-fail", near && "text-cond")}>
                          {fmtNum(v, r.digits ?? 1)}
                          {r.unit}
                          {over && <span className="sr-only"> (melebihi batas)</span>}
                        </span>
                      )}
                      {r.util && v !== undefined && v !== null && (
                        <span className="ml-auto mt-1 block h-1 w-20 overflow-hidden rounded-full bg-sunken" aria-hidden>
                          <span className={cx("block h-full rounded-full", over ? "bg-fail" : near ? "bg-cond" : "bg-pass")} style={{ width: `${Math.min(v, 100)}%` }} />
                        </span>
                      )}
                    </td>
                  );
                })}
                <td className="py-2 pl-3 text-right text-ink-3">{limit !== undefined ? `≤ ${fmtNum(limit, 2)}${r.unit}` : "–"}</td>
              </tr>
            );
          })}
          <tr>
            <th scope="row" className="py-2 pr-3 text-left font-normal text-ink-2">Sumber angka</th>
            {cols.map((s) => (
              <td key={s.kunci} className="px-3 py-2 text-right text-[13px]">
                <RouteTag route={s.statusLangkah === "Dihentikan" ? "Dihentikan" : s.jalurPenjurusan ?? "Sistem"} />
                {s.skorKeyakinan !== null && <span className="mt-0.5 block text-[12px] text-ink-3">keyakinan {Math.round(s.skorKeyakinan * 100)}%</span>}
              </td>
            ))}
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function RouteTag({ route }: { route: string }) {
  const tone =
    route === "EstimasiPenalaran"
      ? "bg-cond-soft text-cond"
      : route === "Dihentikan"
        ? "bg-na-soft text-na"
        : route === "FallbackDigitalTwin" || route === "LayananLLM"
          ? "bg-accent-soft text-accent"
          : "bg-sunken text-ink-2";
  return (
    <span className={cx("inline-block rounded px-1.5 py-0.5 text-[12px] font-medium", tone)}>{ROUTE_LABEL[route as keyof typeof ROUTE_LABEL] ?? route}</span>
  );
}

export function TraceList({ trace }: { trace: TraceEntry[] }) {
  return (
    <ol className="grid gap-0">
      {trace.map((t, i) => (
        <li key={t.id + i} className="grid grid-cols-[28px_1fr] gap-3 border-b border-line py-2.5 last:border-0">
          <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-sunken text-[12px] text-ink-2">{i + 1}</span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[14px] font-medium">{t.label}</span>
              <RouteTag route={t.jalur} />
              {t.skorKeyakinan !== null && <span className="text-[12.5px] text-ink-3">keyakinan {Math.round(t.skorKeyakinan * 100)}%</span>}
              {t.kesepakatanSampel !== null && <span className="text-[12.5px] text-ink-3">kesepakatan sampel {Math.round(t.kesepakatanSampel * 100)}%</span>}
              <span className="text-[12.5px] text-ink-3">{t.durasiMs} ms</span>
            </div>
            <p className="mt-0.5 text-[13.5px] text-ink-2">{t.catatan}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Ringkasan untuk peran nonteknis (NFR-08): verdict, sumber daya pembatas, dan narasi tampil lebih dulu. */
export function VerdictHero({ result, title = "Verdict Core Module" }: { result: AnalysisResult; title?: string }) {
  const v = result.verdict;
  const t = VERDICT_TONE[v.status];
  const m = result.modelDigitalTwin;
  return (
    <section className={cx("verdict-reveal overflow-hidden rounded-xl border bg-surface", t.border)} aria-labelledby={`verdict-${result.idPermintaan}`}>
      <div className={cx("flex flex-wrap items-center gap-4 px-5 py-5 sm:px-6", t.bg)}>
        <VerdictIcon verdict={v.status} className={cx("h-11 w-11 shrink-0", t.text)} />
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] text-ink-2">{title}</p>
          <h2 id={`verdict-${result.idPermintaan}`} data-verdict-title className={cx("text-[30px] font-bold leading-tight sm:text-[36px]", t.text)}>
            {VERDICT_LABEL[v.status]}
          </h2>
        </div>
        {result.sumberDayaPembatas && (
          <div className="rounded-lg bg-surface/70 px-4 py-2.5">
            <p className="text-[12.5px] text-ink-3">Sumber daya pembatas</p>
            <p className="text-[17px] font-semibold">{LIMITING_LABEL[result.sumberDayaPembatas]}</p>
          </div>
        )}
      </div>
      <div className="grid gap-5 px-5 py-5 sm:px-6 md:grid-cols-[1.3fr_1fr]">
        <div>
          <h3 className="text-[14px] font-semibold">Cara verdict diperoleh</h3>
          <p className="mt-1.5 max-w-prose text-[14.5px] leading-relaxed text-ink-2">{v.narasi}</p>
          {result.penyebabBottleneck.length > 0 && (
            <>
              <h3 className="mt-4 text-[14px] font-semibold">Kemungkinan penyebab bottleneck</h3>
              <ul className="mt-1.5 grid gap-1 text-[14px] text-ink-2">
                {result.penyebabBottleneck.map((r, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-ink-3" aria-hidden />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <div className="grid content-start gap-4">
          <div>
            <h3 className="text-[14px] font-semibold">Alasan</h3>
            <ul className="mt-1.5 grid gap-1 text-[14px] text-ink-2">
              {v.alasan.map((r, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-ink-3" aria-hidden />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
          {v.syarat.length > 0 && (
            <div>
              <h3 className="text-[14px] font-semibold">Syarat</h3>
              <ul className="mt-1.5 grid gap-1 text-[14px] text-ink-2">
                {v.syarat.map((r, i) => (
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
      <p className="border-t border-line px-5 py-2.5 text-[12.5px] text-ink-3 sm:px-6">
        {m?.statusAktif
          ? `Model digital twin ${m.versiModel}, dikalibrasi ${m.tanggalKalibrasi ? fmtDate(m.tanggalKalibrasi) : "–"}, rentang ${m.tpsMinTerkalibrasi} sampai ${m.tpsMaksTerkalibrasi} TPS.`
          : "Tidak ada model digital twin aktif."}{" "}
        {result.modeAnalisis === "demo" ? "Mode demo." : `Layanan LLM: ${result.provider} ${result.model}.`} Dianalisis {fmtDate(result.waktuSelesai, true)}.
      </p>
    </section>
  );
}
