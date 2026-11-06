/**
 * Halaman dokumen sign-off: isi dokumen bernomor, keputusan, dan unduhan PDF.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleCheck, Download, Lock, TriangleAlert } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import { getSignoff } from "@/lib/data";
import { KeyValue, Notice, PageHeader, Panel, Tag } from "@/components/ui";
import { IndicatorTable, VerdictBadge } from "@/components/verdict";
import { StatusHistory } from "@/components/status-history";
import { SignoffForm } from "./signoff-form";
import { fmtDate, fmtNum } from "@/lib/format";
import { LIMITING_LABEL, ROUTE_LABEL, SIGNOFF_STATUS_LABEL, VERDICT_LABEL } from "@/lib/verdict";
import type { SignoffStatus } from "@/lib/types";

/**
 * Judul tab browser untuk dokumen sign-off.
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
  const d = await getSignoff((await params).id);
  return { title: d ? `Sign-off ${d.code}` : "Sign-off" };
}

const STATES: SignoffStatus[] = ["Draf", "MenungguKeputusan", "Disetujui", "Ditolak"];

/**
 * Bagian bernomor pada dokumen sign-off.
 *
 * Parameters
 * ----------
 * n : number
 *     Nomor bagian.
 * title : string
 *     Judul bagian.
 * children : ReactNode
 *     Isi bagian.
 *
 * Returns
 * -------
 * JSX.Element
 */
function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line py-5 first:border-0 first:pt-0">
      <h2 className="mb-3 flex items-baseline gap-2 text-[17px] font-semibold">
        <span className="text-ink-3">{n}.</span> {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * Halaman dokumen sign-off.
 *
 * Parameters
 * ----------
 * params : Promise<{ id: string }>
 *     Identitas dokumen.
 * searchParams : Promise<{ keputusan?: string }>
 *     "keputusan" terisi setelah keputusan tersimpan.
 *
 * Returns
 * -------
 * Promise<JSX.Element>
 */
export default async function SignoffPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ keputusan?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { keputusan } = await searchParams;
  const d = await getSignoff(id);
  if (!d) notFound();
  const s = d.snapshot;
  const r = s.result;
  const conditional = r.verdict.status === "LolosBersyarat";
  const decided = d.status === "Disetujui" || d.status === "Ditolak";
  const canDecide = can(user.role, "signoff.decide") && d.status === "MenungguKeputusan";
  const manual = r.langkah.filter((l) => l.perluVerifikasiManual);
  let n = 0;

  return (
    <>
      <PageHeader
        back={{ href: "/signoff", label: "Sign-off" }}
        title={`Dokumen sign-off ${d.code}`}
        description={`${s.release} cycle ${s.cycleNo}, ${s.service}. Versi ${d.version}.`}
        actions={
          <>
            <Tag tone={d.status === "MenungguKeputusan" ? "warn" : d.status === "Disetujui" ? "pass" : d.status === "Ditolak" ? "fail" : "neutral"}>
              {SIGNOFF_STATUS_LABEL[d.status]}
            </Tag>
            {decided && can(user.role, "reports.download") && (
              <a
                href={`/api/reports/download?id=${encodeURIComponent(d.reportId ?? "")}&format=pdf`}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-line-strong bg-surface px-3.5 text-[14px] font-medium hover:bg-surface-2"
              >
                <Download className="h-4 w-4" aria-hidden /> Unduh PDF
              </a>
            )}
          </>
        }
      />

      <div className="mb-6">
        <StatusHistory title="Status dokumen" history={d.history} labels={SIGNOFF_STATUS_LABEL} states={STATES} />
      </div>

      {keputusan && decided && (
        <div className="mb-6">
          <Notice
            tone={d.status === "Disetujui" ? "pass" : "warn"}
            icon={<CircleCheck className="h-4 w-4" />}
            title={d.status === "Disetujui" ? "Sign-off disetujui dan dokumen dikunci" : "Sign-off ditolak"}
          >
            {d.status === "Disetujui"
              ? "Dokumen final siap dilampirkan pada proses release approval dan deployment terjadwal ke Production."
              : "Dokumen tersimpan berstatus ditolak. Perbaikan dilakukan dengan menerbitkan dokumen baru pada cycle berikutnya."}
          </Notice>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px] lg:items-start">
        <article className="rounded-xl border border-line bg-surface px-5 py-6 sm:px-8" aria-label="Isi dokumen sign-off">
          <Section n={++n} title="Verdict dan ringkasan">
            <div className="flex flex-wrap items-center gap-3">
              <VerdictBadge verdict={r.verdict.status} />
              {r.sumberDayaPembatas && <Tag>Pembatas: {LIMITING_LABEL[r.sumberDayaPembatas]}</Tag>}
              {r.kapasitas && <span className="text-[14px] text-ink-2">Kapasitas maksimum {fmtNum(r.kapasitas.kapasitasMaksTps)} TPS.</span>}
            </div>
            <p className="mt-3 max-w-prose text-[14.5px] leading-relaxed text-ink-2">{r.verdict.narasi}</p>
          </Section>

          <Section n={++n} title="Identitas rilis">
            <KeyValue
              items={[
                ["Layanan", s.service],
                ["Rilis", `${s.release}, sprint cycle ${s.cycleNo}`],
                ["Versi uji", s.releaseCandidate],
                ["Environment", `${s.envSource} (asal) ke ${s.envTarget} (target)`],
                [
                  "Laporan alignment",
                  <Link key="l" className="text-accent underline-offset-2 hover:underline" href={`/alignment/${d.sessionId}`}>
                    Buka sesi alignment
                  </Link>,
                ],
              ]}
            />
          </Section>

          {conditional && (
            <Section n={++n} title="Syarat dan angka yang perlu verifikasi manual">
              <div className="rounded-lg border border-cond/40 bg-cond-soft p-4 text-[14px]">
                <ul className="grid gap-1.5">
                  {[...r.verdict.syarat, ...manual.map((l) => `${l.deskripsi}: estimasi penalaran, keyakinan ${Math.round((l.skorKeyakinan ?? 0) * 100)}%`)].map((c, i) => (
                    <li key={i} className="flex gap-2">
                      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-cond" aria-hidden />
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            </Section>
          )}

          <Section n={++n} title="Parameter analisis">
            <KeyValue
              items={[
                ["Beban", `Normal ${s.params.normalTps} TPS, puncak ${s.params.peakTps} TPS${s.params.whatIf.length ? `, what-if ${s.params.whatIf.map((m) => `${m}× normal`).join(", ")}` : ""}`],
                ["Kriteria penerimaan", `p95 ≤ ${s.params.criteria.maxP95Ms} ms, error ≤ ${s.params.criteria.maxErrorRatePct}%, CPU ≤ ${s.params.criteria.maxCpuPct}%, memori ≤ ${s.params.criteria.maxMemPct}%`],
                ["Spesifikasi Production", `${s.params.prodSpec.vcpu} vCPU, ${s.params.prodSpec.ramGb} GB, ${s.params.prodSpec.nodes} node`],
                ["Uji di Dev", `${s.params.devSummary.testedTps} TPS, p95 ${s.params.devSummary.p95Ms} ms, CPU ${s.params.devSummary.cpuPct}%`],
              ]}
            />
          </Section>

          <Section n={++n} title="Indikator sumber daya dan sumber angka">
            <IndicatorTable steps={r.langkah} criteria={r.kriteria} />
            <p className="mt-3 text-[13.5px] text-ink-3">
              Sumber angka: {r.langkah.map((x) => `${x.deskripsi}: ${x.jalurPenjurusan ? ROUTE_LABEL[x.jalurPenjurusan] : "dihentikan"}`).join("; ")}.
            </p>
          </Section>

          <Section n={++n} title="Catatan tindak lanjut">
            <p className="text-[14.5px] text-ink-2">{s.decisionNotes}</p>
            {s.followUps.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-[14px] text-ink-2">
                {s.followUps.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            )}
          </Section>

          <Section n={++n} title="Keterbatasan simulasi">
            <ul className="list-disc pl-5 text-[14px] text-ink-2">
              {s.limitations.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </Section>
        </article>

        <aside className="grid gap-4 lg:sticky lg:top-6">
          {canDecide ? (
            <Panel title="Keputusan Anda" description="Tinjau isi dokumen sebelum memutuskan.">
              <SignoffForm id={d.id} />
            </Panel>
          ) : !decided ? (
            <Notice tone="info" title="Menunggu keputusan Project/Technical Manager">
              Diminta {fmtDate(d.createdAt, true)} oleh {d.requestedBy}.
            </Notice>
          ) : (
            <Panel title={SIGNOFF_STATUS_LABEL[d.status]}>
              <KeyValue
                items={[
                  ["Oleh", d.decidedBy],
                  ["Waktu", `${fmtDate(d.decidedAt, true)} WIB`],
                  ["Versi", `v${d.version}`],
                  ["Catatan", d.pmNotes || "–"],
                ]}
              />
              <p className="mt-3 flex items-center gap-2 text-[13px] text-ink-3">
                <Lock className="h-3.5 w-3.5" aria-hidden /> Terkunci {fmtDate(d.lockedAt, true)}
              </p>
            </Panel>
          )}
          <p className="text-[13px] text-ink-3">
            Verdict {VERDICT_LABEL[r.verdict.status]} dihasilkan Core Module pada {fmtDate(r.waktuSelesai, true)}. Eksekusi deployment tetap melalui pipeline yang berlaku.
          </p>
        </aside>
      </div>
    </>
  );
}
