import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CircleCheck, ShieldAlert } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import { getIncident } from "@/lib/data";
import { INCIDENT_TYPE_LABEL, mttrMinutes } from "@/lib/domain";
import { KeyValue, Notice, PageHeader, Panel, Tag, cx } from "@/components/ui";
import { IndicatorTable, TraceList, VerdictBadge, VerdictHero } from "@/components/verdict";
import { Stepper } from "@/components/stepper";
import { AllTestedButton, CopySummary, FinalizeForm, MitigationLab, ReproRunner } from "./incident-tools";
import { fmtDate, fmtIdr, fmtNum } from "@/lib/format";
import { RESOURCE_LABEL } from "@/lib/core/twin";
import { applyChanges, INCIDENT_CRITERIA } from "@/lib/core/engine";
import { VERDICT_LABEL } from "@/lib/verdict";
import type { Assessment, Incident, ScenarioResult } from "@/lib/types";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const i = await getIncident((await params).id);
  return { title: i ? i.code : "Insiden" };
}

function asScenario(a: Assessment, label: string, tps: number): ScenarioResult {
  return {
    key: a.id,
    label,
    kind: "puncak",
    tps,
    route: a.indicators ? (a.manualVerification.length ? "estimasi_penalaran" : "digital_twin") : "dihentikan",
    indicators: a.indicators,
    limiting: a.limiting,
    status: a.verdict,
    violations: [],
  };
}

function summaryText(inc: Incident) {
  const chosen = inc.mitigations.find((m) => m.id === inc.selectedMitigationId);
  const lines = [
    `Laporan insiden ${inc.code}: ${inc.data.title}`,
    `Layanan ${inc.data.service}, rilis ${inc.data.release}, tipe ${INCIDENT_TYPE_LABEL[inc.data.type]}.`,
    `Terdeteksi ${fmtDate(inc.data.detectedAt, true)} WIB, beban puncak ${inc.data.peakRps} RPS selama ${inc.data.durationMin} menit.`,
    `Status reproduksi: ${inc.notReproduced ? "belum tereproduksi" : "tereproduksi pada spesifikasi saat ini"}.`,
    inc.repro?.limiting ? `Sumber daya pembatas: ${RESOURCE_LABEL[inc.repro.limiting]}.` : "",
    ...(inc.repro?.rootCauses.length ? ["Kemungkinan akar masalah:", ...inc.repro.rootCauses.map((c) => `- ${c}`)] : []),
    `Verdict sebelum mitigasi: ${inc.repro ? VERDICT_LABEL[inc.repro.verdict] : "-"}.`,
    chosen ? `Mitigasi terpilih: ${chosen.label} (verdict ${chosen.result ? VERDICT_LABEL[chosen.result.verdict] : "-"}).` : "",
    inc.needsEscalation ? "Perlu eskalasi ke Technical Lead: tidak ada opsi mitigasi yang lolos." : "",
    mttrMinutes(inc) ? `Waktu deteksi sampai akar masalah teridentifikasi: ${mttrMinutes(inc)} menit.` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

export default async function IncidentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ laporan?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { laporan } = await searchParams;
  const inc = await getIncident(id);
  if (!inc) notFound();
  const d = inc.data;
  const manage = can(user.role, "incident.manage") && inc.status !== "selesai";
  const closed = inc.status === "selesai";
  const hasPass = inc.mitigations.some((m) => m.result?.verdict === "LOLOS");

  const current = closed ? 4 : !inc.repro ? 1 : inc.notReproduced ? 3 : inc.mitigations.length ? (hasPass || inc.needsEscalation ? 3 : 2) : 2;
  const steps = [
    { label: "Data insiden", detail: "Integration Engineer" },
    { label: "Reproduksi", detail: "Core Module" },
    { label: "Uji mitigasi", detail: "Core Module" },
    { label: "Laporan insiden", detail: "Riwayat laporan" },
  ];

  return (
    <>
      <PageHeader
        back={{ href: "/incidents", label: "Respons insiden" }}
        title={`${inc.code}: ${d.title}`}
        description={`${d.service}, rilis ${d.release}. Terdeteksi ${fmtDate(d.detectedAt, true)} WIB.`}
        actions={<Tag tone="fail">{INCIDENT_TYPE_LABEL[d.type]}</Tag>}
      />
      <Stepper steps={steps} current={current} />

      {laporan && closed && (
        <div className="mt-6">
          <Notice tone="pass" icon={<CircleCheck className="h-4 w-4 text-pass" />} title="Laporan insiden tersimpan ke riwayat laporan">
            Tim Support dan Monitoring dapat mengunduhnya dari halaman Report.
          </Notice>
        </div>
      )}
      {inc.needsEscalation && (
        <div className="mt-6">
          <Notice tone="fail" icon={<ShieldAlert className="h-4 w-4 text-fail" />} title="Perlu eskalasi ke Technical Lead">
            Seluruh opsi mitigasi sudah diuji tanpa verdict Lolos.
          </Notice>
        </div>
      )}

      <div className="mt-6 grid gap-6">
        <Panel title="Data insiden" description={`Dibuka oleh ${inc.createdBy}`}>
          <div className="grid gap-5 md:grid-cols-2">
            <KeyValue
              items={[
                ["Deskripsi", d.description],
                ["Beban", `Puncak ${d.peakRps} RPS, rata-rata ${d.avgRps} RPS`],
                ["Durasi", `${d.durationMin} menit`],
                ...(d.type === "memory_leak" ? ([["Kenaikan memori", `${d.memGrowthMbPerHour} MB/jam per node`]] as [string, string][]) : []),
                ...(d.type === "batch_overlap" ? ([["Beban batch", `${d.batchCpuPct}% CPU per node`]] as [string, string][]) : []),
              ]}
            />
            <KeyValue
              items={[
                ["Spesifikasi", `${d.spec.vcpu} vCPU, ${d.spec.ramGb} GB RAM, ${d.spec.nodes} node`],
                ["Pool", `Thread ${d.spec.threadPool}, connection ${d.spec.connPool}`],
                ["Data ELK", d.elkDataAvailable ? "Tersedia" : "Tidak tersedia, memakai gejala manual"],
                ...(d.manualSymptoms ? ([["Gejala manual", d.manualSymptoms]] as [string, string][]) : []),
              ]}
            />
          </div>
        </Panel>

        <Panel title="Reproduksi insiden" description="Apakah insiden akan terjadi lagi pada spesifikasi saat ini?">
          {!inc.repro ? (
            manage ? (
              <ReproRunner id={inc.id} />
            ) : (
              <p className="text-[14px] text-ink-3">Belum dinilai oleh Integration Engineer.</p>
            )
          ) : (
            <div className="grid gap-5">
              <div
                className={cx(
                  "rounded-lg border px-4 py-3",
                  inc.repro.reproduced ? "border-fail/40 bg-fail-soft" : "border-na/40 bg-na-soft",
                )}
              >
                <p className={cx("font-display text-[22px] font-semibold", inc.repro.reproduced ? "text-fail" : "text-na")}>
                  {inc.repro.reproduced ? "Insiden akan terjadi lagi pada spesifikasi saat ini" : "Insiden belum tereproduksi"}
                </p>
                <p className="mt-0.5 text-[14px] text-ink-2">
                  {inc.repro.reproduced
                    ? `Sumber daya pembatas: ${RESOURCE_LABEL[inc.repro.limiting!]}. Lanjutkan dengan menguji opsi mitigasi.`
                    : "Rekomendasi: kalibrasi ulang model digital twin dengan data periode insiden. Laporan tetap dapat disimpan dengan penanda khusus."}
                </p>
              </div>
              <VerdictHero
                verdict={inc.repro.verdict}
                reasons={inc.repro.reasons}
                conditions={[]}
                narrative={inc.repro.narrative}
                meta={<p>{fmtDate(inc.repro.createdAt, true)}</p>}
              />
              {inc.repro.rootCauses.length > 0 && (
                <div>
                  <h3 className="text-[14px] font-semibold">Kemungkinan akar masalah</h3>
                  <ul className="mt-1.5 list-disc pl-5 text-[14px] text-ink-2">
                    {inc.repro.rootCauses.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
              {inc.repro.indicators && (
                <IndicatorTable
                  useLabels
                  scenarios={[
                    asScenario(inc.repro, "Spesifikasi saat ini", d.peakRps),
                    ...inc.mitigations.filter((m) => m.result).map((m, i) => asScenario(m.result!, `Opsi ${i + 1}`, d.peakRps)),
                  ]}
                  criteria={INCIDENT_CRITERIA}
                />
              )}
              {inc.repro.warnings.length > 0 && (
                <Notice tone="warn" title="Catatan dari Core Module">
                  <ul className="list-disc pl-4">
                    {inc.repro.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </Notice>
              )}
              <p className="text-[13px] text-ink-3">
                Kriteria SLA Production: p95 ≤ {INCIDENT_CRITERIA.maxP95Ms} ms, error ≤ {INCIDENT_CRITERIA.maxErrorRatePct}%, CPU ≤ {INCIDENT_CRITERIA.maxCpuPct}%, memori ≤ {INCIDENT_CRITERIA.maxMemPct}%.{" "}
                {inc.repro.mode === "demo" ? "Mode demo, biaya LLM Rp0." : `Estimasi biaya LLM ${fmtIdr(inc.repro.cost.idr)}.`}
              </p>
              <details className="rounded-lg border border-line">
                <summary className="cursor-pointer px-4 py-2.5 text-[14px] font-medium">Jejak keputusan agen</summary>
                <div className="border-t border-line px-4 py-2">
                  <TraceList trace={inc.repro.trace} />
                </div>
              </details>
              {manage && <ReproRunner id={inc.id} rerun />}
            </div>
          )}
        </Panel>

        {inc.repro && !inc.notReproduced && (
          <Panel title="Opsi mitigasi" description="Uji opsi satu per satu sampai ada yang memperoleh verdict Lolos, atau semua opsi selesai diuji.">
            {inc.mitigations.length > 0 && (
              <ol className="mb-5 grid gap-2">
                {inc.mitigations.map((m, i) => {
                  const sp = applyChanges(d.spec, m.changes);
                  return (
                    <li key={m.id} className={cx("rounded-lg border px-4 py-3", m.id === inc.selectedMitigationId ? "border-accent" : "border-line")}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] text-ink-3">Opsi {i + 1}</span>
                        <span className="font-medium">{m.label}</span>
                        {m.result && <VerdictBadge verdict={m.result.verdict} size="sm" />}
                        {m.id === inc.selectedMitigationId && <Tag tone="accent">Direkomendasikan</Tag>}
                      </div>
                      <p className="mt-1 text-[13.5px] text-ink-2">
                        {sp.vcpu} vCPU, {sp.ramGb} GB, {sp.nodes} node, thread pool {sp.threadPool}, connection pool {sp.connPool}
                        {m.changes.timeoutMs ? `, timeout ${m.changes.timeoutMs} ms` : ""}.{" "}
                        {m.result?.indicators &&
                          `${RESOURCE_LABEL[m.result.limiting!]} ${fmtNum(Math.max(m.result.indicators.cpuPct, m.result.indicators.memPct, m.result.indicators.threadSatPct, m.result.indicators.connSatPct))}%, p95 ${m.result.indicators.p95Ms} ms.`}
                      </p>
                      {m.result && <p className="mt-1 text-[13.5px] text-ink-3">{m.result.narrative}</p>}
                    </li>
                  );
                })}
              </ol>
            )}
            {manage && !hasPass && (
              <div className="grid gap-4">
                <MitigationLab id={inc.id} spec={d.spec} count={inc.mitigations.length} />
                {inc.mitigations.length > 0 && !inc.needsEscalation && (
                  <div className="border-t border-line pt-4">
                    <p className="mb-2 text-[14px] text-ink-2">Tidak ada opsi lain yang ingin diuji?</p>
                    <AllTestedButton id={inc.id} />
                  </div>
                )}
              </div>
            )}
            {manage && hasPass && <Notice tone="pass" title="Ada opsi mitigasi yang memperoleh verdict Lolos">Pilih mitigasi yang direkomendasikan di bawah, lalu simpan laporan.</Notice>}
          </Panel>
        )}

        {manage && inc.repro && (inc.notReproduced || inc.mitigations.length > 0) && (
          <Panel title="Laporan insiden" description="Memuat data insiden, status reproduksi, verdict sebelum dan sesudah mitigasi, serta waktu deteksi dan akar masalah sebagai data MTTR.">
            <FinalizeForm id={inc.id} mitigations={inc.mitigations} notReproduced={inc.notReproduced} />
          </Panel>
        )}

        {closed && (
          <Panel title="Laporan insiden" description={`Disimpan ${fmtDate(inc.closedAt, true)}`} actions={<CopySummary text={summaryText(inc)} />}>
            <KeyValue
              items={[
                ["Status", inc.notReproduced ? "Belum tereproduksi (perlu kalibrasi ulang model)" : inc.needsEscalation ? "Perlu eskalasi ke Technical Lead" : "Mitigasi terpilih"],
                ["Verdict sebelum", inc.repro ? <VerdictBadge key="v" verdict={inc.repro.verdict} size="sm" /> : "–"],
                [
                  "Verdict sesudah",
                  inc.selectedMitigationId ? <VerdictBadge key="a" verdict={inc.mitigations.find((m) => m.id === inc.selectedMitigationId)?.result?.verdict ?? null} size="sm" /> : "–",
                ],
                ["Mitigasi terpilih", inc.mitigations.find((m) => m.id === inc.selectedMitigationId)?.label ?? "–"],
                ["Waktu deteksi", `${fmtDate(d.detectedAt, true)} WIB`],
                ["Akar masalah teridentifikasi", inc.rootCauseAt ? `${fmtDate(inc.rootCauseAt, true)} WIB` : "–"],
                ["MTTR (deteksi ke akar masalah)", mttrMinutes(inc) ? `${mttrMinutes(inc)} menit` : "–"],
              ]}
            />
          </Panel>
        )}
      </div>
    </>
  );
}
