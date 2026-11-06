import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import { listSessions } from "@/lib/data";
import { PageHeader, Panel } from "@/components/ui";
import { ScheduleForm } from "./schedule-form";
import { SERVICES } from "@/lib/core/twin";

export const metadata: Metadata = { title: "Jadwalkan sesi alignment" };

export default async function NewSession() {
  const user = await requireUser();
  if (!can(user.role, "alignment.schedule")) redirect("/alignment");
  const sessions = await listSessions();
  const latest = Object.fromEntries(
    SERVICES.map((svc) => {
      const last = sessions.filter((s) => s.service === svc.name).sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))[0];
      return [svc.name, last ? { release: last.release, cycleNo: last.cycleNo + 1 } : { release: "", cycleNo: 1 }];
    }),
  );
  return (
    <>
      <PageHeader
        title="Jadwalkan sesi alignment"
        description="Sesi dibuka untuk sprint cycle berjalan. Setelah dijadwalkan, QA/Performance Tester mengisi parameter analisis."
        back={{ href: "/alignment", label: "Alignment rilis" }}
      />
      <Panel className="max-w-2xl">
        <ScheduleForm services={SERVICES.map((s) => ({ name: s.name, twin: s.twin }))} latest={latest} />
      </Panel>
    </>
  );
}
