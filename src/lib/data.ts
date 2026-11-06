import "server-only";
import { all, get, put } from "./db";
import { transition } from "./domain";
import type { AlignmentSession, AuditEntry, Incident, ReportEntry, Role, SignoffDoc } from "./types";

/** bukaSesi() [jadwal akhir sprint cycle tiba]: Terjadwal -> Pengisian Parameter (Gambar 10.16). */
async function openIfDue(s: AlignmentSession): Promise<AlignmentSession> {
  if (s.status === "Terjadwal" && new Date(s.scheduledAt).getTime() <= Date.now()) {
    transition(s, "PengisianParameter", "Sistem", "Jadwal akhir sprint cycle tiba");
    await put("sa_sessions", s);
  }
  return s;
}

export const listSessions = async () => Promise.all((await all<AlignmentSession>("sa_sessions")).map(openIfDue));
export const getSession = async (id: string) => {
  const s = await get<AlignmentSession>("sa_sessions", id);
  return s ? openIfDue(s) : null;
};
export const listIncidents = () => all<Incident>("sa_incidents");
export const getIncident = (id: string) => get<Incident>("sa_incidents", id);
export const listSignoffs = () => all<SignoffDoc>("sa_signoffs");
export const getSignoff = (id: string) => get<SignoffDoc>("sa_signoffs", id);
export const listReports = () => all<ReportEntry>("sa_reports");
export const listAudit = () => all<AuditEntry>("sa_audit");

export function sortSessions(s: AlignmentSession[]) {
  return [...s].sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));
}

export interface Todo {
  href: string;
  title: string;
  detail: string;
  kind: "alignment" | "signoff" | "incident";
}

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

export async function navBadges(role: Role) {
  const todos = await todosFor(role);
  return {
    alignment: todos.filter((t) => t.kind === "alignment").length,
    signoff: todos.filter((t) => t.kind === "signoff").length,
    incidents: todos.filter((t) => t.kind === "incident").length,
  };
}
