"use client";

import { submitWith } from "@/components/form";
import { useActionState, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { scheduleSession, type FormState } from "../actions";
import { Button, ButtonLink, Field, Input, Select } from "@/components/ui";

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
  const defaultDate = (() => {
    const d = new Date(Date.now() + 2 * 86400000);
    d.setHours(14, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T14:00`;
  })();

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
          <Input id="release" name="release" key={`r-${service}`} defaultValue={sug?.release} placeholder="R3.9" aria-invalid={!!e.release} />
        </Field>
        <Field label="Nomor sprint cycle" htmlFor="cycleNo" error={e.cycleNo} hint="Satu rilis umumnya melewati 5–7 cycle.">
          <Input id="cycleNo" name="cycleNo" key={`c-${service}`} type="number" min={1} defaultValue={sug?.cycleNo} aria-invalid={!!e.cycleNo} />
        </Field>
      </div>
      <Field label="Release candidate" htmlFor="releaseCandidate" error={e.releaseCandidate}>
        <Input id="releaseCandidate" name="releaseCandidate" placeholder="3.9.0-rc1" aria-invalid={!!e.releaseCandidate} />
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
