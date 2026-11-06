import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-lg px-4 py-24 text-center">
      <h1 className="text-[28px] font-semibold">Halaman tidak ditemukan</h1>
      <p className="mt-2 text-ink-2">Data yang Anda cari mungkin sudah dihapus atau tautannya salah.</p>
      <Link href="/" className="mt-6 inline-flex h-10 items-center rounded-md bg-primary px-4 font-semibold text-primary-ink">
        Kembali ke Beranda
      </Link>
    </main>
  );
}
