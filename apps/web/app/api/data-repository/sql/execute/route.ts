// POST /api/data-repository/sql/execute — run an ad-hoc SQL statement
// against a saved connection. Body: { connectionId, sql, params? }.
// Returns: { columns, rows, rowCount, durationMs }.
//
// Safety: every statement runs inside a single connection that is
// closed afterwards; we don't auto-commit DDL across multiple
// statements. Caller is expected to pre-validate intent (read-only
// vs write) — admin role required by the page-level auth.
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  withPgClient, withMysqlConn, withOracleConn,
  type ConnectionConfig, type ConnectionType,
} from '@/lib/repo-connections'
import { ok, fail } from '../../_helpers'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { connectionId, sql, params } = body || {}
    if (!connectionId || !sql) return fail('connectionId and sql required')

    const conn = await prisma.repoConnection.findUnique({ where: { id: connectionId } })
    if (!conn) return fail('Connection not found', 404)

    const cfg = conn.config as ConnectionConfig
    const t0 = Date.now()
    let result: { columns: string[]; rows: any[]; rowCount: number }

    if (conn.type === 'postgresql') {
      result = await withPgClient(cfg, async (c) => {
        const r = await c.query(sql, params ?? [])
        return {
          columns: r.fields.map((f: any) => f.name),
          rows: r.rows,
          rowCount: r.rowCount ?? r.rows.length,
        }
      })
    } else if (conn.type === 'mysql') {
      result = await withMysqlConn(cfg, async (c) => {
        const [rows, fields]: any = await c.query(sql, params ?? [])
        const cols = Array.isArray(fields) ? fields.map((f: any) => f.name) : []
        const rs = Array.isArray(rows) ? rows : []
        return { columns: cols, rows: rs, rowCount: rs.length }
      })
    } else if (conn.type === 'oracle') {
      result = await withOracleConn(cfg, async (c) => {
        const r = await c.execute(sql, params ?? {}, { autoCommit: true })
        const cols = (r.metaData ?? []).map((m: any) => m.name?.toLowerCase() ?? m.name)
        const rs = Array.isArray(r.rows) ? r.rows : []
        return { columns: cols, rows: rs, rowCount: r.rowsAffected ?? rs.length }
      })
    } else {
      return fail(`Unsupported connection type: ${conn.type}`)
    }

    return ok({ ...result, durationMs: Date.now() - t0 })
  } catch (e: any) {
    return fail(String(e?.message ?? e), 500)
  }
}
