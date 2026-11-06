"use client";

import { submitWith } from "@/components/form";
import { useActionState, useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { createIncident, type IncFormState } from "../actions";
import { Button, ButtonLink, Field, Input, Panel, Select, Textarea, cx } from "@/components/ui";
import type { IncidentType, Spec } from "@/lib/types";

const TYPES: { value: IncidentType; title: string; body: string }[] = [
  { value: "traffic_spike", title: "Traffic spike", body: "Lonjakan request melebihi kebiasaan." },
  { value: "memory_leak", title: "Memory leak", body: "Memori naik terus hingga OOM atau restart." },
  { value: "batch_overlap", title: "Batch job overlap", body: "Batch berjalan bersamaan dengan trafik." },
  { value: "lainnya", title: "Lainnya", body: "Gejala performa lain." },
];

export function IncidentForm({ services, nowWib }: { services: { name: string; spec: Spec }[]; nowWib: string }) {
  const [state, action, pending] = useActionState<IncFormState, FormData>(createIncident, {});
  const v = state.values ?? {};
  const e = state.errors ?? {};
  const [type, setType] = useState<IncidentType>((v.type as IncidentType) || "traffic_spike");
  const [service, setService] = useState(v.service || services[0].name);
  const [elk, setElk] = useState(v.elkDataAvailable ? true : !state.values);
  const spec = services.find((s) => s.name === service)!.spec;
  const errRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.error) errRef.current?.focus();
  }, [state]);

  const num = (name: string, label: string, def: number | string, hint?: string) => (
    <Field label={label} htmlFor={name} error={e[name]} hint={hint}>
      <Input
        id={name}
        name={name}
        type="number"
        step="any"
        inputMode="decimal"
        key={`${name}-${service}`}
        defaultValue={v[name] ?? def}
        aria-invalid={!!e[name]}
      />
    </Field>
  );

  return (
    <form onSubmit={submitWith(action)} noValidate className="grid gap-6">
      {state.error && (
        <div ref={errRef} tabIndex={-1} role="alert" className="rounded-lg border border-fail/30 bg-fail-soft px-4 py-3 text-[14px] outline-none">
          <p className="font-medium text-fail">{state.error}</p>
          <ul className="mt-1 grid gap-0.5 text-ink-2">
            {Object.entries(e).map(([k, m]) => (
              <li key={k}>
                <a className="underline underline-offset-2" href={`#${k}`}>
                  {m}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Panel title="Tipe insiden">
        <fieldset>
          <legend className="sr-only">Tipe insiden</legend>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {TYPES.map((t) => (
              <label
                key={t.value}
                className={cx(
                  "flex cursor-pointer gap-3 rounded-lg border px-3.5 py-3",
                  type === t.value ? "border-accent bg-accent-soft" : "border-line-strong hover:bg-surface-2",
                )}
              >
                <input type="radio" name="type" value={t.value} checked={type === t.value} onChange={() => setType(t.value)} className="mt-1 accent-[var(--accent)]" />
                <span>
                  <span className="block font-medium">{t.title}</span>
                  <span className="block text-[13px] text-ink-3">{t.body}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </Panel>

      <Panel title="Data insiden">
        <div className="grid gap-4">
          <Field label="Judul" htmlFor="title" error={e.title}>
            <Input id="title" name="title" defaultValue={v.title} aria-invalid={!!e.title} placeholder="Timeout pada endpoint pembayaran saat payday" />
          </Field>
          <Field label="Deskripsi kejadian" htmlFor="description" error={e.description} hint="Host, IP, dan nomor panjang disamarkan otomatis sebelum dikirim ke Layanan LLM.">
            <Textarea id="description" name="description" rows={3} defaultValue={v.description} aria-invalid={!!e.description} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Layanan terkait" htmlFor="service" error={e.service}>
              <Select id="service" name="service" value={service} onChange={(ev) => setService(ev.target.value)}>
                {services.map((s) => (
                  <option key={s.name}>{s.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Rilis atau rollout terkait" htmlFor="release" error={e.release}>
              <Input id="release" name="release" defaultValue={v.release} aria-invalid={!!e.release} placeholder="Rilis QRIS" />
            </Field>
            <Field label="Waktu deteksi (WIB)" htmlFor="detectedAt" error={e.detectedAt}>
              <Input id="detectedAt" name="detectedAt" type="datetime-local" defaultValue={v.detectedAt ?? nowWib} aria-invalid={!!e.detectedAt} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            {num("peakRps", "Beban puncak (RPS)", "")}
            {num("avgRps", "Beban rata-rata (RPS)", "")}
            {num("durationMin", "Durasi (menit)", "")}
            {num("payloadKb", "Payload (KB)", 6)}
          </div>
          {type === "memory_leak" && <div className="max-w-xs">{num("memGrowthMbPerHour", "Kenaikan memori (MB/jam per node)", "")}</div>}
          {type === "batch_overlap" && <div className="max-w-xs">{num("batchCpuPct", "Beban CPU batch job (% per node)", "")}</div>}

          <label className="flex items-start gap-3 rounded-lg border border-line px-3.5 py-3">
            <input type="checkbox" name="elkDataAvailable" checked={elk} onChange={(ev) => setElk(ev.target.checked)} className="mt-1 accent-[var(--accent)]" />
            <span>
              <span className="block font-medium">Data periode insiden tersedia di ELK Stack</span>
              <span className="block text-[13px] text-ink-3">Hapus centang bila data tidak tersedia atau tertutup perjanjian kerahasiaan.</span>
            </span>
          </label>
          {!elk && (
            <Field label="Gambaran umum gejala" htmlFor="manualSymptoms" error={e.manualSymptoms} hint="Dipakai menggantikan metrik periode insiden dari ELK.">
              <Textarea id="manualSymptoms" name="manualSymptoms" rows={2} defaultValue={v.manualSymptoms} aria-invalid={!!e.manualSymptoms} />
            </Field>
          )}
        </div>
      </Panel>

      <Panel title="Spesifikasi sistem saat ini" description={`Terisi dari spesifikasi Production ${service}. Ubah bila berbeda.`}>
        <div className="grid gap-4 sm:grid-cols-3">
          {num("vcpu", "vCPU per node", spec.vcpu)}
          {num("ramGb", "RAM per node (GB)", spec.ramGb)}
          {num("nodes", "Jumlah node", spec.nodes)}
          {num("threadPool", "Thread pool per node", spec.threadPool)}
          {num("connPool", "Connection pool per node", spec.connPool)}
          {num("bandwidthMbps", "Bandwidth per node (Mbps)", spec.bandwidthMbps)}
        </div>
      </Panel>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
          Simpan kasus insiden
        </Button>
        <ButtonLink href="/incidents" variant="ghost">
          Batal
        </ButtonLink>
      </div>
    </form>
  );
}
