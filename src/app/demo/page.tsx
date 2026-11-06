"use client";

/**
 * Tur produk interaktif publik (/demo) tanpa login.
 *
 * Seluruh data adalah contoh statis di browser: tidak membaca database, sesi, atau Core Module,
 * dan tindakan di halaman ini tidak mengubah sistem utama. Matriks akses (VIEWS dan ACTIONS)
 * mencerminkan aturan di src/lib/roles.ts.
 */
import Link from "next/link";
import { CpuBenchmark, ReadinessTrend, SimulationComparison, TrendReport } from "./demo-charts";
import { useState } from "react";
import { Activity, ArrowRight, BarChart3, CheckCircle2, ChevronRight, CircleHelp, ClipboardCheck, Gauge, Home, LockKeyhole, RotateCcw, ShieldAlert, Sparkles, X } from "lucide-react";

type Role = "TL" | "QA" | "IE" | "PM" | "SUP";
type View = "overview" | "alignment" | "incidents" | "signoff" | "reports" | "access";
type Action = "run" | "decide" | "incident" | "signoff" | "download";
const roles: { id: Role; title: string; short: string; task: string }[] = [
  { id: "TL", title: "Technical Lead", short: "Technical Lead", task: "Tinjau verdict dan putuskan promosi" },
  { id: "QA", title: "QA / Performance Tester", short: "QA Tester", task: "Uji parameter beban dan hasil simulasi" },
  { id: "IE", title: "Integration Engineer", short: "Integration Engineer", task: "Analisis insiden dan mitigasi" },
  { id: "PM", title: "Project / Technical Manager", short: "Project Manager", task: "Periksa dan setujui sign-off" },
  { id: "SUP", title: "Support & Monitoring", short: "Support", task: "Pantau insiden dan tren operasional" },
];
const nav: { id: View; title: string; icon: typeof Home }[] = [
  { id: "overview", title: "Overview", icon: Home },
  { id: "alignment", title: "Release alignment", icon: Gauge },
  { id: "incidents", title: "Incident response", icon: Activity },
  { id: "signoff", title: "Sign-off", icon: ClipboardCheck },
  { id: "reports", title: "Analytics & reports", icon: BarChart3 },
  { id: "access", title: "Access & roles", icon: LockKeyhole },
];
const baseReleases = [
  { name: "QRIS Payment", version: "v3.8.2", cycle: "Cycle 03", status: "Needs review", tone: "warning", cpu: 87, p95: 390, owner: "Payments" },
  { name: "Account Notification", version: "v2.4.1", cycle: "Cycle 05", status: "Ready", tone: "success", cpu: 64, p95: 215, owner: "Platform" },
  { name: "Account Mutation", version: "v1.9.0", cycle: "Cycle 02", status: "Back to Dev", tone: "danger", cpu: 93, p95: 520, owner: "Core Banking" },
  { name: "Fraud Detection", version: "v4.1.0", cycle: "Cycle 01", status: "Scheduled", tone: "neutral", cpu: 52, p95: 180, owner: "Risk" },
];
const tagStyle: Record<string, string> = {
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  warning: "bg-amber-50 text-amber-800 ring-amber-200",
  danger: "bg-rose-50 text-rose-700 ring-rose-200",
  neutral: "bg-slate-100 text-slate-600 ring-slate-200",
};
const tabText: Record<View, { eyebrow: string; title: string; caption: string }> = {
  overview: { eyebrow: "RELEASE INTELLIGENCE", title: "Operational overview", caption: "A quick view of release readiness and operational priorities." },
  alignment: { eyebrow: "RELEASE MANAGEMENT", title: "Release alignment", caption: "Explore simulation results and acceptance thresholds." },
  incidents: { eyebrow: "OPERATIONAL RESILIENCE", title: "Incident response", caption: "Investigate a simulated incident and explore a mitigation." },
  signoff: { eyebrow: "APPROVAL WORKFLOW", title: "Release sign-off", caption: "Review a simulated sign-off decision and its impact." },
  reports: { eyebrow: "OPERATIONAL ANALYTICS", title: "Trends & reports", caption: "Understand quality trends across release cycles." },
  access: { eyebrow: "ROLE-BASED ACCESS CONTROL", title: "Who can do what?", caption: "Compare each role’s available screens, responsibilities, and permissions." },
};

// Mirror the application's access matrix in src/lib/roles.ts for a safe, browser-only walkthrough.
const VIEWS: Record<View, Role[]> = {
  overview: ["TL", "QA", "IE", "PM", "SUP"],
  alignment: ["TL", "QA", "IE", "PM"],
  incidents: ["TL", "IE", "SUP"],
  signoff: ["TL", "PM", "QA"],
  reports: ["TL", "QA", "IE", "PM", "SUP"],
  access: ["TL", "QA", "IE", "PM", "SUP"],
};
const ACTIONS: Record<Action, Role[]> = {
  run: ["QA", "TL"],
  decide: ["TL"],
  incident: ["IE", "TL"],
  signoff: ["PM"],
  download: ["SUP", "TL", "PM"],
};
const ROLE_DESCRIPTIONS: Record<Role, { focus: string; next: string }> = {
  TL: { focus: "Release governance & final decisions", next: "Review a release verdict and decide whether it can be promoted." },
  QA: { focus: "Performance evidence & scenario analysis", next: "Adjust the load, run the simulation and check acceptance criteria." },
  IE: { focus: "Incident investigation & mitigation", next: "Investigate the payment latency spike and test a mitigation." },
  PM: { focus: "Formal approval & sign-off", next: "Inspect the release evidence and approve the sign-off document." },
  SUP: { focus: "Operational monitoring & reporting", next: "Review the incident trend and download the sample report." },
};

/**
 * Halaman tur produk dengan pemilih peran, navigasi per bagian, dan aksi simulasi.
 *
 * Returns
 * -------
 * JSX.Element
 */
export default function DemoPage() {
  const [role, setRole] = useState<Role>("TL");
  const [view, setView] = useState<View>("overview");
  const [tps, setTps] = useState(45);
  const [simulated, setSimulated] = useState(false);
  const [decision, setDecision] = useState<"Pending" | "Promote" | "Return">("Pending");
  const [incident, setIncident] = useState(false);
  const [signed, setSigned] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [guide, setGuide] = useState(true);
  const [showPermissionInfo, setShowPermissionInfo] = useState(true);
  const canDo = (action: Action) => ACTIONS[action].includes(role);
  const available = (section: View) => VIEWS[section].includes(role);
  const navigate = (section: View) => { if (available(section)) { setView(section); setMobileMenu(false); } };
  const currentRole = roles.find((r) => r.id === role)!;
  const cpu = Math.min(99, Math.round(tps * 1.65 + 13));
  const p95 = Math.round(105 + tps * 5.8);
  const highRisk = cpu > 80 || p95 > 350;
  const stats = [
    { title: "Release candidates", value: "04", help: "Across active sprint cycles", Icon: Gauge },
    { title: "Ready to promote", value: decision === "Promote" ? "02" : "01", help: "Meets acceptance criteria", Icon: CheckCircle2 },
    { title: "Requires attention", value: decision === "Return" ? "03" : "02", help: "Review or remediation needed", Icon: ShieldAlert },
    { title: "Open incidents", value: incident ? "01" : "02", help: "Operational monitoring", Icon: Activity },
  ];
  /**
   * Mengembalikan tur ke keadaan awal: beban 45 TPS, simulasi, keputusan, insiden, dan sign-off
   * dikosongkan, lalu kembali ke Overview.
   */
  function reset() { setTps(45); setSimulated(false); setDecision("Pending"); setIncident(false); setSigned(false); setView("overview"); }
  const roleDefault: Record<Role, View> = { TL: "alignment", QA: "alignment", IE: "incidents", PM: "signoff", SUP: "reports" };
  const content = (
    <>
      <div className="border-b border-white/10 px-5 py-5">
        <Link href="/login" className="flex items-center gap-3 text-white">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500"><Gauge size={20}/></span>
          <span className="text-lg font-bold tracking-tight">ServerAgent</span>
        </Link>
        <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-300">Interactive product tour</p>
      </div>
      <div className="px-3 py-5">
        <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Workspace</p>
        <nav aria-label="Demo navigation" className="space-y-1">
          {nav.map((item) => { const Icon = item.icon; return <button type="button" key={item.id} onClick={() => navigate(item.id)} disabled={!available(item.id)} title={!available(item.id) ? "Tidak tersedia untuk peran ini" : undefined} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium transition-colors ${!available(item.id) ? "cursor-not-allowed text-slate-500 opacity-60" : view === item.id ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-white/10 hover:text-white"}`} aria-current={view === item.id ? "page" : undefined}><Icon size={18}/><span className="flex-1">{item.title}</span>{!available(item.id) && <LockKeyhole size={14} aria-hidden />}</button> })}
        </nav>
      </div>
      <div className="mt-auto border-t border-white/10 px-4 py-4">
        <label htmlFor="demo-role" className="mb-2 block text-xs font-semibold text-slate-300">Explore as</label>
        <select id="demo-role" value={role} onChange={e=>{const next=e.target.value as Role;setRole(next);setView(roleDefault[next]);setMobileMenu(false);setGuide(true)}} className="w-full rounded-xl border border-blue-800 bg-[#183b66] px-3 py-3 text-sm text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300">{roles.map(r=><option key={r.id} value={r.id}>{r.short}</option>)}</select>
        <button onClick={reset} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 px-3 py-2.5 text-xs font-semibold text-slate-200 hover:bg-white/10"><RotateCcw size={14}/> Reset demo</button>
      </div>
    </>
  );
  return <div className="min-h-dvh bg-[#f3f7fd] font-sans text-[#10243e]">
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-[252px] flex-col bg-[#0b2040] lg:flex">{content}</aside>
    <div className="sticky top-0 z-30 flex items-center justify-between bg-[#0b2040] px-5 py-3 text-white lg:hidden">
      <span className="flex items-center gap-2 font-bold"><Gauge size={20}/> ServerAgent <span className="rounded bg-blue-600 px-1.5 py-0.5 text-[10px]">DEMO</span></span>
      <button type="button" aria-label="Open menu" aria-expanded={mobileMenu} onClick={()=>setMobileMenu(true)} className="rounded-lg border border-white/20 px-3 py-2 text-sm">Menu</button>
    </div>
    {mobileMenu && <div className="fixed inset-0 z-50 bg-black/50 lg:hidden"><aside className="absolute inset-y-0 left-0 flex w-[min(85vw,300px)] flex-col bg-[#0b2040]"><button type="button" className="absolute right-3 top-4 rounded-lg p-2 text-white" onClick={()=>setMobileMenu(false)} aria-label="Close menu"><X/></button>{content}</aside><button type="button" aria-label="Close menu" className="absolute inset-y-0 right-0 w-[15vw]" onClick={()=>setMobileMenu(false)}/></div>}
    <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-8 lg:ml-[252px] lg:px-10 lg:py-9">
      <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-xs font-bold tracking-[0.15em] text-blue-600">{tabText[view].eyebrow}</p><h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{tabText[view].title}</h1><p className="mt-2 text-sm text-slate-600">{tabText[view].caption}</p></div>
        <div className="flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800"><span className="h-2 w-2 rounded-full bg-blue-600"/> SAFE DEMO · SAMPLE DATA</div>
      </div>
      {guide && <section aria-label="Demo guidance" className="mb-6 flex items-start gap-3 rounded-2xl border border-blue-200 bg-[#e9f1ff] p-4"><Sparkles className="mt-0.5 shrink-0 text-blue-700" size={20}/><div className="min-w-0 flex-1"><p className="font-semibold text-blue-950">You're exploring as {currentRole.title}</p><p className="mt-1 text-sm leading-relaxed text-blue-900">{currentRole.task}. Semua data dan tindakan di halaman ini hanya simulasi lokal, tidak memengaruhi sistem utama.</p></div><button type="button" onClick={()=>setGuide(false)} aria-label="Dismiss guide" className="rounded-lg p-1 text-blue-700 hover:bg-blue-100"><X size={17}/></button></section>}
      <section className="mb-6 rounded-2xl border border-[#dce6f2] bg-white p-4 shadow-sm sm:p-5" aria-label="Role permissions summary">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-[11px] font-bold uppercase tracking-wider text-blue-600">CURRENT ROLE & RESPONSIBILITY</p>
            <h2 className="mt-1 text-lg font-bold">{currentRole.title}</h2>
            <p className="mt-1 text-sm text-slate-600">{ROLE_DESCRIPTIONS[role].focus}</p>
          </div>
          <button type="button" onClick={() => setView("access")} className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100"><LockKeyhole size={15}/> Compare permissions</button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {nav.filter(n => n.id !== "access").map(n => <span key={n.id} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${available(n.id) ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>{available(n.id) ? <CheckCircle2 size={12} /> : <LockKeyhole size={12} />}{n.title}</span>)}
        </div>
      </section>
      {view === "overview" && <>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{stats.map(s=><div key={s.title} className="rounded-2xl border border-[#dce6f2] bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><p className="text-sm text-slate-600">{s.title}</p><span className="rounded-xl bg-blue-50 p-2 text-blue-700"><s.Icon size={19}/></span></div><p className="mt-4 text-4xl font-bold tracking-tight">{s.value}</p><p className="mt-2 text-xs text-slate-500">{s.help}</p></div>)}</div>
        <div className="mt-6 grid gap-5 xl:grid-cols-2">
          <ReadinessTrend />
          <CpuBenchmark />
        </div>
        <div className="mt-6 grid gap-5 xl:grid-cols-[1.5fr_1fr]">
          <section className="overflow-hidden rounded-2xl border border-[#dce6f2] bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="font-bold">Release pipeline</h2><p className="text-xs text-slate-500">Current sprint candidates</p></div><button onClick={()=>navigate("alignment")} className="text-sm font-semibold text-blue-700">View details →</button></div><div className="divide-y divide-slate-100">{baseReleases.map((r,i)=><div key={r.name} className="flex flex-wrap items-center gap-3 px-5 py-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 font-bold text-blue-700">{i+1}</span><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{r.name}</p><p className="text-xs text-slate-500">{r.cycle} · {r.version} · {r.owner}</p></div><span className={`rounded-lg px-2.5 py-1 text-xs font-semibold ring-1 ${tagStyle[r.tone]}`}>{r.status}</span></div>)}</div></section>
          <section className="rounded-2xl border border-[#dce6f2] bg-white p-5 shadow-sm"><h2 className="font-bold">Your next step</h2><p className="mt-1 text-sm text-slate-500">{currentRole.task}</p><div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 p-4"><p className="text-xs font-bold text-blue-700">RECOMMENDED ACTION</p><p className="mt-2 font-bold">{role === "IE" ? "Investigate latency spike" : role === "PM" ? "Review release sign-off" : role === "SUP" ? "Review incident trends" : "Validate QRIS release readiness"}</p><p className="mt-2 text-sm text-slate-600">Explore the interactive walkthrough for this responsibility.</p><button onClick={()=>navigate(roleDefault[role])} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">Explore workflow <ArrowRight size={16}/></button></div></section>
        </div>
        <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-5 sm:p-6">
          <p className="text-xs font-bold uppercase tracking-wider text-blue-700">Decision intelligence · Sample dataset</p>
          <h2 className="mt-2 text-lg font-bold text-blue-950">Temuan penting untuk release manager</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {[
              ["01 · Capacity risk", "QRIS dan Mutation melewati ambang CPU 80%. Prioritaskan load testing sebelum promosi."],
              ["02 · Quality trend", "Readiness meningkat dari 40% ke 82% pada lima sprint cycle contoh."],
              ["03 · Next action", "Uji what-if scenario untuk membandingkan p95 dan utilisasi terhadap baseline."],
            ].map(([title,desc]) => <div key={title} className="rounded-xl border border-blue-100 bg-white p-4"><p className="text-sm font-bold text-blue-900">{title}</p><p className="mt-2 text-sm leading-relaxed text-slate-600">{desc}</p></div>)}
          </div>
          <button type="button" onClick={() => setView("alignment")} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700">Bandingkan simulasi <ArrowRight size={16}/></button>
        </div>
      </>}
      {view === "alignment" && <div className="grid gap-5 xl:grid-cols-[1.25fr_1fr]">
        <section className="rounded-2xl border border-[#dce6f2] bg-white p-6 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-blue-600">Scenario simulator</p><h2 className="mt-2 text-xl font-bold">QRIS Payment · Cycle 03</h2><p className="mt-1 text-sm text-slate-500">Digital twin preview · Production environment</p><label htmlFor="demo-tps" className="mt-7 flex items-center justify-between gap-2 text-sm font-semibold"><span>Peak load</span><span className="text-blue-700">{tps} TPS</span></label><input id="demo-tps" type="range" min="10" max="75" step="5" value={tps} onChange={e=>{setTps(Number(e.target.value));setSimulated(false)}} className="mt-3 w-full accent-blue-600"/><div className="mt-2 flex justify-between text-xs text-slate-500"><span>10 TPS</span><span>75 TPS</span></div><button onClick={()=>canDo("run") && setSimulated(true)} disabled={!canDo("run")} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"><Gauge size={18}/> Run simulated analysis</button><p className="mt-3 text-xs text-slate-500">Simulasi visual berbasis rumus ilustratif, bukan hasil Core Module produksi.</p>{!canDo("run") && <p className="mt-2 rounded-lg bg-amber-50 p-3 text-xs font-semibold text-amber-800">Hanya QA dan Technical Lead yang dapat menjalankan analisis. Ganti peran untuk mencoba.</p>}</section>
        <section className="rounded-2xl border border-[#dce6f2] bg-white p-6 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-blue-600">Acceptance criteria</p><h2 className="mt-2 text-xl font-bold">Performance verdict</h2>{simulated ? <><span className={`mt-4 inline-flex rounded-lg px-3 py-2 text-sm font-bold ring-1 ${tagStyle[highRisk?"danger":"success"]}`}>{highRisk?"Needs remediation":"Meets criteria"}</span>{[{label:"CPU utilization",value:cpu,limit:80,unit:"%"},{label:"Response time p95",value:p95,limit:350,unit:"ms"}].map(m=><div key={m.label} className="mt-6"><div className="flex justify-between text-sm"><span className="font-semibold">{m.label}</span><span className={m.value>m.limit?"font-bold text-rose-700":"font-bold text-emerald-700"}>{m.value} {m.unit}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${m.value>m.limit?"bg-rose-500":"bg-emerald-500"}`} style={{width:`${Math.min(m.value/m.limit*100,100)}%`}}/></div><p className="mt-1 text-xs text-slate-500">Acceptance threshold ≤ {m.limit} {m.unit}</p></div>)}</> : <div className="mt-8 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center"><Gauge className="mx-auto text-blue-500"/><p className="mt-3 text-sm text-slate-600">Run the simulation to see estimated results and risk indicators.</p></div>}</section>
        {simulated && <div className="xl:col-span-2"><SimulationComparison cpu={cpu} p95={p95} /></div>}
        {simulated && <section className="rounded-2xl border border-[#dce6f2] bg-white p-6 xl:col-span-2"><h2 className="font-bold">Alignment decision</h2><p className="mt-1 text-sm text-slate-500">Practice the Technical Lead decision flow. This choice is saved only in this preview.</p><div className="mt-4 flex flex-wrap gap-3"><button onClick={()=>canDo("decide") && setDecision("Promote")} disabled={!canDo("decide")} className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300">Approve promotion</button><button onClick={()=>canDo("decide") && setDecision("Return")} disabled={!canDo("decide")} className="rounded-xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-slate-300">Return to Dev</button></div>{!canDo("decide") && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs font-semibold text-amber-800">Read only: penetapan keputusan hanya dapat dilakukan Technical Lead. QA boleh menjalankan simulasi, tetapi tidak menetapkan promosi.</p>}{decision!=="Pending"&&<p role="status" className="mt-4 rounded-lg bg-blue-50 p-3 text-sm font-semibold text-blue-900">Demo decision: {decision==="Promote"?"Approved for promotion":"Returned to development"} · No real changes made.</p>}</section>}
      </div>}
      {view === "incidents" && <section className="max-w-4xl rounded-2xl border border-[#dce6f2] bg-white p-6 shadow-sm"><p className="text-xs font-bold tracking-wider text-blue-600">INC-2026-042</p><h2 className="mt-2 text-xl font-bold">Payment latency spike</h2><p className="mt-2 text-sm leading-relaxed text-slate-600">Example: peak traffic triggered elevated latency in the QRIS payment service.</p><div className="mt-5 grid gap-3 sm:grid-cols-3">{[["Peak traffic","65 TPS"],["p95 response time","485 ms"],["CPU utilization","91%"]].map(([a,b])=><div key={a} className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">{a}</p><p className="mt-2 text-xl font-bold">{b}</p></div>)}</div><h3 className="mt-7 font-bold">Mitigation test</h3><p className="mt-1 text-sm text-slate-600">Simulate increasing available compute capacity to reduce CPU saturation.</p><button onClick={()=>canDo("incident") && setIncident(true)} disabled={!canDo("incident")} className="mt-4 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300">Simulate mitigation</button>{!canDo("incident") && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs font-semibold text-amber-800">Monitoring only: hanya Integration Engineer dan Technical Lead yang dapat menjalankan mitigasi.</p>}{incident&&<div role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><CheckCircle2 className="mb-2"/><strong>Illustrative mitigation successful</strong><p className="mt-1">Estimated CPU reduced to 69%. This result is simulated and not connected to live infrastructure.</p></div>}</section>}
      {view === "signoff" && <section className="max-w-4xl rounded-2xl border border-[#dce6f2] bg-white p-6 shadow-sm"><p className="text-xs font-bold tracking-wider text-blue-600">RELEASE APPROVAL</p><h2 className="mt-2 text-xl font-bold">Notification Service · Cycle 05</h2><div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-emerald-50 p-4"><CheckCircle2 className="text-emerald-700"/><p className="mt-2 font-bold text-emerald-800">Performance checks passed</p><p className="mt-1 text-xs text-emerald-700">Illustrative alignment verdict</p></div><div className="rounded-xl bg-blue-50 p-4"><ClipboardCheck className="text-blue-700"/><p className="mt-2 font-bold text-blue-900">{signed?"Demo signed off":"Awaiting manager review"}</p><p className="mt-1 text-xs text-blue-700">Approval workflow preview</p></div></div><p className="mt-6 text-sm text-slate-600">Review the evidence and test the approval action. No official sign-off is created.</p><button onClick={()=>canDo("signoff") && setSigned(true)} disabled={signed || !canDo("signoff")} className="mt-4 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300">{signed?"Approved in demo":"Approve demo sign-off"}</button>{!canDo("signoff") && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs font-semibold text-amber-800">Only the Project / Technical Manager can approve sign-off.</p>}</section>}
      {view === "reports" && <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ["Readiness latest", "82%", "+42 pp vs C1"],
            ["p95 latest", "215 ms", "−225 ms vs C1"],
            ["Incidents latest", "02", "−67% vs C1"],
          ].map(([name,value,delta]) => <div key={name} className="rounded-2xl border border-[#dce6f2] bg-white p-5 shadow-sm"><p className="text-sm text-slate-600">{name}</p><p className="mt-3 text-3xl font-bold">{value}</p><p className="mt-2 text-xs font-semibold text-emerald-700">{delta}</p></div>)}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#dce6f2] bg-white p-4">
          <div><p className="text-sm font-bold">Report export</p><p className="mt-1 text-xs text-slate-500">Download a small, clearly labelled sample dataset.</p></div>
          {canDo("download") ? <button type="button" onClick={() => { const csv = "Cycle,Readiness (%),p95 latency (ms),Incidents\nC1,40,440,6\nC2,58,392,5\nC3,65,330,4\nC4,74,285,3\nC5,82,215,2\n"; const blob = new Blob([csv], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "serveragent-demo-sample.csv"; link.click(); URL.revokeObjectURL(url); }} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">Download sample CSV</button> : <span className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600"><LockKeyhole size={14}/> Export restricted</span>}
        </div>
        <TrendReport />
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-blue-700">Data story · Sample only</p>
          <h2 className="mt-2 text-lg font-bold">Apa yang menyebabkan tren membaik?</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-700">Dataset ilustratif menunjukkan readiness meningkat bersamaan dengan penurunan insiden dan p95 latency. Korelasi ini belum membuktikan penyebabnya; dalam sistem nyata, evaluator perlu menelusuri perubahan kapasitas, hasil load test, dan riwayat keputusan per cycle.</p>
          <p className="mt-3 text-sm font-semibold text-blue-900">Rekomendasi: tinjau layanan dengan CPU kandidat melewati 80%, lalu validasi ulang dengan skenario TPS pada tab Alignment.</p>
          <button type="button" onClick={() => setView("alignment")} className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-blue-700 hover:underline">Jalankan what-if analysis <ArrowRight size={16}/></button>
        </div>
      </div>}
            {view === "access" && <div className="space-y-5">
        <section className="rounded-2xl border border-[#dce6f2] bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-bold">Role permission matrix</h2>
          <p className="mt-2 text-sm text-slate-600">Hak akses di bawah mengikuti aturan role-based aplikasi utama. Tanda centang berarti peran boleh menjalankan tindakan tersebut, bukan hanya melihat layar.</p>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-left text-sm">
              <thead><tr className="border-b border-slate-200 text-xs text-slate-500"><th className="py-3 pr-3 font-semibold">Capability</th>{roles.map(r=><th key={r.id} className={`px-3 py-3 text-center font-semibold ${role===r.id?"bg-blue-50 text-blue-800":""}`}>{r.id}</th>)}</tr></thead>
              <tbody>
                {([
                  ["Access alignment", "alignment"],
                  ["Access incidents", "incidents"],
                  ["Access sign-off", "signoff"],
                  ["Run load simulation", "run"],
                  ["Decide promotion", "decide"],
                  ["Manage incidents", "incident"],
                  ["Approve sign-off", "signoffAction"],
                  ["Download reports", "download"],
                ] as const).map(([label,code])=><tr key={label} className="border-b border-slate-100 last:border-0">
                  <th scope="row" className="py-3 pr-3 font-medium">{label}</th>
                  {roles.map(r=>{const has=code==="alignment"||code==="incidents"||code==="signoff"?VIEWS[code].includes(r.id):ACTIONS[code==="signoffAction"?"signoff":code].includes(r.id);return <td key={r.id} className={`px-3 py-3 text-center ${role===r.id?"bg-blue-50":""}`}><span className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${has?"bg-emerald-50 text-emerald-700":"bg-slate-100 text-slate-400"}`} aria-label={has?"Allowed":"Restricted"}>{has?<CheckCircle2 size={16}/>:<LockKeyhole size={14}/>}</span></td>})}
                </tr>)}
              </tbody>
            </table>
          </div>
        </section>
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {roles.map(r=><button type="button" key={r.id} onClick={()=>{setRole(r.id);setView(roleDefault[r.id]);setGuide(true)}} className={`rounded-2xl border p-5 text-left shadow-sm transition-colors hover:border-blue-400 ${role===r.id?"border-blue-500 bg-blue-50":"border-[#dce6f2] bg-white"}`}>
            <span className="text-xs font-bold text-blue-700">{r.id} · SELECT ROLE</span><h3 className="mt-2 text-base font-bold">{r.title}</h3><p className="mt-2 text-sm text-slate-600">{ROLE_DESCRIPTIONS[r.id].next}</p><span className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-blue-700">Explore this role <ArrowRight size={14}/></span>
          </button>)}
        </section>
      </div>}
      <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-[#dce6f2] pt-5 text-xs text-slate-500"><span className="flex items-center gap-1.5"><LockKeyhole size={14}/> Isolated browser-only demo · No production writes</span><Link href="/login" className="inline-flex items-center gap-1 font-semibold text-blue-700">Go to secure sign-in <ChevronRight size={15}/></Link></footer>
    </main>
  </div>;
}
