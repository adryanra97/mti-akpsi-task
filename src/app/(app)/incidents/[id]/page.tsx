/**
 * Halaman detail kasus insiden: data, reproduksi, opsi mitigasi, dan laporan insiden.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CircleCheck, Info, ShieldAlert } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import { getIncident } from "@/lib/data";
import { INCIDENT_TYPE_LABEL, mttrMinutes, peakSummary, selectedMitigation } from "@/lib/domain";
import { KeyValue, Notice, PageHeader, Panel, Tag, cx } from "@/components/ui";
import { IndicatorTable, VerdictBadge, VerdictHero } from "@/components/verdict";
import { ResultDetails } from "@/components/result-details";
import { StatusHistory } from "@/components/status-history";
import { Stepper } from "@/components/stepper";
import { AllTestedButton, CopySummary, FinalizeForm, MitigationLab, ReproRunner } from "./incident-tools";
import { fmtDate, fmtNum } from "@/lib/format";
import { INCIDENT_STATUS_LABEL, LIMITING_LABEL, VERDICT_LABEL } from "@/lib/verdict";
import type { AnalysisStep, Incident, IncidentStatus, Spec } from "@/lib/types";

/**
 * Judul tab browser untuk kasus insiden.
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
  const i = await getIncident((await params).id);
  return { title: i ? i.code : "Insiden" };
}

const STATES: IncidentStatus[] = ["Dicatat", "DalamReproduksi", "Tereproduksi", "BelumTereproduksi", "UjiMitigasi", "MitigasiDitemukan", "PerluEskalasi", "Terdokumentasi"];

/**
 * Spesifikasi setelah perubahan opsi mitigasi diterapkan.
 *
 * Parameters
 * ----------
 * spec : Spec
 *     Spesifikasi saat ini.
 * ch : Partial<Spec>
 *     Perubahan; nilai kosong diabaikan.
 *
 * Returns
 * -------
 * Spec
 */
function applied(spec: Spec, ch: Partial<Spec>): Spec {
  return { ...spec, ...Object.fromEntries(Object.entries(ch).filter(([, v]) => v)) };
}

/**
 * Ringkasan teks laporan insiden untuk disalin ke kanal eskalasi.
 *
 * Parameters
 * ----------
 * inc : Incident
 *     Kasus insiden.
 *
 * Returns
 * -------
 * string
 */
function summaryText(inc: Incident) {
  const chosen = selectedMitigation(inc);
  const lines = [
    `Laporan insiden ${inc.code}: ${inc.data.title}`,
    `Layanan ${inc.data.service}, rilis ${inc.data.release}, tipe ${INCIDENT_TYPE_LABEL[inc.data.type]}.`,
    `Terdeteksi ${fmtDate(inc.data.detectedAt, true)} WIB, beban puncak ${inc.data.peakRps} RPS selama ${inc.data.durationMin} menit.`,
    `Status reproduksi: ${inc.repro?.statusReproduksi === "Tereproduksi" ? "tereproduksi pada spesifikasi saat ini" : "belum tereproduksi"}.`,
    inc.repro?.sumberDayaPembatas ? `Sumber daya pembatas: ${LIMITING_LABEL[inc.repro.sumberDayaPembatas]}.` : "",
    ...(inc.repro?.kemungkinanAkarMasalah.length ? ["Kemungkinan akar masalah:", ...inc.repro.kemungkinanAkarMasalah.map((c) => `- ${c}`)] : []),
    `Verdict sebelum mitigasi: ${inc.repro ? VERDICT_LABEL[inc.repro.verdict.status] : "-"}.`,
    chosen ? `Mitigasi terpilih: ${chosen.label} (verdict ${VERDICT_LABEL[chosen.result.verdict.status]}).` : "",
    inc.needsEscalation ? "Perlu eskalasi ke Technical Lead: tidak ada opsi mitigasi yang lolos." : "",
    mttrMinutes(inc) ? `Waktu deteksi sampai akar masalah teridentifikasi: ${mttrMinutes(inc)} menit.` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

/**
 * Halaman detail kasus insiden.
 *
 * Parameters
 * ----------
 * params : Promise<{ id: string }>
 *     Identitas insiden.
 * searchParams : Promise<{ laporan?: string }>
 *     "laporan" terisi setelah laporan insiden tersimpan.
 *
 * Returns
 * -------
 * Promise<JSX.Element>
 */
export default async function IncidentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ laporan?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { laporan } = await searchParams;
  const inc = await getIncident(id);
  if (!inc) notFound();
  const d = inc.data;
  const manage = can(user.role, "incident.manage");
  const st = inc.status;
  const documented = st === "Terdokumentasi";
  const notReproduced = st === "BelumTereproduksi" || inc.history.some((h) => h.status === "BelumTereproduksi");
  const hasPass = inc.mitigations.some((m) => m.result.verdict.status === "Lolos");

  const current = { Dicatat: 0, DalamReproduksi: 1, Tereproduksi: 2, UjiMitigasi: 2, BelumTereproduksi: 3, MitigasiDitemukan: 3, PerluEskalasi: 3, Terdokumentasi: 4 }[st];
  const steps = [
    { label: "Data insiden", detail: "Integration Engineer" },
    { label: "Reproduksi", detail: "Core Module" },
    { label: "Uji mitigasi", detail: "Core Module" },
    { label: "Laporan insiden", detail: "Riwayat laporan" },
  ];

  // Kolom pembanding: spesifikasi saat ini dan setiap opsi mitigasi, pada beban insiden yang sama.
  const columns: AnalysisStep[] = [];
  if (inc.repro?.langkah[0]) columns.push({ ...inc.repro.langkah[0], kunci: "awal", deskripsi: "Spesifikasi saat ini" });
  inc.mitigations.forEach((m, i) => columns.push({ ...m.result.langkah[0], kunci: `opsi-${i}`, deskripsi: `Opsi ${i + 1}` }));

  return (
    <>
      <PageHeader
        back={{ href: "/incidents", label: "Respons insiden" }}
        title={`${inc.code}: ${d.title}`}
        description={`${d.service}, rilis ${d.release}. Terdeteksi ${fmtDate(d.detectedAt, true)} WIB.`}
        actions={
          <>
            <Tag tone="fail">{INCIDENT_TYPE_LABEL[d.type]}</Tag>
            <Tag tone={documented ? "pass" : st === "PerluEskalasi" ? "fail" : "accent"}>{INCIDENT_STATUS_LABEL[st]}</Tag>
          </>
        }
      />
      <Stepper steps={steps} current={current} />
      <div className="mt-3">
        <StatusHistory title="Status kasus insiden" history={inc.history} labels={INCIDENT_STATUS_LABEL} states={STATES} />
      </div>

      {laporan && documented && (
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
        {/* Kasus yang sudah terdokumentasi: hasil akhirnya tampil paling atas. */}
        {documented && (
          <Panel title="Laporan insiden" description={`Disimpan ${fmtDate(inc.closedAt, true)}`} actions={<CopySummary text={summaryText(inc)} />}>
            <KeyValue
              items={[
                ["Jalur akhir", notReproduced ? "Belum tereproduksi (perlu kalibrasi ulang model)" : inc.needsEscalation ? "Perlu eskalasi ke Technical Lead" : "Mitigasi ditemukan"],
                ["Verdict sebelum", inc.repro ? <VerdictBadge key="v" verdict={inc.repro.verdict.status} size="sm" /> : "–"],
                ["Verdict sesudah", selectedMitigation(inc) ? <VerdictBadge key="a" verdict={selectedMitigation(inc)!.result.verdict.status} size="sm" /> : "–"],
                ["Mitigasi terpilih", selectedMitigation(inc)?.label ?? "–"],
                ["Waktu deteksi", `${fmtDate(d.detectedAt, true)} WIB`],
                ["Akar masalah teridentifikasi", inc.rootCauseAt ? `${fmtDate(inc.rootCauseAt, true)} WIB` : "–"],
                ["MTTR (deteksi ke akar masalah)", mttrMinutes(inc) ? `${mttrMinutes(inc)} menit` : "–"],
              ]}
            />
          </Panel>
        )}
        <Panel title="Data insiden" description={`Dicatat oleh ${inc.createdBy}`}>
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
                ["Pool", `Thread ${d.spec.threadPool}, connection ${d.spec.connPool}, timeout ${d.spec.timeoutMs ?? 3000} ms`],
                ["Data ELK", d.elkDataAvailable ? "Tersedia" : "Tidak tersedia, memakai gejala manual"],
                ...(d.manualSymptoms ? ([["Gejala manual", d.manualSymptoms]] as [string, string][]) : []),
              ]}
            />
          </div>
        </Panel>

        <Panel title="Reproduksi insiden" description="Apakah insiden akan terjadi lagi pada spesifikasi saat ini? Simulasi berjalan di digital twin, bukan Production.">
          {!inc.repro ? (
            manage && (st === "Dicatat" || st === "DalamReproduksi") ? (
              <ReproRunner id={inc.id} retry={st === "DalamReproduksi"} />
            ) : (
              <p className="text-[14px] text-ink-3">Belum dinilai oleh Integration Engineer.</p>
            )
          ) : (
            <div className="grid gap-5">
              <VerdictHero
                result={inc.repro}
                title={inc.repro.statusReproduksi === "Tereproduksi" ? "Tereproduksi: insiden akan terjadi lagi pada spesifikasi saat ini" : "Insiden belum tereproduksi pada digital twin"}
              />
              {inc.repro.statusReproduksi !== "Tereproduksi" && (
                <Notice tone="info" title="Rekomendasi">
                  Kalibrasi ulang model digital twin dengan data periode insiden. Laporan tetap dapat disusun.
                </Notice>
              )}
              {inc.repro.kemungkinanAkarMasalah.length > 0 && (
                <div>
                  <h3 className="text-[14px] font-semibold">Kemungkinan akar masalah</h3>
                  <ul className="mt-1.5 list-disc pl-5 text-[14px] text-ink-2">
                    {inc.repro.kemungkinanAkarMasalah.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
              <details className="rounded-lg border border-line">
                <summary className="cursor-pointer px-4 py-2.5 text-[14px] font-medium">Rincian hasil reproduksi</summary>
                <div className="border-t border-line p-4">
                  <ResultDetails r={inc.repro} showRunway={false} />
                </div>
              </details>
            </div>
          )}
        </Panel>

        {inc.repro && !notReproduced && (
          <Panel title="Opsi mitigasi" description="Uji opsi satu per satu sampai ada yang memperoleh verdict Lolos, atau tutup pengujian bila semua opsi sudah diuji.">
            {inc.mitigations.length > 0 && (
              <>
                <ol className="mb-5 grid gap-2">
                  {inc.mitigations.map((m, i) => {
                    const sp = applied(d.spec, m.changes);
                    const pk = peakSummary(m.result);
                    return (
                      <li key={m.id} className={cx("rounded-lg border px-4 py-3", m.id === inc.selectedMitigationId ? "border-accent" : "border-line")}>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[13px] text-ink-3">Opsi {i + 1}</span>
                          <span className="font-medium">{m.label}</span>
                          <VerdictBadge verdict={m.result.verdict.status} size="sm" />
                          {m.id === inc.selectedMitigationId && <Tag tone="accent">Terpilih</Tag>}
                        </div>
                        <p className="mt-1 text-[13.5px] text-ink-2">
                          {sp.vcpu} vCPU, {sp.ramGb} GB, {sp.nodes} node, thread pool {sp.threadPool}, connection pool {sp.connPool}, timeout {sp.timeoutMs ?? 3000} ms.{" "}
                          {pk && `p95 ${fmtNum(pk.p95Ms, 0)} ms, error ${fmtNum(pk.errorRatePct, 2)}%.`}
                        </p>
                        <p className="mt-1 text-[13.5px] text-ink-3">{m.result.verdict.narasi}</p>
                      </li>
                    );
                  })}
                </ol>
                <div className="mb-5">
                  <IndicatorTable steps={columns} criteria={inc.repro.kriteria} useLabels />
                </div>
              </>
            )}
            {manage && (st === "Tereproduksi" || st === "UjiMitigasi") && (
              <div className="grid gap-4">
                <MitigationLab id={inc.id} spec={d.spec} count={inc.mitigations.length} />
                {st === "UjiMitigasi" && inc.mitigations.length > 0 && !hasPass && (
                  <div className="border-t border-line pt-4">
                    <p className="mb-2 text-[14px] text-ink-2">Tidak ada opsi lain yang ingin diuji?</p>
                    <AllTestedButton id={inc.id} />
                  </div>
                )}
              </div>
            )}
            {st === "MitigasiDitemukan" && (
              <Notice tone="pass" title="Mitigasi ditemukan">
                Ada opsi yang memperoleh verdict Lolos. Pilih mitigasi yang direkomendasikan, lalu susun laporan.
              </Notice>
            )}
          </Panel>
        )}

        {manage && (st === "MitigasiDitemukan" || st === "PerluEskalasi" || st === "BelumTereproduksi") && (
          <Panel title="Laporan insiden" description="Memuat data insiden, status reproduksi, verdict sebelum dan sesudah mitigasi, serta waktu deteksi dan akar masalah sebagai data MTTR.">
            <FinalizeForm id={inc.id} mitigations={inc.mitigations} notReproduced={st === "BelumTereproduksi"} />
          </Panel>
        )}
        {!manage && !documented && (
          <Notice tone="info" icon={<Info className="h-4 w-4 text-accent" />} title="Ditangani Integration Engineer">
            Halaman ini menampilkan perkembangan kasus. Penilaian dan laporan disusun oleh Integration Engineer.
          </Notice>
        )}

      </div>
    </>
  );
}
