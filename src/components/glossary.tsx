/**
 * Daftar istilah aplikasi (sprint cycle, release candidate, verdict, digital twin, dan lainnya).
 */
import { BookOpen } from "lucide-react";

const TERMS: [string, string][] = [
  ["Rilis", "Paket pembaruan fitur yang akan dipasang ke sistem yang dipakai nasabah, misalnya Rilis QRIS."],
  ["Sprint cycle", "Satu putaran kerja tim, sekitar dua minggu. Satu rilis biasanya melewati 5 sampai 7 cycle sebelum siap."],
  ["Versi uji (release candidate)", "Versi aplikasi yang diuji pada cycle itu, misalnya Kandidat 2 (v3.8). Versi terakhir yang lolos disebut Final."],
  ["Dev dan Production", "Dev adalah lingkungan uji milik tim. Production adalah sistem sungguhan yang dipakai nasabah."],
  ["Alignment meeting", "Rapat di akhir setiap cycle untuk memutuskan apakah versi uji boleh naik ke Production atau kembali ke Dev."],
  ["Verdict", "Hasil penilaian ServerAgent: Lolos, Lolos Bersyarat, Tidak Lolos, atau Tidak Dapat Dinilai."],
  ["Sign-off", "Persetujuan tertulis Project/Technical Manager sebelum rilis dipasang ke Production."],
  ["TPS", "Transaksi per detik, ukuran seberapa berat beban yang diterima layanan."],
];

/**
 * Panel istilah yang bisa dibuka-tutup.
 *
 * Parameters
 * ----------
 * defaultOpen : boolean, default false
 *     Buka panel saat pertama tampil.
 *
 * Returns
 * -------
 * JSX.Element
 */
export function Glossary({ defaultOpen = false }: { defaultOpen?: boolean }) {
  return (
    <details className="group rounded-[10px] border border-line bg-surface" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3.5">
        <BookOpen className="h-[18px] w-[18px] shrink-0 text-ink-2" aria-hidden />
        <span className="flex-1 font-semibold">Arti istilah di aplikasi ini</span>
        <span className="text-[13.5px] text-accent group-open:hidden">Tampilkan</span>
        <span className="hidden text-[13.5px] text-accent group-open:inline">Sembunyikan</span>
      </summary>
      <dl className="grid gap-x-8 gap-y-3 border-t border-line px-5 py-4 text-[14px] md:grid-cols-2">
        {TERMS.map(([k, v]) => (
          <div key={k}>
            <dt className="font-semibold">{k}</dt>
            <dd className="text-ink-2">{v}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
