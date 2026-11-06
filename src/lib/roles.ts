/**
 * Akun pengujian per peran, label peran, izin tindakan, dan akses halaman.
 *
 * Akun sengaja memakai nama peran, bukan nama orang, agar tidak ada PII.
 */
import type { Role } from "./types";

export interface DemoUser {
  id: string;
  username: string;
  name: string;
  role: Role;
  initials: string;
}

export const USERS: DemoUser[] = [
  // Akun pengujian per peran. Sengaja tanpa nama orang agar tidak ada PII di aplikasi maupun data.
  { id: "u-tl", username: "techlead", name: "Technical Lead", role: "TL", initials: "TL" },
  { id: "u-qa", username: "qa", name: "QA/Performance Tester", role: "QA", initials: "QA" },
  { id: "u-ie", username: "engineer", name: "Integration Engineer", role: "IE", initials: "IE" },
  { id: "u-pm", username: "manager", name: "Project/Technical Manager", role: "PM", initials: "PM" },
  { id: "u-sup", username: "support", name: "Tim Support dan Monitoring", role: "SUP", initials: "TS" },
];

export const ROLE_LABEL: Record<Role, string> = {
  TL: "Technical Lead",
  QA: "QA/Performance Tester",
  IE: "Integration Engineer",
  PM: "Project/Technical Manager",
  SUP: "Tim Support dan Monitoring",
};

export const ROLE_GOAL: Record<Role, string> = {
  TL: "Memimpin alignment meeting, meninjau verdict, dan menetapkan keputusan cycle.",
  QA: "Memasukkan parameter analisis dan ringkasan hasil pengujian Dev.",
  IE: "Mencatat insiden, mereproduksinya, dan menguji opsi mitigasi.",
  PM: "Meninjau dan memberi keputusan dokumen sign-off sebelum deployment.",
  SUP: "Mengumpulkan dan mengunduh laporan untuk analisis tren.",
};

export type Permission =
  | "alignment.schedule"
  | "alignment.params"
  | "alignment.run"
  | "alignment.decide"
  | "incident.manage"
  | "signoff.decide"
  | "reports.download"
  | "settings.manage";

const PERMS: Record<Permission, Role[]> = {
  "alignment.schedule": ["TL"],
  "alignment.params": ["QA", "TL"],
  "alignment.run": ["QA", "TL"],
  "alignment.decide": ["TL"],
  "incident.manage": ["IE", "TL"],
  "signoff.decide": ["PM"],
  "reports.download": ["SUP", "TL", "PM"],
  "settings.manage": ["TL"],
};

/**
 * Memeriksa apakah sebuah peran memiliki izin tindakan.
 *
 * Parameters
 * ----------
 * role : Role
 *     Peran pengguna.
 * perm : Permission
 *     Izin yang diperiksa, misalnya "alignment.decide".
 *
 * Returns
 * -------
 * boolean
 *     true bila diizinkan.
 */
export function can(role: Role, perm: Permission) {
  return PERMS[perm].includes(role);
}

export type Section = "home" | "alignment" | "incidents" | "signoff" | "reports" | "settings";

export const SECTION_ACCESS: Record<Section, Role[]> = {
  home: ["TL", "QA", "IE", "PM", "SUP"],
  alignment: ["TL", "QA", "IE", "PM"],
  incidents: ["TL", "IE", "SUP"],
  signoff: ["TL", "PM", "QA"],
  reports: ["TL", "QA", "IE", "PM", "SUP"],
  settings: ["TL"],
};

/**
 * Menentukan bagian aplikasi dari path URL, untuk pemeriksaan akses halaman.
 *
 * Parameters
 * ----------
 * path : string
 *     Pathname, misalnya "/alignment/aln-rilis-qris-c1".
 *
 * Returns
 * -------
 * Section
 *     Bagian aplikasi; "home" bila tidak cocok dengan bagian lain.
 */
export function sectionForPath(path: string): Section {
  if (path.startsWith("/alignment")) return "alignment";
  if (path.startsWith("/incidents")) return "incidents";
  if (path.startsWith("/signoff")) return "signoff";
  if (path.startsWith("/reports")) return "reports";
  if (path.startsWith("/settings")) return "settings";
  return "home";
}

