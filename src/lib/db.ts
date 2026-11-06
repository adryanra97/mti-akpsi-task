import "server-only";

type Query = (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

export const SEED_VERSION = 2;

export const TABLES = ["sa_sessions", "sa_incidents", "sa_signoffs", "sa_reports", "sa_audit", "sa_settings"] as const;
export type Table = (typeof TABLES)[number];

interface DbState {
  query: Query;
  kind: "postgres" | "memory";
}

const g = globalThis as unknown as { __saDb?: Promise<DbState> };

/**
 * Mencari URL koneksi Postgres. Integrasi Neon di Vercel bisa memberi awalan pada nama variabel
 * (mis. MTI_AKPSI_DATABASE_URL), jadi variabel berawalan juga dikenali. Koneksi pooled diutamakan.
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

export function getDb(): Promise<DbState> {
  if (!g.__saDb) {
    g.__saDb = connect().catch((e) => {
      g.__saDb = undefined;
      throw e;
    });
  }
  return g.__saDb;
}

export async function dbKind() {
  return (await getDb()).kind;
}

export async function all<T>(table: Table): Promise<T[]> {
  const db = await getDb();
  const rows = await db.query(`select data from ${table} order by created_at desc`);
  return rows.map((r) => r.data as T);
}

export async function get<T>(table: Table, id: string): Promise<T | null> {
  const db = await getDb();
  const rows = await db.query(`select data from ${table} where id = $1`, [id]);
  return rows[0] ? (rows[0].data as T) : null;
}

export async function put<T extends { id: string; createdAt?: string }>(table: Table, doc: T): Promise<T> {
  const db = await getDb();
  await db.query(
    `insert into ${table} (id, data, created_at) values ($1, $2::jsonb, $3)
     on conflict (id) do update set data = excluded.data`,
    [doc.id, JSON.stringify(doc), doc.createdAt ?? new Date().toISOString()],
  );
  return doc;
}

/** Menghapus seluruh data lalu mengisi ulang data contoh. */
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
