import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleCheck, FileSignature, Info } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import { getSession, getSignoff, listSessions } from "@/lib/data";
import { defaultParams, SESSION_STATUS_LABEL } from "@/lib/domain";
import { KeyValue, Notice, PageHeader, Panel, Tag, cx } from "@/components/ui";
import { CapacityRunway, IndicatorTable, TraceList, VerdictBadge, VerdictHero } from "@/components/verdict";
import { Workbench } from "./workbench";
import { DecisionForm } from "./decision-form";
import { Stepper } from "@/components/stepper";
import { fmtDate, fmtIdr, fmtNum } from "@/lib/format";
import { RESOURCE_LABEL } from "@/lib/core/twin";
import { PROVIDER_LABEL } from "@/lib/settings";
import type { AlignmentSession, AnalysisResult } from "@/lib/types";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const s = await getSession((await params).id);
  return { title: s ? `${s.release} cycle ${s.cycleNo}` : "Sesi alignment" };
}

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

function Comparison({ run, prev }: { run: AnalysisResult; prev: { s: AlignmentSession; r: AnalysisResult } | null }) {
  if (!prev) return <p className="text-[14px] text-ink-3">Belum ada cycle sebelumnya untuk rilis ini.</p>;
  const a = run.scenarios.find((x) => x.key === "puncak")?.indicators;
  const b = prev.r.scenarios.find((x) => x.key === "puncak")?.indicators;
  const rows: [string, React.ReactNode, React.ReactNode, React.ReactNode][] = [
    ["Verdict", <VerdictBadge key="b" verdict={prev.r.verdict} size="sm" />, <VerdictBadge key="a" verdict={run.verdict} size="sm" />, ""],
    ["Kapasitas maks", `${fmtNum(prev.r.maxTps)} TPS`, `${fmtNum(run.maxTps)} TPS`, <Delta key="d" now={run.maxTps} before={prev.r.maxTps} unit=" TPS" lowerIsBetter={false} />],
    ["CPU saat puncak", `${fmtNum(b?.cpuPct)}%`, `${fmtNum(a?.cpuPct)}%`, <Delta key="d" now={a?.cpuPct} before={b?.cpuPct} unit=" poin" />],
    ["p95 saat puncak", `${fmtNum(b?.p95Ms)} ms`, `${fmtNum(a?.p95Ms)} ms`, <Delta key="d" now={a?.p95Ms} before={b?.p95Ms} unit=" ms" />],
    ["Memori saat puncak", `${fmtNum(b?.memPct)}%`, `${fmtNum(a?.memPct)}%`, <Delta key="d" now={a?.memPct} before={b?.memPct} unit=" poin" />],
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

export default async function SessionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ keputusan?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { keputusan } = await searchParams;
  const s = await getSession(id);
  if (!s) notFound();

  const all = await listSessions();
  const draft = !s.params && s.draftFrom ? all.find((x) => x.id === s.draftFrom)?.params : null;
  const formParams = s.params ?? (draft ? { ...draft, serviceVersion: s.releaseCandidate } : { ...defaultParams(s.service), serviceVersion: s.releaseCandidate });
  const run = s.runs.at(-1);
  const prevSession = all
    .filter((x) => x.service === s.service && x.release === s.release && x.cycleNo < s.cycleNo && x.runs.length)
    .sort((a, b) => b.cycleNo - a.cycleNo)[0];
  const prev = prevSession ? { s: prevSession, r: prevSession.runs.at(-1)! } : null;
  const signoff = s.signoffId ? await getSignoff(s.signoffId) : null;

  const decided = s.status === "diputuskan";
  const canEdit = can(user.role, "alignment.params") && !decided;
  const canRun = can(user.role, "alignment.run") && !decided;
  const needsRun = s.status === "siap_dianalisis" && s.runs.length > 0;

  const stepIndex = { menunggu_parameter: 0, siap_dianalisis: 1, dianalisis: 2, diputuskan: 4 }[s.status];
  const steps = [
    { label: "Parameter", detail: "QA/Performance Tester" },
    { label: "Analisis", detail: "Core Module" },
    { label: "Tinjau verdict", detail: "Peserta alignment" },
    { label: "Keputusan", detail: "Technical Lead" },
    ...(s.decision === "promosi" ? [{ label: "Sign-off", detail: "Project/Technical Manager" }] : []),
  ];

  return (
    <>
      <PageHeader
        back={{ href: "/alignment", label: "Alignment rilis" }}
        title={`${s.release} cycle ${s.cycleNo}`}
        description={
          <>
            {s.service}, versi uji <span className="font-medium text-ink">{s.releaseCandidate}</span>, dari {s.envSource} ke {s.envTarget}. Jadwal {fmtDate(s.scheduledAt, true)} WIB.
          </>
        }
        actions={<Tag tone={decided ? (s.decision === "promosi" ? "pass" : "neutral") : "warn"}>{s.decision === "promosi" ? "Lanjut promosi" : s.decision === "kembali_dev" ? "Kembali ke Dev" : SESSION_STATUS_LABEL[s.status]}</Tag>}
      />

      <Stepper steps={steps} current={Math.min(stepIndex, steps.length)} />

      {keputusan && decided && (
        <div className="mt-6">
          <Notice tone="pass" icon={<CircleCheck className="h-4 w-4 text-pass" />} title="Keputusan cycle tersimpan">
            Laporan alignment masuk ke riwayat laporan.
            {s.decision === "promosi" && signoff && (
              <>
                {" "}
                Permintaan sign-off {signoff.code} sudah dikirim ke Project/Technical Manager.
              </>
            )}
          </Notice>
        </div>
      )}

      <div className="mt-6 grid gap-6">
        <Panel id="parameter" title="Parameter analisis" description={s.paramsBy ? `Diisi oleh ${s.paramsBy}` : "Belum diisi"}>
          <Workbench
            sessionId={s.id}
            params={formParams}
            hasSavedParams={!!s.params}
            draftNote={!s.params && draft ? `Isian diambil dari parameter cycle sebelumnya untuk ${s.service}. Perbarui yang berubah pada release candidate ini.` : undefined}
            canEdit={canEdit}
            canRun={canRun}
            needsRun={needsRun}
            hasRuns={s.runs.length > 0}
          />
        </Panel>

        {run && (
          <div id="hasil" className="grid scroll-mt-6 gap-6">
            {needsRun && (
              <Notice tone="warn" title="Hasil di bawah memakai parameter sebelumnya">
                Jalankan ulang analisis agar verdict sesuai parameter terbaru.
              </Notice>
            )}
            <VerdictHero
              verdict={run.verdict}
              reasons={run.reasons}
              conditions={run.conditions}
              narrative={run.narrative}
              meta={
                <>
                  <p>{fmtDate(run.createdAt, true)}</p>
                  <p>{run.mode === "demo" ? "Mode demo" : `${PROVIDER_LABEL[run.provider as keyof typeof PROVIDER_LABEL] ?? run.provider}, ${run.model}`}</p>
                </>
              }
            />

            {run.warnings.length > 0 && (
              <Notice tone="warn" title="Catatan dari Core Module">
                <ul className="list-disc pl-4">
                  {run.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </Notice>
            )}

            {run.manualVerification.length > 0 && (
              <Notice tone="warn" title="Angka yang perlu verifikasi manual">
                <ul className="list-disc pl-4">
                  {run.manualVerification.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </Notice>
            )}

            <Panel
              title="Hasil simulasi"
              description={
                run.limiting
                  ? `Sumber daya pembatas pada beban puncak: ${RESOURCE_LABEL[run.limiting]}`
                  : "Indikator tidak dihitung karena analisis dihentikan"
              }
            >
              {run.maxTps !== null ? (
                <CapacityRunway scenarios={run.scenarios.filter((x) => x.indicators)} maxTps={run.maxTps} />
              ) : (
                <p className="mb-2 text-[14px] text-ink-3">Kapasitas maksimum tidak dihitung.</p>
              )}
              <div className="mt-5">
                <IndicatorTable scenarios={run.scenarios} criteria={run.params.criteria} />
              </div>
            </Panel>

            <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
              <Panel title={prev ? `Dibanding cycle ${prev.s.cycleNo}` : "Dibanding cycle sebelumnya"}>
                <Comparison run={run} prev={prev} />
              </Panel>
              <Panel title="Data dan biaya">
                <KeyValue
                  items={[
                    ["Baseline", run.baseline.source === "elk" ? `ELK Stack, ${run.baseline.window}` : `Tersimpan ${fmtDate(run.baseline.takenAt)}`],
                    ["Penyamaran", `${run.masking.count} item (${run.masking.kinds.join(", ") || "–"})`],
                    ["Panggilan LLM", run.mode === "demo" ? "Tidak ada (mode demo)" : `${run.cost.calls} panggilan, ${fmtNum(run.cost.inputTokens + run.cost.outputTokens, 0)} token`],
                    ["Estimasi biaya", run.mode === "demo" ? "Rp0" : `${fmtIdr(run.cost.idr)} (US$${run.cost.usd.toFixed(4)})`],
                  ]}
                />
              </Panel>
            </div>

            <details className="group rounded-xl border border-line bg-surface">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
                <span>
                  <span className="font-display text-[17px] font-semibold">Jejak keputusan agen</span>
                  <span className="block text-[13.5px] text-ink-3">Langkah, jalur penjurusan, skor keyakinan, dan kesepakatan sampel</span>
                </span>
                <span className="text-[13.5px] text-accent group-open:hidden">Tampilkan</span>
                <span className="hidden text-[13.5px] text-accent group-open:inline">Sembunyikan</span>
              </summary>
              <div className="border-t border-line px-5 py-3">
                <TraceList trace={run.trace} />
              </div>
            </details>

            {s.runs.length > 1 && (
              <Panel title="Riwayat analisis sesi ini" description="Setiap uji varian (what-if bertingkat) tercatat" bodyClassName="p-0">
                <ol>
                  {[...s.runs].reverse().map((r, i) => (
                    <li key={r.id} className={cx("flex flex-wrap items-center gap-3 border-b border-line px-5 py-3 text-[14px] last:border-0", i === 0 && "bg-surface-2")}>
                      <VerdictBadge verdict={r.verdict} size="sm" />
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

        {run && !decided && s.status === "dianalisis" && (
          can(user.role, "alignment.decide") ? (
            <Panel title="Catat keputusan cycle" description="Diisi Technical Lead setelah verdict ditinjau bersama peserta alignment meeting.">
              <DecisionForm sessionId={s.id} verdict={run.verdict} defaultFollowUps={run.conditions.join("\n")} />
            </Panel>
          ) : (
            <Notice tone="info" icon={<Info className="h-4 w-4 text-accent" />} title="Menunggu keputusan Technical Lead">
              Verdict sudah tersedia untuk ditinjau di alignment meeting. Keputusan cycle dicatat oleh Technical Lead.
            </Notice>
          )
        )}

        {decided && (
          <Panel title="Keputusan cycle" description={`Dicatat oleh ${s.decidedBy} pada ${fmtDate(s.decidedAt, true)}`}>
            <KeyValue
              items={[
                ["Keputusan", s.decision === "promosi" ? "Lanjut promosi ke Production" : "Kembali ke Dev untuk sprint cycle berikutnya"],
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
              <Link
                href={`/signoff/${signoff.id}`}
                className="mt-4 flex items-center gap-3 rounded-lg border border-line px-4 py-3 hover:bg-surface-2"
              >
                <FileSignature className="h-5 w-5 text-accent" aria-hidden />
                <span className="flex-1">
                  <span className="block font-medium">Dokumen sign-off {signoff.code}</span>
                  <span className="block text-[13.5px] text-ink-3">
                    {signoff.status === "menunggu" ? "Menunggu keputusan Project/Technical Manager" : signoff.status === "disetujui" ? "Disetujui dan dikunci" : "Ditolak"}
                  </span>
                </span>
                <span className="text-ink-3" aria-hidden>›</span>
              </Link>
            )}
          </Panel>
        )}
      </div>
    </>
  );
}
