import "server-only";

/**
 * Lapisan penyimpanan dokumen JSON di Postgres (Neon) dengan cadangan PGlite di memori.
 *
 * Setiap tabel berbentuk (id, data jsonb, created_at). Tabel dibuat dan data contoh diisi otomatis
 * saat koneksi pertama; data contoh versi lama diganti bila `SEED_VERSION` naik.
 */
type Query = (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

export const SEED_VERSION = 3;

export const TABLES = ["sa_sessions", "sa_incidents", "sa_signoffs", "sa_reports", "sa_audit", "sa_settings"] as const;
export type Table = (typeof TABLES)[number];

interface DbState {
  query: Query;
  kind: "postgres" | "memory";
}

const g = globalThis as unknown as { __saDb?: Promise<DbState> };

/**
 * Mencari URL koneksi Postgres dari environment variable.
 *
 * Integrasi Neon di Vercel bisa memberi awalan pada nama variabel (misalnya
 * MTI_AKPSI_DATABASE_URL), sehingga variabel berawalan juga dikenali.
 *
 * Returns
 * -------
 * string | undefined
 *     URL koneksi, atau undefined bila tidak ada (memakai PGlite di memori).
 */
function databaseUrl(): string | undefined {
  const env = process.env;
  if (env.DATABASE_URL) return env.DATABASE_URL;
  if (env.POSTGRES_URL) return env.POSTGRES_URL;
  const keys = Object.keys(env).sort();
  const pick = (re: RegExp) => keys.find((k) => re.test(k) && env[k]);
  const k = pick(/_DATABASE_URL$/) ?? pick(/_POSTGRES_URL$/);
  return k ? env[k] : undefined;
}

/**
 * Membuka koneksi, membuat tabel, dan mengisi data contoh bila perlu.
 *
 * Returns
 * -------
 * Promise<DbState>
 *     Fungsi query dan jenis penyimpanan ("postgres" atau "memory").
 */
async function connect(): Promise<DbState> {
  const url = databaseUrl();
  let state: DbState;
  if (url) {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(url);
    state = {
      kind: "postgres",
      query: async (text, params = []) => (await sql.query(text, params)) as Record<string, unknown>[],
    };
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const pg = new PGlite();
    state = {
      kind: "memory",
      query: async (text, params = []) => (await pg.query(text, params)).rows as Record<string, unknown>[],
    };
  }
  for (const t of TABLES) {
    await state.query(
      `create table if not exists ${t} (id text primary key, data jsonb not null, created_at timestamptz not null default now())`,
    );
  }
  const seeded = await state.query(`select data from sa_settings where id = 'app'`);
  // Data contoh versi lama (nama orang, kode rilis teknis) diganti seluruhnya dengan versi terbaru.
  const legacy = seeded.length > 0 && ((seeded[0].data as { seedVersion?: number }).seedVersion ?? 0) < SEED_VERSION;
  if (legacy) {
    for (const t of TABLES) await state.query(`delete from ${t}`);
  }
  if (seeded.length === 0 || legacy) {
    const { seed } = await import("./seed");
    await seed(async (table, id, data, createdAt) => {
      await state.query(
        `insert into ${table} (id, data, created_at) values ($1, $2::jsonb, $3) on conflict (id) do nothing`,
        [id, JSON.stringify(data), createdAt],
      );
    });
  }
  return state;
}

/**
 * Koneksi database bersama untuk seluruh permintaan pada satu instans server.
 *
 * Returns
 * -------
 * Promise<DbState>
 *     Koneksi yang sama dipakai ulang; bila gagal, percobaan berikutnya membuka koneksi baru.
 */
export function getDb(): Promise<DbState> {
  if (!g.__saDb) {
    g.__saDb = connect().catch((e) => {
      g.__saDb = undefined;
      throw e;
    });
  }
  return g.__saDb;
}

/**
 * Jenis penyimpanan yang sedang dipakai.
 *
 * Returns
 * -------
 * Promise<"postgres" | "memory">
 */
export async function dbKind() {
  return (await getDb()).kind;
}

/**
 * Membaca seluruh dokumen pada sebuah tabel, terbaru lebih dulu.
 *
 * Parameters
 * ----------
 * table : Table
 *     Nama tabel.
 *
 * Returns
 * -------
 * Promise<T[]>
 *     Isi kolom data setiap baris.
 */
export async function all<T>(table: Table): Promise<T[]> {
  const db = await getDb();
  const rows = await db.query(`select data from ${table} order by created_at desc`);
  return rows.map((r) => r.data as T);
}

/**
 * Membaca satu dokumen.
 *
 * Parameters
 * ----------
 * table : Table
 *     Nama tabel.
 * id : string
 *     Identitas dokumen.
 *
 * Returns
 * -------
 * Promise<T | null>
 *     Dokumen, atau null bila tidak ada.
 */
export async function get<T>(table: Table, id: string): Promise<T | null> {
  const db = await getDb();
  const rows = await db.query(`select data from ${table} where id = $1`, [id]);
  return rows[0] ? (rows[0].data as T) : null;
}

/**
 * Menyimpan dokumen (insert atau update berdasarkan id).
 *
 * Parameters
 * ----------
 * table : Table
 *     Nama tabel.
 * doc : T
 *     Dokumen dengan field id dan opsional createdAt.
 *
 * Returns
 * -------
 * Promise<T>
 *     Dokumen yang sama.
 */
export async function put<T extends { id: string; createdAt?: string }>(table: Table, doc: T): Promise<T> {
  const db = await getDb();
  await db.query(
    `insert into ${table} (id, data, created_at) values ($1, $2::jsonb, $3)
     on conflict (id) do update set data = excluded.data`,
    [doc.id, JSON.stringify(doc), doc.createdAt ?? new Date().toISOString()],
  );
  return doc;
}

/**
 * Menghapus seluruh data lalu mengisi ulang data contoh.
 *
 * Returns
 * -------
 * Promise<void>
 */
export async function resetAll() {
  const db = await getDb();
  for (const t of TABLES) await db.query(`delete from ${t}`);
  const { seed } = await import("./seed");
  await seed(async (table, id, data, createdAt) => {
    await db.query(`insert into ${table} (id, data, created_at) values ($1, $2::jsonb, $3) on conflict (id) do nothing`, [
      id,
      JSON.stringify(data),
      createdAt,
    ]);
  });
}
