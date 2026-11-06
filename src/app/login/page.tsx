import type { Metadata } from "next";
import { LoginForm } from "./login-form";
import { authConfigProblems } from "@/lib/auth-config";
import { DepartureBoard, type BoardRow } from "@/components/board";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Masuk" };

// Halaman ini publik, jadi papan memakai contoh ilustratif, bukan data asli.
const SAMPLE: BoardRow[] = [
  { key: "a", date: "Sen", time: "09.00", release: "Rilis QRIS", service: "Layanan Pembayaran", cycle: 3, gate: "Dev → Production", status: "Lolos", tone: "pass" },
  { key: "b", date: "Sen", time: "13.30", release: "Rilis Notifikasi", service: "Layanan Notifikasi", cycle: 5, gate: "Dev → Production", status: "Bersyarat", tone: "cond" },
  { key: "c", date: "Sel", time: "10.00", release: "Rilis Mutasi", service: "Layanan Rekening", cycle: 2, gate: "Dev → Production", status: "Tidak lolos", tone: "fail" },
  { key: "d", date: "Sel", time: "15.00", release: "Rilis Deteksi Fraud", service: "Layanan Deteksi Fraud", cycle: 1, gate: "Dev → Production", status: "Menunggu", tone: "wait" },
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="flex min-h-dvh flex-col bg-bg lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(420px,1fr)]">
      {/* Formulir tampil lebih dulu di ponsel; di layar lebar menempel di kanan dan selalu terlihat utuh. */}
      <section className="order-1 flex flex-col px-4 lg:order-2 py-6 sm:px-8 lg:sticky lg:top-0 lg:h-dvh lg:justify-center lg:overflow-y-auto lg:py-8" aria-label="Formulir masuk">
        <div className="mb-6 flex items-center gap-2.5 lg:hidden">
          <img src="/icon.svg" alt="" width={28} height={28} />
          <span className="font-wide text-[17px] font-bold tracking-tight">ServerAgent</span>
        </div>
        <div className="mx-auto w-full max-w-[420px]">
          <LoginForm next={next ?? "/"} configProblems={authConfigProblems()} />
        </div>
      </section>

      <section className="order-2 relative overflow-hidden bg-board lg:order-1 px-5 py-8 text-board-ink sm:px-10 lg:min-h-dvh lg:px-12 lg:py-10" aria-labelledby="hero-title">
        <div className="hidden items-center gap-2.5 lg:flex">
          <img src="/icon.svg" alt="" width={30} height={30} />
          <span className="font-wide text-[18px] font-bold tracking-tight">ServerAgent</span>
        </div>

        <h1 id="hero-title" className="font-wide max-w-[17ch] text-[30px] leading-[1.05] text-white sm:text-[40px] lg:mt-12 lg:text-[48px]">
          Lolos ke Production, atau kembali ke Dev.
        </h1>
        <p className="mt-4 max-w-[54ch] text-[15px] leading-relaxed text-board-ink-2">
          Setiap akhir sprint cycle, ServerAgent mensimulasikan release candidate pada topologi Production dan memberi verdict untuk alignment meeting.
          Ia juga mereproduksi insiden dan menguji mitigasinya tanpa menyentuh Production.
        </p>

        <div className="mt-8 hidden md:block">
          <div className="mb-2 flex items-baseline justify-between gap-4">
            <p className="font-narrow text-[15px] font-semibold tracking-wide text-amber">Papan promosi: Dev ke Production</p>
            <p className="text-[12.5px] text-board-ink-2">Contoh tampilan</p>
          </div>
          <DepartureBoard rows={SAMPLE} caption="Contoh papan promosi release candidate" />
        </div>

        <dl className="mt-8 grid max-w-xl grid-cols-2 gap-x-6 gap-y-3 text-[13.5px] sm:grid-cols-4">
          {[
            ["Lolos", "Memenuhi kriteria"],
            ["Bersyarat", "Ada syarat verifikasi"],
            ["Tidak lolos", "Melanggar kriteria"],
            ["Tidak dapat dinilai", "Di luar kalibrasi"],
          ].map(([k, v]) => (
            <div key={k} className="border-t border-board-line pt-2">
              <dt className="font-semibold">{k}</dt>
              <dd className="text-board-ink-2">{v}</dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}
