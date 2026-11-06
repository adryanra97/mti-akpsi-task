"use client";

/**
 * Grafik ringkasan tren laporan (recharts): CPU puncak per cycle dan jumlah insiden per rilis.
 */
import { Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface CpuSeries {
  release: string;
  service: string;
  points: { cycle: number; cpu: number | null }[];
}

const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)"];

/**
 * Tooltip grafik tren.
 *
 * Parameters
 * ----------
 * active : boolean, optional
 *     Tooltip sedang aktif.
 * payload : { name: string; value: number; color: string }[], optional
 *     Nilai seri.
 * label : string | number, optional
 *     Label sumbu X.
 * unit : string
 *     Satuan nilai.
 * prefix : string, optional
 *     Awalan label, misalnya "Cycle".
 *
 * Returns
 * -------
 * JSX.Element | null
 */
function Tip({ active, payload, label, unit, prefix }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string | number; unit: string; prefix: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-[13px] shadow-lg">
      <p className="mb-1 font-medium">
        {prefix}
        {label}
      </p>
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
 * Grafik garis CPU saat beban puncak per cycle untuk maksimal tiga rilis.
 *
 * Parameters
 * ----------
 * series : CpuSeries[]
 *     Deret per rilis.
 *
 * Returns
 * -------
 * JSX.Element
 */
export function CpuTrend({ series }: { series: CpuSeries[] }) {
  const shown = series.slice(0, 3);
  const cycles = Array.from(new Set(shown.flatMap((s) => s.points.map((p) => p.cycle)))).sort((a, b) => a - b);
  const data = cycles.map((c) => {
    const row: Record<string, number | null> = { cycle: c };
    for (const s of shown) row[s.release] = s.points.find((p) => p.cycle === c)?.cpu ?? null;
    return row;
  });
  const lastIdx: Record<string, number> = Object.fromEntries(
    shown.map((s) => [s.release, data.reduce((acc, d, i) => (d[s.release] != null ? i : acc), -1)]),
  );
  return (
    <div>
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-2" aria-label="Legenda">
        {shown.map((s, i) => (
          <li key={s.release} className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded" style={{ background: SERIES[i] }} aria-hidden />
            {s.release} <span className="text-ink-3">{s.service}</span>
          </li>
        ))}
      </ul>
      <div className="h-[220px]" role="img" aria-label="Grafik kebutuhan CPU saat beban puncak per sprint cycle untuk setiap rilis">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 76, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis dataKey="cycle" tickFormatter={(c) => `C${c}`} stroke="var(--ink-3)" tick={{ fontSize: 12, fill: "var(--ink-3)" }} tickLine={false} axisLine={{ stroke: "var(--line-strong)" }} />
            <YAxis unit="%" domain={[0, (max: number) => Math.max(100, Math.ceil(max / 10) * 10)]} tick={{ fontSize: 12, fill: "var(--ink-3)" }} tickLine={false} axisLine={false} width={48} />
            <Tooltip content={<Tip unit="%" prefix="Cycle " />} cursor={{ stroke: "var(--line-strong)" }} />
            {shown.map((s, i) => (
              <Line
                key={s.release}
                dataKey={s.release}
                name={s.release}
                stroke={SERIES[i]}
                strokeWidth={2}
                dot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)", fill: SERIES[i] }}
                activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--surface)" }}
                connectNulls
                isAnimationActive={false}
              >
                <LabelList
                  dataKey={s.release}
                  content={(props) => {
                    const { x, y, index } = props as { x: number; y: number; index: number };
                    if (index !== lastIdx[s.release]) return null;
                    return (
                      <text x={x + 8} y={y + 4} fontSize={12} fill="var(--ink-2)">
                        {s.release}
                      </text>
                    );
                  }}
                />
              </Line>
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {series.length > 3 && <p className="mt-1 text-[12.5px] text-ink-3">Menampilkan 3 rilis terbaru. Pakai filter rilis untuk melihat yang lain.</p>}
    </div>
  );
}

/**
 * Grafik batang jumlah insiden per rilis.
 *
 * Parameters
 * ----------
 * data : { release: string; count: number }[]
 *     Jumlah insiden per rilis.
 *
 * Returns
 * -------
 * JSX.Element
 */
export function IncidentBars({ data }: { data: { release: string; count: number }[] }) {
  return (
    <div className="h-[220px]" role="img" aria-label="Grafik jumlah insiden per rilis">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 18, right: 8, bottom: 0, left: -24 }} barCategoryGap="30%">
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey="release" tickFormatter={(r: string) => r.replace(/^Rilis\s+/i, "")} interval={0} tick={{ fontSize: 12, fill: "var(--ink-3)" }} tickLine={false} axisLine={{ stroke: "var(--line-strong)" }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "var(--ink-3)" }} tickLine={false} axisLine={false} />
          <Tooltip content={<Tip unit=" insiden" prefix="Rilis " />} cursor={{ fill: "var(--sunken)" }} />
          <Bar dataKey="count" name="Insiden" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={44} isAnimationActive={false}>
            <LabelList dataKey="count" position="top" fontSize={12} fill="var(--ink-2)" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
