"use client";

import { submitWith } from "@/components/form";
import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, FlaskConical, LoaderCircle, Play } from "lucide-react";
import { RunProgress, useStreamRun } from "@/components/run-progress";
import { Button, Field, Input, Notice, cx } from "@/components/ui";
import { VerdictBadge } from "@/components/verdict";
import { finalizeIncident, markAllTested, type IncFormState } from "../actions";
import type { Mitigation, Spec } from "@/lib/types";

export function ReproRunner({ id, rerun }: { id: string; rerun?: boolean }) {
  const router = useRouter();
  const run = useStreamRun();
  return (
    <div className="grid gap-3">
      <div>
        <Button
          variant={rerun ? "secondary" : "primary"}
          disabled={run.running}
          onClick={async () => {
            if (await run.start(`/api/incidents/${id}/assess`, { kind: "reproduksi" })) router.refresh();
          }}
        >
          {run.running ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
          {run.running ? "Menilai…" : rerun ? "Nilai ulang kondisi insiden" : "Nilai kondisi insiden"}
        </Button>
      </div>
      {run.error && <Notice tone="fail" title="Penilaian gagal">{run.error}</Notice>}
      <RunProgress steps={run.steps} running={run.running} />
    </div>
  );
}

const FIELDS: { key: keyof Spec | "timeoutMs"; label: string }[] = [
  { key: "vcpu", label: "vCPU per node" },
  { key: "ramGb", label: "RAM per node (GB)" },
  { key: "nodes", label: "Jumlah node" },
  { key: "threadPool", label: "Thread pool" },
  { key: "connPool", label: "Connection pool" },
  { key: "timeoutMs", label: "Timeout hilir (ms)" },
];

export function MitigationLab({ id, spec, count }: { id: string; spec: Spec; count: number }) {
  const router = useRouter();
  const run = useStreamRun();
  const [label, setLabel] = useState("");
  const [vals, setVals] = useState<Record<string, string>>({});
  const changed = Object.entries(vals).filter(([k, v]) => v !== "" && Number(v) !== (spec as unknown as Record<string, number>)[k]);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const changes = Object.fromEntries(changed.map(([k, v]) => [k, Number(v)]));
    const auto = changed.map(([k, v]) => `${FIELDS.find((f) => f.key === k)?.label.split(" (")[0]} ${v}`).join(", ");
    const ok = await run.start(`/api/incidents/${id}/assess`, { kind: "mitigasi", label: label || auto, changes });
    if (ok) {
      setLabel("");
      setVals({});
      router.refresh();
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <p className="text-[14px] text-ink-2">
        Ubah nilai yang ingin diuji. Nilai yang tidak diubah memakai spesifikasi saat ini.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {FIELDS.map((f) => {
          const current = f.key === "timeoutMs" ? undefined : spec[f.key as keyof Spec];
          return (
            <Field key={f.key} label={f.label} htmlFor={`m-${f.key}`} hint={current !== undefined ? `Saat ini ${current}` : "Opsional"}>
              <Input
                id={`m-${f.key}`}
                type="number"
                min={1}
                inputMode="numeric"
                placeholder={current !== undefined ? String(current) : "–"}
                value={vals[f.key] ?? ""}
                onChange={(e) => setVals((p) => ({ ...p, [f.key]: e.target.value }))}
                className={cx(vals[f.key] && Number(vals[f.key]) !== current && "border-accent")}
              />
            </Field>
          );
        })}
      </div>
      <Field label="Nama opsi (opsional)" htmlFor="m-label">
        <Input id="m-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={`Opsi ${count + 1}`} />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={run.running || changed.length === 0}>
          {run.running ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <FlaskConical className="h-4 w-4" aria-hidden />}
          {run.running ? "Menilai opsi…" : "Nilai opsi mitigasi"}
        </Button>
        {changed.length === 0 && !run.running && <span className="text-[13.5px] text-ink-3">Ubah minimal satu nilai untuk menguji opsi.</span>}
      </div>
      {run.error && <Notice tone="fail" title="Penilaian gagal">{run.error}</Notice>}
      <RunProgress steps={run.steps} running={run.running} />
    </form>
  );
}

export function AllTestedButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button variant="secondary" disabled={pending} onClick={() => start(() => markAllTested(id))}>
      {pending && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
      Semua opsi sudah diuji
    </Button>
  );
}

export function FinalizeForm({
  id,
  mitigations,
  notReproduced,
}: {
  id: string;
  mitigations: Mitigation[];
  notReproduced: boolean;
}) {
  const [state, action, pending] = useActionState<IncFormState, FormData>(finalizeIncident.bind(null, id), {});
  const best = mitigations.find((m) => m.result?.verdict === "LOLOS") ?? mitigations.find((m) => m.result?.verdict === "LOLOS_BERSYARAT");
  const [sel, setSel] = useState(best?.id ?? "");
  return (
    <form onSubmit={submitWith(action)} className="grid gap-4">
      {!notReproduced && (
        <fieldset>
          <legend className="mb-2 text-[13.5px] font-medium">Mitigasi yang direkomendasikan</legend>
          <div className="grid gap-2">
            {mitigations.map((m) => (
              <label
                key={m.id}
                className={cx(
                  "flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-2.5",
                  sel === m.id ? "border-accent bg-accent-soft" : "border-line-strong hover:bg-surface-2",
                )}
              >
                <input type="radio" name="mitigation" value={m.id} checked={sel === m.id} onChange={() => setSel(m.id)} className="accent-[var(--accent)]" />
                <span className="flex-1">{m.label}</span>
                {m.result && <VerdictBadge verdict={m.result.verdict} size="sm" />}
              </label>
            ))}
          </div>
          {state.errors?.mitigation && <p className="mt-1 text-[13px] text-fail">{state.errors.mitigation}</p>}
        </fieldset>
      )}
      {state.error && <p className="text-[14px] text-fail" role="alert">{state.error}</p>}
      <div>
        <Button type="submit" disabled={pending}>
          {pending && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
          Susun dan simpan laporan insiden
        </Button>
      </div>
    </form>
  );
}

export function CopySummary({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? <Check className="h-4 w-4 text-pass" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
      {copied ? "Ringkasan tersalin" : "Salin ringkasan untuk eskalasi"}
    </Button>
  );
}
