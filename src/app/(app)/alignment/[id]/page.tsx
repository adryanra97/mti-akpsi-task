/**
 * Halaman detail sesi alignment: parameter, hasil Core Module, perbandingan cycle, dan keputusan.
 *
 * Bila hasil sudah ada, verdict dan keputusan tampil lebih dulu daripada parameter (NFR-08).
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, CircleCheck, FileSignature, Info } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import { getSession, getSignoff, listSessions } from "@/lib/data";
import { defaultParams, latestResult, peakSummary } from "@/lib/domain";
import { serviceEntry } from "@/lib/services";
import { KeyValue, Notice, PageHeader, Panel, Tag, cx } from "@/components/ui";
import { VerdictBadge, VerdictHero } from "@/components/verdict";
import { ResultDetails } from "@/components/result-details";
import { StatusHistory } from "@/components/status-history";
import { Workbench } from "./workbench";
import { DecisionForm } from "./decision-form";
import { OpenSessionButton } from "./open-session";
import { Stepper } from "@/components/stepper";
import { fmtDate, fmtNum } from "@/lib/format";
import { DECISION_LABEL, SESSION_STATUS_LABEL, SIGNOFF_STATUS_LABEL } from "@/lib/verdict";
import type { AlignmentSession, AnalysisResult, SessionStatus } from "@/lib/types";

/**
 * Judul tab browser untuk sesi alignment.
 *
 * Parameters
 * ----------
 * params : Promise<{ id: string }>
 *     Parameter rute.
 *
 * Returns
 * -------
 * Promise<Metadata>
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const s = await getSession((await params).id);
  return { title: s ? `${s.release} cycle ${s.cycleNo}` : "Sesi alignment" };
}

const STATES: SessionStatus[] = ["Terjadwal", "PengisianParameter", "MenungguHasil", "Peninjauan", "Diputuskan", "Ditutup"];

/**
 * Selisih indikator dibanding cycle sebelumnya, berwarna sesuai arah perbaikan.
 *
 * Parameters
 * ----------
 * now : number | null, optional
 *     Nilai cycle ini.
 * before : number | null, optional
 *     Nilai cycle sebelumnya.
 * unit : string
 *     Satuan selisih.
 * lowerIsBetter : boolean, default true
 *     Arah perbaikan; false untuk kapasitas.
 *
 * Returns
 * -------
 * JSX.Element
 */
function Delta({ now, before, unit, lowerIsBetter = true }: { now?: number | null; before?: number | null; unit: string; lowerIsBetter?: boolean }) {
  if (now == null || before == null) return <span className="text-ink-3">–</span>;
  const d = now - before;
  const good = lowerIsBetter ? d < 0 : d > 0;
  if (Math.abs(d) < 0.05) return <span className="text-ink-3">tetap</span>;
  return (
    <span className={good ? "text-pass" : "text-fail"}>
      {d > 0 ? "+" : "−"}
      {fmtNum(Math.abs(d))}
      {unit}
    </span>
  );
}

/**
 * Tabel perbandingan verdict dan indikator puncak dengan cycle sebelumnya.
 *
 * Parameters
 * ----------
 * run : AnalysisResult
 *     Hasil cycle ini.
 * prev : { s: AlignmentSession; r: AnalysisResult } | null
 *     Sesi dan hasil cycle sebelumnya, atau null.
 *
 * Returns
 * -------
 * JSX.Element
 */
function Comparison({ run, prev }: { run: AnalysisResult; prev: { s: AlignmentSession; r: AnalysisResult } | null }) {
  if (!prev) return <p className="text-[14px] text-ink-3">Belum ada cycle sebelumnya untuk rilis ini.</p>;
  const a = peakSummary(run);
  const b = peakSummary(prev.r);
  const rows: [string, React.ReactNode, React.ReactNode, React.ReactNode][] = [
    ["Verdict", <VerdictBadge key="b" verdict={prev.r.verdict.status} size="sm" />, <VerdictBadge key="a" verdict={run.verdict.status} size="sm" />, ""],
    [
      "Kapasitas maks",
      `${fmtNum(prev.r.kapasitas?.kapasitasMaksTps)} TPS`,
      `${fmtNum(run.kapasitas?.kapasitasMaksTps)} TPS`,
      <Delta key="d" now={run.kapasitas?.kapasitasMaksTps} before={prev.r.kapasitas?.kapasitasMaksTps} unit=" TPS" lowerIsBetter={false} />,
    ],
    ["CPU saat puncak", `${fmtNum(b?.cpuPct)}%`, `${fmtNum(a?.cpuPct)}%`, <Delta key="d" now={a?.cpuPct} before={b?.cpuPct} unit=" poin" />],
    ["p95 saat puncak", `${fmtNum(b?.p95Ms, 0)} ms`, `${fmtNum(a?.p95Ms, 0)} ms`, <Delta key="d" now={a?.p95Ms} before={b?.p95Ms} unit=" ms" />],
    ["Error rate saat puncak", `${fmtNum(b?.errorRatePct, 2)}%`, `${fmtNum(a?.errorRatePct, 2)}%`, <Delta key="d" now={a?.errorRatePct} before={b?.errorRatePct} unit=" poin" />],
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-[14px]">
        <thead>
          <tr className="border-b border-line text-left text-[13px] text-ink-3">
            <th className="py-2 pr-3 font-medium">Indikator</th>
            <th className="px-3 py-2 font-medium">Cycle {prev.s.cycleNo}</th>
            <th className="px-3 py-2 font-medium">Cycle ini</th>
            <th className="py-2 pl-3 font-medium">Perubahan</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([k, b4, now, d]) => (
            <tr key={k} className="border-b border-line last:border-0">
              <th scope="row" className="py-2 pr-3 text-left font-normal text-ink-2">{k}</th>
              <td className="px-3 py-2">{b4}</td>
              <td className="px-3 py-2">{now}</td>
              <td className="py-2 pl-3">{d}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Halaman detail sesi alignment.
 *
 * Parameters
 * ----------
 * params : Promise<{ id: string }>
 *     Identitas sesi.
 * searchParams : Promise<{ keputusan?: string }>
 *     "keputusan" terisi setelah keputusan cycle tersimpan.
 *
 * Returns
 * -------
 * Promise<JSX.Element>
 */
export default async function SessionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ keputusan?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { keputusan } = await searchParams;
  const s = await getSession(id);
  if (!s) notFound();

  const all = await listSessions();
  const draft = !s.params && s.draftFrom ? all.find((x) => x.id === s.draftFrom)?.params : null;
  const formParams = s.params ?? (draft ? { ...draft, serviceVersion: s.releaseCandidate } : { ...defaultParams(s.service), serviceVersion: s.releaseCandidate });
  const run = latestResult(s);
  const prevSession = all
    .filter((x) => x.service === s.service && x.release === s.release && x.cycleNo < s.cycleNo && x.runs.length)
    .sort((a, b) => b.cycleNo - a.cycleNo)[0];
  const prev = prevSession ? { s: prevSession, r: latestResult(prevSession)! } : null;
  const signoff = s.signoffId ? await getSignoff(s.signoffId) : null;

  const closed = s.status === "Diputuskan" || s.status === "Ditutup";
  const open = s.status === "PengisianParameter" || s.status === "Peninjauan";
  const canEdit = can(user.role, "alignment.params") && open;
  const canRun = can(user.role, "alignment.run") && (s.status === "PengisianParameter" || s.status === "MenungguHasil");
  const needsRun = s.status === "PengisianParameter" && s.runs.length > 0;

  const stepIndex = { Terjadwal: 0, PengisianParameter: 0, MenungguHasil: 1, Peninjauan: 2, Diputuskan: 3, Ditutup: 4 }[s.status];
  const steps = [
    { label: "Parameter", detail: "QA/Performance Tester" },
    { label: "Analisis", detail: "Core Module" },
    { label: "Peninjauan", detail: "Peserta alignment" },
    { label: "Keputusan", detail: "Technical Lead" },
    ...(s.decision === "LanjutPromosi" ? [{ label: "Sign-off", detail: "Project/Technical Manager" }] : []),
  ];

  // Verdict, sumber daya pembatas, dan narasi tampil lebih dulu bila sudah ada hasil (NFR-08).
  const twin = serviceEntry(s.service)?.model;
  const resultFirst = Boolean(run) && (s.status === "Peninjauan" || closed);

  const paramsPanel = (
    <Panel
      id="parameter"
      title="Parameter analisis"
      description={s.paramsBy ? `Diisi oleh ${s.paramsBy}${s.paramVersion ? `, versi ${s.paramVersion}` : ""}` : "Belum diisi"}
    >
      <Workbench
        sessionId={s.id}
        params={formParams}
        hasSavedParams={!!s.params}
        draftNote={!s.params && draft ? `Isian diambil dari parameter cycle sebelumnya untuk ${s.service}. Perbarui yang berubah pada versi uji ini.` : undefined}
        canEdit={canEdit}
        canRun={canRun}
        needsRun={needsRun}
        hasRuns={s.runs.length > 0}
        waiting={s.status === "MenungguHasil"}
        range={twin?.statusAktif ? { min: twin.tpsMinTerkalibrasi, max: twin.tpsMaksTerkalibrasi } : null}
      />
    </Panel>
  );

  const decisionSummary = s.decision ? (
    <Panel title="Keputusan cycle" description={`Dicatat oleh ${s.decidedBy} pada ${fmtDate(s.decidedAt, true)}`}>
      <KeyValue
        items={[
          ["Keputusan", DECISION_LABEL[s.decision]],
          ["Ringkasan", s.decisionNotes],
          [
            "Tindak lanjut",
            s.followUps?.length ? (
              <ul className="list-disc pl-4">
                {s.followUps.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            ) : (
              "–"
            ),
          ],
        ]}
      />
      {signoff && (
        <Link href={`/signoff/${signoff.id}`} className="mt-4 flex items-center gap-3 rounded-lg border border-line px-4 py-3 hover:bg-surface-2">
          <FileSignature className="h-5 w-5 text-accent" aria-hidden />
          <span className="flex-1">
            <span className="block font-medium">Dokumen sign-off {signoff.code}</span>
            <span className="block text-[13.5px] text-ink-3">{SIGNOFF_STATUS_LABEL[signoff.status]}</span>
          </span>
          <span className="text-ink-3" aria-hidden>›</span>
        </Link>
      )}
    </Panel>
  ) : null;

  return (
    <>
      <PageHeader
        back={{ href: "/alignment", label: "Alignment rilis" }}
        title={`${s.release} cycle ${s.cycleNo}`}
        description={
          <>
            {s.service}, versi uji <span className="font-medium text-ink">{s.releaseCandidate}</span>, dari {s.envSource} ke {s.envTarget}. Jadwal{" "}
            {fmtDate(s.scheduledAt, true)} WIB.
          </>
        }
        actions={
          <Tag tone={closed ? (s.decision === "LanjutPromosi" ? "pass" : "neutral") : s.status === "Peninjauan" ? "accent" : "warn"}>
            {closed && s.decision ? DECISION_LABEL[s.decision] : SESSION_STATUS_LABEL[s.status]}
          </Tag>
        }
      />

      <Stepper steps={steps} current={Math.min(stepIndex, steps.length)} />

      <div className="mt-3">
        <StatusHistory title="Status sesi" history={s.history} labels={SESSION_STATUS_LABEL} states={STATES} />
      </div>

      {keputusan && closed && (
        <div className="mt-6">
          <Notice tone="pass" icon={<CircleCheck className="h-4 w-4 text-pass" />} title="Keputusan cycle tersimpan dan sesi ditutup">
            Laporan alignment masuk ke riwayat laporan.
            {s.decision === "LanjutPromosi" && signoff && <> Permintaan sign-off {signoff.code} sudah dikirim ke Project/Technical Manager.</>}
          </Notice>
        </div>
      )}

      <div className="mt-6 grid gap-6">
        {s.status === "Terjadwal" && (
          <Panel title="Sesi belum dibuka">
            <div className="flex flex-wrap items-center gap-4">
              <CalendarClock className="h-8 w-8 text-ink-3" aria-hidden />
              <p className="max-w-prose flex-1 text-[14px] text-ink-2">
                Sesi terbuka otomatis saat jadwal akhir sprint cycle tiba ({fmtDate(s.scheduledAt, true)} WIB). Setelah itu QA/Performance Tester dapat mengisi parameter
                analisis.
              </p>
              {can(user.role, "alignment.schedule") && <OpenSessionButton id={s.id} />}
            </div>
          </Panel>
        )}

        {/* Saat parameter sedang diisi, formulir adalah tugas utama sehingga tampil paling atas. */}
        {!resultFirst && s.status !== "Terjadwal" && paramsPanel}

        {s.status === "MenungguHasil" && (
          <Notice tone="info" icon={<Info className="h-4 w-4 text-accent" />} title="Menunggu hasil Core Module">
            Permintaan analisis sudah diajukan. Bila halaman ditutup sebelum hasil diterima, ajukan ulang analisis dari panel parameter.
          </Notice>
        )}

        {/* Sesi yang sudah diputuskan: hasil akhirnya dulu. */}
        {closed && s.decision && decisionSummary}

        {run && (
          <div id="hasil" className="grid scroll-mt-6 gap-6">
            {needsRun && (
              <Notice tone="warn" title="Hasil di bawah memakai parameter versi sebelumnya">
                Ajukan analisis lagi agar verdict sesuai parameter terbaru.
              </Notice>
            )}
            <VerdictHero result={run} />

            {/* Keputusan adalah tindakan utama Technical Lead saat peninjauan: diletakkan tepat setelah verdict. */}
            {s.status === "Peninjauan" &&
              (can(user.role, "alignment.decide") ? (
                <Panel id="keputusan" title="Catat keputusan cycle" description="Diisi Technical Lead setelah verdict ditinjau bersama peserta alignment meeting.">
                  <DecisionForm sessionId={s.id} verdict={run.verdict.status} defaultFollowUps={run.verdict.syarat.join("\n")} />
                </Panel>
              ) : (
                <Notice tone="info" icon={<Info className="h-4 w-4 text-accent" />} title="Menunggu keputusan Technical Lead">
                  Verdict sudah tersedia untuk ditinjau di alignment meeting. Keputusan cycle dicatat oleh Technical Lead.
                  {canEdit && (
                    <>
                      {" "}
                      <a href="#parameter" className="font-medium text-accent hover:underline">
                        Uji varian parameter lain
                      </a>
                    </>
                  )}
                </Notice>
              ))}

            <ResultDetails r={run} />

            <Panel title={prev ? `Dibanding cycle ${prev.s.cycleNo}` : "Dibanding cycle sebelumnya"}>
              <Comparison run={run} prev={prev} />
            </Panel>

            {s.runs.length > 1 && (
              <Panel title="Riwayat analisis sesi ini" description="Setiap uji varian membuat versi parameter dan permintaan analisis baru" bodyClassName="p-0">
                <ol>
                  {[...s.runs].reverse().map((r, i) => (
                    <li key={r.id} className={cx("flex flex-wrap items-center gap-3 border-b border-line px-5 py-3 text-[14px] last:border-0", i === 0 && "bg-surface-2")}>
                      <VerdictBadge verdict={r.result.verdict.status} size="sm" />
                      <span>
                        Puncak {fmtNum(r.params.peakTps)} TPS
                        {r.params.whatIf.length > 0 && `, what-if ${r.params.whatIf.map((m) => `${fmtNum(m)}×`).join(", ")}`}
                      </span>
                      <span className="text-ink-3">
                        {fmtDate(r.createdAt, true)} oleh {r.createdBy}
                      </span>
                      {i === 0 && <Tag tone="accent">Terbaru</Tag>}
                    </li>
                  ))}
                </ol>
              </Panel>
            )}
          </div>
        )}

        {resultFirst && paramsPanel}
      </div>
    </>
  );
}
