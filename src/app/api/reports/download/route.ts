/**
 * API unduhan laporan (PDF per laporan dan CSV riwayat) dengan pemeriksaan hak akses dan log audit.
 */
import { NextResponse } from "next/server";
import { audit, currentUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import { get } from "@/lib/db";
import { getIncident, getSession, getSignoff, listReports } from "@/lib/data";
import { applyFilter, filterFromParams } from "@/lib/reports";
import { alignmentPdf, incidentPdf, reportsCsv, signoffPdf } from "@/lib/pdf";
import type { ReportEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Mengunduh satu laporan sebagai PDF/CSV, atau seluruh riwayat terfilter sebagai CSV.
 *
 * Parameters
 * ----------
 * req : Request
 *     Query: format ("pdf" atau "csv"), id (opsional), dan filter laporan.
 *
 * Returns
 * -------
 * Promise<NextResponse>
 *     Berkas dengan Content-Disposition attachment; 401 atau 403 bila tidak berhak.
 */
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sesi berakhir. Masuk kembali." }, { status: 401 });
  // Periksa hak akses sebelum berkas dihasilkan, karena berkas adalah titik data keluar dari sistem.
  if (!can(user.role, "reports.download")) {
    return NextResponse.json({ error: "Peran Anda tidak memiliki hak mengunduh laporan." }, { status: 403 });
  }
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const format = url.searchParams.get("format") === "csv" ? "csv" : "pdf";
  const stamp = new Date().toISOString().slice(0, 10);

  if (!id) {
    const sp = Object.fromEntries(url.searchParams.entries());
    const rows = applyFilter(await listReports(), filterFromParams(sp)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    await audit(user, "Unduh data riwayat (CSV)", `${rows.length} laporan`);
    return new Response(reportsCsv(rows), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="serveragent-riwayat-${stamp}.csv"`,
      },
    });
  }

  const rep = await get<ReportEntry>("sa_reports", id);
  if (!rep) return NextResponse.json({ error: "Laporan tidak ditemukan." }, { status: 404 });
  const base = rep.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

  if (format === "csv") {
    await audit(user, "Unduh laporan (CSV)", rep.title);
    return new Response(reportsCsv([rep]), {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${base}.csv"` },
    });
  }

  let buf: ArrayBuffer | null = null;
  if (rep.kind === "alignment") {
    const s = await getSession(rep.refId);
    if (s?.runs.length) buf = alignmentPdf(s, rep);
  } else if (rep.kind === "signoff") {
    const d = await getSignoff(rep.refId);
    if (d) buf = signoffPdf(d, rep);
  } else {
    const i = await getIncident(rep.refId);
    if (i) buf = incidentPdf(i, rep);
  }
  if (!buf) return NextResponse.json({ error: "Data sumber laporan tidak ditemukan." }, { status: 404 });
  await audit(user, "Unduh laporan (PDF)", rep.title, rep.restricted ? "Terbatas NDA: data agregat" : undefined);
  return new Response(buf, {
    headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${base}.pdf"` },
  });
}
