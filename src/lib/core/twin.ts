import type { AlignmentParams, Criteria, Indicators, ResourceKey, Spec } from "../types";

export interface ServiceModel {
  name: string;
  twin: boolean;
  calibratedAt: string | null;
  baseline: { avgTps: number; peakTps: number; cpuPct: number; memPct: number; p95Ms: number; errorRatePct: number };
  defaultSpec: Spec;
}

export const SERVICES: ServiceModel[] = [
  {
    name: "Layanan Pembayaran",
    twin: true,
    calibratedAt: "2026-10-12",
    baseline: { avgTps: 6.4, peakTps: 41, cpuPct: 24, memPct: 52, p95Ms: 210, errorRatePct: 0.08 },
    defaultSpec: { vcpu: 8, ramGb: 16, nodes: 3, threadPool: 200, connPool: 60, bandwidthMbps: 1000 },
  },
  {
    name: "Layanan Rekening",
    twin: true,
    calibratedAt: "2026-09-28",
    baseline: { avgTps: 4.8, peakTps: 34, cpuPct: 31, memPct: 61, p95Ms: 260, errorRatePct: 0.05 },
    defaultSpec: { vcpu: 8, ramGb: 32, nodes: 2, threadPool: 150, connPool: 50, bandwidthMbps: 1000 },
  },
  {
    name: "Layanan Notifikasi",
    twin: true,
    calibratedAt: "2026-10-20",
    baseline: { avgTps: 8.2, peakTps: 52, cpuPct: 18, memPct: 44, p95Ms: 140, errorRatePct: 0.12 },
    defaultSpec: { vcpu: 4, ramGb: 8, nodes: 3, threadPool: 120, connPool: 30, bandwidthMbps: 500 },
  },
  {
    name: "Layanan Deteksi Fraud",
    twin: false,
    calibratedAt: null,
    baseline: { avgTps: 3.1, peakTps: 22, cpuPct: 35, memPct: 58, p95Ms: 320, errorRatePct: 0.1 },
    defaultSpec: { vcpu: 8, ramGb: 16, nodes: 2, threadPool: 100, connPool: 40, bandwidthMbps: 1000 },
  },
];

export function serviceModel(name: string) {
  return SERVICES.find((s) => s.name === name);
}

export const RESOURCE_LABEL: Record<ResourceKey, string> = {
  cpu: "CPU",
  mem: "Memori",
  net: "Jaringan",
  thread: "Thread pool",
  conn: "Connection pool",
};

/** Profil beban kerja per request yang diturunkan dari hasil uji di environment Dev. */
export interface Profile {
  cpuSecPerReq: number;
  baseLatencyMs: number;
  memBaseGbPerNode: number;
  memPerTpsGb: number;
  payloadKb: number;
  baseErrorPct: number;
  extraCpuFrac?: number;
  extraMemGbPerNode?: number;
  connHoldFrac?: number;
}

export function profileFromDev(p: AlignmentParams): Profile {
  const d = p.devSummary;
  const devVcpu = p.devSpec.vcpu * p.devSpec.nodes;
  const tps = Math.max(d.testedTps, 0.1);
  const memPerTps = 0.012;
  return {
    cpuSecPerReq: ((d.cpuPct / 100) * devVcpu) / tps,
    baseLatencyMs: Math.max(d.p95Ms / queueFactor(d.cpuPct / 100, 1.6), 20),
    memBaseGbPerNode: Math.max((d.memPct / 100) * p.devSpec.ramGb - memPerTps * (tps / p.devSpec.nodes), 0.3),
    memPerTpsGb: memPerTps,
    payloadKb: d.payloadKb,
    baseErrorPct: d.errorRatePct,
  };
}

export function profileFromBaseline(
  b: { avgTps: number; peakTps: number; cpuPct: number; memPct: number; p95Ms: number; errorRatePct: number },
  spec: Spec,
  payloadKb: number,
): Profile {
  // CPU rata-rata baseline mencakup periode sepi; pada beban puncak diasumsikan ±1,8× rata-rata.
  const peakCpu = Math.min((b.cpuPct * 1.8) / 100, 0.9);
  const memPerTps = 0.012;
  return {
    cpuSecPerReq: (peakCpu * spec.vcpu * spec.nodes) / Math.max(b.peakTps, 0.1),
    baseLatencyMs: Math.max(b.p95Ms / queueFactor(b.cpuPct / 100, 1.6), 20),
    memBaseGbPerNode: Math.max((b.memPct / 100) * spec.ramGb - memPerTps * (b.avgTps / spec.nodes), 0.3),
    memPerTpsGb: memPerTps,
    payloadKb,
    baseErrorPct: b.errorRatePct,
  };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Faktor antrean: latensi naik tajam saat utilisasi mendekati 100% (perilaku multi-core). */
export function queueFactor(rho: number, cap = Infinity) {
  const r = Math.min(Math.max(rho, 0), 0.95);
  return Math.min(1 + r ** 3 / (1 - r), cap);
}

export function simulate(spec: Spec, pr: Profile, tps: number): Indicators {
  const n = Math.max(spec.nodes, 1);
  const tpsNode = tps / n;
  const cpu = (pr.cpuSecPerReq * tpsNode) / spec.vcpu + (pr.extraCpuFrac ?? 0);
  let lat = pr.baseLatencyMs;
  let thread = 0;
  for (let i = 0; i < 8; i++) {
    thread = (tpsNode * lat) / 1000 / spec.threadPool;
    const rho = Math.max(cpu, thread);
    lat = pr.baseLatencyMs * queueFactor(rho);
  }
  const conn = (tpsNode * lat * (pr.connHoldFrac ?? 0.4)) / 1000 / spec.connPool;
  let mem = (pr.memBaseGbPerNode + pr.memPerTpsGb * tpsNode + (pr.extraMemGbPerNode ?? 0)) / spec.ramGb;
  if (thread > 0.9) mem += 0.04 * (thread - 0.9) * 10;
  const net = (tps * pr.payloadKb * 8 * 2) / 1000 / (spec.bandwidthMbps * n);
  const rhoAll = Math.max(cpu, thread, conn);

  let p95 = lat;
  if (rhoAll > 1) p95 *= 1 + (rhoAll - 1) * 4;
  if (mem > 0.85) p95 *= 1 + (mem - 0.85) * 5;

  let err = pr.baseErrorPct;
  if (rhoAll > 0.85) err += (rhoAll - 0.85) * 6;
  if (rhoAll > 1) err += (rhoAll - 1) * 120;
  if (mem > 0.95) err += 8 + (mem - 0.95) * 200;

  return {
    tps: r1(tps),
    cpuPct: r1(cpu * 100),
    memPct: r1(Math.min(mem * 100, 140)),
    netPct: r1(net * 100),
    threadSatPct: r1(thread * 100),
    connSatPct: r1(conn * 100),
    p95Ms: Math.round(Math.min(p95, 60000)),
    errorRatePct: Math.round(Math.min(err, 100) * 100) / 100,
  };
}

export function violations(ind: Indicators, c: Criteria): string[] {
  const v: string[] = [];
  if (ind.p95Ms > c.maxP95Ms) v.push(`Response time p95 ${ind.p95Ms} ms melebihi batas ${c.maxP95Ms} ms`);
  if (ind.errorRatePct > c.maxErrorRatePct) v.push(`Error rate ${ind.errorRatePct}% melebihi batas ${c.maxErrorRatePct}%`);
  if (ind.cpuPct > c.maxCpuPct) v.push(`Kebutuhan CPU ${ind.cpuPct}% melebihi batas ${c.maxCpuPct}% kapasitas`);
  if (ind.memPct > c.maxMemPct) v.push(`Pemakaian memori ${ind.memPct}% melebihi batas ${c.maxMemPct}%`);
  if (ind.threadSatPct > 100) v.push(`Thread pool jenuh (${ind.threadSatPct}%), request mengantre`);
  if (ind.connSatPct > 100) v.push(`Connection pool jenuh (${ind.connSatPct}%)`);
  if (ind.netPct > 90) v.push(`Bandwidth jaringan terpakai ${ind.netPct}%`);
  return v;
}

export function limitingResource(ind: Indicators): ResourceKey {
  const entries: [ResourceKey, number][] = [
    ["cpu", ind.cpuPct],
    ["mem", ind.memPct],
    ["net", ind.netPct],
    ["thread", ind.threadSatPct],
    ["conn", ind.connSatPct],
  ];
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

export function peakUtil(ind: Indicators) {
  return Math.max(ind.cpuPct, ind.memPct, ind.netPct, ind.threadSatPct, ind.connSatPct);
}

/** Kapasitas transaksi maksimum: TPS tertinggi yang masih memenuhi kriteria penerimaan. */
export function maxTps(spec: Spec, pr: Profile, c: Criteria): number {
  let lo = 0.1;
  let hi = 5000;
  if (violations(simulate(spec, pr, lo), c).length) return 0;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (violations(simulate(spec, pr, mid), c).length) hi = mid;
    else lo = mid;
  }
  return Math.floor(lo * 10) / 10;
}

/** Bilangan semu deterministik 0..1 dari string, agar masukan yang sama selalu memberi hasil sama. */
export function hash01(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

export function perturb(ind: Indicators, factor: number): Indicators {
  return {
    tps: ind.tps,
    cpuPct: r1(ind.cpuPct * factor),
    memPct: r1(Math.min(ind.memPct * (1 + (factor - 1) / 2), 140)),
    netPct: r1(ind.netPct * factor),
    threadSatPct: r1(ind.threadSatPct * factor),
    connSatPct: r1(ind.connSatPct * factor),
    p95Ms: Math.round(ind.p95Ms * factor),
    errorRatePct: Math.round(Math.min(ind.errorRatePct * factor, 100) * 100) / 100,
  };
}
