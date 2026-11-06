import type { Metadata } from "next";
import Link from "next/link";
import { Download, FileSpreadsheet, Lock } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import { listAudit, listIncidents, listReports, listSessions } from "@/lib/data";
import { applyFilter, filterFromParams, filterToQuery, KIND_LABEL } from "@/lib/reports";
import { ButtonLink, EmptyState, Notice, PageHeader, Panel, Select, Input, Tag, cx } from "@/components/ui";
import { VerdictBadge, VerdictIcon, VERDICT_TONE } from "@/components/verdict";
import { VERDICT_LABEL } from "@/lib/verdict";
import { fmtDate, fmtNum } from "@/lib/format";
import { CpuTrend, IncidentBars, type CpuSeries } from "./trend-charts";
import type { AlignmentSession } from "@/lib/types";

export const metadata: Metadata = { title: "Report" };

const dlLink = "inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong px-2.5 text-[13px] font-medium hover:bg-surface-2";

export default async function Reports({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const filter = filterFromParams(sp);
  const [reports, sessions, incidents, auditLog] = await Promise.all([listReports(), listSessions(), listIncidents(), listAudit()]);
  const services = [...new Set(reports.map((r) => r.service))].sort();
  const releases = [...new Set(reports.map((r) => r.release))].sort().reverse();
  const list = applyFilter(reports, filter).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const canDownload = can(user.role, "reports.download");
  const active = Boolean(filter.kind || filter.service || filter.release || filter.from || filter.to);
  const q = filterToQuery(filter);

  // Ringkasan tren mengikuti filter layanan, rilis, dan tanggal.
  const scoped = (s: AlignmentSession) =>
    (!filter.service || s.service === filter.service) &&
    (!filter.release || s.release === filter.release) &&
    (!filter.from || (s.decidedAt ?? s.scheduledAt).slice(0, 10) >= filter.from) &&
    (!filter.to || (s.decidedAt ?? s.scheduledAt).slice(0, 10) <= filter.to);
  const decided = sessions.filter((s) => s.status === "diputuskan" && s.runs.length && scoped(s));
  const byRelease = new Map<string, AlignmentSession[]>();
  for (const s of decided.sort((a, b) => a.cycleNo - b.cycleNo)) byRelease.set(s.release, [...(byRelease.get(s.release) ?? []), s]);
  const releaseOrder = [...byRelease.entries()].sort((a, b) => (b[1].at(-1)!.decidedAt ?? "").localeCompare(a[1].at(-1)!.decidedAt ?? ""));
  const maxCycle = Math.max(0, ...decided.map((s) => s.cycleNo));
  const cpuSeries: CpuSeries[] = releaseOrder.map(([release, list]) => ({
    release,
    service: list[0].service,
    points: list.map((s) => ({ cycle: s.cycleNo, cpu: s.runs.at(-1)!.scenarios.find((x) => x.key === "puncak")?.indicators?.cpuPct ?? null })),
  }));
  const incScoped = incidents.filter((i) => (!filter.service || i.data.service === filter.service) && (!filter.release || i.data.release === filter.release));
  const incData = [...new Set(incScoped.map((i) => i.data.release))].sort().map((r) => ({ release: r, count: incScoped.filter((i) => i.data.release === r).length }));
  const downloads = auditLog.filter((a) => a.action.startsWith("Unduh")).slice(0, 6);

  return (
    <>
      <PageHeader
        title="Report"
        description="Laporan alignment per sprint cycle, dokumen sign-off, dan laporan insiden. Ringkasan tren di bawah menjadi pengantar; analisis tren lanjutan disusun di luar sistem."
      />

      <form method="get" className="mb-6 rounded-xl border border-line bg-surface p-4" aria-label="Filter laporan">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto] lg:items-end">
          <label className="text-[13px] font-medium">
            Jenis laporan
            <Select name="jenis" defaultValue={filter.kind} className="mt-1">
              <option value="">Semua jenis</option>
              {Object.entries(KIND_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-[13px] font-medium">
            Layanan
            <Select name="layanan" defaultValue={filter.service} className="mt-1">
              <option value="">Semua layanan</option>
              {services.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </label>
          <label className="text-[13px] font-medium">
            Rilis
            <Select name="rilis" defaultValue={filter.release} className="mt-1">
              <option value="">Semua rilis</option>
              {releases.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </label>
          <label className="text-[13px] font-medium">
            Dari tanggal
            <Input type="date" name="dari" defaultValue={filter.from} className="mt-1" />
          </label>
          <label className="text-[13px] font-medium">
            Sampai tanggal
            <Input type="date" name="sampai" defaultValue={filter.to} className="mt-1" />
          </label>
          <div className="flex gap-2">
            <button type="submit" className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-[14px] font-semibold text-primary-ink hover:bg-primary-hover">
              Terapkan
            </button>
            {active && (
              <ButtonLink href="/reports" variant="ghost">
                Reset
              </ButtonLink>
            )}
          </div>
        </div>
      </form>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Verdict per sprint cycle" description="Verdict terakhir yang diputuskan pada setiap cycle" className="lg:col-span-2">
          {releaseOrder.length === 0 ? (
            <p className="text-[14px] text-ink-3">Tidak ada cycle yang diputuskan pada filter ini.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-[13.5px]">
                <thead>
                  <tr className="text-left text-[12.5px] text-ink-3">
                    <th className="pb-2 pr-3 font-medium">Rilis</th>
                    {Array.from({ length: maxCycle }, (_, i) => (
                      <th key={i} className="px-1 pb-2 text-center font-medium">
                        Cycle {i + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {releaseOrder.map(([release, list]) => (
                    <tr key={release}>
                      <th scope="row" className="py-1 pr-3 text-left font-medium">
                        {release}
                        <span className="block text-[12.5px] font-normal text-ink-3">{list[0].service}</span>
                      </th>
                      {Array.from({ length: maxCycle }, (_, i) => {
                        const s = list.find((x) => x.cycleNo === i + 1);
                        const v = s?.runs.at(-1)?.verdict;
                        return (
                          <td key={i} className="px-1 py-1">
                            {v ? (
                              <span
                                className={cx("flex h-9 items-center justify-center gap-1 rounded-md", VERDICT_TONE[v].bg, VERDICT_TONE[v].text)}
                                title={`${release} cycle ${i + 1}: ${VERDICT_LABEL[v]}${s?.decision === "promosi" ? ", lanjut promosi" : ""}`}
                              >
                                <VerdictIcon verdict={v} className="h-4 w-4" />
                                <span className="sr-only">{VERDICT_LABEL[v]}</span>
                                {s?.decision === "promosi" && <span className="text-[11.5px] font-semibold">Promosi</span>}
                              </span>
                            ) : (
                              <span className="flex h-9 items-center justify-center rounded-md border border-dashed border-line text-ink-3" aria-label="Tidak ada data">
                                –
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-2" aria-label="Keterangan verdict">
                {(["LOLOS", "LOLOS_BERSYARAT", "TIDAK_LOLOS", "TIDAK_DAPAT_DINILAI"] as const).map((v) => (
                  <li key={v} className="flex items-center gap-1.5">
                    <VerdictIcon verdict={v} className={cx("h-3.5 w-3.5", VERDICT_TONE[v].text)} />
                    {VERDICT_LABEL[v]}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>

        <Panel title="CPU saat beban puncak per cycle" description="Indikator sumber daya utama per rilis, dalam persen kapasitas">
          {cpuSeries.length ? (
            <>
              <CpuTrend series={cpuSeries} />
              <details className="mt-2 text-[13px]">
                <summary className="cursor-pointer text-accent">Tampilkan sebagai tabel</summary>
                <table className="mt-2 w-full">
                  <thead>
                    <tr className="text-left text-ink-3">
                      <th className="py-1 font-medium">Rilis</th>
                      <th className="py-1 font-medium">Cycle</th>
                      <th className="py-1 text-right font-medium">CPU puncak</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cpuSeries.flatMap((s) =>
                      s.points.map((p) => (
                        <tr key={s.release + p.cycle} className="border-t border-line">
                          <td className="py-1">{s.release}</td>
                          <td className="py-1">{p.cycle}</td>
                          <td className="py-1 text-right">{fmtNum(p.cpu)}%</td>
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
              </details>
            </>
          ) : (
            <p className="text-[14px] text-ink-3">Tidak ada data pada filter ini.</p>
          )}
        </Panel>

        <Panel title="Jumlah insiden per rilis" description="Insiden setelah go-live atau rollout">
          {incData.length ? <IncidentBars data={incData} /> : <p className="text-[14px] text-ink-3">Tidak ada insiden pada filter ini.</p>}
        </Panel>
      </div>

      <section className="mt-6 rounded-xl border border-line bg-surface" aria-labelledby="daftar">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 id="daftar" className="text-[17px] font-semibold">
              Daftar laporan
            </h2>
            <p className="text-[13.5px] text-ink-3">{list.length} laporan{active ? " sesuai filter" : ""}</p>
          </div>
          {canDownload && list.length > 0 && (
            <a href={`/api/reports/download?format=csv${q ? `&${q}` : ""}`} className={cx(dlLink, "h-10 px-3.5 text-[14px]")}>
              <FileSpreadsheet className="h-4 w-4" aria-hidden /> Unduh data riwayat (CSV)
            </a>
          )}
        </header>

        {!canDownload && (
          <div className="px-5 pt-4">
            <Notice tone="info" icon={<Lock className="h-4 w-4 text-accent" />}>
              Peran Anda dapat melihat daftar laporan, tetapi unduhan berkas hanya untuk Tim Support dan Monitoring, Technical Lead, dan Project/Technical Manager.
            </Notice>
          </div>
        )}

        {list.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Riwayat tidak ditemukan" action={<ButtonLink href="/reports" variant="secondary">Hapus filter</ButtonLink>}>
              Tidak ada laporan yang cocok dengan filter ini. Longgarkan rentang tanggal atau pilih jenis laporan lain.
            </EmptyState>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[14px]">
              <thead>
                <tr className="border-b border-line text-left text-[13px] text-ink-3">
                  <th className="px-5 py-2.5 font-medium">Laporan</th>
                  <th className="px-3 py-2.5 font-medium">Jenis</th>
                  <th className="px-3 py-2.5 font-medium">Verdict</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Tanggal</th>
                  <th className="px-5 py-2.5 text-right font-medium">Unduh</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-3">
                      <span className="font-medium">{r.title}</span>
                      <span className="block text-[13px] text-ink-3">
                        {r.service}
                        {r.restricted && (
                          <>
                            {" "}
                            <Tag tone="warn">
                              <Lock className="h-3 w-3" aria-hidden /> Terbatas NDA
                            </Tag>
                          </>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-ink-2">{KIND_LABEL[r.kind]}</td>
                    <td className="px-3 py-3">
                      <VerdictBadge verdict={r.verdict} size="sm" />
                    </td>
                    <td className="px-3 py-3 text-ink-2">{r.status}</td>
                    <td className="px-3 py-3 text-ink-2">{fmtDate(r.createdAt)}</td>
                    <td className="px-5 py-3 text-right">
                      {canDownload ? (
                        <span className="inline-flex gap-1.5">
                          <a href={`/api/reports/download?id=${encodeURIComponent(r.id)}&format=pdf`} className={dlLink} aria-label={`Unduh PDF ${r.title}`}>
                            <Download className="h-3.5 w-3.5" aria-hidden /> PDF
                          </a>
                          <a href={`/api/reports/download?id=${encodeURIComponent(r.id)}&format=csv`} className={dlLink} aria-label={`Unduh CSV ${r.title}`}>
                            CSV
                          </a>
                        </span>
                      ) : (
                        <span className="text-[13px] text-ink-3">–</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canDownload && (
        <Panel className="mt-6" title="Log audit unduhan" description="Setiap unduhan dicatat beserta pengguna dan waktunya" bodyClassName="p-0">
          {downloads.length ? (
            <ul>
              {downloads.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-x-3 border-b border-line px-5 py-2.5 text-[14px] last:border-0">
                  <span className="font-medium">{a.user}</span>
                  <span className="text-ink-2">{a.action}</span>
                  <span className="text-ink-2">{a.target}</span>
                  <span className="ml-auto text-[13px] text-ink-3">{fmtDate(a.createdAt, true)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-4 text-[14px] text-ink-3">Belum ada unduhan.</p>
          )}
          {user.role === "TL" && (
            <p className="border-t border-line px-5 py-2.5 text-[13px]">
              <Link href="/settings#audit" className="text-accent hover:underline">
                Lihat seluruh log audit
              </Link>
            </p>
          )}
        </Panel>
      )}
    </>
  );
}
