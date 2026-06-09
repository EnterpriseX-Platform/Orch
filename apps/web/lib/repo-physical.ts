/**
 * Physical-table helpers for the Data Repository.
 *
 * Each RepoTable maps to a real Postgres/Oracle table with name
 * `repo_<slug>` (where <slug> = sanitized RepoTable.name). This file
 * provides:
 *
 *   ensurePhysicalTable(name, columns)  — CREATE TABLE if not exists
 *   describePhysicalTable(name)         — query information_schema
 *   addColumn(name, col)                — ALTER TABLE ADD COLUMN
 *   dropColumn(name, col)               — ALTER TABLE DROP COLUMN
 *   selectRows / insertRow / updateRow / deleteRow
 *
 * All identifiers are validated against /^[a-z][a-z0-9_]{0,62}$/ to
 * defend against SQL injection — Prisma's $executeRawUnsafe is a
 * raw passthrough so the column name has to be safe BEFORE we
 * interpolate it.
 */
import { prisma } from '@/lib/prisma'

const IDENT = /^[a-z][a-z0-9_]{0,62}$/

export type RepoColumn = {
  name: string
  /** SQL type string — text, integer, numeric, boolean, timestamptz, jsonb */
  type: string
  nullable?: boolean
  encrypted?: boolean
}

const ALLOWED_TYPES = new Set([
  'text', 'varchar', 'char',
  'integer', 'bigint', 'numeric', 'real', 'double precision',
  'boolean', 'date', 'timestamp', 'timestamptz', 'time',
  'json', 'jsonb', 'uuid', 'bytea',
])

/**
 * `repo_<slug>` is the physical table prefix so admins can scan
 * pg_tables and see which tables came from the data-repository UI.
 */
export function physicalTableName(slug: string): string {
  if (!IDENT.test(slug)) throw new Error(`Invalid table slug: ${slug}`)
  return `repo_${slug}`
}

function assertIdent(s: string, kind = 'identifier') {
  if (!IDENT.test(s)) throw new Error(`Invalid ${kind}: ${s}`)
}
function assertType(t: string) {
  const lower = t.toLowerCase().split('(')[0].trim()
  if (!ALLOWED_TYPES.has(lower)) throw new Error(`Disallowed column type: ${t}`)
}

export async function ensurePhysicalTable(slug: string, columns: RepoColumn[]) {
  const tbl = physicalTableName(slug)
  for (const c of columns) {
    assertIdent(c.name, 'column name')
    assertType(c.type)
  }
  // Always include surrogate id + audit timestamps so CRUD has a
  // stable PK even if the user doesn't pick one.
  const colDefs = [
    '"id" SERIAL PRIMARY KEY',
    ...columns.map(c => `"${c.name}" ${c.type}${c.nullable === false ? ' NOT NULL' : ''}`),
    '"created_at" TIMESTAMPTZ DEFAULT NOW()',
    '"updated_at" TIMESTAMPTZ DEFAULT NOW()',
  ].join(',\n  ')
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "${tbl}" (\n  ${colDefs}\n)`)
  return tbl
}

export async function dropPhysicalTable(slug: string) {
  const tbl = physicalTableName(slug)
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${tbl}"`)
}

export async function describePhysicalTable(slug: string) {
  const tbl = physicalTableName(slug)
  const rows = await prisma.$queryRawUnsafe<{ column_name: string; data_type: string; is_nullable: string }[]>(
    `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
    tbl,
  )
  return rows.map(r => ({
    name: r.column_name,
    type: r.data_type,
    nullable: r.is_nullable === 'YES',
    encrypted: r.data_type === 'bytea',
  }))
}

export async function countRows(slug: string): Promise<number> {
  const tbl = physicalTableName(slug)
  const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`SELECT COUNT(*)::bigint AS count FROM "${tbl}"`)
  return Number(rows[0]?.count ?? 0)
}

export async function selectRows(slug: string, opts: { limit?: number; offset?: number } = {}) {
  const tbl = physicalTableName(slug)
  const limit = Math.max(1, Math.min(opts.limit ?? 50, 500))
  const offset = Math.max(0, opts.offset ?? 0)
  return prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT * FROM "${tbl}" ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}`,
  )
}

export async function insertRow(slug: string, payload: Record<string, unknown>) {
  const tbl = physicalTableName(slug)
  const cols = Object.keys(payload)
  cols.forEach(c => assertIdent(c, 'column name'))
  if (!cols.length) throw new Error('Empty payload')
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ')
  const sql = `INSERT INTO "${tbl}" (${cols.map(c => `"${c}"`).join(', ')})
               VALUES (${placeholders}) RETURNING *`
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    sql,
    ...cols.map(c => payload[c] as any),
  )
  return rows[0]
}

export async function updateRow(slug: string, id: number, payload: Record<string, unknown>) {
  const tbl = physicalTableName(slug)
  const cols = Object.keys(payload)
  cols.forEach(c => assertIdent(c, 'column name'))
  if (!cols.length) throw new Error('Empty payload')
  const sets = cols.map((c, i) => `"${c}" = $${i + 1}`).join(', ')
  const sql = `UPDATE "${tbl}" SET ${sets}, "updated_at" = NOW()
               WHERE id = $${cols.length + 1} RETURNING *`
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    sql,
    ...cols.map(c => payload[c] as any),
    id,
  )
  return rows[0]
}

export async function deleteRow(slug: string, id: number) {
  const tbl = physicalTableName(slug)
  await prisma.$executeRawUnsafe(`DELETE FROM "${tbl}" WHERE id = $1`, id)
}
