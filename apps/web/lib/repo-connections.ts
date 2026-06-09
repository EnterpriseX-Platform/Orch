/**
 * External database connection helpers for the Data Repository.
 *
 * Mirrors what `platform/integration` does — provides a thin
 * with*Conn() wrapper per engine that opens a connection from a
 * config blob, runs a callback, and tears down. Callers never see
 * the raw client.
 *
 * mysql2 + oracledb are imported lazily (`await import(...)`) so
 * apps that don't need them never pay the cold-start cost.
 */
import { Pool as PgPool } from 'pg'

export type ConnectionType = 'postgresql' | 'mysql' | 'oracle'

export type ConnectionConfig = {
  host: string
  port: string | number
  database: string
  username?: string
  user?: string
  password: string
  ssl?: boolean
  // Oracle-specific
  serviceName?: string
  // MySQL-specific
  socketPath?: string
}

export type DiscoveredTable = {
  name: string
  schema?: string | null
  rowCount?: number | null
}

function pickUser(cfg: ConnectionConfig): string {
  return cfg.username ?? cfg.user ?? ''
}
function pickPort(cfg: ConnectionConfig, fallback: number): number {
  if (typeof cfg.port === 'number') return cfg.port
  const n = parseInt(cfg.port || '', 10)
  return Number.isFinite(n) ? n : fallback
}

// ─── PostgreSQL ────────────────────────────────────────────────────
export async function withPgClient<T>(cfg: ConnectionConfig, fn: (client: any) => Promise<T>): Promise<T> {
  const pool = new PgPool({
    host: cfg.host,
    port: pickPort(cfg, 5432),
    database: cfg.database,
    user: pickUser(cfg),
    password: cfg.password,
    ssl: cfg.ssl ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
  })
  const client = await pool.connect()
  try {
    return await fn(client)
  } finally {
    client.release()
    await pool.end()
  }
}

// ─── MySQL ────────────────────────────────────────────────────
export async function withMysqlConn<T>(cfg: ConnectionConfig, fn: (c: any) => Promise<T>): Promise<T> {
  const mysql: any = await import('mysql2/promise')
  const conn = await mysql.createConnection({
    host: cfg.host,
    port: pickPort(cfg, 3306),
    database: cfg.database,
    user: pickUser(cfg),
    password: cfg.password,
    ssl: cfg.ssl ? {} : undefined,
    socketPath: cfg.socketPath,
    connectTimeout: 5000,
  })
  try {
    return await fn(conn)
  } finally {
    await conn.end()
  }
}

// ─── Oracle ────────────────────────────────────────────────────
export async function withOracleConn<T>(cfg: ConnectionConfig, fn: (c: any) => Promise<T>): Promise<T> {
  // @ts-expect-error — oracledb has no types and is loaded lazily.
  const oracledbMod: any = await import('oracledb')
  const oracledb: any = oracledbMod.default ?? oracledbMod
  // Return rows as objects keyed by column alias (e.g. r.rows[0].name)
  // instead of the default arrays. All describe / count / select sites
  // depend on this — they reference x.name, x.type, x.is_nullable etc.
  // Without it those keys come back undefined and silently produce
  // schema rows like {nullable: false} with no column name.
  oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT
  // Materialise CLOB/BLOB values into JS strings/Buffers so callers
  // can JSON.stringify the rows. Default behaviour returns Lob handles
  // that hold a parent connection ref → "Converting circular structure
  // to JSON" when the API tries to serialise. Setting this once at
  // module level is safe — oracledb caches it on the singleton.
  oracledb.fetchAsString = [oracledb.CLOB]
  oracledb.fetchAsBuffer = [oracledb.BLOB]
  const connectString = cfg.serviceName
    ? `${cfg.host}:${pickPort(cfg, 1521)}/${cfg.serviceName}`
    : `${cfg.host}:${pickPort(cfg, 1521)}/${cfg.database}`
  const conn = await oracledb.getConnection({
    user: pickUser(cfg),
    password: cfg.password,
    connectString,
  })
  try {
    return await fn(conn)
  } finally {
    await conn.close()
  }
}

/**
 * Connect, run `SELECT 1` (or equivalent), and close. Used by the
 * "Test connection" button in the Connections panel.
 */
export async function testConnection(type: ConnectionType, cfg: ConnectionConfig): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  const t0 = Date.now()
  try {
    if (type === 'postgresql') {
      await withPgClient(cfg, c => c.query('SELECT 1'))
    } else if (type === 'mysql') {
      await withMysqlConn(cfg, c => c.execute('SELECT 1'))
    } else if (type === 'oracle') {
      await withOracleConn(cfg, c => c.execute('SELECT 1 FROM DUAL'))
    } else {
      return { ok: false, error: `Unsupported type: ${type}` }
    }
    return { ok: true, latencyMs: Date.now() - t0 }
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) }
  }
}

/**
 * List BASE tables in the connected database. Returns a uniform
 * shape regardless of engine so the UI doesn't branch.
 */
export async function listExternalTables(type: ConnectionType, cfg: ConnectionConfig): Promise<DiscoveredTable[]> {
  if (type === 'postgresql') {
    return withPgClient(cfg, async (client) => {
      const r = await client.query(
        `SELECT table_name AS name, table_schema AS schema
           FROM information_schema.tables
          WHERE table_schema NOT IN ('pg_catalog','information_schema')
            AND table_type = 'BASE TABLE'
       ORDER BY table_schema, table_name`,
      )
      return r.rows
    })
  }
  if (type === 'mysql') {
    return withMysqlConn(cfg, async (c) => {
      const [rows]: any = await c.execute(
        `SELECT TABLE_NAME AS name, TABLE_SCHEMA AS \`schema\`
           FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
       ORDER BY TABLE_NAME`,
      )
      return rows
    })
  }
  if (type === 'oracle') {
    return withOracleConn(cfg, async (c) => {
      const r = await c.execute(
        `SELECT TABLE_NAME AS "name", OWNER AS "schema"
           FROM ALL_TABLES WHERE OWNER = USER ORDER BY TABLE_NAME`,
      )
      return r.rows as DiscoveredTable[]
    })
  }
  return []
}

/**
 * Get the column descriptor of a remote table — name, type, nullable.
 * Used to pre-populate the import / browse view.
 */
export async function describeExternalTable(
  type: ConnectionType,
  cfg: ConnectionConfig,
  tableName: string,
  schema?: string,
): Promise<{ name: string; type: string; nullable: boolean }[]> {
  if (type === 'postgresql') {
    return withPgClient(cfg, async (client) => {
      const r = await client.query(
        `SELECT column_name AS name, data_type AS type, is_nullable
           FROM information_schema.columns
          WHERE table_name = $1 AND ($2::text IS NULL OR table_schema = $2)
       ORDER BY ordinal_position`,
        [tableName, schema ?? null],
      )
      return r.rows.map((c: any) => ({ name: c.name, type: c.type, nullable: c.is_nullable === 'YES' }))
    })
  }
  if (type === 'mysql') {
    return withMysqlConn(cfg, async (c) => {
      const [rows]: any = await c.execute(
        `SELECT COLUMN_NAME AS name, DATA_TYPE AS type, IS_NULLABLE AS is_nullable
           FROM information_schema.COLUMNS
          WHERE TABLE_NAME = ? AND TABLE_SCHEMA = DATABASE()
       ORDER BY ORDINAL_POSITION`,
        [tableName],
      )
      return rows.map((c: any) => ({ name: c.name, type: c.type, nullable: c.is_nullable === 'YES' }))
    })
  }
  if (type === 'oracle') {
    return withOracleConn(cfg, async (c) => {
      const r = await c.execute(
        `SELECT COLUMN_NAME AS "name", DATA_TYPE AS "type", NULLABLE AS "is_nullable"
           FROM ALL_TAB_COLUMNS WHERE TABLE_NAME = :t AND OWNER = USER ORDER BY COLUMN_ID`,
        [tableName.toUpperCase()],
      )
      return (r.rows as any[]).map((c) => ({ name: c.name, type: c.type, nullable: c.is_nullable === 'Y' }))
    })
  }
  return []
}
