"use client";

/**
 * Pemuat grafik secara malas (lazy): pustaka recharts baru diunduh dan dirender saat area
 * grafik mendekati layar. Halaman tampil dan dapat dipakai lebih cepat, dan grafik di dalam
 * bagian yang tertutup (misalnya rincian reproduksi insiden) tidak dirender sama sekali.
 */
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { CpuSeries } from "@/app/(app)/reports/trend-charts";
import type { AnalysisStep } from "@/lib/types";

/**
 * Kerangka abu-abu setinggi grafik selama grafik belum dimuat.
 *
 * Parameters
 * ----------
 * height : number
 *     Tinggi kerangka dalam piksel, agar tata letak tidak bergeser saat grafik muncul.
 *
 * Returns
 * -------
 * JSX.Element
 */
function ChartSkeleton({ height }: { height: number }) {
  return <div className="animate-pulse rounded-lg bg-sunken" style={{ height }} aria-hidden />;
}

const TrajectoryChart = dynamic(() => import("./trajectory-chart").then((m) => m.TrajectoryChart), {
  ssr: false,
  loading: () => <ChartSkeleton height={460} />,
});
const CpuTrendChart = dynamic(() => import("@/app/(app)/reports/trend-charts").then((m) => m.CpuTrend), {
  ssr: false,
  loading: () => <ChartSkeleton height={250} />,
});
const IncidentBarsChart = dynamic(() => import("@/app/(app)/reports/trend-charts").then((m) => m.IncidentBars), {
  ssr: false,
  loading: () => <ChartSkeleton height={220} />,
});

/**
 * Merender anak hanya setelah wadahnya mendekati area layar (IntersectionObserver).
 *
 * Parameters
 * ----------
 * height : number
 *     Tinggi kerangka sebelum terlihat.
 * children : ReactNode
 *     Grafik yang dirender setelah terlihat.
 *
 * Returns
 * -------
 * JSX.Element
 */
function WhenVisible({ height, children }: { height: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || show) return;
    if (typeof IntersectionObserver === "undefined") return setShow(true);
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setShow(true), { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, [show]);
  return <div ref={ref}>{show ? children : <ChartSkeleton height={height} />}</div>;
}

/**
 * Grafik trajektori sumber daya yang dimuat saat terlihat.
 *
 * Parameters
 * ----------
 * steps : AnalysisStep[]
 *     Langkah dengan deret waktu digital twin.
 *
 * Returns
 * -------
 * JSX.Element
 */
export function LazyTrajectoryChart({ steps }: { steps: AnalysisStep[] }) {
  return (
    <WhenVisible height={460}>
      <TrajectoryChart steps={steps} />
    </WhenVisible>
  );
}

/**
 * Grafik tren CPU puncak per cycle yang dimuat saat terlihat.
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
export function LazyCpuTrend({ series }: { series: CpuSeries[] }) {
  return (
    <WhenVisible height={250}>
      <CpuTrendChart series={series} />
    </WhenVisible>
  );
}

/**
 * Grafik jumlah insiden per rilis yang dimuat saat terlihat.
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
export function LazyIncidentBars({ data }: { data: { release: string; count: number }[] }) {
  return (
    <WhenVisible height={220}>
      <IncidentBarsChart data={data} />
    </WhenVisible>
  );
}
