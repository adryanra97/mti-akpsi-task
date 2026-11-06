import type { Metadata } from "next";
import Link from "next/link";
import { listSignoffs } from "@/lib/data";
import { EmptyState, PageHeader, Tag } from "@/components/ui";
import { VerdictBadge } from "@/components/verdict";
import { fmtDate } from "@/lib/format";
import type { SignoffDoc } from "@/lib/types";
import { SIGNOFF_STATUS_LABEL } from "@/lib/verdict";

export const metadata: Metadata = { title: "Sign-off" };

const TONE = { Draf: "neutral", MenungguKeputusan: "warn", Disetujui: "pass", Ditolak: "fail" } as const;

function Row({ d }: { d: SignoffDoc }) {
  return (
    <li className="border-b border-line last:border-0">
      <Link href={`/signoff/${d.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 hover:bg-surface-2">
        <span className="min-w-0 flex-1">
          <span className="block font-medium">
            {d.code}: {d.snapshot.release} cycle {d.snapshot.cycleNo}, versi {d.version}
          </span>
          <span className="block text-[13.5px] text-ink-3">
            {d.snapshot.service}, {d.snapshot.releaseCandidate}. Diminta {fmtDate(d.createdAt, true)} oleh {d.requestedBy}
          </span>
        </span>
        <VerdictBadge verdict={d.snapshot.result.verdict.status} size="sm" />
        <Tag tone={TONE[d.status]}>{SIGNOFF_STATUS_LABEL[d.status]}</Tag>
      </Link>
    </li>
  );
}

export default async function SignoffList() {
  const docs = (await listSignoffs()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const pending = docs.filter((d) => d.status === "MenungguKeputusan" || d.status === "Draf");
  const done = docs.filter((d) => d.status === "Disetujui" || d.status === "Ditolak");
  return (
    <>
      <PageHeader
        title="Sign-off"
        description="Dokumen sign-off disusun otomatis dari laporan alignment yang memutuskan lanjut promosi. Dokumen ini melengkapi hasil SIT/UAT dan mekanisme release approval yang berlaku."
      />
      <div className="grid gap-6">
        <section className="rounded-xl border border-line bg-surface">
          <h2 className="border-b border-line px-5 py-3.5 text-[17px] font-semibold">Menunggu keputusan</h2>
          {pending.length ? (
            <ul>{pending.map((d) => <Row key={d.id} d={d} />)}</ul>
          ) : (
            <div className="p-5">
              <EmptyState title="Tidak ada dokumen yang menunggu">Permintaan baru muncul saat Technical Lead memutuskan lanjut promosi.</EmptyState>
            </div>
          )}
        </section>
        <section className="rounded-xl border border-line bg-surface">
          <h2 className="border-b border-line px-5 py-3.5 text-[17px] font-semibold">Sudah diputuskan</h2>
          {done.length ? <ul>{done.map((d) => <Row key={d.id} d={d} />)}</ul> : <p className="px-5 py-4 text-[14px] text-ink-3">Belum ada.</p>}
        </section>
      </div>
    </>
  );
}
