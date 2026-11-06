import type { Metadata } from "next";
import { LoginForm } from "./login-form";
import { authConfigProblems } from "@/lib/auth-config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Masuk" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="min-h-dvh bg-bg">
      <div className="mx-auto grid min-h-dvh max-w-6xl gap-10 px-4 py-10 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-16">
        <div>
          <div className="flex items-center gap-2.5">
            <img src="/icon.svg" alt="" width={32} height={32} />
            <span className="font-display text-[19px] font-semibold">ServerAgent</span>
          </div>
          <h1 className="mt-10 max-w-xl text-[34px] font-semibold leading-[1.1] sm:text-[44px]">
            Tahu hasilnya di Production sebelum rilis sampai ke sana.
          </h1>
          <p className="mt-4 max-w-lg text-[16px] text-ink-2">
            ServerAgent mensimulasikan release candidate pada topologi Production, lalu memberi verdict yang dibahas di
            alignment meeting setiap sprint cycle. Ia juga dipakai untuk mereproduksi insiden dan menguji mitigasinya.
          </p>
          <ol className="mt-8 grid max-w-lg gap-px overflow-hidden rounded-xl border border-line bg-line text-[14px] sm:grid-cols-4">
            {[
              ["Lolos", "pass"],
              ["Lolos Bersyarat", "cond"],
              ["Tidak Lolos", "fail"],
              ["Tidak Dapat Dinilai", "na"],
            ].map(([label, tone]) => (
              <li key={label} className="flex items-center gap-2 bg-surface px-3 py-2.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: `var(--${tone})` }} aria-hidden />
                <span className="text-ink-2">{label}</span>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-[13px] text-ink-3">Empat kemungkinan verdict dari Core Module.</p>
        </div>

        <LoginForm next={next ?? "/"} configProblems={authConfigProblems()} />
      </div>
    </main>
  );
}
