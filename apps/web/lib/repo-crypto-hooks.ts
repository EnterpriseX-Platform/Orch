/**
 * repo-crypto-hooks.ts — schema-aware bridge between the Data Repository
 * data path (repo-router) and the app-level AES-GCM crypto primitives.
 *
 * A column is "app-encrypted" when its entry in RepoTable.schemaJson carries
 * `appEncrypted: true`. On WRITE we encrypt those columns with the ACTIVE key
 * version; on READ we decrypt with the key version embedded in each token
 * (so rotation just works). Everything here is a no-op with zero key
 * resolution when a table has no app-encrypted columns.
 *
 * Scope: consistent only for data written/read through Orch's API path
 * (and local repo tables). External rows written directly by other systems
 * are passed through untouched on read (decryptValue ignores non-tokens).
 */
import { decryptValue, encryptValue, isEncrypted, type KeyResolver } from '@/lib/app-crypto'
import { getActiveEncryptionKey, getEncryptionState, makeKeyResolver } from '@/lib/encryption-keys'
import { selectRows as localSelect, updateRow as localUpdate } from '@/lib/repo-physical'

type SchemaCol = { name: string; type?: string; appEncrypted?: boolean; keyVersion?: number }
export type TableWithSchema = { schemaJson?: unknown }

/** Column names flagged app-encrypted in the table's schemaJson. */
export function encryptedColumnsOf(t: TableWithSchema): string[] {
  const cols = Array.isArray(t.schemaJson) ? (t.schemaJson as SchemaCol[]) : []
  return cols.filter((c) => c && typeof c === 'object' && c.appEncrypted).map((c) => c.name)
}

/**
 * Decrypt app-encrypted columns across a result set (read path). No-op + no
 * key resolution when the table has no encrypted columns. Resolves the key
 * set once per call. decryptValue passes non-token values through unchanged
 * (so plaintext / externally-written rows stay readable) and throws on a
 * tampered/unresolvable token (never leaks ciphertext as plaintext).
 */
export async function decryptRows<R extends Record<string, unknown>>(
  t: TableWithSchema,
  rows: R[],
): Promise<R[]> {
  const cols = encryptedColumnsOf(t)
  if (cols.length === 0 || !Array.isArray(rows) || rows.length === 0) return rows
  const state = await getEncryptionState()
  if (!state) return rows // no key state configured → leave values as-is rather than fail reads
  const resolve: KeyResolver = makeKeyResolver(state)
  for (const row of rows) {
    if (!row) continue
    for (const col of cols) {
      const v = (row as Record<string, unknown>)[col]
      if (isEncrypted(v)) (row as Record<string, unknown>)[col] = decryptValue(v, resolve)
    }
  }
  return rows
}

/**
 * Encrypt app-encrypted columns present in an insert/update payload (write
 * path), using the ACTIVE key version. Fails closed: if the table has an
 * encrypted column to write but encryption isn't enabled, getActiveEncryptionKey
 * throws (better than silently storing plaintext in an "encrypted" column).
 */
export async function encryptPayload(
  t: TableWithSchema,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const cols = encryptedColumnsOf(t).filter((c) => c in payload)
  if (cols.length === 0) return payload
  const { key, version } = await getActiveEncryptionKey()
  const out: Record<string, unknown> = { ...payload }
  for (const col of cols) out[col] = encryptValue(out[col], key, version)
  return out
}

/** Overlay appEncrypted / keyVersion from schemaJson onto a fresh column
 *  list from the physical DB, so /structure + the UI reflect app-encryption
 *  (kept separate from the DB-native `encrypted` flag). */
export function withAppEncryptedFlags<C extends { name: string; appEncrypted?: boolean; keyVersion?: number }>(
  t: TableWithSchema,
  cols: C[],
): C[] {
  const byName = new Map<string, SchemaCol>()
  if (Array.isArray(t.schemaJson)) {
    for (const c of t.schemaJson as SchemaCol[]) if (c && c.name) byName.set(c.name, c)
  }
  if (byName.size === 0) return cols
  return cols.map((c) => {
    const s = byName.get(c.name)
    return s?.appEncrypted ? { ...c, appEncrypted: true, keyVersion: s.keyVersion } : c
  })
}

const MIGRATE_PAGE = 500

/**
 * Encrypt one column across ALL rows of a LOCAL table (idempotent — skips
 * NULLs and values that are already enc: tokens). Returns the count migrated.
 * Paginates by offset; encrypting a value never changes row count/order.
 */
export async function migrateColumnEncrypt(tableName: string, column: string): Promise<number> {
  const { key, version } = await getActiveEncryptionKey()
  let migrated = 0
  let offset = 0
  for (;;) {
    const rows = (await localSelect(tableName, { limit: MIGRATE_PAGE, offset })) as Array<Record<string, unknown>>
    if (!rows.length) break
    for (const row of rows) {
      const v = row[column]
      if (v === null || v === undefined || isEncrypted(v)) continue
      await localUpdate(tableName, Number(row.id), { [column]: encryptValue(v, key, version) })
      migrated++
    }
    if (rows.length < MIGRATE_PAGE) break
    offset += MIGRATE_PAGE
  }
  return migrated
}

/** Reverse of migrateColumnEncrypt: decrypt enc: tokens back to plaintext. */
export async function migrateColumnDecrypt(tableName: string, column: string): Promise<number> {
  const state = await getEncryptionState()
  if (!state) throw new Error('No encryption key state — cannot decrypt.')
  const resolve = makeKeyResolver(state)
  let migrated = 0
  let offset = 0
  for (;;) {
    const rows = (await localSelect(tableName, { limit: MIGRATE_PAGE, offset })) as Array<Record<string, unknown>>
    if (!rows.length) break
    for (const row of rows) {
      const v = row[column]
      if (!isEncrypted(v)) continue
      await localUpdate(tableName, Number(row.id), { [column]: decryptValue(v, resolve) })
      migrated++
    }
    if (rows.length < MIGRATE_PAGE) break
    offset += MIGRATE_PAGE
  }
  return migrated
}
