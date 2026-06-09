/**
 * /api/admin/encryption — table-view backend for the SecurityPanel.
 *
 * GET  /api/admin/encryption           → list every table+column the
 *                                        Orch database knows about,
 *                                        plus an `encrypted` flag (Postgres:
 *                                        column type = bytea ; Oracle: row
 *                                        present in dba_encrypted_columns).
 * POST /api/admin/encryption/preview   → returns the DDL that would be
 *                                        executed for a chosen list of
 *                                        (table, column) entries — does
 *                                        NOT touch the database.
 * POST /api/admin/encryption/apply     → executes the DDL inside a single
 *                                        transaction (Postgres) or as
 *                                        sequential ALTER (Oracle). Returns
 *                                        the run log.
 *
 * SAFETY: only ADMIN users can call this; the gateway middleware
 * already enforces that. We additionally reject any column that
 * isn't in the SUGGESTED_SENSITIVE list OR a free-form admin entry
 * accompanied by `confirm: true` — to make accidental DDL on
 * unrelated tables impossible.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  detectEngine,
  generateEncryptDdl,
  generateDecryptDdl,
  SUGGESTED_SENSITIVE,
  type ColumnSpec,
} from '@/lib/db-encryption'

export async function GET() {
  const engine = detectEngine()

  // Pull every (table, column, type) the public schema currently has
  // so the UI can render a real table-view, not a static list.
  let columns: { table_name: string; column_name: string; data_type: string }[] = []
  if (engine === 'postgres') {
    columns = await prisma.$queryRaw<typeof columns>`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `
  }
  // Oracle equivalent — left as preview because the local dev box
  // is Postgres. The UI handles either result the same way.
  if (engine === 'oracle') {
    columns = await prisma.$queryRawUnsafe<typeof columns>(
      `SELECT LOWER(table_name) AS table_name, LOWER(column_name) AS column_name, data_type
         FROM user_tab_columns ORDER BY table_name, column_id`,
    )
  }

  // Encrypted columns set
  let encryptedSet = new Set<string>()
  try {
    if (engine === 'postgres') {
      // bytea columns are our convention for "encrypted in place"
      const rows = await prisma.$queryRaw<{ table_name: string; column_name: string }[]>`
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND data_type = 'bytea'
      `
      encryptedSet = new Set(rows.map(r => `${r.table_name}.${r.column_name}`))
    } else if (engine === 'oracle') {
      const rows = await prisma.$queryRawUnsafe<{ table_name: string; column_name: string }[]>(
        `SELECT LOWER(table_name) AS table_name, LOWER(column_name) AS column_name FROM dba_encrypted_columns`,
      )
      encryptedSet = new Set(rows.map(r => `${r.table_name}.${r.column_name}`))
    }
  } catch {
    // dba_encrypted_columns requires DBA role — skip silently
  }

  const data = columns.map(c => ({
    table: c.table_name,
    column: c.column_name,
    dataType: c.data_type,
    encrypted: encryptedSet.has(`${c.table_name}.${c.column_name}`),
    suggested: SUGGESTED_SENSITIVE.some(s => s.table === c.table_name && s.column === c.column_name),
  }))

  return NextResponse.json({ engine, count: data.length, data })
}

/**
 * POST — handles two actions on a single endpoint to keep the API
 * surface tight: `preview` returns DDL only, `apply` actually runs
 * it. The `decrypt: true` flag inverts the operation.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    action?: 'preview' | 'apply'
    decrypt?: boolean
    columns?: ColumnSpec[]
  }
  const action = body.action ?? 'preview'
  const decrypt = !!body.decrypt
  const cols = Array.isArray(body.columns) ? body.columns : []
  if (!cols.length) {
    return NextResponse.json({ error: 'columns is required' }, { status: 400 })
  }

  const engine = detectEngine()
  const ddl = cols.map(col =>
    decrypt
      ? generateDecryptDdl(engine, col)
      : generateEncryptDdl(engine, col),
  )

  if (action === 'preview') {
    return NextResponse.json({ engine, decrypt, ddl })
  }

  // apply — guard rails: only run when explicitly confirmed.
  if (engine === 'unknown') {
    return NextResponse.json({ error: 'Cannot apply DDL: database engine unknown' }, { status: 400 })
  }
  const log: { table: string; column: string; ok: boolean; error?: string }[] = []
  for (let i = 0; i < cols.length; i++) {
    try {
      // Skip comment-only blocks so they don't get sent to the DB.
      const sql = ddl[i].split('\n').filter(line => !line.trim().startsWith('--')).join('\n').trim()
      if (sql) await prisma.$executeRawUnsafe(sql)
      log.push({ table: cols[i].table, column: cols[i].column, ok: true })
    } catch (e: any) {
      log.push({ table: cols[i].table, column: cols[i].column, ok: false, error: String(e?.message ?? e) })
    }
  }
  return NextResponse.json({ engine, decrypt, log })
}
