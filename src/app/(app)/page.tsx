import Link from "next/link";
import { CalendarClock, ChevronRight, FileSignature, ShieldAlert, Siren } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listIncidents, listSessions, sortSessions, todosFor } from "@/lib/data";
import { ROLE_GOAL, ROLE_LABEL } from "@/lib/roles";
import { EmptyState, Notice, PageHeader, Panel, Tag } from "@/components/ui";
import { VerdictBadge } from "@/components/verdict";
import { fmtDate, fmtRelative } from "@/lib/format";
import { SESSION_STATUS_LABEL, INCIDENT_TYPE_LABEL } from "@/lib/domain";

const SECTION_NAME: Record<string, string> = {
  alignment: "Alignment rilis",
  incidents: "Respons insiden",
  signoff: "Sign-off",
  settings: "Pengaturan",
  reports: "Report",
};

export default async function Home({ searchParams }: { searchParams: Promise<{ akses?: string }> }) {
  const user = await requireUser();
  const { akses } = await searchParams;
  const [todos, sessions, incidents] = await Promise.all([todosFor(user.role), listSessions(), listIncidents()]);
  const recent = sortSessions(sessions).filter((s) => s.runs.length).slice(0, 6);
  const openIncidents = incidents.filter((i) => i.status !== "selesai");
  const icon = { alignment: CalendarClock, signoff: FileSignature, incident: Siren };

  return (
    <>
      {akses && (
        <div className="mb-5">
          <Notice tone="warn" icon={<ShieldAlert className="h-4 w-4 text-cond" />} title={`Halaman ${SECTION_NAME[akses] ?? akses} tidak tersedia untuk peran Anda.`}>
            Anda masuk sebagai {ROLE_LABEL[user.role]}. Masuk dengan akun peran lain bila perlu membuka halaman itu.
          </Notice>
        </div>
      )}
      <PageHeader title="Beranda" description={`Masuk sebagai ${ROLE_LABEL[user.role]}. ${ROLE_GOAL[user.role]}`} />

      <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        <Panel title="Yang perlu Anda kerjakan" description={todos.length ? `${todos.length} tugas menunggu` : undefined} bodyClassName="p-0">
          {todos.length === 0 ? (
            <div className="p-5">
              <EmptyState title="Tidak ada tugas yang menunggu Anda">
                {user.role === "SUP"
                  ? "Buka Report untuk mengumpulkan laporan lintas sprint cycle dan rilis."
                  : "Tugas baru muncul di sini ketika sebuah alur memerlukan peran Anda."}
              </EmptyState>
            </div>
          ) : (
            <ul>
              {todos.map((t) => {
                const Icon = icon[t.kind];
                return (
                  <li key={t.href + t.title} className="border-b border-line last:border-0">
                    <Link href={t.href} className="flex items-center gap-3 px-5 py-3.5 hover:bg-surface-2">
                      <Icon className="h-5 w-5 shrink-0 text-accent" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{t.title}</span>
                        <span className="block text-[13.5px] text-ink-3">{t.detail}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 text-ink-3" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="Insiden terbuka" bodyClassName="p-0">
          {openIncidents.length === 0 ? (
            <p className="px-5 py-4 text-[14px] text-ink-3">Tidak ada insiden terbuka.</p>
          ) : (
            <ul>
              {openIncidents.map((i) => (
                <li key={i.id} className="border-b border-line px-5 py-3.5 last:border-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{i.code}</span>
                    <Tag tone="fail">{INCIDENT_TYPE_LABEL[i.data.type]}</Tag>
                  </div>
                  <p className="mt-0.5 text-[14px]">{i.data.title}</p>
                  <p className="text-[13px] text-ink-3">
                    {i.data.service}, terdeteksi {fmtRelative(i.data.detectedAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel className="mt-6" title="Verdict terbaru" description="Hasil analisis terakhir dari setiap sesi alignment" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[14px]">
            <thead>
              <tr className="border-b border-line text-left text-[13px] text-ink-3">
                <th className="px-5 py-2.5 font-medium">Release candidate</th>
                <th className="px-3 py-2.5 font-medium">Layanan</th>
                <th className="px-3 py-2.5 font-medium">Jadwal</th>
                <th className="px-3 py-2.5 font-medium">Verdict</th>
                <th className="px-5 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((s) => (
                <tr key={s.id} className="border-b border-line last:border-0 hover:bg-surface-2">
                  <td className="px-5 py-3">
                    <Link href={user.role === "SUP" ? "/reports" : `/alignment/${s.id}`} className="font-medium hover:text-accent">
                      {s.release} cycle {s.cycleNo}
                    </Link>
                    <span className="block text-[13px] text-ink-3">{s.releaseCandidate}</span>
                  </td>
                  <td className="px-3 py-3 text-ink-2">{s.service}</td>
                  <td className="px-3 py-3 text-ink-2">{fmtDate(s.scheduledAt)}</td>
                  <td className="px-3 py-3">
                    <VerdictBadge verdict={s.runs.at(-1)!.verdict} size="sm" />
                  </td>
                  <td className="px-5 py-3 text-ink-2">
                    {s.decision === "promosi" ? "Lanjut promosi" : s.decision === "kembali_dev" ? "Kembali ke Dev" : SESSION_STATUS_LABEL[s.status]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
