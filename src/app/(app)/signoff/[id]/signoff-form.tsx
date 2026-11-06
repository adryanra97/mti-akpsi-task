"use client";

import { submitWith } from "@/components/form";
import { useActionState, useState } from "react";
import { LoaderCircle, Lock } from "lucide-react";
import { decideSignoff, type SoState } from "../actions";
import { Button, Field, Textarea, cx } from "@/components/ui";

export function SignoffForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState<SoState, FormData>(decideSignoff.bind(null, id), {});
  const [decision, setDecision] = useState(state.values?.decision ?? "");
  const [confirming, setConfirming] = useState(false);
  const e = state.errors ?? {};
  return (
    <form onSubmit={submitWith(action)} className="grid gap-4" noValidate>
      <fieldset>
        <legend className="mb-2 text-[13.5px] font-medium">Keputusan sign-off</legend>
        <div className="grid gap-2">
          {[
            { v: "Disetujui", t: "Setujui", b: "Dokumen dikunci dengan nomor versi dan tanda waktu, siap dilampirkan pada release approval." },
            { v: "Ditolak", t: "Tolak", b: "Dokumen disimpan berstatus ditolak; release candidate kembali ke Dev." },
          ].map((o) => (
            <label
              key={o.v}
              className={cx(
                "flex cursor-pointer gap-3 rounded-lg border px-4 py-3",
                decision === o.v ? "border-accent bg-accent-soft" : "border-line-strong hover:bg-surface-2",
              )}
            >
              <input
                type="radio"
                name="decision"
                value={o.v}
                checked={decision === o.v}
                onChange={() => {
                  setDecision(o.v);
                  setConfirming(false);
                }}
                className="mt-1 accent-[var(--accent)]"
              />
              <span>
                <span className="block font-medium">{o.t}</span>
                <span className="block text-[13.5px] text-ink-3">{o.b}</span>
              </span>
            </label>
          ))}
        </div>
        {e.decision && <p className="mt-1 text-[13px] text-fail">{e.decision}</p>}
      </fieldset>
      <Field label={decision === "Ditolak" ? "Alasan penolakan" : "Catatan"} htmlFor="notes" error={e.notes} hint={decision === "Ditolak" ? "Wajib diisi." : "Opsional."}>
        <Textarea id="notes" name="notes" rows={3} defaultValue={state.values?.notes} aria-invalid={!!e.notes} />
      </Field>
      {state.error && <p role="alert" className="text-[14px] text-fail">{state.error}</p>}
      {!confirming ? (
        <div>
          <Button type="button" disabled={!decision} onClick={() => setConfirming(true)}>
            Simpan keputusan sign-off
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border border-line-strong bg-surface-2 p-4">
          <p className="flex items-center gap-2 font-medium">
            <Lock className="h-4 w-4" aria-hidden /> Dokumen akan dikunci dan tidak dapat diubah.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="submit" variant={decision === "Ditolak" ? "danger" : "primary"} disabled={pending}>
              {pending && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
              {decision === "Ditolak" ? "Tolak sign-off" : "Setujui dan kunci dokumen"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
              Periksa lagi
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}
