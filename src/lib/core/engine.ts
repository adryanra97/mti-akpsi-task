import type {
  AlignmentParams,
  AlignmentSession,
  AnalysisResult,
  AppSettings,
  Assessment,
  Baseline,
  Criteria,
  Incident,
  Indicators,
  MitigationChanges,
  ResourceKey,
  ScenarioResult,
  Spec,
  StepRoute,
  TraceStep,
  Verdict,
} from "../types";
import { aliasService, maskText, type MaskReport } from "./masking";
import { fetchBaseline } from "./elk";
import { callLlm, CostMeter, extractJson, SYSTEM_PROMPT } from "./llm";
import {
  hash01,
  limitingResource,
  maxTps,
  peakUtil,
  perturb,
  profileFromBaseline,
  profileFromDev,
  RESOURCE_LABEL,
  serviceModel,
  simulate,
  violations,
  type Profile,
} from "./twin";
import { VERDICT_LABEL } from "../verdict";

export type EngineEvent =
  | { type: "step"; id: string; label: string; state: "run" | "done" | "warn" | "skip"; note?: string }
  | { type: "done"; payload: unknown }
  | { type: "error"; message: string };

export interface EngineCtx {
  settings: AppSettings;
  userName: string;
  emit?: (e: EngineEvent) => void;
  pace?: boolean;
  now?: Date;
}

/** Kriteria SLA Production yang dipakai untuk menilai insiden. */
export const INCIDENT_CRITERIA: Criteria = { maxP95Ms: 800, maxErrorRatePct: 1, maxCpuPct: 85, maxMemPct: 90 };

const HEADROOM_LIMIT = 75;
const TWIN_COVERAGE = 2.5;
const CALIBRATED_LIMIT = 5;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
const pct = (n: number) => `${Math.round(n * 100)}%`;

class Tracer {
  trace: TraceStep[] = [];
  warnings: string[] = [];
  constructor(private ctx: EngineCtx) {}
  async step<T>(
    id: string,
    label: string,
    fn: () => Promise<{ value: T; note: string; route?: TraceStep["route"]; warn?: boolean; confidence?: number; sampleAgreement?: number }>,
  ): Promise<T> {
    this.ctx.emit?.({ type: "step", id, label, state: "run" });
    const t0 = Date.now();
    if (this.ctx.pace) await sleep(260);
    const r = await fn();
    this.trace.push({
      id,
      label,
      route: r.route ?? "sistem",
      note: r.note,
      confidence: r.confidence,
      sampleAgreement: r.sampleAgreement,
      durationMs: Date.now() - t0,
    });
    this.ctx.emit?.({ type: "step", id, label, state: r.warn ? "warn" : "done", note: r.note });
    return r.value;
  }
  skip(id: string, label: string, note: string) {
    this.trace.push({ id, label, route: "dihentikan", note, durationMs: 0 });
    this.ctx.emit?.({ type: "step", id, label, state: "skip", note });
  }
}

function useLlm(ctx: EngineCtx) {
  return ctx.settings.mode === "llm";
}

function modelOf(ctx: EngineCtx) {
  return ctx.settings.models[ctx.settings.provider];
}

async function llmText(ctx: EngineCtx, meter: CostMeter, prompt: string, maxTokens?: number) {
  const r = await callLlm(ctx.settings.provider, modelOf(ctx), SYSTEM_PROMPT, prompt, maxTokens);
  meter.add(r);
  return r.text;
}

interface EstimateOut {
  ind: Indicators;
  confidence: number;
  agreement: number;
}

/** Estimasi penalaran untuk kasus di luar cakupan model digital twin, dengan beberapa sampel untuk mengukur kesepakatan. */
async function estimate(
  ctx: EngineCtx,
  meter: CostMeter,
  tracer: Tracer,
  key: string,
  context: string,
  twin: Indicators,
  ratio: number,
  coverage: number,
  limit: number,
): Promise<EstimateOut> {
  if (!useLlm(ctx)) {
    const h = hash01(key);
    const confidence = clamp(0.9 - 0.32 * ((ratio - coverage) / (limit - coverage)) + (h - 0.5) * 0.08, 0.4, 0.95);
    const agreement = clamp(0.8 + hash01(key + "s") * 0.16, 0, 1);
    return { ind: perturb(twin, 1.05 + h * 0.08), confidence, agreement };
  }
  const prompt = `${context}

Kasus ini berada di luar cakupan kalibrasi model digital twin (beban ${ratio.toFixed(1)}x dari titik kalibrasi).
Ekstrapolasi digital twin sebagai acuan (bisa kurang akurat): ${JSON.stringify(twin)}.
Berikan estimasi penalaran Anda untuk indikator pada beban ${twin.tps} TPS.
Balas JSON: {"cpuPct": number, "memPct": number, "netPct": number, "threadSatPct": number, "connSatPct": number, "p95Ms": number, "errorRatePct": number, "confidence": number antara 0 dan 1, "alasan": string singkat}`;
  const n = clamp(Math.round(ctx.settings.samples), 1, 5);
  const settled = await Promise.allSettled(Array.from({ length: n }, () => llmText(ctx, meter, prompt, 500)));
  const samples = settled
    .map((s) => (s.status === "fulfilled" ? extractJson<Record<string, number>>(s.value) : null))
    .filter((x): x is Record<string, number> => !!x && typeof x.cpuPct === "number" && typeof x.p95Ms === "number");
  const failed = settled.find((s) => s.status === "rejected") as PromiseRejectedResult | undefined;
  if (failed) tracer.warnings.push(`Sebagian sampel estimasi gagal: ${(failed.reason as Error).message}`);
  if (samples.length === 0) return { ind: twin, confidence: 0, agreement: 0 };
  const avg = (k: string) => samples.reduce((a, s) => a + (Number(s[k]) || 0), 0) / samples.length;
  const spread = (k: string) => {
    const m = avg(k);
    if (m === 0) return 0;
    return samples.reduce((a, s) => a + Math.abs((Number(s[k]) || 0) - m), 0) / samples.length / m;
  };
  const agreement = clamp(1 - (spread("cpuPct") + spread("p95Ms")) / 2, 0, 1);
  const r1 = (x: number) => Math.round(x * 10) / 10;
  return {
    ind: {
      tps: twin.tps,
      cpuPct: r1(avg("cpuPct")),
      memPct: r1(avg("memPct") || twin.memPct),
      netPct: r1(avg("netPct") || twin.netPct),
      threadSatPct: r1(avg("threadSatPct") || twin.threadSatPct),
      connSatPct: r1(avg("connSatPct") || twin.connSatPct),
      p95Ms: Math.round(avg("p95Ms")),
      errorRatePct: Math.round(avg("errorRatePct") * 100) / 100,
    },
    confidence: clamp(avg("confidence") - (agreement < 0.8 ? 0.1 : 0), 0, 1),
    agreement,
  };
}

function scenarioStatus(ind: Indicators, route: StepRoute, c: Criteria): { status: Verdict; violations: string[] } {
  const v = violations(ind, c);
  if (v.length) return { status: "TIDAK_LOLOS", violations: v };
  if (route === "estimasi_penalaran" || peakUtil(ind) > HEADROOM_LIMIT) return { status: "LOLOS_BERSYARAT", violations: [] };
  return { status: "LOLOS", violations: [] };
}

const BOTTLENECK_HINT: Record<ResourceKey, string> = {
  cpu: "Kemungkinan penyebab bottleneck adalah kebutuhan CPU per transaksi; tinjau profil per request pada versi ini atau tambah vCPU/node.",
  mem: "Memori menjadi pembatas; periksa ukuran heap, cache, dan objek yang tertahan per request sebelum menambah RAM.",
  net: "Bandwidth jaringan menjadi pembatas; periksa ukuran payload dan kompresi respons.",
  thread:
    "Antrean pada thread pool muncul lebih dulu daripada kejenuhan CPU; menambah thread pool atau memangkas waktu tunggu ke layanan hilir memberi dampak terbesar.",
  conn: "Connection pool ke database menjadi titik antre; tinjau ukuran pool, durasi transaksi, dan query yang lambat.",
};

function baselineNote(b: Baseline, elkDown: boolean) {
  const d = new Date(b.takenAt).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  return elkDown
    ? `ELK Stack tidak dapat diakses. Memakai baseline tersimpan terakhir tanggal ${d}.`
    : `Baseline Production ${b.window}: rata-rata ${b.avgTps} TPS, puncak ${b.peakTps} TPS, CPU ${b.cpuPct}%, p95 ${b.p95Ms} ms.`;
}

// ---------------------------------------------------------------------------
// UC-01: analisis release candidate
// ---------------------------------------------------------------------------

export async function runAlignment(
  session: AlignmentSession,
  params: AlignmentParams,
  ctx: EngineCtx,
): Promise<{ result: AnalysisResult; baselineToCache?: Baseline }> {
  const tracer = new Tracer(ctx);
  const meter = new CostMeter(ctx.settings);
  const mask: MaskReport = { count: 0, kinds: [] };
  const now = ctx.now ?? new Date();
  const key = `${session.service}|${session.releaseCandidate}|${JSON.stringify(params)}`;

  const masked = await tracer.step("mask", "Samarkan data sensitif", async () => {
    const svc = aliasService(session.service, mask);
    const cfg = maskText(params.configChanges, mask);
    const notes = maskText(params.devSummary.notes, mask);
    return {
      value: { svc, cfg, notes },
      note: `${mask.count} item disamarkan (${mask.kinds.join(", ")}) sebelum data keluar ke Layanan LLM.`,
    };
  });

  const { baseline, elkDown } = await tracer.step("elk", "Ambil metrik baseline dari ELK Stack", async () => {
    const r = fetchBaseline(session.service, ctx.settings, now);
    if (r.elkDown) tracer.warnings.push(baselineNote(r.baseline, true));
    return { value: r, note: baselineNote(r.baseline, r.elkDown), warn: r.elkDown };
  });

  const model = serviceModel(session.service);
  const hasTwin = Boolean(model?.twin);
  const scenarios: { key: string; label: string; kind: ScenarioResult["kind"]; tps: number }[] = [
    { key: "normal", label: `Beban normal (${params.normalTps} TPS)`, kind: "normal", tps: params.normalTps },
    { key: "puncak", label: `Beban puncak (${params.peakTps} TPS)`, kind: "puncak", tps: params.peakTps },
    ...params.whatIf.map((m) => ({
      key: `whatif-${m}`,
      label: `What-if ${m}× puncak (${Math.round(params.peakTps * m * 10) / 10} TPS)`,
      kind: "whatif" as const,
      tps: Math.round(params.peakTps * m * 10) / 10,
    })),
  ];

  const contextText = `Layanan: ${masked.svc} | Release candidate: ${session.releaseCandidate} | Cycle ${session.cycleNo} | ${session.envSource} -> ${session.envTarget}
Versi layanan: ${params.serviceVersion}
Perubahan konfigurasi: ${masked.cfg || "-"}
Spesifikasi Dev: ${JSON.stringify(params.devSpec)}
Hasil uji Dev: ${params.devSummary.testedTps} TPS, p95 ${params.devSummary.p95Ms} ms, CPU ${params.devSummary.cpuPct}%, memori ${params.devSummary.memPct}%, error ${params.devSummary.errorRatePct}%. Catatan: ${masked.notes || "-"}
Spesifikasi Production: ${JSON.stringify(params.prodSpec)}
Kriteria penerimaan: ${JSON.stringify(params.criteria)}
Baseline Production: ${JSON.stringify({ ...baseline, takenAt: undefined })}`;

  await tracer.step("plan", "Susun rencana analisis", async () => {
    const list = scenarios.map((s) => s.label).join("; ");
    if (!useLlm(ctx)) {
      return { value: null, route: "llm", note: `Rencana ${scenarios.length} langkah: ${list}.` };
    }
    try {
      const text = await llmText(
        ctx,
        meter,
        `${contextText}\n\nSusun rencana analisis untuk skenario berikut secara berurutan: ${list}.\nBalas JSON: {"fokus": "satu kalimat tentang risiko utama yang perlu diperhatikan", "langkah": ["..."]}`,
        500,
      );
      const j = extractJson<{ fokus?: string }>(text);
      return { value: null, route: "llm", note: `Rencana ${scenarios.length} langkah. Fokus: ${j?.fokus ?? text.slice(0, 200)}` };
    } catch (e) {
      tracer.warnings.push(`Layanan LLM gagal menyusun rencana (${(e as Error).message}); memakai rencana deterministik.`);
      return { value: null, route: "llm", warn: true, note: `Rencana deterministik ${scenarios.length} langkah: ${list}.` };
    }
  });

  const profile = profileFromDev(params);
  const results: ScenarioResult[] = [];
  const manual: string[] = [];
  let stopped: string | null = null;
  let requiredEstimated = false;

  for (const [i, s] of scenarios.entries()) {
    const ratio = s.tps / Math.max(params.devSummary.testedTps, 0.1);
    const required = s.kind !== "whatif";
    const label = `Jalankan langkah ${i + 1}: ${s.label}`;

    if (!hasTwin || ratio > CALIBRATED_LIMIT) {
      const why = !hasTwin
        ? `Tidak ada model digital twin aktif untuk ${session.service}.`
        : `Beban ${ratio.toFixed(1)}× titik kalibrasi, di luar rentang terkalibrasi (maks ${CALIBRATED_LIMIT}×).`;
      tracer.skip(`step-${s.key}`, label, `${why} Langkah dihentikan tanpa menghitung indikator.`);
      results.push({
        ...s,
        route: "dihentikan",
        indicators: null,
        limiting: null,
        status: "TIDAK_DAPAT_DINILAI",
        violations: [why],
      });
      if (required) {
        stopped = why;
        break;
      }
      continue;
    }

    const r = await tracer.step<{ ind: Indicators; route: StepRoute; conf?: number }>(`step-${s.key}`, label, async () => {
      const twin = simulate(params.prodSpec, profile, s.tps);
      if (ratio <= TWIN_COVERAGE) {
        return { value: { ind: twin, route: "digital_twin" as StepRoute }, route: "digital_twin", note: "Dijalankan pada digital twin." };
      }
      const est = await estimate(ctx, meter, tracer, key + s.key, contextText, twin, ratio, TWIN_COVERAGE, CALIBRATED_LIMIT);
      if (est.confidence >= ctx.settings.confidenceThreshold) {
        manual.push(`${s.label}: angka berasal dari estimasi penalaran (keyakinan ${pct(est.confidence)})`);
        if (required) requiredEstimated = true;
        return {
          value: { ind: est.ind, route: "estimasi_penalaran" as StepRoute, conf: est.confidence },
          route: "estimasi_penalaran",
          confidence: est.confidence,
          sampleAgreement: est.agreement,
          warn: true,
          note: `Di luar cakupan model (${ratio.toFixed(1)}×). Estimasi penalaran dipakai; angka perlu verifikasi manual.`,
        };
      }
      return {
        value: { ind: twin, route: "fallback_twin" as StepRoute, conf: est.confidence },
        route: "fallback_twin",
        confidence: est.confidence,
        sampleAgreement: est.agreement,
        note: `Keyakinan ${pct(est.confidence)} di bawah ambang ${pct(ctx.settings.confidenceThreshold)}; dialihkan ke digital twin (fallback deterministik).`,
      };
    });
    const st = scenarioStatus(r.ind, r.route, params.criteria);
    results.push({
      ...s,
      route: r.route,
      indicators: r.ind,
      limiting: limitingResource(r.ind),
      status: st.status,
      violations: st.violations,
      confidence: r.conf,
    });
  }

  let capacity: number | null = null;
  let limiting: ResourceKey | null = null;
  if (stopped) {
    tracer.skip("indicators", "Hitung indikator sumber daya", "Dilewati karena analisis dihentikan.");
  } else {
    await tracer.step("indicators", "Hitung indikator sumber daya", async () => {
      capacity = maxTps(params.prodSpec, profile, params.criteria);
      const peak = results.find((r) => r.key === "puncak")!;
      limiting = peak.limiting;
      return {
        value: null,
        note: `Kapasitas transaksi maksimum ${capacity} TPS. Sumber daya pembatas pada beban puncak: ${RESOURCE_LABEL[limiting!]}.`,
      };
    });
  }

  const { verdict, reasons, conditions } = await tracer.step("verdict", "Tetapkan verdict", async () => {
    const reasons: string[] = [];
    const conditions: string[] = [];
    let verdict: Verdict;
    if (stopped) {
      verdict = "TIDAK_DAPAT_DINILAI";
      reasons.push(stopped, "Rekomendasi: kalibrasi ulang atau aktifkan model digital twin sebelum alignment berikutnya.");
    } else {
      const req = results.filter((r) => r.kind !== "whatif");
      const viol = req.flatMap((r) => r.violations.map((v) => `${r.label}: ${v}`));
      const peak = req.find((r) => r.kind === "puncak")!;
      if (viol.length) {
        verdict = "TIDAK_LOLOS";
        reasons.push(...viol);
      } else if (req.some((r) => r.route === "estimasi_penalaran")) {
        verdict = "LOLOS_BERSYARAT";
        reasons.push("Seluruh indikator memenuhi kriteria, tetapi sebagian angka berasal dari estimasi penalaran.");
        conditions.push("Verifikasi manual angka estimasi melalui performance test di Dev sebelum deployment.");
      } else if (peakUtil(peak.indicators!) > HEADROOM_LIMIT) {
        verdict = "LOLOS_BERSYARAT";
        reasons.push(
          `Seluruh indikator memenuhi kriteria, tetapi headroom tipis: ${RESOURCE_LABEL[peak.limiting!]} mencapai ${Math.round(peakUtil(peak.indicators!))}% pada beban puncak.`,
        );
        conditions.push(`Pantau ${RESOURCE_LABEL[peak.limiting!]} selama 7 hari pertama setelah deployment.`);
      } else {
        verdict = "LOLOS";
        reasons.push("Seluruh indikator pada beban normal dan puncak memenuhi kriteria penerimaan.");
      }
      if (capacity !== null && verdict !== "TIDAK_LOLOS") {
        reasons.push(`Kapasitas maksimum ${capacity} TPS, atau ${(capacity / params.peakTps).toFixed(1)}× beban puncak.`);
      }
      for (const w of results.filter((r) => r.kind === "whatif")) {
        reasons.push(`${w.label}: ${VERDICT_LABEL[w.status]}${w.violations[0] ? ` (${w.violations[0]})` : ""}.`);
      }
    }
    if (elkDown) conditions.push(`Baseline memakai data tersimpan tanggal ${new Date(baseline.takenAt).toLocaleDateString("id-ID")}.`);
    if (requiredEstimated && verdict === "LOLOS") verdict = "LOLOS_BERSYARAT";
    return { value: { verdict, reasons, conditions }, note: `Verdict: ${VERDICT_LABEL[verdict]}.` };
  });

  const peak = results.find((r) => r.key === "puncak");
  const narrative = await tracer.step("narrative", "Susun narasi verdict", async () => {
    const template = alignmentNarrative(verdict, params, peak, capacity, limiting, requiredEstimated, stopped);
    if (!useLlm(ctx)) return { value: template, route: "llm", note: "Narasi disusun dari templat (mode demo)." };
    try {
      const text = await llmText(
        ctx,
        meter,
        `${contextText}\n\nHasil analisis: ${JSON.stringify({ verdict: VERDICT_LABEL[verdict], alasan: reasons, syarat: conditions, skenario: results.map((r) => ({ label: r.label, jalur: r.route, indikator: r.indicators, status: VERDICT_LABEL[r.status] })), kapasitasMaksTps: capacity, pembatas: limiting ? RESOURCE_LABEL[limiting] : null })}\n\nTulis narasi ringkas 3-5 kalimat (teks biasa, tanpa markdown) yang menjelaskan bagaimana verdict diperoleh dan kemungkinan penyebab bottleneck. Jangan mengubah verdict.`,
        600,
      );
      return { value: text.trim() || template, route: "llm", note: `Narasi disusun oleh ${modelOf(ctx)}.` };
    } catch (e) {
      tracer.warnings.push(`Layanan LLM gagal menyusun narasi (${(e as Error).message}); memakai templat.`);
      return { value: template, route: "llm", warn: true, note: "Narasi memakai templat karena Layanan LLM gagal." };
    }
  });

  await tracer.step("trace", "Catat jejak keputusan", async () => ({
    value: null,
    note: useLlm(ctx)
      ? `${meter.cost.calls} panggilan LLM, ${meter.cost.inputTokens + meter.cost.outputTokens} token, estimasi Rp${meter.cost.idr.toLocaleString("id-ID")}.`
      : "Mode demo: tidak ada panggilan LLM berbayar.",
  }));

  const result: AnalysisResult = {
    id: crypto.randomUUID(),
    createdAt: now.toISOString(),
    createdBy: ctx.userName,
    mode: ctx.settings.mode,
    provider: useLlm(ctx) ? ctx.settings.provider : undefined,
    model: useLlm(ctx) ? modelOf(ctx) : undefined,
    params,
    scenarios: results,
    maxTps: capacity,
    limiting,
    verdict,
    reasons,
    conditions,
    manualVerification: manual,
    narrative,
    baseline,
    masking: mask,
    trace: tracer.trace,
    cost: meter.cost,
    warnings: tracer.warnings,
  };
  return { result, baselineToCache: elkDown ? undefined : baseline };
}

function alignmentNarrative(
  verdict: Verdict,
  p: AlignmentParams,
  peak: ScenarioResult | undefined,
  capacity: number | null,
  limiting: ResourceKey | null,
  estimated: boolean,
  stopped: string | null,
) {
  if (stopped || !peak?.indicators || !limiting) {
    return `Status ${VERDICT_LABEL[verdict]} ditetapkan karena analisis tidak dapat dijalankan secara sah: ${stopped ?? "data tidak lengkap"} Indikator sumber daya sengaja tidak dihitung agar tidak menghasilkan angka di luar rentang yang dapat dipertanggungjawabkan. Release candidate sebaiknya kembali ke Dev sampai model dikalibrasi ulang.`;
  }
  const i = peak.indicators;
  const parts = [
    `Verdict ${VERDICT_LABEL[verdict]} ditetapkan dengan membandingkan indikator pada beban normal (${p.normalTps} TPS) dan puncak (${p.peakTps} TPS) terhadap kriteria penerimaan.`,
    `Pada beban puncak, sumber daya pembatas adalah ${RESOURCE_LABEL[limiting]} (${Math.round(peakUtil(i))}%), dengan response time p95 ${i.p95Ms} ms dan error rate ${i.errorRatePct}%.`,
  ];
  if (capacity !== null) {
    parts.push(`Kapasitas transaksi maksimum diperkirakan ${capacity} TPS, atau ${(capacity / p.peakTps).toFixed(1)}× beban puncak.`);
  }
  parts.push(BOTTLENECK_HINT[limiting]);
  if (estimated) parts.push("Sebagian angka berasal dari estimasi penalaran sehingga perlu diverifikasi manual sebelum dijadikan acuan.");
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// UC-02: penilaian insiden (mode reproduksi dan mode mitigasi)
// ---------------------------------------------------------------------------

export function applyChanges(spec: Spec, c: MitigationChanges): Spec {
  return {
    vcpu: c.vcpu ?? spec.vcpu,
    ramGb: c.ramGb ?? spec.ramGb,
    nodes: c.nodes ?? spec.nodes,
    threadPool: c.threadPool ?? spec.threadPool,
    connPool: c.connPool ?? spec.connPool,
    bandwidthMbps: spec.bandwidthMbps,
  };
}

function incidentProfile(inc: Incident, baseline: Baseline, changes?: MitigationChanges): Profile {
  const d = inc.data;
  const pr = profileFromBaseline(baseline, d.spec, d.payloadKb);
  if (d.type === "memory_leak") {
    pr.extraMemGbPerNode = (d.memGrowthMbPerHour * (d.durationMin / 60)) / 1024;
  }
  if (d.type === "batch_overlap") {
    pr.extraCpuFrac = d.batchCpuPct / 100;
    pr.connHoldFrac = 0.55;
  }
  if (changes?.timeoutMs) {
    pr.connHoldFrac = (pr.connHoldFrac ?? 0.4) * 0.8;
  }
  return pr;
}

function rootCauses(inc: Incident, ind: Indicators, lim: ResourceKey, viol: string[]): string[] {
  const d = inc.data;
  const out: string[] = [];
  if (d.type === "memory_leak")
    out.push(
      `Kebocoran memori ±${d.memGrowthMbPerHour} MB/jam per node menambah ${Math.round(((d.memGrowthMbPerHour * d.durationMin) / 60 / 1024) * 10) / 10} GB selama ${d.durationMin} menit.`,
    );
  if (d.type === "batch_overlap") out.push(`Batch job berjalan bersamaan dengan trafik puncak dan menambah beban CPU ${d.batchCpuPct}% per node.`);
  if (d.type === "traffic_spike")
    out.push(`Lonjakan trafik ${d.peakRps} RPS, ${(d.peakRps / Math.max(d.avgRps, 0.1)).toFixed(1)}× rata-rata harian.`);
  out.push(`${RESOURCE_LABEL[lim]} mencapai ${Math.round(peakUtil(ind))}% dan menjadi sumber daya pembatas.`);
  return out;
}

export async function assessIncident(
  inc: Incident,
  kind: "reproduksi" | "mitigasi",
  changes: MitigationChanges | undefined,
  ctx: EngineCtx,
): Promise<{ result: Assessment; baselineToCache?: Baseline }> {
  const tracer = new Tracer(ctx);
  const meter = new CostMeter(ctx.settings);
  const mask: MaskReport = { count: 0, kinds: [] };
  const now = ctx.now ?? new Date();
  const d = inc.data;
  const spec = kind === "mitigasi" && changes ? applyChanges(d.spec, changes) : d.spec;
  const key = `${inc.id}|${kind}|${JSON.stringify(changes ?? {})}`;

  const masked = await tracer.step("mask", "Samarkan data sensitif", async () => {
    const svc = aliasService(d.service, mask);
    const desc = maskText(`${d.title}. ${d.description} ${d.manualSymptoms}`, mask);
    return { value: { svc, desc }, note: `${mask.count} item disamarkan (${mask.kinds.join(", ")}).` };
  });

  const { baseline, elkDown } = await tracer.step("elk", "Ambil metrik baseline dan periode insiden dari ELK Stack", async () => {
    const r = fetchBaseline(d.service, ctx.settings, now);
    let note = baselineNote(r.baseline, r.elkDown);
    if (r.elkDown) tracer.warnings.push(note);
    if (!d.elkDataAvailable) {
      note += " Data periode insiden tidak tersedia; memakai gambaran gejala yang dimasukkan manual.";
    }
    return { value: r, note, warn: r.elkDown || !d.elkDataAvailable };
  });

  const ctxText = `Mode: ${kind}. Layanan: ${masked.svc}. Tipe insiden: ${d.type}. Ringkasan: ${masked.desc}
Beban puncak ${d.peakRps} RPS, rata-rata ${d.avgRps} RPS, durasi ${d.durationMin} menit.
Spesifikasi yang dinilai: ${JSON.stringify(spec)}${changes ? ` (opsi mitigasi: ${JSON.stringify(changes)})` : ""}
Baseline: ${JSON.stringify({ ...baseline, takenAt: undefined })}
Kriteria SLA: ${JSON.stringify(INCIDENT_CRITERIA)}`;

  await tracer.step("plan", "Susun rencana analisis", async () => {
    const base = kind === "reproduksi" ? "Reproduksi kondisi insiden pada spesifikasi saat ini." : "Nilai opsi mitigasi pada kondisi insiden yang sama.";
    if (!useLlm(ctx)) return { value: null, route: "llm", note: base };
    try {
      const text = await llmText(ctx, meter, `${ctxText}\n\nSusun rencana analisis singkat. Balas JSON: {"fokus": "satu kalimat"}`, 300);
      return { value: null, route: "llm", note: `${base} Fokus: ${extractJson<{ fokus?: string }>(text)?.fokus ?? text.slice(0, 160)}` };
    } catch (e) {
      tracer.warnings.push(`Layanan LLM gagal menyusun rencana (${(e as Error).message}).`);
      return { value: null, route: "llm", warn: true, note: base };
    }
  });

  const model = serviceModel(d.service);
  const ratio = d.peakRps / Math.max(baseline.peakTps, 0.1);
  let ind: Indicators | null = null;
  let route: StepRoute = "digital_twin";
  const manual: string[] = [];
  let stopped: string | null = null;

  if (!model?.twin || ratio > 6) {
    stopped = !model?.twin
      ? `Tidak ada model digital twin aktif untuk ${d.service}.`
      : `Beban ${ratio.toFixed(1)}× puncak baseline, di luar rentang terkalibrasi.`;
    tracer.skip("analyze", "Jalankan analisis pada digital twin", stopped);
  } else {
    const r = await tracer.step<{ ind: Indicators; route: StepRoute }>("analyze", "Jalankan analisis pada digital twin", async () => {
      const twin = simulate(spec, incidentProfile(inc, baseline, changes), d.peakRps);
      if (ratio <= 3) return { value: { ind: twin, route: "digital_twin" as StepRoute }, route: "digital_twin", note: `Kondisi ${d.peakRps} RPS disimulasikan pada digital twin.` };
      const est = await estimate(ctx, meter, tracer, key, ctxText, twin, ratio, 3, 6);
      if (est.confidence >= ctx.settings.confidenceThreshold) {
        manual.push(`Indikator pada ${d.peakRps} RPS berasal dari estimasi penalaran (keyakinan ${pct(est.confidence)})`);
        return {
          value: { ind: est.ind, route: "estimasi_penalaran" as StepRoute },
          route: "estimasi_penalaran",
          confidence: est.confidence,
          sampleAgreement: est.agreement,
          warn: true,
          note: "Di luar cakupan model; estimasi penalaran dipakai dan perlu verifikasi manual.",
        };
      }
      return {
        value: { ind: twin, route: "fallback_twin" as StepRoute },
        route: "fallback_twin",
        confidence: est.confidence,
        sampleAgreement: est.agreement,
        note: `Keyakinan ${pct(est.confidence)} di bawah ambang; dialihkan ke digital twin.`,
      };
    });
    ind = r.ind;
    route = r.route;
  }

  const lim = ind ? limitingResource(ind) : null;
  const viol = ind ? violations(ind, INCIDENT_CRITERIA) : [];
  if (ind) {
    await tracer.step("indicators", "Hitung indikator sumber daya", async () => ({
      value: null,
      note: `Pembatas: ${RESOURCE_LABEL[lim!]} ${Math.round(peakUtil(ind!))}%, p95 ${ind!.p95Ms} ms, error ${ind!.errorRatePct}%.`,
    }));
  } else tracer.skip("indicators", "Hitung indikator sumber daya", "Dilewati karena analisis dihentikan.");

  const { verdict, reasons, reproduced } = await tracer.step("verdict", "Tetapkan verdict", async () => {
    let verdict: Verdict;
    let reproduced: boolean | null = null;
    const reasons: string[] = [];
    if (!ind) {
      verdict = "TIDAK_DAPAT_DINILAI";
      reasons.push(stopped!, "Rekomendasi: kalibrasi ulang model digital twin dengan data periode insiden.");
    } else if (kind === "reproduksi") {
      reproduced = viol.length > 0;
      verdict = reproduced ? "TIDAK_LOLOS" : "LOLOS";
      reasons.push(
        reproduced
          ? "Insiden akan terjadi lagi pada spesifikasi saat ini."
          : "Gejala tidak tereproduksi: indikator masih dalam SLA pada spesifikasi saat ini.",
        ...viol,
      );
    } else {
      const st = scenarioStatus(ind, route, INCIDENT_CRITERIA);
      verdict = st.status;
      reasons.push(
        ...(st.violations.length ? st.violations : [`Seluruh indikator dalam SLA. ${RESOURCE_LABEL[lim!]} tertinggi ${Math.round(peakUtil(ind))}%.`]),
      );
    }
    return { value: { verdict, reasons, reproduced }, note: `Verdict: ${VERDICT_LABEL[verdict]}.` };
  });

  const causes = ind && lim ? rootCauses(inc, ind, lim, viol) : [];

  const narrative = await tracer.step("narrative", "Susun narasi verdict", async () => {
    const template = !ind
      ? `Status ${VERDICT_LABEL[verdict]}: ${stopped} Indikator tidak dihitung agar tidak menghasilkan angka di luar rentang yang dapat dipertanggungjawabkan.`
      : kind === "reproduksi"
        ? `${reproduced ? "Kondisi insiden tereproduksi" : "Kondisi insiden tidak tereproduksi"} pada spesifikasi ${spec.vcpu} vCPU, ${spec.ramGb} GB RAM, ${spec.nodes} node dengan beban ${d.peakRps} RPS. ${causes[0] ?? ""} ${BOTTLENECK_HINT[lim!]}`
        : `Dengan opsi mitigasi ini (${spec.vcpu} vCPU, ${spec.ramGb} GB RAM, ${spec.nodes} node, thread pool ${spec.threadPool}, connection pool ${spec.connPool}), ${RESOURCE_LABEL[lim!]} menjadi ${Math.round(peakUtil(ind))}% dengan p95 ${ind.p95Ms} ms. Verdict: ${VERDICT_LABEL[verdict]}.`;
    if (!useLlm(ctx)) return { value: template.trim(), route: "llm", note: "Narasi disusun dari templat (mode demo)." };
    try {
      const text = await llmText(
        ctx,
        meter,
        `${ctxText}\n\nHasil: ${JSON.stringify({ verdict: VERDICT_LABEL[verdict], tereproduksi: reproduced, indikator: ind, pembatas: lim ? RESOURCE_LABEL[lim] : null, alasan: reasons, kemungkinanAkarMasalah: causes })}\n\nTulis narasi 3-4 kalimat (teks biasa) yang menjelaskan hasil dan kemungkinan akar masalah. Jangan mengubah verdict.`,
        500,
      );
      return { value: text.trim() || template, route: "llm", note: `Narasi disusun oleh ${modelOf(ctx)}.` };
    } catch (e) {
      tracer.warnings.push(`Layanan LLM gagal menyusun narasi (${(e as Error).message}); memakai templat.`);
      return { value: template, route: "llm", warn: true, note: "Narasi memakai templat." };
    }
  });

  await tracer.step("trace", "Catat jejak keputusan", async () => ({
    value: null,
    note: useLlm(ctx)
      ? `${meter.cost.calls} panggilan LLM, estimasi Rp${meter.cost.idr.toLocaleString("id-ID")}.`
      : "Mode demo: tidak ada panggilan LLM berbayar.",
  }));

  return {
    result: {
      id: crypto.randomUUID(),
      createdAt: now.toISOString(),
      mode: ctx.settings.mode,
      provider: useLlm(ctx) ? ctx.settings.provider : undefined,
      model: useLlm(ctx) ? modelOf(ctx) : undefined,
      kind,
      reproduced,
      indicators: ind,
      limiting: lim,
      rootCauses: causes,
      verdict: manual.length && verdict === "LOLOS" ? "LOLOS_BERSYARAT" : verdict,
      reasons,
      manualVerification: manual,
      narrative,
      baseline,
      masking: mask,
      trace: tracer.trace,
      cost: meter.cost,
      warnings: tracer.warnings,
    },
    baselineToCache: elkDown ? undefined : baseline,
  };
}
