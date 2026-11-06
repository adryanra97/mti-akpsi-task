/**
 * Halaman daftar kasus insiden (terbuka dan terdokumentasi).
 */
import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listIncidents } from "@/lib/data";
import { can } from "@/lib/roles";
import { ButtonLink, EmptyState, PageHeader, Tag } from "@/components/ui";
import { VerdictBadge } from "@/components/verdict";
import { fmtDate } from "@/lib/format";
import { INCIDENT_TYPE_LABEL, mttrMinutes } from "@/lib/domain";
import { INCIDENT_STATUS_LABEL } from "@/lib/verdict";
import type { Incident } from "@/lib/types";

export const metadata: Metadata = { title: "Respons insiden" };

/**
 * Warna tag untuk status insiden.
 *
 * Parameters
 * ----------
 * i : Incident
 *     Kasus insiden; kasus yang perlu eskalasi selalu merah.
 *
 * Returns
 * -------
 * "neutral" | "accent" | "warn" | "pass" | "fail"
 */
function statusTone(i: Incident): "warn" | "accent" | "pass" | "neutral" | "fail" {
  if (i.status === "PerluEskalasi" || i.needsEscalation) return "fail";
  if (i.status === "Terdokumentasi") return "pass";
  if (i.status === "BelumTereproduksi") return "neutral";
  if (i.status === "Dicatat") return "warn";
  return "accent";
}

/**
 * Halaman daftar kasus insiden.
 *
 * Returns
 * -------
 * Promise<JSX.Element>
 */
export default async function Incidents() {
  const user = await requireUser();
  const list = (await listIncidents()).sort((a, b) => b.data.detectedAt.localeCompare(a.data.detectedAt));
  return (
    <>
      <PageHeader
        title="Respons insiden"
        description="Kasus insiden performa setelah go-live atau rollout. Core Module mereproduksi kondisinya pada digital twin dan menilai opsi mitigasi tanpa pengujian di Production."
        actions={
          can(user.role, "incident.manage") && (
            <ButtonLink href="/incidents/new">
              <Plus className="h-4 w-4" aria-hidden /> Buka kasus insiden
            </ButtonLink>
          )
        }
      />
      {list.length === 0 ? (
        <EmptyState title="Belum ada kasus insiden">Kasus dibuka Integration Engineer setelah menerima eskalasi dari Tim Support dan Monitoring.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[760px] text-[14px]">
            <thead>
              <tr className="border-b border-line text-left text-[13px] text-ink-3">
                <th className="px-5 py-2.5 font-medium">Insiden</th>
                <th className="px-3 py-2.5 font-medium">Layanan</th>
                <th className="px-3 py-2.5 font-medium">Terdeteksi</th>
                <th className="px-3 py-2.5 font-medium">Reproduksi</th>
                <th className="px-3 py-2.5 font-medium">MTTR</th>
                <th className="px-5 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {list.map((i) => {
                const mttr = mttrMinutes(i);
                return (
                  <tr key={i.id} className="border-b border-line last:border-0 hover:bg-surface-2">
                    <td className="px-5 py-3">
                      <Link href={`/incidents/${i.id}`} className="font-medium hover:text-accent">
                        {i.code}: {i.data.title}
                      </Link>
                      <span className="block text-[13px] text-ink-3">{INCIDENT_TYPE_LABEL[i.data.type]}, rilis {i.data.release}</span>
                    </td>
                    <td className="px-3 py-3 text-ink-2">{i.data.service}</td>
                    <td className="px-3 py-3 text-ink-2">{fmtDate(i.data.detectedAt, true)}</td>
                    <td className="px-3 py-3">{i.repro ? <VerdictBadge verdict={i.repro.verdict.status} size="sm" /> : <span className="text-ink-3">Belum dinilai</span>}</td>
                    <td className="px-3 py-3 text-ink-2">{mttr ? `${mttr} menit` : "–"}</td>
                    <td className="px-5 py-3">
                      <Tag tone={statusTone(i)}>
                        {INCIDENT_STATUS_LABEL[i.status]}
                        {i.status === "Terdokumentasi" && i.needsEscalation ? ", perlu eskalasi" : ""}
                      </Tag>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
