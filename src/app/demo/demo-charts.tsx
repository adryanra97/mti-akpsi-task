"use client";

/**
 * Grafik contoh untuk tur produk (/demo), memakai data statis dan recharts.
 */
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const grid = "#e5edf8";
const axis = { fontSize: 11, fill: "#64748b" };
const tooltip = { contentStyle: { border: "1px solid #dce6f2", borderRadius: 12, background: "#fff", fontSize: 12 }, cursor: { stroke: "#cbd5e1" } };
const card = "rounded-2xl border border-[#dce6f2] bg-white p-5 shadow-sm sm:p-6";
const readiness = [
  { cycle: "C1", ready: 40, latency: 440, incidents: 6 },
  { cycle: "C2", ready: 58, latency: 392, incidents: 5 },
  { cycle: "C3", ready: 65, latency: 330, incidents: 4 },
  { cycle: "C4", ready: 74, latency: 285, incidents: 3 },
  { cycle: "C5", ready: 82, latency: 215, incidents: 2 },
];
const services = [
  { name: "QRIS", baseline: 52, candidate: 87 },
  { name: "Notification", baseline: 44, candidate: 64 },
  { name: "Mutation", baseline: 59, candidate: 93 },
  { name: "Fraud", baseline: 38, candidate: 52 },
];

/**
 * Tren persentase rilis yang siap promosi per sprint cycle (data contoh).
 *
 * Returns
 * -------
 * JSX.Element
 */
export function ReadinessTrend() {
  return <section className={card} aria-label="Release readiness trend chart">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-wider text-blue-600">QUALITY TREND</p><h2 className="mt-1 text-lg font-bold">Release readiness</h2><p className="mt-1 text-xs text-slate-500">Persentase rilis siap dari 5 sprint cycle · data contoh</p></div><span className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">+42 poin sejak C1</span></div>
    <div className="mt-5 h-[245px] w-full" role="img" aria-label="Readiness rises from 40 percent at cycle 1 to 82 percent at cycle 5">
      <ResponsiveContainer width="100%" height="100%"><AreaChart data={readiness} margin={{ top: 8, right: 8, left: -22, bottom: 2 }}>
        <defs><linearGradient id="demoReadinessFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2563eb" stopOpacity={0.22}/><stop offset="100%" stopColor="#2563eb" stopOpacity={0.01}/></linearGradient></defs>
        <CartesianGrid stroke={grid} strokeDasharray="3 5" vertical={false}/><XAxis dataKey="cycle" tick={axis} axisLine={false} tickLine={false}/><YAxis domain={[0,100]} unit="%" tick={axis} axisLine={false} tickLine={false}/><Tooltip {...tooltip}/><ReferenceLine y={80} stroke="#16a34a" strokeDasharray="5 4" label={{ value:"Target 80%", fontSize:11, fill:"#15803d", position:"insideTopRight" }}/><Area type="monotone" dataKey="ready" name="Readiness (%)" stroke="#2563eb" strokeWidth={3} fill="url(#demoReadinessFill)" dot={{ r:4,fill:"#2563eb",stroke:"#fff",strokeWidth:2 }} isAnimationActive={false}/>
      </AreaChart></ResponsiveContainer>
    </div>
    <p className="mt-2 text-xs leading-relaxed text-slate-500">Interpretasi: tren kesiapan meningkat, melewati target ilustratif 80% pada cycle 05.</p>
  </section>;
}

/**
 * Perbandingan utilisasi CPU baseline dan kandidat rilis per layanan (data contoh).
 *
 * Returns
 * -------
 * JSX.Element
 */
export function CpuBenchmark() {
  return <section className={card} aria-label="CPU baseline versus release candidate comparison">
    <div><p className="text-[11px] font-bold uppercase tracking-wider text-blue-600">BASELINE VS CANDIDATE</p><h2 className="mt-1 text-lg font-bold">CPU utilization by service</h2><p className="mt-1 text-xs text-slate-500">Perbandingan utilisasi baseline dan saat simulasi rilis · data contoh</p></div>
    <div className="mt-5 h-[245px] w-full" role="img" aria-label="Grouped bar chart comparing baseline and candidate CPU of four services">
      <ResponsiveContainer width="100%" height="100%"><BarChart data={services} margin={{ top: 8, right: 6, bottom: 3, left: -22 }} barGap={3}>
        <CartesianGrid stroke={grid} vertical={false} strokeDasharray="3 5"/><XAxis dataKey="name" tick={axis} tickLine={false} axisLine={false}/><YAxis domain={[0,100]} unit="%" tick={axis} tickLine={false} axisLine={false}/><Tooltip {...tooltip}/><Legend wrapperStyle={{fontSize:12}}/><ReferenceLine y={80} stroke="#e11d48" strokeDasharray="5 4"/><Bar dataKey="baseline" name="Baseline (%)" fill="#93c5fd" radius={[4,4,0,0]} maxBarSize={24} isAnimationActive={false}/><Bar dataKey="candidate" name="Candidate (%)" fill="#2563eb" radius={[4,4,0,0]} maxBarSize={24} isAnimationActive={false}/>
      </BarChart></ResponsiveContainer>
    </div><p className="mt-2 text-xs leading-relaxed text-slate-500">QRIS dan Mutation melampaui ambang ilustratif CPU 80%. Prioritaskan investigasi sebelum go-live.</p>
  </section>;
}

/**
 * Tren kesiapan, latensi p95, dan jumlah insiden lintas cycle (data contoh).
 *
 * Returns
 * -------
 * JSX.Element
 */
export function TrendReport() {
  return <div className="grid gap-5 xl:grid-cols-2">
    <ReadinessTrend />
    <section className={card}><p className="text-[11px] font-bold uppercase tracking-wider text-blue-600">RELIABILITY TREND</p><h2 className="mt-1 text-lg font-bold">Incidents per cycle</h2><p className="mt-1 text-xs text-slate-500">Jumlah insiden contoh sepanjang lima cycle</p>
      <div className="mt-5 h-[245px] w-full" role="img" aria-label="Incidents decrease from 6 at cycle 1 to 2 at cycle 5">
        <ResponsiveContainer width="100%" height="100%"><ComposedChart data={readiness} margin={{ top: 10,right: 8,left: -25,bottom: 0 }}><CartesianGrid stroke={grid} vertical={false} strokeDasharray="3 5"/><XAxis dataKey="cycle" tick={axis} tickLine={false} axisLine={false}/><YAxis allowDecimals={false} tick={axis} tickLine={false} axisLine={false}/><Tooltip {...tooltip}/><Bar dataKey="incidents" name="Incidents" fill="#2563eb" radius={[5,5,0,0]} barSize={30} isAnimationActive={false}/></ComposedChart></ResponsiveContainer>
      </div><p className="mt-2 text-xs text-slate-500">Dari 6 ke 2 insiden (turun 67%) pada data ilustratif.</p>
    </section>
    <CpuBenchmark />
    <section className={card}><p className="text-[11px] font-bold uppercase tracking-wider text-blue-600">RESPONSE TIME</p><h2 className="mt-1 text-lg font-bold">p95 latency improvement</h2><p className="mt-1 text-xs text-slate-500">Milidetik · semakin rendah semakin baik</p>
      <div className="mt-5 h-[245px] w-full" role="img" aria-label="p95 latency falls from 440 to 215 milliseconds">
        <ResponsiveContainer width="100%" height="100%"><LineChart data={readiness} margin={{top:10,right:8,left:-16,bottom:0}}><CartesianGrid stroke={grid} strokeDasharray="3 5" vertical={false}/><XAxis dataKey="cycle" tick={axis} axisLine={false} tickLine={false}/><YAxis unit="ms" domain={[0,500]} tick={axis} axisLine={false} tickLine={false}/><Tooltip {...tooltip}/><ReferenceLine y={350} stroke="#e11d48" strokeDasharray="5 4" label={{value:"SLA 350ms",position:"insideTopRight",fontSize:11,fill:"#be123c"}}/><Line dataKey="latency" name="p95 latency (ms)" type="monotone" stroke="#2563eb" strokeWidth={3} dot={{r:5,fill:"#2563eb",stroke:"#fff",strokeWidth:2}} isAnimationActive={false}/></LineChart></ResponsiveContainer>
      </div><p className="mt-2 text-xs text-slate-500">Mulai cycle 03, nilai ilustratif berada di bawah ambang SLA 350ms.</p>
    </section>
  </div>;
}

/**
 * Perbandingan hasil simulasi dengan batas kriteria penerimaan.
 *
 * Parameters
 * ----------
 * cpu : number
 *     Utilisasi CPU hasil simulasi dalam persen.
 * p95 : number
 *     Response time p95 hasil simulasi dalam milidetik.
 *
 * Returns
 * -------
 * JSX.Element
 */
export function SimulationComparison({ cpu, p95 }: { cpu: number; p95: number }) {
  const rows = [{metric:"CPU",baseline:52,candidate:cpu,limit:80},{metric:"p95 / 10",baseline:24,candidate:Math.round(p95/10),limit:35}];
  return <section className={card} aria-label="Simulation comparison charts"><p className="text-[11px] font-bold uppercase tracking-wider text-blue-600">SCENARIO COMPARISON</p><h2 className="mt-1 text-lg font-bold">Baseline vs simulated load</h2><p className="mt-1 text-xs text-slate-500">CPU dalam %, latency dalam puluhan ms agar skala terbaca</p>
    <div className="mt-5 h-[245px] w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={rows} margin={{top:8,right:8,left:-22,bottom:0}}><CartesianGrid stroke={grid} vertical={false} strokeDasharray="3 5"/><XAxis dataKey="metric" tick={axis} axisLine={false} tickLine={false}/><YAxis tick={axis} axisLine={false} tickLine={false}/><Tooltip {...tooltip}/><Legend wrapperStyle={{fontSize:12}}/><Bar dataKey="baseline" name="Production baseline" fill="#93c5fd" radius={[5,5,0,0]} isAnimationActive={false}/><Bar dataKey="candidate" name="Simulated candidate" fill="#2563eb" radius={[5,5,0,0]} isAnimationActive={false}/></BarChart></ResponsiveContainer></div>
    <div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Δ CPU vs baseline</p><p className="mt-1 text-xl font-bold">{cpu>=52?"+":""}{cpu-52} pp</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Δ p95 vs baseline</p><p className="mt-1 text-xl font-bold">{p95>=240?"+":""}{p95-240} ms</p></div></div>
  </section>;
}
