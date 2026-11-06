"use client";

import { submitWith } from "@/components/form";
import { useActionState, useState } from "react";
import { LoaderCircle, Lock } from "lucide-react";
import { decideCycle, type FormState } from "../actions";
import { Button, Field, Textarea, cx } from "@/components/ui";
import type { Verdict } from "@/lib/types";

export function DecisionForm({ sessionId, verdict, defaultFollowUps }: { sessionId: string; verdict: Verdict; defaultFollowUps: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(decideCycle.bind(null, sessionId), {});
  const blocked = verdict === "TIDAK_LOLOS" || verdict === "TIDAK_DAPAT_DINILAI";
  const [decision, setDecision] = useState<string>(state.values?.decision ?? (blocked ? "kembali_dev" : ""));
  const [confirming, setConfirming] = useState(false);
  const e = state.errors ?? {};

  const options = [
    {
      value: "promosi",
      title: "Lanjut promosi ke Production",
      body: blocked
        ? "Tidak tersedia: verdict Tidak Lolos atau Tidak Dapat Dinilai mengharuskan release candidate kembali ke Dev."
        : "Laporan disimpan dan draf dokumen sign-off dikirim ke Project/Technical Manager.",
      disabled: blocked,
    },
    {
      value: "kembali_dev",
      title: "Kembali ke Dev untuk sprint cycle berikutnya",
      body: "Laporan disimpan. Catatan tindak lanjut menjadi masukan cycle berikutnya.",
      disabled: false,
    },
  ];

  return (
    <form onSubmit={submitWith(action)} className="grid gap-4" noValidate>
      <fieldset>
        <legend className="mb-2 text-[13.5px] font-medium">Keputusan cycle</legend>
        <div className="grid gap-2 md:grid-cols-2">
          {options.map((o) => (
            <label
              key={o.value}
              className={cx(
                "flex gap-3 rounded-lg border px-4 py-3",
                o.disabled ? "cursor-not-allowed border-line bg-surface-2 opacity-70" : "cursor-pointer border-line-strong hover:bg-surface-2",
                decision === o.value && "border-accent bg-accent-soft hover:bg-accent-soft",
              )}
            >
              <input
                type="radio"
                name="decision"
                value={o.value}
                disabled={o.disabled}
                checked={decision === o.value}
                onChange={() => {
                  setDecision(o.value);
                  setConfirming(false);
                }}
                className="mt-1 accent-[var(--accent)]"
              />
              <span>
                <span className="block font-medium">{o.title}</span>
                <span className="block text-[13.5px] text-ink-3">{o.body}</span>
              </span>
            </label>
          ))}
        </div>
        {e.decision && <p className="mt-1 text-[13px] text-fail">{e.decision}</p>}
      </fieldset>

      <Field label="Ringkasan keputusan alignment meeting" htmlFor="notes" error={e.notes}>
        <Textarea id="notes" name="notes" rows={3} defaultValue={state.values?.notes} aria-invalid={!!e.notes} placeholder="Apa yang disepakati peserta dan mengapa" />
      </Field>
      <Field
        label="Catatan tindak lanjut (satu per baris)"
        htmlFor="followUps"
        error={e.followUps}
        hint={decision === "kembali_dev" ? "Wajib diisi saat kembali ke Dev." : "Opsional saat promosi."}
      >
        <Textarea id="followUps" name="followUps" rows={3} defaultValue={state.values?.followUps ?? defaultFollowUps} aria-invalid={!!e.followUps} />
      </Field>

      {state.error && <p className="text-[14px] text-fail" role="alert">{state.error}</p>}

      {!confirming ? (
        <div>
          <Button type="button" onClick={() => setConfirming(true)} disabled={!decision}>
            Simpan keputusan
          </Button>
          {!decision && <span className="ml-3 text-[13.5px] text-ink-3">Pilih keputusan terlebih dahulu.</span>}
        </div>
      ) : (
        <div className="rounded-lg border border-line-strong bg-surface-2 p-4">
          <p className="flex items-center gap-2 font-medium">
            <Lock className="h-4 w-4" aria-hidden /> Keputusan tidak dapat diubah setelah disimpan.
          </p>
          <p className="mt-1 text-[14px] text-ink-2">
            {decision === "promosi"
              ? "Laporan alignment akan disimpan dan permintaan sign-off dikirim ke Project/Technical Manager."
              : "Laporan alignment akan disimpan dan release candidate kembali ke environment Dev."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>
              {pending && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
              {decision === "promosi" ? "Simpan dan kirim permintaan sign-off" : "Simpan keputusan kembali ke Dev"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
              Periksa lagi
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}
