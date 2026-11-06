/**
 * Beranda: tugas yang menunggu peran pengguna, papan promosi Dev ke Production, dan insiden terbuka.
 */
import Link from "next/link";
import { Activity, CalendarClock, CheckCircle2, ChevronRight, Clock3, FileSignature, ShieldAlert, Siren, TrendingUp } from "lucide-react";
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

/**
 * Status dan warna baris papan promosi untuk sebuah sesi.
 *
 * Parameters
 * ----------
 * s : AlignmentSession
 *     Sesi alignment.
 * signoffs : SignoffDoc[]
 *     Seluruh dokumen sign-off, untuk status setelah lanjut promosi.
 *
 * Returns
 * -------
 * [string, BoardTone]
 *     Label status dan nada warna.
 */
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

/**
 * Memformat tanggal pada zona WIB dengan opsi tertentu.
 *
 * Parameters
 * ----------
 * iso : string
 *     Tanggal ISO 8601.
 * opt : Intl.DateTimeFormatOptions
 *     Opsi format.
 *
 * Returns
 * -------
 * string
 */
const wib = (iso: string, opt: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString("id-ID", { ...opt, timeZone: "Asia/Jakarta" });

/**
 * Halaman beranda.
 *
 * Parameters
 * ----------
 * searchParams : Promise<{ akses?: string }>
 *     "akses" terisi bila pengguna dialihkan dari halaman di luar aksesnya.
 *
 * Returns
 * -------
 * Promise<JSX.Element>
 */
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
  const promoted = sessions.filter((s) => s.decision === "LanjutPromosi").length;
  const blocked = sessions.filter((s) => s.decision === "KembaliKeDev").length;
  const awaitingReview = sessions.filter((s) => s.status === "Peninjauan").length;
  const totalDecisions = promoted + blocked;
  const promotionRate = totalDecisions > 0 ? Math.round((promoted / totalDecisions) * 100) : null;
  const priority = [
    ...todos.slice(0, 3).map((t) => ({ title: t.title, detail: t.detail, href: t.href, kind: "task" as const })),
    ...(canOpen ? upcoming.slice(0, Math.max(0, 3 - todos.length)).map((s) => ({
      title: `${s.release} · cycle ${s.cycleNo}`,
      detail: `${s.service} · ${boardStatus(s, signoffs)[0]}`,
      href: `/alignment/${s.id}`,
      kind: "release" as const,
    })) : []),
  ].slice(0, 3);
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

      <section className="mt-7" aria-labelledby="overview-title">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">Release intelligence</p>
            <h2 id="overview-title" className="mt-1 text-[22px] sm:text-[25px]">Ringkasan operasional</h2>
          </div>
          <p className="text-[13px] text-ink-3">Berdasarkan seluruh sesi dan insiden tercatat</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Promosi disetujui", value: promoted.toLocaleString("id-ID"), detail: "Keputusan lanjut promosi", Icon: CheckCircle2, tone: "text-pass", background: "bg-pass-soft" },
            { label: "Perlu peninjauan", value: awaitingReview.toLocaleString("id-ID"), detail: "Sesi menunggu keputusan", Icon: Clock3, tone: "text-cond", background: "bg-cond-soft" },
            { label: "Insiden terbuka", value: openIncidents.length.toLocaleString("id-ID"), detail: "Belum terdokumentasi selesai", Icon: Activity, tone: "text-fail", background: "bg-fail-soft" },
            { label: "Rasio lanjut promosi", value: promotionRate === null ? "—" : `${promotionRate}%`, detail: totalDecisions ? `${promoted} dari ${totalDecisions} keputusan` : "Belum ada keputusan", Icon: TrendingUp, tone: "text-accent", background: "bg-accent-soft" },
          ].map(({ label, value, detail, Icon, tone, background }) => (
            <div key={label} className="rounded-xl border border-line bg-surface p-4 shadow-sm sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[13px] font-medium text-ink-2">{label}</p>
                <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${background} ${tone}`}>
                  <Icon className="h-[18px] w-[18px]" aria-hidden />
                </span>
              </div>
              <p className="mt-3 font-display text-[34px] font-bold leading-none tracking-tight text-ink" aria-label={`${label}: ${value}`}>{value}</p>
              <p className="mt-2 text-[12.5px] text-ink-3">{detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]" aria-label="Wawasan dan prioritas">
        <div className="rounded-xl border border-line bg-surface p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-[18px] w-[18px] text-accent" aria-hidden />
            <h2 className="text-[17px]">Wawasan rilis</h2>
          </div>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
            {totalDecisions
              ? `${promoted} dari ${totalDecisions} keputusan cycle melanjutkan promosi ke Production. ${blocked} cycle dikembalikan ke Dev untuk perbaikan.`
              : "Belum ada keputusan promosi. Mulai dari sesi alignment untuk membangun baseline keputusan."}
          </p>
          <div className="mt-5 flex h-2 overflow-hidden rounded-full bg-sunken" role="img" aria-label={totalDecisions ? `${promotionRate}% keputusan lanjut promosi dan ${100 - promotionRate!}% kembali ke Dev` : "Belum ada keputusan"}>
            {totalDecisions > 0 && <span className="bg-pass" style={{ width: `${promotionRate}%` }} />}
            {totalDecisions > 0 && <span className="bg-fail" style={{ width: `${100 - promotionRate!}%` }} />}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[12.5px] text-ink-2">
            <span><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-pass" />Lanjut promosi ({promoted})</span>
            <span><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-fail" />Kembali ke Dev ({blocked})</span>
          </div>
          {canOpen && <Link href="/alignment" className="mt-5 inline-flex items-center gap-1 text-[13.5px] font-semibold text-accent hover:underline">Telusuri sesi alignment <ChevronRight className="h-4 w-4" aria-hidden /></Link>}
        </div>
        <div className="rounded-xl border border-line bg-surface p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[17px]">Prioritas berikutnya</h2>
            <span className="rounded-full bg-sunken px-2.5 py-1 text-[12px] text-ink-2">{priority.length} item</span>
          </div>
          {priority.length ? (
            <ul className="mt-3 divide-y divide-line">
              {priority.map((item) => (
                <li key={item.href + item.title}>
                  <Link href={item.href} className="group flex items-center gap-3 py-3 hover:text-accent">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                      {item.kind === "task" ? <CalendarClock className="h-4 w-4" aria-hidden /> : <Activity className="h-4 w-4" aria-hidden />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-semibold">{item.title}</span>
                      <span className="block text-[12.5px] text-ink-3">{item.detail}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-ink-3 group-hover:text-accent" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="mt-4 text-[14px] text-ink-3">Tidak ada prioritas yang menunggu saat ini.</p>}
        </div>
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
