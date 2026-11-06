/**
 * Pemeriksaan asal permintaan untuk API yang mengubah data.
 */
/**
 * Menolak permintaan lintas situs (pertahanan tambahan selain cookie SameSite).
 *
 * Parameters
 * ----------
 * req : Request
 *     Permintaan masuk.
 *
 * Returns
 * -------
 * boolean
 *     true bila header Origin kosong atau berasal dari host yang sama.
 */
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(req.url).host || origin === `https://${req.headers.get("host")}`;
  } catch {
    return false;
  }
}
