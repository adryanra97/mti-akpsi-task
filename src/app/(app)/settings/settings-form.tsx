"use client";

import { submitWith } from "@/components/form";
import { useActionState, useState, useTransition } from "react";
import { CircleCheck, CircleX, KeyRound, LoaderCircle, PlugZap, RotateCcw } from "lucide-react";
import { resetDemoData, testConnection, updateSettings, type SettingsState } from "./actions";
import { Button, Field, Input, Notice, Panel, cx } from "@/components/ui";
import type { AppSettings, ProviderId } from "@/lib/types";

export function SettingsForm({
  settings,
  keys,
  labels,
  suggestions,
}: {
  settings: AppSettings;
  keys: Record<ProviderId, boolean>;
  labels: Record<ProviderId, string>;
  suggestions: Record<ProviderId, string[]>;
}) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(updateSettings, {});
  const [mode, setMode] = useState(settings.mode);
  const [provider, setProvider] = useState<ProviderId>(settings.provider);
  const [models, setModels] = useState(settings.models);
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, startTest] = useTransition();
  const e = state.errors ?? {};

  return (
    <form onSubmit={submitWith(action)} className="grid gap-6" noValidate>
      {state.ok && <Notice tone="pass" icon={<CircleCheck className="h-4 w-4 text-pass" />} title={state.ok} />}
      {state.error && <Notice tone="fail" title={state.error} />}

      <Panel title="Mode analisis" description="Menentukan siapa yang menjalankan langkah penalaran Core Module.">
        <fieldset>
          <legend className="sr-only">Mode analisis</legend>
          <div className="grid gap-2 md:grid-cols-2">
            {[
              { v: "demo", t: "Demo", b: "Digital twin bawaan dengan rencana, estimasi, dan narasi deterministik. Tanpa API key dan tanpa biaya." },
              { v: "llm", t: "LLM", b: "Rencana analisis, estimasi penalaran, dan narasi verdict disusun oleh model pilihan. Data disamarkan sebelum dikirim." },
            ].map((o) => (
              <label
                key={o.v}
                className={cx("flex cursor-pointer gap-3 rounded-lg border px-4 py-3", mode === o.v ? "border-accent bg-accent-soft" : "border-line-strong hover:bg-surface-2")}
              >
                <input type="radio" name="mode" value={o.v} checked={mode === o.v} onChange={() => setMode(o.v as "demo" | "llm")} className="mt-1 accent-[var(--accent)]" />
                <span>
                  <span className="block font-medium">{o.t}</span>
                  <span className="block text-[13.5px] text-ink-3">{o.b}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </Panel>

      <Panel title="Penyedia LLM" description="API key dibaca dari environment variable di server dan tidak pernah dikirim ke browser.">
        <fieldset className={cx(mode === "demo" && "opacity-75")}>
          <legend className="sr-only">Penyedia LLM</legend>
          <div className="grid gap-2 md:grid-cols-3">
            {(Object.keys(labels) as ProviderId[]).map((p) => (
              <label
                key={p}
                className={cx("flex cursor-pointer gap-3 rounded-lg border px-4 py-3", provider === p ? "border-accent bg-accent-soft" : "border-line-strong hover:bg-surface-2")}
              >
                <input
                  type="radio"
                  name="provider"
                  value={p}
                  checked={provider === p}
                  onChange={() => {
                    setProvider(p);
                    setTest(null);
                  }}
                  className="mt-1 accent-[var(--accent)]"
                />
                <span className="min-w-0">
                  <span className="block font-medium">{labels[p]}</span>
                  <span className={cx("mt-0.5 flex items-center gap-1 text-[13px]", keys[p] ? "text-pass" : "text-ink-3")}>
                    <KeyRound className="h-3.5 w-3.5" aria-hidden />
                    {keys[p] ? "API key tersedia" : "API key belum diisi"}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {e.provider && <p className="mt-2 text-[13.5px] text-fail">{e.provider}</p>}
        </fieldset>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <Field label="Model" htmlFor="model" error={e.model} hint="Pilih dari saran atau ketik nama model lain.">
            <Input
              id="model"
              name="model"
              list="model-suggestions"
              value={models[provider]}
              onChange={(ev) => setModels((m) => ({ ...m, [provider]: ev.target.value }))}
              aria-invalid={!!e.model}
            />
            <datalist id="model-suggestions">
              {suggestions[provider].map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </Field>
          <Field label="Harga input (US$ per 1 juta token)" htmlFor="priceIn" error={e.priceIn}>
            <Input id="priceIn" name="priceIn" type="number" step="any" key={`in-${provider}`} defaultValue={settings.prices[provider].input} />
          </Field>
          <Field label="Harga output (US$ per 1 juta token)" htmlFor="priceOut" error={e.priceOut}>
            <Input id="priceOut" name="priceOut" type="number" step="any" key={`out-${provider}`} defaultValue={settings.prices[provider].output} />
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            disabled={testing || !keys[provider]}
            onClick={() => startTest(async () => setTest(await testConnection(provider, models[provider])))}
          >
            {testing ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <PlugZap className="h-4 w-4" aria-hidden />}
            Uji koneksi
          </Button>
          {!keys[provider] && <span className="text-[13.5px] text-ink-3">Tambahkan API key untuk menguji koneksi.</span>}
          {test && (
            <span className={cx("flex items-center gap-1.5 text-[13.5px]", test.ok ? "text-pass" : "text-fail")} role="status">
              {test.ok ? <CircleCheck className="h-4 w-4" aria-hidden /> : <CircleX className="h-4 w-4" aria-hidden />}
              {test.message}
            </span>
          )}
        </div>
      </Panel>

      <Panel title="Parameter Core Module">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Ambang skor keyakinan" htmlFor="confidenceThreshold" error={e.confidenceThreshold} hint="Di bawah ambang, langkah dialihkan ke digital twin.">
            <Input id="confidenceThreshold" name="confidenceThreshold" type="number" step="0.01" min={0.3} max={0.99} defaultValue={settings.confidenceThreshold} />
          </Field>
          <Field label="Jumlah sampel estimasi" htmlFor="samples" error={e.samples} hint="Untuk mengukur kesepakatan sampel. Lebih banyak berarti lebih mahal.">
            <Input id="samples" name="samples" type="number" min={1} max={5} defaultValue={settings.samples} />
          </Field>
          <Field label="Kurs US$ ke Rupiah" htmlFor="usdToIdr" error={e.usdToIdr}>
            <Input id="usdToIdr" name="usdToIdr" type="number" defaultValue={settings.usdToIdr} />
          </Field>
        </div>
        <label className="mt-4 flex items-start gap-3 rounded-lg border border-line px-4 py-3">
          <input type="checkbox" name="simulateElkDown" defaultChecked={settings.simulateElkDown} className="mt-1 accent-[var(--accent)]" />
          <span>
            <span className="block font-medium">Simulasikan ELK Stack tidak dapat diakses</span>
            <span className="block text-[13.5px] text-ink-3">Core Module memakai baseline tersimpan terakhir dan mencantumkan tanggalnya pada hasil. Berguna untuk demo alur alternatif.</span>
          </span>
        </label>
      </Panel>

      <div className="sticky bottom-0 -mx-4 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:px-5">
        <Button type="submit" disabled={pending}>
          {pending && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
          Simpan pengaturan
        </Button>
      </div>
    </form>
  );
}

export function ResetData() {
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="grid gap-3">
      <p className="text-[14px] text-ink-2">Menghapus seluruh sesi, insiden, sign-off, laporan, dan log audit, lalu mengisi ulang data contoh. Berguna sebelum demo.</p>
      {!confirm ? (
        <div>
          <Button variant="secondary" onClick={() => setConfirm(true)}>
            <RotateCcw className="h-4 w-4" aria-hidden /> Kembalikan data contoh
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border border-fail/30 bg-fail-soft p-4">
          <p className="font-medium">Semua data saat ini akan dihapus permanen.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="danger"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await resetDemoData();
                  setMsg(r.message);
                  setConfirm(false);
                })
              }
            >
              {pending && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
              Hapus dan isi ulang
            </Button>
            <Button variant="ghost" onClick={() => setConfirm(false)} disabled={pending}>
              Batal
            </Button>
          </div>
        </div>
      )}
      {msg && <p className="text-[14px] text-pass" role="status">{msg}</p>}
    </div>
  );
}
