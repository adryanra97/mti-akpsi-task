/** Menolak permintaan lintas situs pada API yang mengubah data (pertahanan tambahan selain cookie SameSite). */
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(req.url).host || origin === `https://${req.headers.get("host")}`;
  } catch {
    return false;
  }
}
