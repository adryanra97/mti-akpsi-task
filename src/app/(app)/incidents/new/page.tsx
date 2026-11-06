import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import { PageHeader } from "@/components/ui";
import { SERVICES } from "@/lib/core/twin";
import { IncidentForm } from "./incident-form";

export const metadata: Metadata = { title: "Buka kasus insiden" };

export default async function NewIncident() {
  const user = await requireUser();
  if (!can(user.role, "incident.manage")) redirect("/incidents");
  const now = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 16);
  return (
    <>
      <PageHeader
        title="Buka kasus insiden"
        description="Catat data insiden dan spesifikasi sistem saat ini. Setelah disimpan, Core Module menilai apakah insiden akan terulang."
        back={{ href: "/incidents", label: "Respons insiden" }}
      />
      <IncidentForm services={SERVICES.map((s) => ({ name: s.name, spec: s.defaultSpec }))} nowWib={now} />
    </>
  );
}
