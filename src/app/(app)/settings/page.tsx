/**
 * Halaman Pengaturan (khusus Technical Lead): mode analisis, model digital twin, status database, dan log audit.
 */
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { listAudit } from "@/lib/data";
import { dbKind } from "@/lib/db";
import { getSettings, MODEL_SUGGESTIONS, PROVIDER_LABEL, providerKeyConfigured } from "@/lib/settings";
import { KeyValue, PageHeader, Panel, Tag } from "@/components/ui";
import { ResetData, SettingsForm } from "./settings-form";
import { fmtDate } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/roles";
import { SERVICES, effectiveModel } from "@/lib/services";
import { ModelCalibration } from "./model-calibration";

export const metadata: Metadata = { title: "Pengaturan" };

/**
 * Halaman Pengaturan.
 *
 * Returns
 * -------
 * Promise<JSX.Element>
 */
export default async function SettingsPage() {
  await requireUser();
  const [settings, kind, auditLog] = await Promise.all([getSettings(), dbKind(), listAudit()]);
  const keys = { anthropic: providerKeyConfigured("anthropic"), openai: providerKeyConfigured("openai"), gemini: providerKeyConfigured("gemini") };

  return (
    <>
      <PageHeader title="Pengaturan" description="Mode analisis Core Module, penyedia LLM, dan data aplikasi. Hanya Technical Lead yang dapat mengubahnya." />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px] xl:items-start">
        <SettingsForm settings={settings} keys={keys} labels={PROVIDER_LABEL} suggestions={MODEL_SUGGESTIONS} />
        <div className="grid gap-6">
          <Panel title="Database">
            <KeyValue
              items={[
                ["Status", kind === "postgres" ? <Tag key="p" tone="pass">Postgres tersambung</Tag> : <Tag key="m" tone="warn">Sementara di memori</Tag>],
                ["Penyimpanan", kind === "postgres" ? "Data tersimpan permanen." : "Sambungkan Neon di tab Storage Vercel agar data tidak hilang saat server dimulai ulang."],
              ]}
            />
            <div className="mt-4 border-t border-line pt-4">
              <ResetData />
            </div>
          </Panel>
        </div>
      </div>

      <Panel
        id="model-digital-twin"
        className="mt-6 scroll-mt-6"
        title="Model digital twin"
        description="Versi, tanggal kalibrasi, dan rentang TPS terkalibrasi per layanan. Beban di luar rentang berstatus Tidak Dapat Dinilai."
        bodyClassName="p-0"
      >
        <ModelCalibration
          rows={SERVICES.map((sv) => ({ service: sv.nama, model: effectiveModel(sv.nama, settings.twinOverrides)!, recalibrated: Boolean(settings.twinOverrides?.[sv.nama]) }))}
        />
      </Panel>

      <Panel id="audit" className="mt-6 scroll-mt-6" title="Log audit" description="50 aktivitas terakhir" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[14px]">
            <thead>
              <tr className="border-b border-line text-left text-[13px] text-ink-3">
                <th className="px-5 py-2.5 font-medium">Waktu</th>
                <th className="px-3 py-2.5 font-medium">Pengguna</th>
                <th className="px-3 py-2.5 font-medium">Aktivitas</th>
                <th className="px-5 py-2.5 font-medium">Objek</th>
              </tr>
            </thead>
            <tbody>
              {auditLog.slice(0, 50).map((a) => (
                <tr key={a.id} className="border-b border-line last:border-0">
                  <td className="whitespace-nowrap px-5 py-2.5 text-ink-2">{fmtDate(a.createdAt, true)}</td>
                  <td className="px-3 py-2.5">
                    {a.user}
                    <span className="block text-[12.5px] text-ink-3">{ROLE_LABEL[a.role]}</span>
                  </td>
                  <td className="px-3 py-2.5 text-ink-2">{a.action}</td>
                  <td className="px-5 py-2.5 text-ink-2">
                    {a.target}
                    {a.detail && <span className="block text-[12.5px] text-ink-3">{a.detail}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
