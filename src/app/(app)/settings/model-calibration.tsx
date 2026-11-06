"use client";

/**
 * Panel ModelDigitalTwin per layanan beserta formulir kalibrasi ulang (khusus Technical Lead).
 */
import { useActionState, useState } from "react";
import { CircleCheck, Gauge, LoaderCircle } from "lucide-react";
import { submitWith } from "@/components/form";
import { Button, Field, Input, Tag, cx } from "@/components/ui";
import { fmtDate, fmtNum } from "@/lib/format";
import type { DigitalTwinModel } from "@/lib/types";
import { recalibrateModel, type SettingsState } from "./actions";

export interface ModelRow {
  service: string;
  model: DigitalTwinModel;
  recalibrated: boolean;
}

/**
 * Formulir kalibrasi ulang satu model.
 *
 * Parameters
 * ----------
 * row : ModelRow
 *     Layanan dan model yang berlaku.
 * onDone : () => void
 *     Dipanggil untuk menutup formulir.
 *
 * Returns
 * -------
 * JSX.Element
 */
function RecalibrateForm({ row, onDone }: { row: ModelRow; onDone: () => void }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(recalibrateModel.bind(null, row.service), {});
  const e = state.errors ?? {};
  const m = row.model;
  const suggested = m.statusAktif ? Math.max(m.tpsMaksTerkalibrasi * 2, 100) : 120;
  const id = row.service.replace(/\W+/g, "-").toLowerCase();

  if (state.ok) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-pass/40 bg-pass-soft px-4 py-3 text-[14px]" role="status">
        <CircleCheck className="h-4 w-4 text-pass" aria-hidden />
        <span className="flex-1">{state.ok}</span>
        <Button type="button" variant="ghost" onClick={onDone}>
          Tutup
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submitWith(action)} noValidate className="grid gap-3 rounded-lg border border-line-strong bg-surface-2 p-4">
      <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
        <Field
          label="Batas atas baru (TPS)"
          htmlFor={`${id}-max`}
          error={e.tpsMax}
          hint={m.statusAktif ? `Saat ini ${fmtNum(m.tpsMaksTerkalibrasi)} TPS.` : "Model belum aktif."}
        >
          <Input id={`${id}-max`} name="tpsMax" type="number" inputMode="numeric" min={1} max={1000} defaultValue={suggested} aria-invalid={!!e.tpsMax} />
        </Field>
        <Field label="Sumber data kalibrasi" htmlFor={`${id}-src`} error={e.source} hint="Dicatat di log audit, misalnya load test atau periode data ELK.">
          <Input id={`${id}-src`} name="source" maxLength={200} placeholder="Load test Production 9 Nov, sampai 300 TPS" aria-invalid={!!e.source} />
        </Field>
      </div>
      {state.error && <p role="alert" className="text-[14px] text-fail">{state.error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
          {m.statusAktif ? "Simpan kalibrasi ulang" : "Aktifkan model"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Batal
        </Button>
      </div>
    </form>
  );
}

/**
 * Daftar ModelDigitalTwin per layanan dengan tombol kalibrasi ulang.
 *
 * Parameters
 * ----------
 * rows : ModelRow[]
 *     Model yang berlaku untuk setiap layanan.
 *
 * Returns
 * -------
 * JSX.Element
 */
export function ModelCalibration({ rows }: { rows: ModelRow[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div>
      <ul>
        {rows.map((r) => (
          <li key={r.service} className="border-b border-line px-5 py-4 last:border-0">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2 font-medium">
                  {r.service}
                  {r.model.statusAktif ? <Tag tone="pass">Aktif</Tag> : <Tag tone="warn">Belum aktif</Tag>}
                  {r.recalibrated && <Tag tone="accent">Dikalibrasi ulang</Tag>}
                </span>
                <span className="block text-[13.5px] text-ink-3">
                  {r.model.versiModel}
                  {r.model.statusAktif
                    ? `, rentang ${fmtNum(r.model.tpsMinTerkalibrasi)} sampai ${fmtNum(r.model.tpsMaksTerkalibrasi)} TPS, dikalibrasi ${fmtDate(r.model.tanggalKalibrasi ?? undefined)}`
                    : ", analisis layanan ini berstatus Tidak Dapat Dinilai sampai model diaktifkan"}
                </span>
              </span>
              {open !== r.service && (
                <Button type="button" variant="secondary" onClick={() => setOpen(r.service)} aria-expanded={false}>
                  <Gauge className="h-4 w-4" aria-hidden />
                  {r.model.statusAktif ? "Kalibrasi ulang" : "Aktifkan model"}
                </Button>
              )}
            </div>
            {open === r.service && (
              <div className={cx("mt-3")}>
                <RecalibrateForm row={r} onDone={() => setOpen(null)} />
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="border-t border-line px-5 py-3 text-[13px] text-ink-3">
        Prototipe: kalibrasi ulang disimulasikan. Di sistem nyata, langkah ini mencocokkan model dengan data ELK periode beban tinggi atau hasil load
        test sebelum rentangnya diperluas. Versi model naik dan tanggal kalibrasi tercatat pada setiap hasil analisis berikutnya.
      </p>
    </div>
  );
}
