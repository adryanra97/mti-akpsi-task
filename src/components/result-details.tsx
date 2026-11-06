/**
 * Rincian hasil analisis di bawah kartu verdict: peringatan, verifikasi manual, indikator,
 * trajektori, capacity planning, baseline, rencana uji, kalibrasi, biaya, dan jejak keputusan.
 */
import type { AnalysisResult, StepSummary } from "@/lib/types";
import { KeyValue, Notice, Panel } from "./ui";
import { CapacityRunway, IndicatorTable, TraceList } from "./verdict";
import { LazyTrajectoryChart } from "./lazy-charts";
import { fmtDate, fmtIdr, fmtNum } from "@/lib/format";
import { LIMITING_LABEL } from "@/lib/verdict";
import { peakSummary } from "@/lib/domain";

/**
 * Perbandingan metrik baseline Production dengan hasil simulasi beban puncak.
 *
 * Parameters
 * ----------
 * r : AnalysisResult
 *     Hasil Core Module.
 *
 * Returns
 * -------
 * JSX.Element
 */
function BaselineVsSim({ r }: { r: AnalysisResult }) {
  const b = r.metrikBaseline;
  const s = peakSummary(r) as StepSummary | null;
  const rows: [string, string, string][] = [
    ["Beban (TPS)", `rata-rata ${fmtNum(b.throughputTps)}, puncak ${fmtNum(b.puncakTps)}`, s ? fmtNum(s.tps) : "–"],
    ["Utilisasi CPU", `${fmtNum(b.cpuRataPersen)}%`, s ? `${fmtNum(s.cpuPct)}%` : "–"],
    ["Utilisasi memori", `${fmtNum(b.memoriRataPersen)}%`, s ? `${fmtNum(s.memPct)}%` : "–"],
    ["Response time p95", `${fmtNum(b.responseTimeP95Ms, 0)} ms`, s ? `${fmtNum(s.p95Ms, 0)} ms` : "–"],
    ["Error rate", `${fmtNum(b.errorRatePersen, 2)}%`, s ? `${fmtNum(s.errorRatePct, 2)}%` : "–"],
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-[14px]">
        <thead>
          <tr className="border-b border-line text-left text-[13px] text-ink-3">
            <th className="py-2 pr-3 font-medium">Metrik</th>
            <th className="px-3 py-2 font-medium">Baseline Production</th>
            <th className="py-2 pl-3 font-medium">Kondisi simulasi</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([k, a, c]) => (
            <tr key={k} className="border-b border-line last:border-0">
              <th scope="row" className="py-2 pr-3 text-left font-normal text-ink-2">{k}</th>
              <td className="px-3 py-2">{a}</td>
              <td className="py-2 pl-3">{c}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[12.5px] text-ink-3">
        Baseline: {b.sumber === "ELKLangsung" ? "ELK Stack, 7 hari terakhir" : "baseline tersimpan terakhir (ELK tidak dapat diakses)"}, diambil {fmtDate(b.tanggalPengambilan)}.
      </p>
    </div>
  );
}

/**
 * Rincian lengkap satu hasil analisis.
 *
 * Parameters
 * ----------
 * r : AnalysisResult
 *     Hasil Core Module.
 * showRunway : boolean, default true
 *     Tampilkan runway kapasitas (disembunyikan pada reproduksi insiden).
 *
 * Returns
 * -------
 * JSX.Element
 */
export function ResultDetails({ r, showRunway = true }: { r: AnalysisResult; showRunway?: boolean }) {
  const manual = r.langkah.filter((l) => l.perluVerifikasiManual);
  const stopped = r.statusPermintaan === "Selesai" && r.alasanDihentikan;
  const peak = peakSummary(r);
  const metricCards = peak ? [
    { label: "CPU puncak", value: peak.cpuPct, limit: r.kriteria.maxCpuPct, unit: "%", digits: 1 },
    { label: "Memori puncak", value: peak.memPct, limit: r.kriteria.maxMemPct, unit: "%", digits: 1 },
    { label: "Response time p95", value: peak.p95Ms, limit: r.kriteria.maxP95Ms, unit: " ms", digits: 0 },
    { label: "Error rate", value: peak.errorRatePct, limit: r.kriteria.maxErrorRatePct, unit: "%", digits: 2 },
  ] : [];
  return (
    <div className="grid gap-6">
      {r.peringatan.length > 0 && (
        <Notice tone="warn" title="Catatan dari Core Module">
          <ul className="list-disc pl-4">
            {r.peringatan.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Notice>
      )}
      {manual.length > 0 && (
        <Notice tone="warn" title="Angka yang perlu verifikasi manual">
          <ul className="list-disc pl-4">
            {manual.map((l) => (
              <li key={l.kunci}>
                {l.deskripsi}: estimasi penalaran, keyakinan {Math.round((l.skorKeyakinan ?? 0) * 100)}%, kesepakatan sampel {Math.round((l.kesepakatanSampel ?? 0) * 100)}%.
              </li>
            ))}
          </ul>
        </Notice>
      )}

      {metricCards.length > 0 && (
        <section aria-labelledby="quick-metrics-title">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.13em] text-accent">Performance snapshot</p>
              <h2 id="quick-metrics-title" className="mt-1 text-[20px]">Indikator beban puncak</h2>
            </div>
            <p className="text-[12.5px] text-ink-3">Dibandingkan dengan kriteria penerimaan</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {metricCards.map((m) => {
              const exceeds = m.value > m.limit;
              const ratio = m.limit > 0 ? Math.min((m.value / m.limit) * 100, 100) : 0;
              return (
                <div key={m.label} className="rounded-xl border border-line bg-surface p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[13px] font-medium text-ink-2">{m.label}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${exceeds ? "bg-fail-soft text-fail" : "bg-pass-soft text-pass"}`}>
                      {exceeds ? "Melebihi batas" : "Dalam batas"}
                    </span>
                  </div>
                  <p className="mt-3 font-display text-[28px] font-bold leading-none">{fmtNum(m.value, m.digits)}{m.unit}</p>
                  <p className="mt-2 text-[12.5px] text-ink-3">Batas ≤ {fmtNum(m.limit, m.digits)}{m.unit}</p>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-sunken" role="meter" aria-label={m.label} aria-valuemin={0} aria-valuemax={Math.max(m.limit, m.value, 1)} aria-valuenow={m.value}>
                    <div className={`h-full rounded-full ${exceeds ? "bg-fail" : "bg-pass"}`} style={{ width: `${ratio}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <Panel
        title="Hasil per langkah analisis"
        description={
          r.sumberDayaPembatas ? `Sumber daya pembatas: ${LIMITING_LABEL[r.sumberDayaPembatas]}` : stopped ? "Indikator tidak dihitung karena analisis dihentikan" : undefined
        }
      >
        {showRunway && r.kapasitas && (
          <div className="mb-5">
            <CapacityRunway steps={r.langkah} maxTps={r.kapasitas.kapasitasMaksTps} />
          </div>
        )}
        <IndicatorTable steps={r.langkah} criteria={r.kriteria} useLabels={!showRunway} />
      </Panel>

      {r.langkah.some((l) => l.deretWaktu?.length) && (
        <Panel title="Trajektori sumber daya" description="Deret waktu dari digital twin berbasis simulasi kejadian diskret (SimPy)">
          <LazyTrajectoryChart steps={r.langkah} />
        </Panel>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {r.kapasitas && (
          <Panel title="Capacity planning" description="Little's Law: L = λ × W">
            <KeyValue
              items={[
                ["Kapasitas maksimum", `${fmtNum(r.kapasitas.kapasitasMaksTps)} TPS (pembatas ${LIMITING_LABEL[r.kapasitas.pembatas]})`],
                ["Beban puncak (λ)", `${fmtNum(r.kapasitas.littlesLaw.lambdaTps)} TPS`],
                ["Waktu tinggal (W)", `${fmtNum(r.kapasitas.littlesLaw.wDetik * 1000, 0)} ms`],
                ["Request bersamaan (L)", `${fmtNum(r.kapasitas.littlesLaw.lRequest)}`],
                ["Thread per node", `${r.kapasitas.littlesLaw.threadTersediaPerNode} tersedia, ${r.kapasitas.littlesLaw.threadDisarankanPerNode} disarankan (L per node + 30%)`],
              ]}
            />
            <table className="mt-4 w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-line text-left text-ink-3">
                  <th className="py-1.5 pr-3 font-medium">Sumber daya</th>
                  <th className="py-1.5 text-right font-medium">Kapasitas</th>
                </tr>
              </thead>
              <tbody>
                {r.kapasitas.perSumberDaya.map((x) => (
                  <tr key={x.sumber} className="border-b border-line last:border-0">
                    <td className="py-1.5 pr-3">
                      {LIMITING_LABEL[x.sumber]}
                      <span className="block text-[12px] text-ink-3">{x.rumus}</span>
                    </td>
                    <td className={x.sumber === r.kapasitas!.pembatas ? "py-1.5 text-right font-semibold" : "py-1.5 text-right"}>{fmtNum(x.kapasitasTps)} TPS</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        )}
        <Panel title="Baseline vs kondisi simulasi">
          <BaselineVsSim r={r} />
        </Panel>
      </div>

      <Panel title="Rencana uji" description="Test plan untuk memverifikasi hasil simulasi di environment Dev" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[14px]">
            <thead>
              <tr className="border-b border-line text-left text-[13px] text-ink-3">
                <th className="px-5 py-2.5 font-medium">Tahap</th>
                <th className="px-3 py-2.5 font-medium">Profil beban</th>
                <th className="px-3 py-2.5 font-medium">Durasi</th>
                <th className="px-5 py-2.5 font-medium">Kriteria lulus</th>
              </tr>
            </thead>
            <tbody>
              {r.rencanaUji.map((u) => (
                <tr key={u.urutan} className="border-b border-line align-top last:border-0">
                  <td className="px-5 py-2.5">
                    <span className="font-medium">
                      {u.urutan}. {u.nama}
                    </span>
                    <span className="block text-[12.5px] text-ink-3">{u.alasan}</span>
                  </td>
                  <td className="px-3 py-2.5 text-ink-2">{u.profilBeban}</td>
                  <td className="px-3 py-2.5 text-ink-2">{u.durasiMenit} menit</td>
                  <td className="px-5 py-2.5 text-ink-2">{u.kriteriaLulus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Kalibrasi, data, dan biaya">
        <KeyValue
          items={[
            ["Model digital twin", r.modelDigitalTwin?.statusAktif ? `${r.modelDigitalTwin.versiModel}, dikalibrasi ${fmtDate(r.modelDigitalTwin.tanggalKalibrasi ?? undefined)}` : "Tidak aktif"],
            [
              "Kalibrasi profil",
              r.kalibrasi
                ? `Dari ${r.kalibrasi.sumber}: CPU ${fmtNum(r.kalibrasi.cpuMsPerRequest)} ms/request, tunggu database ${fmtNum(r.kalibrasi.tungguDatabaseMs)} ms, dependensi eksternal ${fmtNum(r.kalibrasi.tungguEksternalMs)} ms. p95 simulasi ${r.kalibrasi.p95SimulasiMs} ms vs acuan ${r.kalibrasi.acuanP95Ms} ms (galat ${r.kalibrasi.galatPersen}%).`
                : "Tidak dijalankan",
            ],
            ["Penyamaran", `${r.penyamaran.jumlah} item (${r.penyamaran.jenis.join(", ") || "–"})`],
            ["Pengiriman ke Layanan LLM", r.modeAnalisis === "demo" ? "Tidak ada (mode demo)" : `${r.jejak.jumlahPengirimanKeLLM} kali, ${fmtNum(r.jejak.biaya.tokenMasuk + r.jejak.biaya.tokenKeluar, 0)} token`],
            ["Estimasi biaya permintaan", r.modeAnalisis === "demo" ? "Rp0" : `${fmtIdr(r.jejak.biaya.idr)} (US$${r.jejak.biaya.usd.toFixed(4)})`],
            ["Waktu proses Core Module", `${fmtNum(r.jejak.durasiProsesMs / 1000)} detik`],
          ]}
        />
      </Panel>

      <details className="group rounded-xl border border-line bg-surface">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
          <span>
            <span className="text-[17px] font-semibold">Jejak keputusan agen</span>
            <span className="block text-[13.5px] text-ink-3">
              Rencana dan langkah, jalur penjurusan, skor keyakinan, dan kesepakatan sampel. Versi prompt {r.jejak.versiPrompt}.
            </span>
          </span>
          <span className="text-[13.5px] text-accent group-open:hidden">Tampilkan</span>
          <span className="hidden text-[13.5px] text-accent group-open:inline">Sembunyikan</span>
        </summary>
        <div className="border-t border-line px-5 py-3">
          <p className="mb-2 text-[13.5px] text-ink-2">
            <span className="font-medium text-ink">Tujuan rencana:</span> {r.rencana.ringkasanTujuan}
          </p>
          <TraceList trace={r.jejak.langkah} />
        </div>
      </details>
    </div>
  );
}
