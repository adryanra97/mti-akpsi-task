import Link from "next/link";
import { CalendarClock, ChevronRight, FileSignature, ShieldAlert, Siren } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listIncidents, listSessions, listSignoffs, todosFor } from "@/lib/data";
import { ROLE_GOAL, ROLE_LABEL, SECTION_ACCESS } from "@/lib/roles";
import { EmptyState, Notice, Panel, Tag } from "@/components/ui";
import { DepartureBoard, type BoardRow, type BoardTone } from "@/components/board";
import { fmtRelative } from "@/lib/format";
import { INCIDENT_TYPE_LABEL } from "@/lib/domain";
import type { AlignmentSession, SignoffDoc, Verdict } from "@/lib/types";

const SECTION_NAME: Record<string, string> = {
  alignment: "Alignment rilis",
  incidents: "Respons insiden",
  signoff: "Sign-off",
  settings: "Pengaturan",
  reports: "Report",
};

const VERDICT_BOARD: Record<Verdict, [string, BoardTone]> = {
  LOLOS: ["Lolos", "pass"],
  LOLOS_BERSYARAT: ["Bersyarat", "cond"],
  TIDAK_LOLOS: ["Tidak lolos", "fail"],
  TIDAK_DAPAT_DINILAI: ["Tidak dapat dinilai", "na"],
};

function boardStatus(s: AlignmentSession, signoffs: SignoffDoc[]): [string, BoardTone] {
  if (s.status === "menunggu_parameter") return ["Menunggu parameter", "wait"];
  if (s.status === "siap_dianalisis") return ["Siap dianalisis", "wait"];
  if (s.status === "dianalisis") return VERDICT_BOARD[s.runs.at(-1)!.verdict];
  if (s.decision === "kembali_dev") return ["Kembali ke Dev", "na"];
  const so = signoffs.find((d) => d.id === s.signoffId);
  if (so?.status === "menunggu") return ["Menunggu sign-off", "wait"];
  if (so?.status === "ditolak") return ["Sign-off ditolak", "fail"];
  return ["Disetujui", "pass"];
}

const wib = (iso: string, opt: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString("id-ID", { ...opt, timeZone: "Asia/Jakarta" });

export default async function Home({ searchParams }: { searchParams: Promise<{ akses?: string }> }) {
  const user = await requireUser();
  const { akses } = await searchParams;
  const [todos, sessions, incidents, signoffs] = await Promise.all([todosFor(user.role), listSessions(), listIncidents(), listSignoffs()]);
  const canOpen = SECTION_ACCESS.alignment.includes(user.role);

  const upcoming = sessions.filter((s) => s.status !== "diputuskan").sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const recent = sessions.filter((s) => s.status === "diputuskan").sort((a, b) => (b.decidedAt ?? "").localeCompare(a.decidedAt ?? ""));
  const rows: BoardRow[] = [...upcoming, ...recent].slice(0, 6).map((s) => {
    const [status, tone] = boardStatus(s, signoffs);
    return {
      key: s.id,
      href: canOpen ? `/alignment/${s.id}` : undefined,
      date: wib(s.scheduledAt, { day: "numeric", month: "short" }),
      time: wib(s.scheduledAt, { hour: "2-digit", minute: "2-digit" }),
      release: s.release,
      service: s.service,
      cycle: s.cycleNo,
      gate: `${s.envSource} → ${s.envTarget}`,
      status,
      tone,
    };
  });

  const openIncidents = incidents.filter((i) => i.status !== "selesai");
  const icon = { alignment: CalendarClock, signoff: FileSignature, incident: Siren };
  const today = wib(new Date().toISOString(), { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const headline = todos.length ? `${todos.length} hal menunggu Anda` : "Tidak ada yang menunggu Anda";

  return (
    <>
      {akses && (
        <div className="mb-5">
          <Notice tone="warn" icon={<ShieldAlert className="h-4 w-4 text-cond" />} title={`Halaman ${SECTION_NAME[akses] ?? akses} tidak tersedia untuk peran Anda.`}>
            Anda masuk sebagai {ROLE_LABEL[user.role]}. Masuk dengan akun peran lain bila perlu membuka halaman itu.
          </Notice>
        </div>
      )}

      <section className="-mx-4 -mt-6 bg-board px-4 pb-5 pt-6 text-board-ink sm:mx-0 sm:mt-0 sm:rounded-[14px] sm:px-7 sm:pb-7 sm:pt-8" aria-labelledby="home-title">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <p className="font-narrow text-[15px] font-semibold tracking-wide text-amber">Papan promosi: Dev ke Production</p>
          <p className="text-[13px] text-board-ink-2">{today}</p>
        </div>
        <h1 id="home-title" className="font-wide mt-3 text-[32px] leading-[1.05] text-white sm:text-[44px]">
          {headline}
        </h1>
        <p className="mt-2 max-w-[60ch] text-[15px] text-board-ink-2">
          Masuk sebagai {ROLE_LABEL[user.role]}. {ROLE_GOAL[user.role]}
        </p>
        <div className="mt-6">
          {rows.length ? (
            <DepartureBoard rows={rows} caption="Sesi alignment mendatang dan keputusan terbaru" />
          ) : (
            <p className="rounded-[10px] border border-board-line px-5 py-6 text-board-ink-2">Belum ada sesi alignment yang dijadwalkan.</p>
          )}
        </div>
        <p className="mt-3 text-[12.5px] text-board-ink-2">
          Sesi yang belum diputuskan tampil lebih dulu, diikuti keputusan terbaru.
          {canOpen && (
            <>
              {" "}
              <Link href="/alignment" className="font-semibold text-board-ink underline-offset-4 hover:underline">
                Lihat semua sesi alignment
              </Link>
            </>
          )}
        </p>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
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
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-sunken">
                        <Icon className="h-[18px] w-[18px] text-ink" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{t.title}</span>
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
                    <span className="font-semibold">{i.code}</span>
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
    </>
  );
}
