import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleCheck, Download, Lock, TriangleAlert } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import { getSignoff } from "@/lib/data";
import { KeyValue, Notice, PageHeader, Panel, Tag } from "@/components/ui";
import { IndicatorTable, ROUTE_LABEL, VerdictBadge } from "@/components/verdict";
import { SignoffForm } from "./signoff-form";
import { fmtDate, fmtNum } from "@/lib/format";
import { RESOURCE_LABEL } from "@/lib/core/twin";
import { VERDICT_LABEL } from "@/lib/verdict";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const d = await getSignoff((await params).id);
  return { title: d ? `Sign-off ${d.code}` : "Sign-off" };
}

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

export default async function SignoffPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ keputusan?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { keputusan } = await searchParams;
  const d = await getSignoff(id);
  if (!d) notFound();
  const s = d.snapshot;
  const r = s.result;
  const conditional = r.verdict === "LOLOS_BERSYARAT";
  const canDecide = can(user.role, "signoff.decide") && d.status === "menunggu";
  let n = 0;

  return (
    <>
      <PageHeader
        back={{ href: "/signoff", label: "Sign-off" }}
        title={`Dokumen sign-off ${d.code}`}
        description={`${s.release} cycle ${s.cycleNo}, ${s.service}. Versi ${d.version}.`}
        actions={
          <>
            <Tag tone={d.status === "menunggu" ? "warn" : d.status === "disetujui" ? "pass" : "fail"}>
              {d.status === "menunggu" ? "Menunggu keputusan" : d.status === "disetujui" ? "Disetujui" : "Ditolak"}
            </Tag>
            {d.status !== "menunggu" && can(user.role, "reports.download") && (
              <a
                href={`/api/reports/download?id=${encodeURIComponent(d.reportId ?? "")}&format=pdf`}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3.5 text-[14px] font-medium hover:bg-surface-2"
              >
                <Download className="h-4 w-4" aria-hidden /> Unduh PDF
              </a>
            )}
          </>
        }
      />

      {keputusan && d.status !== "menunggu" && (
        <div className="mb-6">
          <Notice tone={d.status === "disetujui" ? "pass" : "warn"} icon={<CircleCheck className="h-4 w-4" />} title={d.status === "disetujui" ? "Sign-off disetujui dan dokumen dikunci" : "Sign-off ditolak"}>
            {d.status === "disetujui"
              ? "Dokumen final siap dilampirkan pada proses release approval dan deployment terjadwal ke Production."
              : "Dokumen tersimpan berstatus ditolak. Release candidate kembali ke environment Dev untuk sprint cycle berikutnya."}
          </Notice>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px] lg:items-start">
        <article className="rounded-xl border border-line bg-surface px-5 py-6 sm:px-8" aria-label="Isi dokumen sign-off">
          <Section n={++n} title="Identitas rilis">
            <KeyValue
              items={[
                ["Layanan", s.service],
                ["Rilis", `${s.release}, sprint cycle ${s.cycleNo}`],
                ["Release candidate", s.releaseCandidate],
                ["Environment", `${s.envSource} (asal) ke ${s.envTarget} (target)`],
                ["Laporan alignment", <Link key="l" className="text-accent underline-offset-2 hover:underline" href={`/alignment/${d.sessionId}`}>Buka sesi alignment</Link>],
              ]}
            />
          </Section>

          <Section n={++n} title="Verdict">
            <div className="flex flex-wrap items-center gap-3">
              <VerdictBadge verdict={r.verdict} />
              {r.maxTps !== null && <span className="text-[14px] text-ink-2">Kapasitas maksimum {fmtNum(r.maxTps)} TPS, pembatas {r.limiting ? RESOURCE_LABEL[r.limiting] : "–"}.</span>}
            </div>
            <p className="mt-3 max-w-prose text-[14.5px] leading-relaxed text-ink-2">{r.narrative}</p>
          </Section>

          {conditional && (
            <Section n={++n} title="Syarat dan angka yang perlu verifikasi manual">
              <div className="rounded-lg border border-cond/40 bg-cond-soft p-4 text-[14px]">
                <ul className="grid gap-1.5">
                  {[...r.conditions, ...r.manualVerification].map((c, i) => (
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
                ["Beban", `Normal ${s.params.normalTps} TPS, puncak ${s.params.peakTps} TPS${s.params.whatIf.length ? `, what-if ${s.params.whatIf.map((m) => `${m}×`).join(", ")}` : ""}`],
                ["Kriteria penerimaan", `p95 ≤ ${s.params.criteria.maxP95Ms} ms, error ≤ ${s.params.criteria.maxErrorRatePct}%, CPU ≤ ${s.params.criteria.maxCpuPct}%, memori ≤ ${s.params.criteria.maxMemPct}%`],
                ["Spesifikasi Production", `${s.params.prodSpec.vcpu} vCPU, ${s.params.prodSpec.ramGb} GB, ${s.params.prodSpec.nodes} node`],
                ["Uji di Dev", `${s.params.devSummary.testedTps} TPS, p95 ${s.params.devSummary.p95Ms} ms, CPU ${s.params.devSummary.cpuPct}%`],
              ]}
            />
          </Section>

          <Section n={++n} title="Indikator sumber daya dan sumber angka">
            <IndicatorTable scenarios={r.scenarios} criteria={s.params.criteria} />
            <p className="mt-3 text-[13.5px] text-ink-3">
              Sumber angka:{" "}
              {r.scenarios.map((x) => `${x.label}: ${ROUTE_LABEL[x.route]}`).join("; ")}.
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
          ) : d.status === "menunggu" ? (
            <Notice tone="info" title="Menunggu keputusan Project/Technical Manager">
              Diminta {fmtDate(d.createdAt, true)} oleh {d.requestedBy}.
            </Notice>
          ) : (
            <Panel title={d.status === "disetujui" ? "Disetujui" : "Ditolak"}>
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
            Verdict {VERDICT_LABEL[r.verdict]} dihasilkan Core Module pada {fmtDate(r.createdAt, true)}. Eksekusi deployment tetap melalui pipeline yang berlaku.
          </p>
        </aside>
      </div>
    </>
  );
}
