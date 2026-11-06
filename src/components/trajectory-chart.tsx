"use client";

/**
 * Grafik trajektori sumber daya dari deret waktu digital twin (recharts).
 */
import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AnalysisStep } from "@/lib/types";
import { cx } from "./ui";

const SERIES = [
  { key: "cpu", name: "CPU", color: "var(--series-1)" },
  { key: "mem", name: "Memori", color: "var(--series-2)" },
  { key: "thread", name: "Thread pool", color: "var(--series-3)" },
] as const;

/**
 * Tooltip grafik dengan nilai setiap seri pada detik tertentu.
 *
 * Parameters
 * ----------
 * active : boolean, optional
 *     Tooltip sedang aktif.
 * payload : { name: string; value: number; color: string }[], optional
 *     Nilai seri.
 * label : number, optional
 *     Detik simulasi.
 * unit : string
 *     Satuan nilai.
 *
 * Returns
 * -------
 * JSX.Element | null
 */
function Tip({ active, payload, label, unit }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: number; unit: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-[13px] shadow-lg">
      <p className="mb-1 font-medium">Detik ke-{label}</p>
      {payload
        .filter((p) => p.value !== null && p.value !== undefined)
        .map((p) => (
          <p key={p.name} className="flex items-center gap-2 text-ink-2">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} aria-hidden />
            {p.name}: <span className="font-medium text-ink">{p.value.toLocaleString("id-ID")}{unit}</span>
          </p>
        ))}
    </div>
  );
}

/**
 * Grafik CPU, memori, dan thread pool, serta p95, untuk skenario yang dipilih.
 *
 * Parameters
 * ----------
 * steps : AnalysisStep[]
 *     Langkah dengan deret waktu.
 *
 * Returns
 * -------
 * JSX.Element | null
 *     null bila tidak ada deret waktu.
 */
export function TrajectoryChart({ steps }: { steps: AnalysisStep[] }) {
  const usable = steps.filter((s) => s.deretWaktu?.length);
  const [key, setKey] = useState(usable.find((s) => s.kunci === "puncak" || s.kunci === "insiden")?.kunci ?? usable[0]?.kunci);
  const step = usable.find((s) => s.kunci === key) ?? usable[0];
  if (!step) return <p className="text-[14px] text-ink-3">Tidak ada deret waktu karena analisis tidak dijalankan pada digital twin.</p>;
  const data = step.deretWaktu.filter((d) => d.t > 0);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2" role="tablist" aria-label="Pilih langkah">
        {usable.map((s) => (
          <button
            key={s.kunci}
            type="button"
            role="tab"
            aria-selected={s.kunci === step.kunci}
            onClick={() => setKey(s.kunci)}
            className={cx(
              "rounded-md border px-2.5 py-1 text-[13px]",
              s.kunci === step.kunci ? "border-primary bg-primary font-semibold text-primary-ink" : "border-line-strong hover:bg-surface-2",
            )}
          >
            {s.deskripsi}
          </button>
        ))}
      </div>
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-2" aria-label="Legenda">
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded" style={{ background: s.color }} aria-hidden />
            {s.name}
          </li>
        ))}
      </ul>
      <div className="h-[220px]" role="img" aria-label={`Trajektori utilisasi pada ${step.deskripsi}`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis dataKey="t" tickFormatter={(t) => `${t}s`} tick={{ fontSize: 12, fill: "var(--ink-3)" }} tickLine={false} axisLine={{ stroke: "var(--line-strong)" }} />
            <YAxis unit="%" domain={[0, (max: number) => Math.max(100, Math.ceil(max / 10) * 10)]} tick={{ fontSize: 12, fill: "var(--ink-3)" }} tickLine={false} axisLine={false} width={48} />
            <Tooltip content={<Tip unit="%" />} cursor={{ stroke: "var(--line-strong)" }} />
            {SERIES.map((s) => (
              <Line key={s.key} dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} dot={false} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mb-1 mt-4 text-[13px] font-medium text-ink-2">Response time p95 per 2 detik</p>
      <div className="h-[140px]" role="img" aria-label={`Response time p95 pada ${step.deskripsi}`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis dataKey="t" tickFormatter={(t) => `${t}s`} tick={{ fontSize: 12, fill: "var(--ink-3)" }} tickLine={false} axisLine={{ stroke: "var(--line-strong)" }} />
            <YAxis unit=" ms" tick={{ fontSize: 12, fill: "var(--ink-3)" }} tickLine={false} axisLine={false} width={62} />
            <Tooltip content={<Tip unit=" ms" />} cursor={{ stroke: "var(--line-strong)" }} />
            <Line dataKey="p95" name="p95" stroke="var(--series-1)" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-[12.5px] text-ink-3">
        Satu menit simulasi setelah pemanasan 10 detik. Masukan yang sama selalu menghasilkan deret yang sama.
      </p>
    </div>
  );
}
