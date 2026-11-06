import "server-only";
import { all, get } from "./db";
import type { AlignmentSession, AuditEntry, Incident, ReportEntry, Role, SignoffDoc } from "./types";

export const listSessions = () => all<AlignmentSession>("sa_sessions");
export const getSession = (id: string) => get<AlignmentSession>("sa_sessions", id);
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
    for (const s of sessions.filter((x) => x.status === "menunggu_parameter"))
      out.push({ href: `/alignment/${s.id}`, kind: "alignment", title: `Isi parameter ${s.release} cycle ${s.cycleNo}`, detail: s.service });
    for (const s of sessions.filter((x) => x.status === "siap_dianalisis"))
      out.push({ href: `/alignment/${s.id}`, kind: "alignment", title: `Jalankan analisis ${s.release} cycle ${s.cycleNo}`, detail: s.service });
  }
  if (role === "TL") {
    for (const s of sessions.filter((x) => x.status === "dianalisis"))
      out.push({ href: `/alignment/${s.id}`, kind: "alignment", title: `Tetapkan keputusan ${s.release} cycle ${s.cycleNo}`, detail: s.service });
    for (const i of incidents.filter((x) => x.needsEscalation && x.status !== "selesai"))
      out.push({ href: `/incidents/${i.id}`, kind: "incident", title: `Eskalasi ${i.code}: tidak ada mitigasi yang lolos`, detail: i.data.service });
  }
  if (role === "PM") {
    for (const d of signoffs.filter((x) => x.status === "menunggu"))
      out.push({ href: `/signoff/${d.id}`, kind: "signoff", title: `Tinjau sign-off ${d.snapshot.release} cycle ${d.snapshot.cycleNo}`, detail: d.snapshot.service });
  }
  if (role === "IE") {
    for (const i of incidents.filter((x) => x.status !== "selesai"))
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
