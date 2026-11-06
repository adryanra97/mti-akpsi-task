"use client";

/**
 * Formulir penjadwalan sesi alignment.
 */
import { submitWith } from "@/components/form";
import { useActionState, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { scheduleSession, type FormState } from "../actions";
import { Button, ButtonLink, Field, Input, Select } from "@/components/ui";

/**
 * Formulir layanan, rilis, versi uji, nomor cycle, dan jadwal alignment meeting.
 *
 * Parameters
 * ----------
 * services : { name: string; twin: boolean }[]
 *     Layanan pada registri dan apakah memiliki model digital twin aktif.
 * latest : Record<string, { release: string; cycleNo: number }>
 *     Rilis dan cycle terakhir per layanan, untuk mengisi saran nomor cycle berikutnya.
 *
 * Returns
 * -------
 * JSX.Element
 */
export function ScheduleForm({
  services,
  latest,
}: {
  services: { name: string; twin: boolean }[];
  latest: Record<string, { release: string; cycleNo: number }>;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(scheduleSession, {});
  const [service, setService] = useState(services[0].name);
  const sug = latest[service];
  const e = state.errors ?? {};
  const svc = services.find((s) => s.name === service);
  // Selalu dihitung dalam WIB agar server dan browser menghasilkan nilai yang sama (tanpa galat hydration).
  const defaultDate = `${new Date(Date.now() + 2 * 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" })}T14:00`;

  return (
    <form onSubmit={submitWith(action)} className="grid gap-4" noValidate>
      <Field label="Layanan" htmlFor="service" error={e.service} hint={svc && !svc.twin ? "Layanan ini belum memiliki model digital twin aktif; verdict akan berstatus Tidak Dapat Dinilai." : undefined}>
        <Select id="service" name="service" value={service} onChange={(ev) => setService(ev.target.value)}>
          {services.map((s) => (
            <option key={s.name} value={s.name}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Rilis" htmlFor="release" error={e.release}>
          <Input id="release" name="release" key={`r-${service}`} defaultValue={sug?.release} placeholder="Rilis Dompet Digital" aria-invalid={!!e.release} />
        </Field>
        <Field label="Nomor sprint cycle" htmlFor="cycleNo" error={e.cycleNo} hint="Satu rilis umumnya melewati 5–7 cycle.">
          <Input id="cycleNo" name="cycleNo" key={`c-${service}`} type="number" min={1} defaultValue={sug?.cycleNo} aria-invalid={!!e.cycleNo} />
        </Field>
      </div>
      <Field label="Versi uji (release candidate)" htmlFor="releaseCandidate" error={e.releaseCandidate}>
        <Input id="releaseCandidate" name="releaseCandidate" placeholder="Kandidat 1 (v3.9)" aria-invalid={!!e.releaseCandidate} />
      </Field>
      <Field label="Jadwal alignment meeting (WIB)" htmlFor="scheduledAt" error={e.scheduledAt}>
        <Input id="scheduledAt" name="scheduledAt" type="datetime-local" defaultValue={defaultDate} aria-invalid={!!e.scheduledAt} />
      </Field>
      <p className="text-[13.5px] text-ink-3">Environment asal Dev, environment target Production.</p>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="submit" disabled={pending}>
          {pending && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
          Jadwalkan sesi
        </Button>
        <ButtonLink href="/alignment" variant="ghost">
          Batal
        </ButtonLink>
      </div>
    </form>
  );
}
