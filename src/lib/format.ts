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

export function fmtNum(n: number | null | undefined, digits = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return "–";
  return n.toLocaleString("id-ID", { maximumFractionDigits: digits });
}

export function fmtIdr(n: number) {
  return `Rp${Math.round(n).toLocaleString("id-ID")}`;
}
