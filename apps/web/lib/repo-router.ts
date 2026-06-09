/**
 * repo-router.ts — single dispatch point that decides whether a
 * RepoTable's data lives in Orch's own Postgres (`repo_<name>`)
 * or in a remote DB reached through a RepoConnection.
 *
 * Every CRUD endpoint funnels through `withTableExecutor()` so the
 * branching logic isn't duplicated in 4 routes.
 *
 * Local mode  : connectionId null  → use lib/repo-physical
 * Remote mode : connectionId set   → open via lib/repo-connections
 *               and run the right SQL dialect
 *
 * The shape of returned rows is identical for both modes so the
 * UI doesn't have to care.
 */
import { prisma } from '@/lib/prisma'
import {
  describePhysicalTable, selectRows as localSelect, insertRow as localInsert,
  updateRow as localUpdate, deleteRow as localDelete, countRows as localCount,
  physicalTableName,
} from '@/lib/repo-physical'
import {
  withPgClient, withMysqlConn, withOracleConn,
  type ConnectionType, type ConnectionConfig,
} from '@/lib/repo-connections'
import { decryptRows, encryptPayload, withAppEncryptedFlags } from '@/lib/repo-crypto-hooks'

type RepoTableRow = {
  id: string
  name: string
  connectionId: string | null
  externalTableName: string | null
  // App-level encryption flags live per-column in schemaJson; the crypto
  // hooks read them off the table row (callers pass the full RepoTable).
  schemaJson?: unknown
}

export async function getTableContext(id: string) {
  const t = await prisma.repoTable.findUnique({
    where: { id },
    include: { connection: true },
  })
  if (!t) throw new Error('Table not found')
  return t
}

/** Resolve "what physical table to talk to" — handles local + remote. */
export function physicalNameFor(t: RepoTableRow): string {
  if (t.connectionId && t.externalTableName) return t.externalTableName
  return physicalTableName(t.name)
}

// ─── DESCRIBE ────────────────────────────────────────────────────
export async function describe(t: RepoTableRow & { connection?: { type: string; config: any } | null }) {
  if (!t.connectionId || !t.connection) {
    // Overlay app-encryption flags from schemaJson so the UI shows 🔒.
    return withAppEncryptedFlags(t, await describePhysicalTable(t.name))
  }
  const cfg = t.connection.config as ConnectionConfig
  const tbl = t.externalTableName!
  const type = t.connection.type as ConnectionType

  if (type === 'postgresql') {
    return withPgClient(cfg, async c => {
      const r = await c.query(
        `SELECT column_name AS name, data_type AS type, is_nullable
           FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`, [tbl])
      return r.rows.map((x: any) => ({ name: x.name, type: x.type, nullable: x.is_nullable === 'YES', encrypted: x.type === 'bytea' }))
    })
  }
  if (type === 'mysql') {
    return withMysqlConn(cfg, async c => {
      const [rows]: any = await c.execute(
        `SELECT COLUMN_NAME AS name, DATA_TYPE AS type, IS_NULLABLE AS is_nullable
           FROM information_schema.COLUMNS WHERE TABLE_NAME = ? AND TABLE_SCHEMA = DATABASE() ORDER BY ORDINAL_POSITION`, [tbl])
      return rows.map((x: any) => ({ name: x.name, type: x.type, nullable: x.is_nullable === 'YES', encrypted: false }))
    })
  }
  if (type === 'oracle') {
    return withOracleConn(cfg, async c => {
      const r = await c.execute(
        `SELECT COLUMN_NAME AS "name", DATA_TYPE AS "type", NULLABLE AS "is_nullable"
           FROM ALL_TAB_COLUMNS WHERE TABLE_NAME = :t AND OWNER = USER ORDER BY COLUMN_ID`, [tbl.toUpperCase()])
      const dba = await c.execute(
        `SELECT COLUMN_NAME AS "n" FROM DBA_ENCRYPTED_COLUMNS WHERE TABLE_NAME = :t`, [tbl.toUpperCase()],
      ).catch(() => ({ rows: [] }))
      const enc = new Set((dba.rows as any[]).map(r => r.n.toLowerCase()))
      return (r.rows as any[]).map(x => ({
        name: x.name.toLowerCase(),
        type: x.type,
        nullable: x.is_nullable === 'Y',
        encrypted: enc.has(x.name.toLowerCase()),
      }))
    })
  }
  return []
}

// ─── COUNT ────────────────────────────────────────────────────
export async function count(t: RepoTableRow & { connection?: { type: string; config: any } | null }): Promise<number> {
  if (!t.connectionId || !t.connection) return localCount(t.name)
  const cfg = t.connection.config as ConnectionConfig
  const tbl = t.externalTableName!
  const type = t.connection.type as ConnectionType
  if (type === 'postgresql') {
    return withPgClient(cfg, async c => {
      const r = await c.query(`SELECT COUNT(*)::bigint AS n FROM "${tbl}"`)
      return Number(r.rows[0]?.n ?? 0)
    })
  }
  if (type === 'mysql') {
    return withMysqlConn(cfg, async c => {
      const [rows]: any = await c.execute(`SELECT COUNT(*) AS n FROM \`${tbl}\``)
      return Number(rows[0]?.n ?? 0)
    })
  }
  if (type === 'oracle') {
    return withOracleConn(cfg, async c => {
      const r = await c.execute(`SELECT COUNT(*) AS "n" FROM ${tbl.toUpperCase()}`)
      return Number((r.rows as any[])[0]?.n ?? 0)
    })
  }
  return 0
}

// ─── SELECT ────────────────────────────────────────────────────
export async function selectRows(
  t: RepoTableRow & { connection?: { type: string; config: any } | null },
  opts: { limit?: number; offset?: number } = {},
) {
  const limit = Math.max(1, Math.min(opts.limit ?? 50, 500))
  const offset = Math.max(0, opts.offset ?? 0)

  let rows: any[]
  if (!t.connectionId || !t.connection) {
    rows = await localSelect(t.name, opts)
  } else {
    const cfg = t.connection.config as ConnectionConfig
    const tbl = t.externalTableName!
    const type = t.connection.type as ConnectionType

    if (type === 'postgresql') {
      rows = await withPgClient(cfg, async c => {
        const r = await c.query(`SELECT * FROM "${tbl}" LIMIT ${limit} OFFSET ${offset}`)
        return r.rows
      })
    } else if (type === 'mysql') {
      rows = await withMysqlConn(cfg, async c => {
        const [rs]: any = await c.execute(`SELECT * FROM \`${tbl}\` LIMIT ${limit} OFFSET ${offset}`)
        return rs
      })
    } else if (type === 'oracle') {
      rows = await withOracleConn(cfg, async c => {
        const r = await c.execute(
          `SELECT * FROM ${tbl.toUpperCase()} OFFSET :o ROWS FETCH NEXT :l ROWS ONLY`,
          { o: offset, l: limit },
        )
        // Oracle returns column names uppercase but our describe(...)
        // lowercases them, so the UI's row[col.name] lookup fails. Map
        // every row's keys to lowercase to match.
        return ((r.rows as any[]) ?? []).map((row: any) => {
          const lower: Record<string, any> = {}
          for (const k of Object.keys(row)) lower[k.toLowerCase()] = row[k]
          return lower
        })
      })
    } else {
      rows = []
    }
  }

  // Decrypt app-encrypted columns on the way out (no-op + no key resolution
  // when the table has none). Covers local + remote reads.
  return decryptRows(t, rows as Array<Record<string, unknown>>)
}

// ─── WRITE OPS (insert/update/delete) — local only for now.
//     External writes are rejected because each remote engine has
//     different identifier-quoting + parameter-binding rules and
//     blindly running them risks data loss. UI surfaces this.
export async function insertRow(
  t: RepoTableRow & { connection?: { type: string; config: any } | null },
  payload: Record<string, unknown>,
) {
  if (t.connectionId) throw new Error('Insert into external connection not supported via this UI — use the source application.')
  // ENCRYPT-HOOK: encrypt app-encrypted columns before the local write.
  return localInsert(t.name, await encryptPayload(t, payload))
}
export async function updateRow(
  t: RepoTableRow & { connection?: { type: string; config: any } | null },
  id: number, payload: Record<string, unknown>,
) {
  if (t.connectionId) throw new Error('Update on external connection not supported.')
  // ENCRYPT-HOOK: encrypt app-encrypted columns before the local write.
  return localUpdate(t.name, id, await encryptPayload(t, payload))
}
export async function deleteRow(
  t: RepoTableRow & { connection?: { type: string; config: any } | null },
  id: number,
) {
  if (t.connectionId) throw new Error('Delete on external connection not supported.')
  return localDelete(t.name, id)
}
