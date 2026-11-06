"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CalendarClock,
  FileSignature,
  FolderDown,
  Home,
  LogOut,
  Menu,
  Moon,
  Settings,
  Siren,
  Sun,
  X,
} from "lucide-react";
import { cx } from "./ui";
import type { Role } from "@/lib/types";
import { ROLE_LABEL, SECTION_ACCESS, type Section } from "@/lib/roles";
import { logout } from "@/app/login/actions";

const NAV: { section: Section; href: string; label: string; icon: typeof Home }[] = [
  { section: "home", href: "/", label: "Beranda", icon: Home },
  { section: "alignment", href: "/alignment", label: "Alignment rilis", icon: CalendarClock },
  { section: "incidents", href: "/incidents", label: "Respons insiden", icon: Siren },
  { section: "signoff", href: "/signoff", label: "Sign-off", icon: FileSignature },
  { section: "reports", href: "/reports", label: "Report", icon: FolderDown },
  { section: "settings", href: "/settings", label: "Pengaturan", icon: Settings },
];

export function Sidebar({
  user,
  badges,
  mode,
}: {
  user: { name: string; role: Role };
  badges: Partial<Record<Section, number>>;
  mode: string;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    setTheme((document.documentElement.dataset.theme as "light" | "dark") ?? "light");
  }, []);
  useEffect(() => setOpen(false), [path]);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("sa-theme", next);
    } catch {}
    setTheme(next);
  }

  const items = NAV.filter((n) => SECTION_ACCESS[n.section].includes(user.role));
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  const content = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 pb-5 pt-5">
        <img src="/icon.svg" alt="" width={28} height={28} />
        <span className="font-display text-[18px] font-semibold">ServerAgent</span>
      </div>

      <nav aria-label="Navigasi utama" className="flex-1 px-3">
        <ul className="grid gap-0.5">
          {items.map((n) => {
            const active = isActive(n.href);
            const count = badges[n.section] ?? 0;
            return (
              <li key={n.href}>
                <Link
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-[14.5px] transition-colors",
                    active ? "bg-accent-soft font-medium text-accent" : "text-ink-2 hover:bg-sunken hover:text-ink",
                  )}
                >
                  <n.icon className="h-[18px] w-[18px]" aria-hidden />
                  <span className="flex-1">{n.label}</span>
                  {count > 0 && (
                    <span className="rounded-full bg-accent px-1.5 text-[12px] font-semibold leading-5 text-accent-ink">
                      {count}
                      <span className="sr-only"> tugas menunggu</span>
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mx-3 mb-3 rounded-lg border border-line px-3 py-2.5 text-[13px]">
        <p className="text-ink-3">Mode analisis</p>
        <p className="font-medium">{mode}</p>
      </div>

      <div className="border-t border-line px-3 py-3">
        <div className="flex items-center gap-3 px-2 py-1.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-medium">{ROLE_LABEL[user.role]}</p>
            <p className="truncate text-[12.5px] text-ink-3">Akun pengujian</p>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            className="rounded-md p-2 text-ink-3 hover:bg-sunken hover:text-ink"
            aria-label={theme === "dark" ? "Gunakan tema terang" : "Gunakan tema gelap"}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[14px] text-ink-2 hover:bg-sunken hover:text-ink"
          >
            <LogOut className="h-4 w-4" aria-hidden /> Keluar
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      <div className="no-print sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface/95 px-4 py-2.5 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2">
          <img src="/icon.svg" alt="" width={24} height={24} />
          <span className="font-display font-semibold">ServerAgent</span>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md p-2 hover:bg-sunken"
          aria-label="Buka menu"
          aria-expanded={open}
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      <aside className="no-print fixed inset-y-0 left-0 z-20 hidden w-[248px] border-r border-line bg-surface lg:block">{content}</aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button className="absolute inset-0 bg-ink/40" aria-label="Tutup menu" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[280px] max-w-[85vw] bg-surface shadow-xl">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-4 rounded-md p-2 hover:bg-sunken"
              aria-label="Tutup menu"
            >
              <X className="h-5 w-5" />
            </button>
            {content}
          </div>
        </div>
      )}
    </>
  );
}
