export type Role = "TL" | "QA" | "IE" | "PM" | "SUP";

export type Verdict = "LOLOS" | "LOLOS_BERSYARAT" | "TIDAK_LOLOS" | "TIDAK_DAPAT_DINILAI";

export type ResourceKey = "cpu" | "mem" | "net" | "thread" | "conn";

export interface Spec {
  vcpu: number;
  ramGb: number;
  nodes: number;
  threadPool: number;
  connPool: number;
  bandwidthMbps: number;
}

export interface Criteria {
  maxP95Ms: number;
  maxErrorRatePct: number;
  maxCpuPct: number;
  maxMemPct: number;
}

export interface DevSummary {
  testedTps: number;
  p95Ms: number;
  cpuPct: number;
  memPct: number;
  errorRatePct: number;
  payloadKb: number;
  notes: string;
}

export interface AlignmentParams {
  normalTps: number;
  peakTps: number;
  whatIf: number[]; // pengali beban dari kondisi puncak, mis. [2, 3]
  serviceVersion: string;
  configChanges: string;
  criteria: Criteria;
  devSpec: Spec;
  devSummary: DevSummary;
  prodSpec: Spec;
}

export interface Indicators {
  tps: number;
  cpuPct: number;
  memPct: number;
  netPct: number;
  threadSatPct: number;
  connSatPct: number;
  p95Ms: number;
  errorRatePct: number;
}

export type StepRoute = "digital_twin" | "estimasi_penalaran" | "fallback_twin" | "dihentikan";

export interface TraceStep {
  id: string;
  label: string;
  route: StepRoute | "sistem" | "llm";
  confidence?: number;
  sampleAgreement?: number;
  note: string;
  durationMs: number;
}

export interface ScenarioResult {
  key: string;
  label: string;
  kind: "normal" | "puncak" | "whatif";
  tps: number;
  route: StepRoute;
  indicators: Indicators | null;
  limiting: ResourceKey | null;
  status: Verdict;
  violations: string[];
  confidence?: number;
}

export interface Baseline {
  source: "elk" | "cache";
  takenAt: string;
  window: string;
  avgTps: number;
  peakTps: number;
  cpuPct: number;
  memPct: number;
  p95Ms: number;
  errorRatePct: number;
}

export interface CostInfo {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  usd: number;
  idr: number;
}

export interface AnalysisResult {
  id: string;
  createdAt: string;
  createdBy: string;
  mode: "demo" | "llm";
  provider?: string;
  model?: string;
  params: AlignmentParams;
  scenarios: ScenarioResult[];
  maxTps: number | null;
  limiting: ResourceKey | null;
  verdict: Verdict;
  reasons: string[];
  conditions: string[];
  manualVerification: string[];
  narrative: string;
  baseline: Baseline;
  masking: { count: number; kinds: string[] };
  trace: TraceStep[];
  cost: CostInfo;
  warnings: string[];
}

export type SessionStatus = "menunggu_parameter" | "siap_dianalisis" | "dianalisis" | "diputuskan";
export type CycleDecision = "promosi" | "kembali_dev";

export interface AlignmentSession {
  id: string;
  code: string;
  service: string;
  release: string;
  releaseCandidate: string;
  cycleNo: number;
  envSource: string;
  envTarget: string;
  scheduledAt: string;
  createdAt: string;
  status: SessionStatus;
  params: AlignmentParams | null;
  paramsBy?: string;
  runs: AnalysisResult[];
  decision?: CycleDecision;
  decisionNotes?: string;
  followUps?: string[];
  decidedBy?: string;
  decidedAt?: string;
  reportId?: string;
  signoffId?: string;
  draftFrom?: string;
}

export type IncidentType = "traffic_spike" | "memory_leak" | "batch_overlap" | "lainnya";

export interface IncidentData {
  type: IncidentType;
  title: string;
  description: string;
  service: string;
  release: string;
  peakRps: number;
  avgRps: number;
  durationMin: number;
  detectedAt: string;
  payloadKb: number;
  memGrowthMbPerHour: number;
  batchCpuPct: number;
  spec: Spec;
  manualSymptoms: string;
  elkDataAvailable: boolean;
}

export interface MitigationChanges {
  vcpu?: number;
  ramGb?: number;
  nodes?: number;
  threadPool?: number;
  connPool?: number;
  timeoutMs?: number;
}

export interface Assessment {
  id: string;
  createdAt: string;
  mode: "demo" | "llm";
  provider?: string;
  model?: string;
  kind: "reproduksi" | "mitigasi";
  reproduced: boolean | null;
  indicators: Indicators | null;
  limiting: ResourceKey | null;
  rootCauses: string[];
  verdict: Verdict;
  reasons: string[];
  manualVerification: string[];
  narrative: string;
  baseline: Baseline;
  masking: { count: number; kinds: string[] };
  trace: TraceStep[];
  cost: CostInfo;
  warnings: string[];
}

export interface Mitigation {
  id: string;
  label: string;
  changes: MitigationChanges;
  result: Assessment | null;
  createdAt: string;
}

export type IncidentStatus = "baru" | "dinilai" | "mitigasi" | "selesai";

export interface Incident {
  id: string;
  code: string;
  createdAt: string;
  createdBy: string;
  status: IncidentStatus;
  data: IncidentData;
  repro: Assessment | null;
  mitigations: Mitigation[];
  selectedMitigationId?: string;
  needsEscalation: boolean;
  notReproduced: boolean;
  rootCauseAt?: string;
  closedAt?: string;
  reportId?: string;
}

export type SignoffStatus = "menunggu" | "disetujui" | "ditolak";

export interface SignoffDoc {
  id: string;
  code: string;
  sessionId: string;
  version: number;
  status: SignoffStatus;
  createdAt: string;
  requestedBy: string;
  snapshot: {
    service: string;
    release: string;
    releaseCandidate: string;
    cycleNo: number;
    envSource: string;
    envTarget: string;
    params: AlignmentParams;
    result: AnalysisResult;
    decisionNotes: string;
    followUps: string[];
    limitations: string[];
  };
  pmNotes?: string;
  decidedBy?: string;
  decidedAt?: string;
  lockedAt?: string;
  reportId?: string;
}

export type ReportKind = "alignment" | "signoff" | "insiden";

export interface ReportEntry {
  id: string;
  kind: ReportKind;
  refId: string;
  title: string;
  service: string;
  release: string;
  cycleNo: number | null;
  verdict: Verdict | null;
  status: string;
  restricted: boolean;
  createdAt: string;
  metrics: { cpuPct?: number; memPct?: number; p95Ms?: number; maxTps?: number | null; mttrMin?: number };
}

export interface AuditEntry {
  id: string;
  createdAt: string;
  user: string;
  role: Role;
  action: string;
  target: string;
  detail?: string;
}

export type ProviderId = "anthropic" | "openai" | "gemini";

export interface AppSettings {
  mode: "demo" | "llm";
  provider: ProviderId;
  models: Record<ProviderId, string>;
  prices: Record<ProviderId, { input: number; output: number }>; // USD per 1 juta token
  confidenceThreshold: number;
  samples: number;
  simulateElkDown: boolean;
  usdToIdr: number;
  cachedBaselines: Record<string, Baseline>;
  piiScrubbed?: boolean;
}
