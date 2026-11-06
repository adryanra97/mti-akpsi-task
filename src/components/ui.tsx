/**
 * Komponen antarmuka dasar: tombol, panel, kepala halaman, isian formulir, tag, pemberitahuan,
 * keadaan kosong, dan daftar label-nilai. Seluruh warna memakai token tema (terang dan gelap).
 */
import clsx from "clsx";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export { clsx as cx };

type BtnVariant = "primary" | "secondary" | "ghost" | "danger";

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-md px-4 h-10 text-[14px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap";
const btnVariants: Record<BtnVariant, string> = {
  primary: "bg-primary text-primary-ink hover:bg-primary-hover",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-surface-2",
  ghost: "text-ink-2 hover:bg-sunken hover:text-ink",
  danger: "bg-fail text-white hover:opacity-90 dark:text-bg",
};

/**
 * Tombol dengan varian gaya.
 *
 * Parameters
 * ----------
 * variant : "primary" | "secondary" | "ghost" | "danger", default "primary"
 *     Gaya tombol; "primary" untuk tindakan utama di setiap layar.
 * className : string, optional
 *     Kelas tambahan.
 * ...props : ComponentProps<"button">
 *     Atribut tombol HTML lainnya.
 *
 * Returns
 * -------
 * JSX.Element
 */
export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: BtnVariant }) {
  return <button className={clsx(btnBase, btnVariants[variant], className)} {...props} />;
}

/**
 * Tautan Next.js bergaya tombol, untuk navigasi yang tampil sebagai tindakan.
 *
 * Parameters
 * ----------
 * variant : "primary" | "secondary" | "ghost" | "danger", default "primary"
 *     Gaya tombol.
 * className : string, optional
 *     Kelas tambahan.
 * ...props : ComponentProps<typeof Link>
 *     Atribut tautan (href wajib).
 *
 * Returns
 * -------
 * JSX.Element
 */
export function ButtonLink({
  variant = "primary",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: BtnVariant }) {
  return <Link className={clsx(btnBase, btnVariants[variant], className)} {...props} />;
}

/**
 * Kartu berbingkai dengan kepala (judul, deskripsi, aksi) dan isi.
 *
 * Parameters
 * ----------
 * title : ReactNode, optional
 *     Judul panel (h2).
 * description : ReactNode, optional
 *     Keterangan singkat di bawah judul.
 * actions : ReactNode, optional
 *     Tombol di sisi kanan kepala.
 * children : ReactNode
 *     Isi panel.
 * className : string, optional
 *     Kelas tambahan untuk bingkai.
 * bodyClassName : string, optional
 *     Kelas isi; bawaan berpadding.
 * id : string, optional
 *     Id elemen, misalnya untuk tautan jangkar.
 *
 * Returns
 * -------
 * JSX.Element
 */
export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  id,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) {
  return (
    <section id={id} className={clsx("rounded-[10px] border border-line bg-surface", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="text-[17px]">{title}</h2>}
            {description && <p className="mt-0.5 text-[13.5px] text-ink-3">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </header>
      )}
      <div className={clsx("px-5 py-4", bodyClassName)}>{children}</div>
    </section>
  );
}

/**
 * Kepala halaman: tautan kembali, judul (h1), deskripsi, dan aksi.
 *
 * Parameters
 * ----------
 * title : ReactNode
 *     Judul halaman.
 * description : ReactNode, optional
 *     Konteks singkat di bawah judul.
 * actions : ReactNode, optional
 *     Tag status atau tombol di sisi kanan.
 * back : { href: string; label: string }, optional
 *     Tautan kembali ke halaman induk.
 *
 * Returns
 * -------
 * JSX.Element
 */
export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="mb-6">
      {back && (
        <Link href={back.href} className="mb-3 inline-flex items-center gap-1 text-[13.5px] text-ink-3 hover:text-ink">
          <span aria-hidden>‹</span> {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 max-w-3xl">
          <h1 className="text-[30px] sm:text-[36px]">{title}</h1>
          {description && <p className="mt-1.5 text-ink-2">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/**
 * Pembungkus isian formulir dengan label, petunjuk, dan pesan galat yang terhubung lewat aria.
 *
 * Parameters
 * ----------
 * label : string
 *     Label isian.
 * htmlFor : string
 *     Id isian; petunjuk memakai id "{htmlFor}-hint" dan galat "{htmlFor}-error".
 * hint : string, optional
 *     Petunjuk singkat (contoh rentang nilai).
 * error : string, optional
 *     Pesan galat validasi; menggantikan tampilan petunjuk.
 * children : ReactNode
 *     Elemen isian.
 * className : string, optional
 *     Kelas tambahan.
 *
 * Returns
 * -------
 * JSX.Element
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[13.5px] font-medium text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="mt-1 text-[13px] text-fail">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="mt-1 text-[13px] text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const inputClass =
  "block w-full rounded-lg border border-line-strong bg-surface px-3 h-10 text-[14.5px] text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 aria-[invalid=true]:border-fail aria-[invalid=true]:ring-fail/20";

/**
 * Isian teks bergaya standar.
 *
 * Parameters
 * ----------
 * className : string, optional
 *     Kelas tambahan.
 * ...props : ComponentProps<"input">
 *     Atribut input HTML, termasuk ref.
 *
 * Returns
 * -------
 * JSX.Element
 */
export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={clsx(inputClass, className)} {...props} />;
}

/**
 * Isian teks multi-baris bergaya standar.
 *
 * Parameters
 * ----------
 * className : string, optional
 *     Kelas tambahan.
 * ...props : ComponentProps<"textarea">
 *     Atribut textarea HTML.
 *
 * Returns
 * -------
 * JSX.Element
 */
export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={clsx(inputClass, "h-auto py-2 leading-relaxed", className)} {...props} />;
}

/**
 * Daftar pilihan bergaya standar.
 *
 * Parameters
 * ----------
 * className : string, optional
 *     Kelas tambahan.
 * ...props : ComponentProps<"select">
 *     Atribut select HTML beserta option sebagai children.
 *
 * Returns
 * -------
 * JSX.Element
 */
export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={clsx(inputClass, "pr-8", className)} {...props} />;
}

/**
 * Label status kecil berwarna.
 *
 * Parameters
 * ----------
 * children : ReactNode
 *     Isi label.
 * tone : "neutral" | "accent" | "warn" | "pass" | "fail", default "neutral"
 *     Warna semantik.
 *
 * Returns
 * -------
 * JSX.Element
 */
export function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" | "warn" | "pass" | "fail" }) {
  const tones = {
    neutral: "bg-sunken text-ink-2",
    accent: "bg-accent-soft text-accent",
    warn: "bg-cond-soft text-cond",
    pass: "bg-pass-soft text-pass",
    fail: "bg-fail-soft text-fail",
  };
  return <span className={clsx("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12.5px] font-medium", tones[tone])}>{children}</span>;
}

/**
 * Keadaan kosong yang menjelaskan apa yang terjadi dan langkah berikutnya.
 *
 * Parameters
 * ----------
 * title : string
 *     Ringkasan keadaan.
 * children : ReactNode, optional
 *     Penjelasan.
 * action : ReactNode, optional
 *     Tombol tindakan lanjutan.
 *
 * Returns
 * -------
 * JSX.Element
 */
export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-[14px] text-ink-3">{children}</div>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/**
 * Kotak pemberitahuan berwarna sesuai nada pesan.
 *
 * Parameters
 * ----------
 * tone : "info" | "warn" | "fail" | "pass", default "info"
 *     Nada pesan.
 * title : ReactNode, optional
 *     Judul pemberitahuan.
 * children : ReactNode, optional
 *     Isi pemberitahuan.
 * icon : ReactNode, optional
 *     Ikon di sisi kiri.
 *
 * Returns
 * -------
 * JSX.Element
 */
export function Notice({
  tone = "info",
  title,
  children,
  icon,
}: {
  tone?: "info" | "warn" | "fail" | "pass";
  title?: ReactNode;
  children?: ReactNode;
  icon?: ReactNode;
}) {
  const tones = {
    info: "border-accent/30 bg-accent-soft text-ink",
    warn: "border-cond/30 bg-cond-soft text-ink",
    fail: "border-fail/30 bg-fail-soft text-ink",
    pass: "border-pass/30 bg-pass-soft text-ink",
  };
  return (
    <div className={clsx("flex gap-3 rounded-lg border px-4 py-3 text-[14px]", tones[tone])} role={tone === "fail" ? "alert" : "status"}>
      {icon && <div className="mt-0.5 shrink-0">{icon}</div>}
      <div className="min-w-0">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={clsx(title && "mt-0.5", "text-ink-2")}>{children}</div>}
      </div>
    </div>
  );
}

/**
 * Daftar pasangan label dan nilai (elemen dl).
 *
 * Parameters
 * ----------
 * items : [ReactNode, ReactNode][]
 *     Pasangan label dan nilai.
 * className : string, optional
 *     Kelas tambahan.
 *
 * Returns
 * -------
 * JSX.Element
 */
export function KeyValue({ items, className }: { items: [ReactNode, ReactNode][]; className?: string }) {
  return (
    <dl className={clsx("grid grid-cols-[minmax(120px,auto)_1fr] gap-x-4 gap-y-2 text-[14px]", className)}>
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-ink-3">{k}</dt>
          <dd className="min-w-0 text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
