"use client";

/**
 * Indikator progres navigasi di tepi atas layar.
 *
 * Muncul seketika saat tautan internal diklik dan hilang ketika halaman tujuan selesai
 * dirender, sehingga pengguna langsung tahu kliknya diterima walaupun server butuh waktu
 * (heuristik NNG: visibility of system status). Tidak memakai batas Suspense, jadi tidak
 * memengaruhi pembaruan halaman setelah server action.
 */
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Memeriksa apakah klik akan memicu navigasi internal di tab yang sama.
 *
 * Parameters
 * ----------
 * e : MouseEvent
 *     Event klik pada dokumen.
 *
 * Returns
 * -------
 * boolean
 *     true untuk tautan ke halaman lain di origin yang sama, tanpa tombol pengubah,
 *     target baru, unduhan, atau sekadar pindah jangkar (#).
 */
function isInternalNavigation(e: MouseEvent): boolean {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  const a = (e.target as Element | null)?.closest?.("a");
  if (!a || !a.href || a.target === "_blank" || a.hasAttribute("download")) return false;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return false;
  return !(url.pathname === location.pathname && url.search === location.search);
}

/**
 * Bilah progres global; dipasang sekali di layout aplikasi.
 *
 * Returns
 * -------
 * JSX.Element
 */
export function RouteProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const onClick = (e: MouseEvent) => isInternalNavigation(e) && setLoading(true);
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // Rute berubah berarti halaman tujuan sudah dirender.
  useEffect(() => setLoading(false), [pathname, search]);

  // Pengaman: jangan biarkan bilah tertahan bila navigasi dibatalkan.
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => setLoading(false), 15000);
    return () => clearTimeout(t);
  }, [loading]);

  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px] overflow-hidden transition-opacity duration-200 ${loading ? "opacity-100" : "opacity-0"}`}
    >
      <div className="route-progress h-full w-1/3 bg-amber" />
    </div>
  );
}
