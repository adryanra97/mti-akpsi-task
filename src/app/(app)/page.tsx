import Link from "next/link";
import { CalendarClock, ChevronRight, FileSignature, ShieldAlert, Siren } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listIncidents, listSessions, listSignoffs, todosFor } from "@/lib/data";
import { ROLE_LABEL, SECTION_ACCESS } from "@/lib/roles";
import { Notice, Panel, Tag } from "@/components/ui";
import { DepartureBoard, type BoardRow, type BoardTone } from "@/components/board";
import { Glossary } from "@/components/glossary";
import { fmtRelative } from "@/lib/format";
import { INCIDENT_TYPE_LABEL, latestResult } from "@/lib/domain";
import type { AlignmentSession, SignoffDoc, Verdict } from "@/lib/types";

const SECTION_NAME: Record<string, string> = {
  alignment: "Alignment rilis",
  incidents: "Respons insiden",
  signoff: "Sign-off",
  settings: "Pengaturan",
  reports: "Report",
};

const VERDICT_BOARD: Record<Verdict, [string, BoardTone]> = {
  Lolos: ["Lolos", "pass"],
  LolosBersyarat: ["Bersyarat", "cond"],
  TidakLolos: ["Tidak lolos", "fail"],
  TidakDapatDinilai: ["Tidak dapat dinilai", "na"],
};

function boardStatus(s: AlignmentSession, signoffs: SignoffDoc[]): [string, BoardTone] {
  if (s.status === "Terjadwal") return ["Terjadwal", "wait"];
  if (s.status === "PengisianParameter") return [s.params ? "Siap diajukan" : "Pengisian parameter", "wait"];
  if (s.status === "MenungguHasil") return ["Menunggu hasil", "wait"];
  if (s.status === "Peninjauan") return VERDICT_BOARD[latestResult(s)!.verdict.status];
  if (s.decision === "KembaliKeDev") return ["Kembali ke Dev", "na"];
  const so = signoffs.find((d) => d.id === s.signoffId);
  if (so?.status === "MenungguKeputusan" || so?.status === "Draf") return ["Menunggu sign-off", "wait"];
  if (so?.status === "Ditolak") return ["Sign-off ditolak", "fail"];
  return ["Disetujui", "pass"];
}

const wib = (iso: string, opt: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString("id-ID", { ...opt, timeZone: "Asia/Jakarta" });

export default async function Home({ searchParams }: { searchParams: Promise<{ akses?: string }> }) {
  const user = await requireUser();
  const { akses } = await searchParams;
  const [todos, sessions, incidents, signoffs] = await Promise.all([todosFor(user.role), listSessions(), listIncidents(), listSignoffs()]);
  const canOpen = SECTION_ACCESS.alignment.includes(user.role);

  const upcoming = sessions.filter((s) => s.status !== "Diputuskan" && s.status !== "Ditutup").sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const recent = sessions.filter((s) => s.status === "Diputuskan" || s.status === "Ditutup").sort((a, b) => (b.decidedAt ?? "").localeCompare(a.decidedAt ?? ""));
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

  const openIncidents = incidents.filter((i) => i.status !== "Terdokumentasi");
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

      {/* Tugas pengguna adalah hal pertama yang dilihat setelah masuk; papan promosi menjadi konteks di bawahnya. */}
      <section className="-mx-4 -mt-6 bg-board px-4 pb-5 pt-6 text-board-ink sm:mx-0 sm:mt-0 sm:rounded-[14px] sm:px-7 sm:pb-6 sm:pt-7" aria-labelledby="home-title">
        <p className="text-[13px] text-board-ink-2">
          {today} · {ROLE_LABEL[user.role]}
        </p>
        <h1 id="home-title" className="font-wide mt-2 text-[28px] leading-[1.05] text-white sm:text-[36px]">
          {headline}
        </h1>
        {todos.length === 0 ? (
          <p className="mt-2 max-w-[60ch] text-[15px] text-board-ink-2">
            {user.role === "SUP" ? "Buka Report untuk mengumpulkan laporan lintas sprint cycle dan rilis." : "Tugas baru muncul di sini ketika sebuah alur memerlukan peran Anda."}
          </p>
        ) : (
          <ul className="mt-5 grid gap-2 md:grid-cols-2" aria-label="Yang perlu Anda kerjakan">
            {todos.map((t) => {
              const Icon = icon[t.kind];
              return (
                <li key={t.href + t.title}>
                  <Link
                    href={t.href}
                    className="group flex h-full items-center gap-3 rounded-[10px] border border-board-line bg-white/[0.04] px-4 py-3 hover:border-amber/60 hover:bg-white/[0.08]"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-amber text-board">
                      <Icon className="h-[18px] w-[18px]" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-white">{t.title}</span>
                      <span className="block text-[13.5px] text-board-ink-2">{t.detail}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 text-board-ink-2 group-hover:text-amber" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="mt-6 grid gap-6 2xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section aria-labelledby="board-title" className="min-w-0 rounded-[14px] bg-board p-4 text-board-ink sm:p-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="board-title" className="font-narrow text-[16px] font-semibold tracking-wide text-amber">
              Papan promosi: Dev ke Production
            </h2>
            {canOpen && (
              <Link href="/alignment" className="text-[13px] font-semibold text-board-ink underline-offset-4 hover:underline">
                Lihat semua sesi
              </Link>
            )}
          </div>
          {rows.length ? (
            <DepartureBoard rows={rows} caption="Sesi alignment mendatang dan keputusan terbaru" />
          ) : (
            <p className="rounded-[10px] border border-board-line px-5 py-6 text-board-ink-2">Belum ada sesi alignment yang dijadwalkan.</p>
          )}
          <p className="mt-2 text-[12.5px] text-board-ink-2">Sesi yang belum diputuskan tampil lebih dulu, diikuti keputusan terbaru.</p>
        </section>

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

      <div className="mt-6">
        <Glossary />
      </div>
    </>
  );
}
