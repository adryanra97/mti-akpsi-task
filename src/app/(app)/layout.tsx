import { Database } from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import { requireUser } from "@/lib/auth";
import { navBadges } from "@/lib/data";
import { dbKind } from "@/lib/db";
import { getSettings, PROVIDER_LABEL } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [badges, kind, settings] = await Promise.all([navBadges(user.role), dbKind(), getSettings()]);
  const mode =
    settings.mode === "demo"
      ? "Demo (digital twin bawaan)"
      : `LLM: ${PROVIDER_LABEL[settings.provider].split(" ")[0]} ${settings.models[settings.provider]}`;

  return (
    <div className="min-h-dvh">
      <Sidebar user={user} badges={badges} mode={mode} />
      <div className="overflow-x-clip lg:pl-[248px]">
        {kind === "memory" && (
          <div className="no-print flex items-start gap-2 border-b border-cond/30 bg-cond-soft px-4 py-2 text-[13.5px] sm:px-8">
            <Database className="mt-0.5 h-4 w-4 shrink-0 text-cond" aria-hidden />
            <p>
              <span className="font-medium">Database belum tersambung.</span>{" "}
              <span className="text-ink-2">
                Data disimpan sementara di memori dan bisa hilang. Tambahkan Neon Postgres di tab Storage Vercel agar tersimpan permanen.
              </span>
            </p>
          </div>
        )}
        <main className="mx-auto max-w-[1180px] px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
