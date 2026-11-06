"use client";

/**
 * Panel parameter analisis: ringkasan parameter tersimpan, formulir pengisian, dan pengajuan analisis.
 */
import { submitWith } from "@/components/form";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Pencil, Play, RotateCcw } from "lucide-react";
import { saveParams, type FormState } from "../actions";
import { Button, Field, Input, KeyValue, Notice, Textarea, cx } from "@/components/ui";
import { RunProgress, useCoreRun } from "@/components/run-progress";
import type { AlignmentParams } from "@/lib/types";
import { fmtNum } from "@/lib/format";

const WHATIF = [2, 3, 5, 10];

type NumField = { name: string; label: string; value: number; hint?: string; unit?: string };

/**
 * Isian angka dengan label, satuan, petunjuk, dan galat.
 *
 * Parameters
 * ----------
 * f : NumField
 *     Definisi field (nama, label, satuan, nilai awal, petunjuk).
 * error : string, optional
 *     Pesan galat validasi.
 * values : Record<string, string>, optional
 *     Nilai yang dikirim terakhir, dipakai ulang saat validasi gagal.
 *
 * Returns
 * -------
 * JSX.Element
 */
function NumberInput({ f, error, values }: { f: NumField; error?: string; values?: Record<string, string> }) {
  return (
    <Field label={f.unit ? `${f.label} (${f.unit})` : f.label} htmlFor={f.name} hint={f.hint} error={error}>
      <Input
        id={f.name}
        name={f.name}
        type="number"
        step="any"
        inputMode="decimal"
        defaultValue={values?.[f.name] ?? (Number.isFinite(f.value) ? f.value : "")}
        aria-invalid={!!error}
        aria-describedby={error ? `${f.name}-error` : f.hint ? `${f.name}-hint` : undefined}
      />
    </Field>
  );
}

/**
 * Kelompok isian formulir dengan judul dan keterangan.
 *
 * Parameters
 * ----------
 * title : string
 *     Judul kelompok.
 * description : string, optional
 *     Keterangan kelompok.
 * children : ReactNode
 *     Isian di dalam kelompok.
 *
 * Returns
 * -------
 * JSX.Element
 */
function Group({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <fieldset className="grid gap-4 border-t border-line pt-5 first:border-0 first:pt-0">
      <legend className="sr-only">{title}</legend>
      <div aria-hidden>
        <p className="font-display text-[16px] font-semibold">{title}</p>
        {description && <p className="text-[13.5px] text-ink-3">{description}</p>}
      </div>
      {children}
    </fieldset>
  );
}

/**
 * Panel parameter dan pengajuan analisis untuk satu sesi.
 *
 * Parameters
 * ----------
 * sessionId : string
 *     Identitas sesi.
 * params : AlignmentParams
 *     Parameter tersimpan, draf dari cycle sebelumnya, atau nilai bawaan.
 * hasSavedParams : boolean
 *     Parameter sudah pernah disimpan.
 * draftNote : string, optional
 *     Penjelasan bila isian diambil dari cycle sebelumnya.
 * canEdit : boolean
 *     Pengguna boleh mengubah parameter pada status saat ini.
 * canRun : boolean
 *     Pengguna boleh mengajukan analisis pada status saat ini.
 * needsRun : boolean
 *     Parameter berubah sejak analisis terakhir.
 * hasRuns : boolean
 *     Sesi sudah pernah dianalisis.
 * waiting : boolean
 *     Sesi berstatus Menunggu Hasil.
 *
 * Returns
 * -------
 * JSX.Element
 */
export function Workbench({
  sessionId,
  params,
  hasSavedParams,
  draftNote,
  canEdit,
  canRun,
  needsRun,
  hasRuns,
  waiting,
  range,
}: {
  sessionId: string;
  params: AlignmentParams;
  hasSavedParams: boolean;
  draftNote?: string;
  canEdit: boolean;
  canRun: boolean;
  needsRun: boolean;
  hasRuns: boolean;
  waiting: boolean;
  range: { min: number; max: number } | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(!hasSavedParams && canEdit);
  const [state, action, pending] = useActionState<FormState, FormData>(saveParams.bind(null, sessionId), {});
  const run = useCoreRun();
  // Nilai beban yang sedang diketik, untuk peringatan rentang kalibrasi sebelum analisis diajukan.
  const [live, setLive] = useState({ normal: params.normalTps, peak: params.peakTps, whatIf: params.whatIf });
  const lastSaved = useRef<number | undefined>(undefined);
  const errorRef = useRef<HTMLDivElement>(null);
  const e = state.errors ?? {};
  const vals = state.errors ? state.values : undefined;
  const sv = (k: string, d: string) => vals?.[k] ?? d;

  /**
   * Mengajukan analisis ke Core Module lalu memuat ulang halaman bila hasil tersimpan.
   *
   * Returns
   * -------
   * Promise<void>
   */
  async function startRun() {
    const ok = await run.start(`/api/alignment/${sessionId}/request`, `/api/alignment/${sessionId}/result`);
    if (ok) {
      router.refresh();
      setTimeout(() => document.getElementById("hasil")?.scrollIntoView({ behavior: "smooth", block: "start" }), 400);
    }
  }

  useEffect(() => {
    if (state.ok && state.savedAt && state.savedAt !== lastSaved.current) {
      lastSaved.current = state.savedAt;
      setEditing(false);
      router.refresh();
      if (state.intent === "run") setTimeout(startRun, 50);
    }
    if (state.errors) errorRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const p = params;

  if (!editing) {
    return (
      <div className="grid gap-4">
        {hasSavedParams ? (
          <div className="grid gap-5 md:grid-cols-2">
            <KeyValue
              items={[
                ["Beban normal", `${fmtNum(p.normalTps)} TPS`],
                ["Beban puncak", `${fmtNum(p.peakTps)} TPS`],
                ["Uji what-if", p.whatIf.length ? p.whatIf.map((m) => `${fmtNum(m)}× normal (${fmtNum(p.normalTps * m)} TPS)`).join(", ") : "Tidak ada"],
                ["Versi layanan", p.serviceVersion],
                ["Perubahan", p.configChanges || "–"],
              ]}
            />
            <KeyValue
              items={[
                ["Kriteria", `p95 ≤ ${p.criteria.maxP95Ms} ms, error ≤ ${p.criteria.maxErrorRatePct}%, CPU ≤ ${p.criteria.maxCpuPct}%, memori ≤ ${p.criteria.maxMemPct}%`],
                ["Uji Dev", `${p.devSummary.testedTps} TPS, p95 ${p.devSummary.p95Ms} ms, CPU ${p.devSummary.cpuPct}%`],
                ["Spesifikasi Dev", `${p.devSpec.vcpu} vCPU, ${p.devSpec.ramGb} GB, ${p.devSpec.nodes} node`],
                ["Spesifikasi Production", `${p.prodSpec.vcpu} vCPU, ${p.prodSpec.ramGb} GB, ${p.prodSpec.nodes} node, thread pool ${p.prodSpec.threadPool}, connection pool ${p.prodSpec.connPool}, timeout ${p.prodSpec.timeoutMs ?? 3000} ms`],
              ]}
            />
          </div>
        ) : (
          <p className="text-[14px] text-ink-3">QA/Performance Tester belum mengisi parameter analisis untuk sesi ini.</p>
        )}

        {(canEdit || canRun) && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            {canRun && hasSavedParams && (
              <Button onClick={startRun} disabled={run.running}>
                {run.running ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : hasRuns ? <RotateCcw className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
                {run.running ? "Menganalisis…" : waiting ? "Ajukan ulang analisis" : "Ajukan analisis"}
              </Button>
            )}
            {canEdit && (
              <Button variant="secondary" onClick={() => setEditing(true)} disabled={run.running}>
                <Pencil className="h-4 w-4" aria-hidden /> {!hasSavedParams ? "Isi parameter" : hasRuns ? "Uji varian lain" : "Ubah parameter"}
              </Button>
            )}
            {needsRun && hasSavedParams && !run.running && (
              <span className="text-[13.5px] text-cond">Parameter berubah sejak analisis terakhir. Ajukan analisis agar verdict mengikuti parameter terbaru.</span>
            )}
          </div>
        )}
        {run.error && <Notice tone="fail" title="Analisis gagal">{run.error}</Notice>}
        <RunProgress steps={run.steps} statuses={run.statuses} running={run.running} />
      </div>
    );
  }

  const v = (n: number) => n;
  return (
    <form
      onSubmit={submitWith(action)}
      onChange={(ev) => {
        const f = new FormData(ev.currentTarget);
        const n = (k: string) => Number(String(f.get(k) ?? "").replace(",", "."));
        setLive({ normal: n("normalTps"), peak: n("peakTps"), whatIf: f.getAll("whatIf").map(Number) });
      }}
      noValidate
      className="grid gap-5"
    >
      {draftNote && <Notice tone="info">{draftNote}</Notice>}
      {state.error && (
        <div ref={errorRef} tabIndex={-1} role="alert" className="rounded-lg border border-fail/30 bg-fail-soft px-4 py-3 text-[14px] outline-none">
          <p className="font-medium text-fail">{state.error}</p>
          {state.errors && (
            <ul className="mt-1 grid gap-0.5 text-ink-2">
              {Object.entries(state.errors).map(([k, msg]) => (
                <li key={k}>
                  <a href={`#${k}`} className="underline underline-offset-2 hover:text-ink">
                    {msg}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Group title="Skenario beban" description="Beban dalam transaksi per detik (TPS) pada Production.">
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberInput f={{ name: "normalTps", label: "Beban normal", unit: "TPS", value: v(p.normalTps), hint: "Umumnya 3–10 TPS." }} values={vals} error={e.normalTps} />
          <NumberInput f={{ name: "peakTps", label: "Beban puncak", unit: "TPS", value: v(p.peakTps), hint: "Umumnya 33–55 TPS." }} values={vals} error={e.peakTps} />
        </div>
        <div>
          <p className="mb-1.5 text-[13.5px] font-medium" id="whatif-label">
            Uji what-if bertingkat (pengali beban normal)
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby="whatif-label">
            {WHATIF.map((m) => (
              <label
                key={m}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-line-strong px-3 py-2 text-[14px] has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
              >
                <input type="checkbox" name="whatIf" value={m} defaultChecked={vals ? (vals.whatIf ?? "").split(",").includes(String(m)) : p.whatIf.includes(m)} className="accent-[var(--accent)]" />
                {fmtNum(m)}× normal
              </label>
            ))}
          </div>
          <p className="mt-1 text-[13px] text-ink-3">
            Setiap varian dijalankan pada digital twin
            {range ? `, yang terkalibrasi untuk ${fmtNum(range.min)} sampai ${fmtNum(range.max)} TPS` : ""}. Varian di luar rentang itu ditandai Tidak Dapat
            Dinilai tanpa menghentikan analisis beban normal dan puncak.
          </p>
          {range && (() => {
            const out = live.whatIf.filter((m) => live.normal > 0 && live.normal * m > range.max);
            const peakOut = live.peak > range.max || live.normal > range.max;
            if (!out.length && !peakOut) return null;
            return (
              <div className="mt-2 rounded-lg border border-cond/40 bg-cond-soft px-3 py-2 text-[13.5px]" role="status">
                {peakOut && (
                  <p>
                    <span className="font-medium">Beban normal atau puncak melebihi {fmtNum(range.max)} TPS.</span> Seluruh analisis akan berstatus Tidak Dapat Dinilai.
                  </p>
                )}
                {out.length > 0 && (
                  <p>
                    {out.map((m) => `${fmtNum(m)}× normal (${fmtNum(live.normal * m)} TPS)`).join(", ")} di luar rentang model; varian ini tidak akan dinilai.
                  </p>
                )}
              </div>
            );
          })()}
        </div>
      </Group>

      <Group title="Perubahan pada release candidate">
        <Field label="Versi layanan" htmlFor="serviceVersion" error={e.serviceVersion}>
          <Input id="serviceVersion" name="serviceVersion" defaultValue={sv("serviceVersion", p.serviceVersion)} aria-invalid={!!e.serviceVersion} placeholder="Kandidat 1 (v3.9)" />
        </Field>
        <Field
          label="Perubahan konfigurasi atau versi"
          htmlFor="configChanges"
          hint="Host, IP, email, dan nomor panjang disamarkan otomatis. Komponen di luar cakupan model (mis. Kafka, Redis) dinilai lewat estimasi penalaran."
        >
          <Textarea id="configChanges" name="configChanges" rows={2} defaultValue={sv("configChanges", p.configChanges)} />
        </Field>
      </Group>

      <Group title="Kriteria penerimaan">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <NumberInput f={{ name: "maxP95Ms", label: "Batas p95", unit: "ms", value: p.criteria.maxP95Ms }} values={vals} error={e.maxP95Ms} />
          <NumberInput f={{ name: "maxErrorRatePct", label: "Batas error rate", unit: "%", value: p.criteria.maxErrorRatePct }} values={vals} error={e.maxErrorRatePct} />
          <NumberInput f={{ name: "maxCpuPct", label: "Batas CPU", unit: "%", value: p.criteria.maxCpuPct }} values={vals} error={e.maxCpuPct} />
          <NumberInput f={{ name: "maxMemPct", label: "Batas memori", unit: "%", value: p.criteria.maxMemPct }} values={vals} error={e.maxMemPct} />
        </div>
      </Group>

      <Group title="Ringkasan hasil uji di Dev" description="Dari SIT/UAT dan performance test yang sudah berjalan.">
        <div className="grid gap-4 sm:grid-cols-3">
          <NumberInput f={{ name: "testedTps", label: "Beban yang diuji", unit: "TPS", value: p.devSummary.testedTps }} values={vals} error={e.testedTps} />
          <NumberInput f={{ name: "devP95Ms", label: "p95", unit: "ms", value: p.devSummary.p95Ms }} values={vals} error={e.devP95Ms} />
          <NumberInput f={{ name: "devErrorRatePct", label: "Error rate", unit: "%", value: p.devSummary.errorRatePct }} values={vals} error={e.devErrorRatePct} />
          <NumberInput f={{ name: "devCpuPct", label: "CPU", unit: "%", value: p.devSummary.cpuPct }} values={vals} error={e.devCpuPct} />
          <NumberInput f={{ name: "devMemPct", label: "Memori", unit: "%", value: p.devSummary.memPct }} values={vals} error={e.devMemPct} />
          <NumberInput f={{ name: "payloadKb", label: "Payload rata-rata", unit: "KB", value: p.devSummary.payloadKb }} values={vals} error={e.payloadKb} />
        </div>
        <Field label="Catatan hasil uji" htmlFor="devNotes">
          <Textarea id="devNotes" name="devNotes" rows={2} defaultValue={sv("devNotes", p.devSummary.notes)} />
        </Field>
      </Group>

      <Group title="Spesifikasi environment">
        <div>
          <p className="mb-2 text-[13.5px] font-medium text-ink-2">Dev (asal)</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <NumberInput f={{ name: "devVcpu", label: "vCPU per node", value: p.devSpec.vcpu }} values={vals} error={e.devVcpu} />
            <NumberInput f={{ name: "devRamGb", label: "RAM per node", unit: "GB", value: p.devSpec.ramGb }} values={vals} error={e.devRamGb} />
            <NumberInput f={{ name: "devNodes", label: "Jumlah node", value: p.devSpec.nodes }} values={vals} error={e.devNodes} />
          </div>
        </div>
        <div>
          <p className="mb-2 text-[13.5px] font-medium text-ink-2">Production (target)</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <NumberInput f={{ name: "prodVcpu", label: "vCPU per node", value: p.prodSpec.vcpu }} values={vals} error={e.prodVcpu} />
            <NumberInput f={{ name: "prodRamGb", label: "RAM per node", unit: "GB", value: p.prodSpec.ramGb }} values={vals} error={e.prodRamGb} />
            <NumberInput f={{ name: "prodNodes", label: "Jumlah node", value: p.prodSpec.nodes }} values={vals} error={e.prodNodes} />
            <NumberInput f={{ name: "prodThreadPool", label: "Thread pool per node", value: p.prodSpec.threadPool }} values={vals} error={e.prodThreadPool} />
            <NumberInput f={{ name: "prodConnPool", label: "Connection pool per node", value: p.prodSpec.connPool }} values={vals} error={e.prodConnPool} />
            <NumberInput f={{ name: "prodBandwidth", label: "Bandwidth per node", unit: "Mbps", value: p.prodSpec.bandwidthMbps }} values={vals} error={e.prodBandwidth} />
            <NumberInput f={{ name: "prodTimeoutMs", label: "Timeout request", unit: "ms", value: p.prodSpec.timeoutMs ?? 3000 }} values={vals} error={e.prodTimeoutMs} />
          </div>
        </div>
      </Group>

      <div className={cx("sticky bottom-0 -mx-5 flex flex-wrap gap-2 border-t border-line bg-surface/95 px-5 py-3 backdrop-blur")}>
        {canRun && (
          <Button type="submit" name="intent" value="run" disabled={pending}>
            {pending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
            Simpan dan ajukan analisis
          </Button>
        )}
        <Button type="submit" name="intent" value="save" variant="secondary" disabled={pending}>
          Simpan parameter
        </Button>
        {hasSavedParams && (
          <Button type="button" variant="ghost" onClick={() => setEditing(false)} disabled={pending}>
            Batal
          </Button>
        )}
      </div>
    </form>
  );
}
