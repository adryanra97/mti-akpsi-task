"use server";

/**
 * Server action UC-04 Terbitkan Dokumen Sign-Off (state machine Gambar 10.19).
 */
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { audit, requirePermission } from "@/lib/auth";
import { put } from "@/lib/db";
import { getSignoff } from "@/lib/data";
import { reportFromSignoff, transition } from "@/lib/domain";

export interface SoState {
  error?: string;
  errors?: Record<string, string>;
  values?: Record<string, string>;
}

/**
 * Mencatat keputusan Project/Technical Manager: Menunggu Keputusan -> Disetujui atau Ditolak.
 *
 * Dokumen dikunci dengan nomor versi dan tanda waktu, lalu laporan sign-off disimpan.
 *
 * Parameters
 * ----------
 * id : string
 *     Identitas dokumen (diikat dengan bind).
 * _ : SoState
 *     State sebelumnya (tidak dipakai).
 * f : FormData
 *     decision ("Disetujui" atau "Ditolak") dan notes (wajib bila ditolak).
 *
 * Returns
 * -------
 * Promise<SoState>
 *     Galat validasi; bila berhasil, dialihkan ke halaman dokumen.
 */
export async function decideSignoff(id: string, _: SoState, f: FormData): Promise<SoState> {
  const user = await requirePermission("signoff.decide");
  const doc = await getSignoff(id);
  if (!doc) return { error: "Dokumen tidak ditemukan." };
  if (doc.status !== "MenungguKeputusan") return { error: "Dokumen ini sudah diputuskan dan terkunci." };
  const decision = String(f.get("decision") ?? "");
  const notes = String(f.get("notes") ?? "").trim();
  const errors: Record<string, string> = {};
  if (decision !== "Disetujui" && decision !== "Ditolak") errors.decision = "Pilih keputusan sign-off.";
  if (decision === "Ditolak" && !notes) errors.notes = "Tulis alasan penolakan agar tim tahu apa yang perlu diperbaiki.";
  if (Object.keys(errors).length) return { errors, values: { decision, notes } };

  const now = new Date().toISOString();
  // catatKeputusan [setuju] / kunci(): Menunggu Keputusan -> Disetujui; [tolak] / tolak(): -> Ditolak.
  transition(doc, decision as "Disetujui" | "Ditolak", user.name, decision === "Disetujui" ? "Dokumen dikunci dengan nomor versi dan tanda waktu" : `Ditolak: ${notes}`, now);
  doc.pmNotes = notes;
  doc.decidedBy = user.name;
  doc.decidedAt = now;
  doc.lockedAt = now;
  doc.reportId = `rpt-${doc.id}`;
  await put("sa_signoffs", doc);
  await put("sa_reports", reportFromSignoff(doc));
  await audit(user, decision === "Disetujui" ? "Menyetujui sign-off" : "Menolak sign-off", doc.code, notes);
  revalidatePath("/", "layout");
  redirect(`/signoff/${doc.id}?keputusan=1`);
}
