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
    <div className="flex h-full flex-col bg-board text-board-ink">
      <div className="flex items-center gap-2.5 px-5 pb-6 pt-5">
        <img src="/icon.svg" alt="" width={28} height={28} />
        <span className="font-wide text-[17px] font-bold tracking-tight">ServerAgent</span>
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
                    "relative flex items-center gap-3 rounded-md px-3 py-2 text-[14.5px] transition-colors",
                    active
                      ? "bg-board-2 font-semibold text-white before:absolute before:inset-y-1.5 before:-left-3 before:w-1 before:rounded-r before:bg-amber"
                      : "text-board-ink-2 hover:bg-board-2 hover:text-board-ink",
                  )}
                >
                  <n.icon className="h-[18px] w-[18px]" aria-hidden />
                  <span className="flex-1">{n.label}</span>
                  {count > 0 && (
                    <span className="rounded-full bg-amber px-1.5 text-[12px] font-bold leading-5 text-board">
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

      <div className="mx-3 mb-3 rounded-md border border-board-line px-3 py-2.5 text-[13px]">
        <p className="text-board-ink-2">Mode analisis</p>
        <p className="font-medium">{mode}</p>
      </div>

      <div className="border-t border-board-line px-3 py-3">
        <div className="flex items-center gap-3 px-2 py-1.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-medium">{ROLE_LABEL[user.role]}</p>
            <p className="truncate text-[12.5px] text-board-ink-2">Akun pengujian</p>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            className="rounded-md p-2 text-board-ink-2 hover:bg-board-2 hover:text-board-ink"
            aria-label={theme === "dark" ? "Gunakan tema terang" : "Gunakan tema gelap"}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="mt-1 flex w-full items-center gap-3 rounded-md px-3 py-2 text-[14px] text-board-ink-2 hover:bg-board-2 hover:text-board-ink"
          >
            <LogOut className="h-4 w-4" aria-hidden /> Keluar
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      <div className="no-print sticky top-0 z-30 flex items-center justify-between bg-board px-4 py-2.5 text-board-ink lg:hidden">
        <div className="flex items-center gap-2">
          <img src="/icon.svg" alt="" width={24} height={24} />
          <span className="font-wide font-bold">ServerAgent</span>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md p-2 hover:bg-board-2"
          aria-label="Buka menu"
          aria-expanded={open}
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      <aside className="no-print fixed inset-y-0 left-0 z-20 hidden w-[248px] bg-board lg:block">{content}</aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button className="absolute inset-0 bg-ink/40" aria-label="Tutup menu" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[280px] max-w-[85vw] bg-board shadow-xl">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-4 z-10 rounded-md p-2 text-board-ink hover:bg-board-2"
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
