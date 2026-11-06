import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listSessions, sortSessions } from "@/lib/data";
import { can } from "@/lib/roles";
import { ButtonLink, EmptyState, PageHeader, Tag } from "@/components/ui";
import { VerdictBadge } from "@/components/verdict";
import { Glossary } from "@/components/glossary";
import { fmtDate } from "@/lib/format";
import { SESSION_STATUS_LABEL } from "@/lib/domain";
import type { AlignmentSession } from "@/lib/types";

export const metadata: Metadata = { title: "Alignment rilis" };

function statusTone(s: AlignmentSession) {
  if (s.status === "diputuskan") return s.decision === "promosi" ? "pass" : "neutral";
  if (s.status === "dianalisis") return "accent";
  return "warn";
}

export default async function AlignmentList() {
  const user = await requireUser();
  const sessions = sortSessions(await listSessions());
  const groups = new Map<string, AlignmentSession[]>();
  for (const s of sessions) {
    const k = `${s.release}|${s.service}`;
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }

  return (
    <>
      <PageHeader
        title="Alignment rilis"
        description="Sesi alignment terjadwal di akhir setiap sprint cycle, untuk menilai kesiapan performa release candidate sebelum promosi dari Dev ke Production."
        actions={
          can(user.role, "alignment.schedule") && (
            <ButtonLink href="/alignment/new">
              <Plus className="h-4 w-4" aria-hidden /> Jadwalkan sesi
            </ButtonLink>
          )
        }
      />

      {sessions.length === 0 && (
        <EmptyState title="Belum ada sesi alignment">Technical Lead dapat menjadwalkan sesi pertama untuk sprint cycle berjalan.</EmptyState>
      )}

      <div className="mb-6">
        <Glossary />
      </div>

      <div className="grid gap-6">
        {[...groups.entries()].map(([k, list]) => {
          const [release, service] = k.split("|");
          return (
            <section key={k} aria-labelledby={`g-${k}`} className="rounded-xl border border-line bg-surface">
              <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-3.5">
                <h2 id={`g-${k}`} className="text-[17px] font-semibold">
                  {release} <span className="font-normal text-ink-3">{service}</span>
                </h2>
                <span className="text-[13px] text-ink-3">{list.length} sprint cycle</span>
              </header>
              <ol>
                {list.map((s) => {
                  const run = s.runs.at(-1);
                  return (
                    <li key={s.id} className="border-b border-line last:border-0">
                      <Link
                        href={`/alignment/${s.id}`}
                        className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-surface-2 sm:grid-cols-[72px_1.4fr_1fr_1fr_auto]"
                      >
                        <span className="font-display text-[22px] font-semibold text-ink-3">
                          <span className="sr-only">Cycle </span>
                          {s.cycleNo}
                        </span>
                        <span className="min-w-0">
                          <span className="block font-medium">{s.releaseCandidate}</span>
                          <span className="block text-[13px] text-ink-3">
                            {s.code}, jadwal {fmtDate(s.scheduledAt, true)}
                          </span>
                        </span>
                        <span className="col-start-2 sm:col-start-auto">
                          {run ? <VerdictBadge verdict={run.verdict} size="sm" /> : <span className="text-[13px] text-ink-3">Belum dianalisis</span>}
                        </span>
                        <span className="col-start-2 sm:col-start-auto">
                          <Tag tone={statusTone(s)}>
                            {s.decision === "promosi" ? "Lanjut promosi" : s.decision === "kembali_dev" ? "Kembali ke Dev" : SESSION_STATUS_LABEL[s.status]}
                          </Tag>
                        </span>
                        <span className="hidden text-ink-3 sm:block" aria-hidden>›</span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
      </div>
    </>
  );
}
