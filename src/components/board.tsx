import Link from "next/link";
import { cx } from "./ui";

export type BoardTone = "pass" | "cond" | "fail" | "na" | "wait";

export interface BoardRow {
  key: string;
  href?: string;
  date: string;
  time: string;
  release: string;
  service: string;
  cycle: number;
  gate: string;
  status: string;
  tone: BoardTone;
}

/** Warna tetap untuk permukaan papan yang selalu gelap (tidak mengikuti tema). */
const TONE: Record<BoardTone, string> = {
  pass: "#4fc48b",
  cond: "#ffb547",
  fail: "#ff7a6f",
  na: "#a6afbf",
  wait: "#a99fff",
};

const SHAPE: Record<BoardTone, string> = {
  pass: "rounded-full",
  cond: "rotate-45 rounded-[1px]",
  fail: "rounded-[1px]",
  na: "rounded-full border-2 bg-transparent",
  wait: "rounded-full",
};

/**
 * Papan promosi: setiap release candidate ditampilkan seperti jadwal keberangkatan menuju Production.
 * Tetap berupa tabel agar terbaca pembaca layar; status selalu disertai label teks.
 */
/** Kolom sudah berjudul "Rilis", jadi awalan "Rilis" tidak diulang di sel papan. */
const short = (release: string) => release.replace(/^rilis\s+/i, "");

export function DepartureBoard({ rows, caption, animate = true }: { rows: BoardRow[]; caption: string; animate?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-[10px] bg-board text-board-ink ring-1 ring-board-line">
      <table className="w-full border-separate border-spacing-0 text-[14px] md:min-w-[540px]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="text-left text-[12.5px] text-amber">
            {["Jadwal", "Rilis", "Layanan", "Cycle", "Status"].map((h, i) => (
              <th
                key={h}
                scope="col"
                className={cx(
                  "font-narrow border-b border-board-line px-2 py-2.5 font-semibold tracking-wide first:pl-4 last:pr-4 sm:px-3 sm:first:pl-5 sm:last:pr-5",
                  h === "Jadwal" && "hidden sm:table-cell",
                  h === "Rilis" && "max-sm:pl-4",
                  h === "Layanan" && "hidden md:table-cell",
                  h === "Cycle" && "hidden text-right sm:table-cell",
                )}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const d = { "--d": `${animate ? 120 + i * 90 : 0}ms` } as React.CSSProperties;
            const cell =
              "whitespace-nowrap border-b border-board-line px-2 py-2.5 align-middle first:pl-4 last:pr-4 sm:px-3 sm:first:pl-5 sm:last:pr-5";
            const content = (
              <>
                <td className={cx(cell, "hidden sm:table-cell")}>
                  <span className="flap" style={d}>
                    {r.time}
                  </span>
                  <span className="ml-2 hidden text-[12.5px] text-board-ink-2 sm:inline">{r.date}</span>
                </td>
                <td className={cx(cell, "max-sm:pl-4")}>
                  {r.href ? (
                    <Link
                      href={r.href}
                      className="rounded-[3px] after:absolute after:inset-0 after:content-[''] focus-visible:outline-amber"
                      aria-label={`${r.release} cycle ${r.cycle}, ${r.service}: ${r.status}`}
                    >
                      <span className="flap" style={d}>
                        {short(r.release)}
                        <span className="sm:hidden"> C{r.cycle}</span>
                      </span>
                    </Link>
                  ) : (
                    <span className="flap" style={d}>
                      {short(r.release)}
                      <span className="sm:hidden"> C{r.cycle}</span>
                    </span>
                  )}
                </td>
                <td className={cx(cell, "hidden max-w-[220px] truncate text-board-ink-2 md:table-cell")}>{r.service}</td>
                <td className={cx(cell, "hidden text-right sm:table-cell")}>
                  <span className="flap" style={d}>
                    {String(r.cycle).padStart(2, "0")}
                  </span>
                </td>
                <td className={cell}>
                  <span className="inline-flex items-center gap-2">
                    <span
                      className={cx("h-2.5 w-2.5 shrink-0", SHAPE[r.tone])}
                      style={r.tone === "na" ? { borderColor: TONE[r.tone] } : { background: TONE[r.tone] }}
                      aria-hidden
                    />
                    <span className="flap" style={{ ...d, color: TONE[r.tone] }}>
                      {r.status}
                    </span>
                  </span>
                </td>
              </>
            );
            return (
              <tr key={r.key} className={cx("board-row relative", r.href && "cursor-pointer hover:bg-board-2")}>
                {content}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
