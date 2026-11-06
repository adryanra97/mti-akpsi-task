import "server-only";
/**
 * Akses data tingkat aplikasi: daftar dan detail objek, tugas per peran, dan lencana navigasi.
 */
import { all, get, put } from "./db";
import { transition } from "./domain";
import type { AlignmentSession, AuditEntry, Incident, ReportEntry, Role, SignoffDoc } from "./types";

/**
 * Membuka sesi terjadwal bila jadwalnya sudah tiba (Gambar 10.16).
 *
 * Event bukaSesi(): Terjadwal -> Pengisian Parameter.
 *
 * Parameters
 * ----------
 * s : AlignmentSession
 *     Sesi alignment; disimpan ulang bila statusnya berubah.
 *
 * Returns
 * -------
 * Promise<AlignmentSession>
 *     Sesi dengan status terbaru.
 */
async function openIfDue(s: AlignmentSession): Promise<AlignmentSession> {
  if (s.status === "Terjadwal" && new Date(s.scheduledAt).getTime() <= Date.now()) {
    transition(s, "PengisianParameter", "Sistem", "Jadwal akhir sprint cycle tiba");
    await put("sa_sessions", s);
  }
  return s;
}

/**
 * Seluruh sesi alignment, dengan sesi terjadwal yang jatuh tempo dibuka otomatis.
 *
 * Returns
 * -------
 * Promise<AlignmentSession[]>
 */
export const listSessions = async () => Promise.all((await all<AlignmentSession>("sa_sessions")).map(openIfDue));
/**
 * Satu sesi alignment, dibuka otomatis bila jadwalnya sudah tiba.
 *
 * Parameters
 * ----------
 * id : string
 *     Identitas sesi.
 *
 * Returns
 * -------
 * Promise<AlignmentSession | null>
 */
export const getSession = async (id: string) => {
  const s = await get<AlignmentSession>("sa_sessions", id);
  return s ? openIfDue(s) : null;
};
/**
 * Seluruh kasus insiden.
 *
 * Returns
 * -------
 * Promise<Incident[]>
 */
export const listIncidents = () => all<Incident>("sa_incidents");
/**
 * Satu kasus insiden.
 *
 * Parameters
 * ----------
 * id : string
 *     Identitas insiden.
 *
 * Returns
 * -------
 * Promise<Incident | null>
 */
export const getIncident = (id: string) => get<Incident>("sa_incidents", id);
/**
 * Seluruh dokumen sign-off.
 *
 * Returns
 * -------
 * Promise<SignoffDoc[]>
 */
export const listSignoffs = () => all<SignoffDoc>("sa_signoffs");
/**
 * Satu dokumen sign-off.
 *
 * Parameters
 * ----------
 * id : string
 *     Identitas dokumen.
 *
 * Returns
 * -------
 * Promise<SignoffDoc | null>
 */
export const getSignoff = (id: string) => get<SignoffDoc>("sa_signoffs", id);
/**
 * Seluruh entri riwayat laporan.
 *
 * Returns
 * -------
 * Promise<ReportEntry[]>
 */
export const listReports = () => all<ReportEntry>("sa_reports");
/**
 * Seluruh entri log audit, terbaru lebih dulu.
 *
 * Returns
 * -------
 * Promise<AuditEntry[]>
 */
export const listAudit = () => all<AuditEntry>("sa_audit");

/**
 * Mengurutkan sesi dari jadwal terbaru.
 *
 * Parameters
 * ----------
 * s : AlignmentSession[]
 *     Daftar sesi; tidak diubah.
 *
 * Returns
 * -------
 * AlignmentSession[]
 *     Salinan yang sudah diurutkan.
 */
export function sortSessions(s: AlignmentSession[]) {
  return [...s].sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));
}

export interface Todo {
  href: string;
  title: string;
  detail: string;
  kind: "alignment" | "signoff" | "incident";
}

/**
 * Daftar tugas yang menunggu sebuah peran.
 *
 * Parameters
 * ----------
 * role : Role
 *     Peran pengguna.
 *
 * Returns
 * -------
 * Promise<Todo[]>
 *     QA dan TL: sesi yang perlu parameter atau pengajuan analisis. TL: sesi yang perlu
 *     keputusan dan insiden yang perlu eskalasi. PM: sign-off yang menunggu keputusan.
 *     IE: insiden yang belum terdokumentasi.
 */
export async function todosFor(role: Role): Promise<Todo[]> {
  const [sessions, signoffs, incidents] = await Promise.all([listSessions(), listSignoffs(), listIncidents()]);
  const out: Todo[] = [];
  if (role === "QA" || role === "TL") {
    for (const s of sessions.filter((x) => x.status === "PengisianParameter"))
      out.push({
        href: `/alignment/${s.id}`,
        kind: "alignment",
        title: s.params ? `Ajukan analisis ${s.release} cycle ${s.cycleNo}` : `Isi parameter ${s.release} cycle ${s.cycleNo}`,
        detail: s.service,
      });
  }
  if (role === "TL") {
    for (const s of sessions.filter((x) => x.status === "Peninjauan"))
      out.push({ href: `/alignment/${s.id}`, kind: "alignment", title: `Tetapkan keputusan ${s.release} cycle ${s.cycleNo}`, detail: s.service });
    for (const i of incidents.filter((x) => x.status === "PerluEskalasi" || (x.needsEscalation && x.status !== "Terdokumentasi")))
      out.push({ href: `/incidents/${i.id}`, kind: "incident", title: `Eskalasi ${i.code}: tidak ada mitigasi yang lolos`, detail: i.data.service });
  }
  if (role === "PM") {
    for (const d of signoffs.filter((x) => x.status === "MenungguKeputusan"))
      out.push({ href: `/signoff/${d.id}`, kind: "signoff", title: `Tinjau sign-off ${d.snapshot.release} cycle ${d.snapshot.cycleNo}`, detail: d.snapshot.service });
  }
  if (role === "IE") {
    for (const i of incidents.filter((x) => x.status !== "Terdokumentasi"))
      out.push({ href: `/incidents/${i.id}`, kind: "incident", title: `Tangani ${i.code}: ${i.data.title}`, detail: i.data.service });
  }
  return out;
}

/**
 * Jumlah tugas per bagian untuk lencana di navigasi.
 *
 * Parameters
 * ----------
 * role : Role
 *     Peran pengguna.
 *
 * Returns
 * -------
 * Promise<{ alignment: number; signoff: number; incidents: number }>
 */
export async function navBadges(role: Role) {
  const todos = await todosFor(role);
  return {
    alignment: todos.filter((t) => t.kind === "alignment").length,
    signoff: todos.filter((t) => t.kind === "signoff").length,
    incidents: todos.filter((t) => t.kind === "incident").length,
  };
}
