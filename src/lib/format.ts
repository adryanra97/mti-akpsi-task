/**
 * Pemformat tampilan tanggal dan angka dalam locale Indonesia (zona waktu WIB).
 */
/**
 * Memformat tanggal ISO menjadi teks Indonesia pada zona waktu Asia/Jakarta.
 *
 * Parameters
 * ----------
 * iso : string | undefined
 *     Tanggal dalam format ISO 8601.
 * withTime : boolean, default false
 *     Sertakan jam dan menit.
 *
 * Returns
 * -------
 * string
 *     Contoh "6 Nov 2026" atau "6 Nov 2026, 14.00"; "–" bila `iso` kosong.
 */
export function fmtDate(iso: string | undefined, withTime = false) {
  if (!iso) return "–";
  const d = new Date(iso);
  return d.toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "Asia/Jakarta",
  });
}

/**
 * Memformat selisih waktu terhadap sekarang secara relatif.
 *
 * Parameters
 * ----------
 * iso : string
 *     Tanggal dalam format ISO 8601.
 *
 * Returns
 * -------
 * string
 *     Contoh "15 menit lalu", "3 hari lagi", atau "baru saja".
 */
export function fmtRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const abs = Math.abs(diff);
  const min = Math.round(abs / 60000);
  const future = diff < 0;
  let s: string;
  if (min < 1) return "baru saja";
  if (min < 60) s = `${min} menit`;
  else if (min < 60 * 24) s = `${Math.round(min / 60)} jam`;
  else s = `${Math.round(min / 1440)} hari`;
  return future ? `${s} lagi` : `${s} lalu`;
}

/**
 * Memformat angka dengan pemisah desimal Indonesia.
 *
 * Parameters
 * ----------
 * n : number | null | undefined
 *     Angka yang diformat.
 * digits : number, default 1
 *     Jumlah digit pecahan maksimum.
 *
 * Returns
 * -------
 * string
 *     Angka terformat, atau "–" bila kosong atau NaN.
 */
export function fmtNum(n: number | null | undefined, digits = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return "–";
  return n.toLocaleString("id-ID", { maximumFractionDigits: digits });
}

/**
 * Memformat nominal rupiah.
 *
 * Parameters
 * ----------
 * n : number
 *     Nominal dalam rupiah.
 *
 * Returns
 * -------
 * string
 *     Contoh "Rp16.500".
 */
export function fmtIdr(n: number) {
  return `Rp${Math.round(n).toLocaleString("id-ID")}`;
}
