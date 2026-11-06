import type { Metadata } from "next";
import { LoginForm } from "./login-form";
import { authConfigProblems } from "@/lib/auth-config";
import { DepartureBoard, type BoardRow } from "@/components/board";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Masuk" };

// Halaman ini publik, jadi papan memakai contoh ilustratif, bukan data asli.
const SAMPLE: BoardRow[] = [
  { key: "a", date: "Sen", time: "09.00", release: "R4.1", service: "Layanan pembayaran", cycle: 3, gate: "Dev → Production", status: "Lolos", tone: "pass" },
  { key: "b", date: "Sen", time: "13.30", release: "R2.6", service: "Layanan notifikasi", cycle: 5, gate: "Dev → Production", status: "Bersyarat", tone: "cond" },
  { key: "c", date: "Sel", time: "10.00", release: "R3.2", service: "Layanan akun", cycle: 2, gate: "Dev → Production", status: "Tidak lolos", tone: "fail" },
  { key: "d", date: "Sel", time: "15.00", release: "R1.1", service: "Layanan skoring", cycle: 1, gate: "Dev → Production", status: "Menunggu", tone: "wait" },
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="grid min-h-dvh bg-bg lg:grid-cols-[1.15fr_1fr]">
      <section className="relative overflow-hidden bg-board px-5 py-8 text-board-ink sm:px-10 lg:px-14 lg:py-12" aria-labelledby="hero-title">
        <div className="flex items-center gap-2.5">
          <img src="/icon.svg" alt="" width={30} height={30} />
          <span className="font-wide text-[18px] font-bold tracking-tight">ServerAgent</span>
        </div>

        <h1 id="hero-title" className="font-wide mt-10 max-w-[15ch] text-[40px] leading-[1.02] text-white sm:text-[56px] lg:mt-16 lg:text-[64px]">
          Lolos ke Production, atau kembali ke Dev.
        </h1>
        <p className="mt-5 max-w-[52ch] text-[16px] leading-relaxed text-board-ink-2">
          Setiap akhir sprint cycle, ServerAgent mensimulasikan release candidate pada topologi Production dan memberi verdict yang
          dibahas di alignment meeting. Ia juga mereproduksi insiden dan menguji mitigasinya tanpa menyentuh Production.
        </p>

        <div className="mt-10 hidden sm:block">
          <div className="mb-2 flex items-baseline justify-between gap-4">
            <p className="font-narrow text-[15px] font-semibold tracking-wide text-amber">Papan promosi: Dev ke Production</p>
            <p className="text-[12.5px] text-board-ink-2">Contoh tampilan. Data asli tersedia setelah masuk.</p>
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

      <section className="flex items-start justify-center px-4 py-8 sm:px-8 lg:items-center lg:py-12" aria-label="Formulir masuk">
        <div className="w-full max-w-[460px]">
          <LoginForm next={next ?? "/"} configProblems={authConfigProblems()} />
        </div>
      </section>
    </main>
  );
}
