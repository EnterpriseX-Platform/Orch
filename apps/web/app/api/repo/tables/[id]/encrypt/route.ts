/**
 * /api/repo/tables/:id/encrypt — APP-LEVEL column encryption (AES-256-GCM).
 *
 * Body: { column, decrypt?, action?: 'preview' | 'apply' }
 *
 * Replaces the old Oracle/pgcrypto TDE DDL path (which silently failed on
 * FK columns — ORA-28335). Encryption now happens in Orch's API data
 * path: repo-router encrypts on write + decrypts on read via the column
 * flags in RepoTable.schemaJson (`appEncrypted` / `keyVersion`).
 *
 *   apply (encrypt) → flag the column + migrate existing LOCAL rows
 *                     (read → encrypt → write, idempotent: skips enc: tokens)
 *   apply (decrypt) → reverse
 *   preview         → summary { keyVersion, willMigrateRows } (no DDL)
 *
 * External tables get the flag only — Orch encrypts only its own writes;
 * rows written directly by other systems are passed through on read.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { describe as routerDescribe, count as routerCount } from '@/lib/repo-router'
import { migrateColumnEncrypt, migrateColumnDecrypt } from '@/lib/repo-crypto-hooks'
import { getActiveEncryptionKey } from '@/lib/encryption-keys'

// Columns that must never be app-encrypted: a random-IV ciphertext breaks
// equality / range / join on a PK or audit-timestamp column. Mirrors the
// client-side disable the Data Repository UI also enforces.
const PROTECTED = new Set(['id', 'created_at', 'updated_at', 'createdat', 'updatedat'])

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const t = await prisma.repoTable.findUnique({
      where: { id },
      include: { connection: true },
    })
    if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const body = (await req.json()) as { column?: string; decrypt?: boolean; action?: 'preview' | 'apply' }
    const column = body.column
    if (!column) return NextResponse.json({ error: 'column required' }, { status: 400 })
    const decrypt = !!body.decrypt
    const action = body.action ?? 'preview'
    const isLocal = !t.connectionId

    // Column must exist; protect key / audit columns from encryption.
    const cols = await routerDescribe(t as any)
    const target = (cols as any[]).find((c) => c.name === column)
    if (!target) return NextResponse.json({ error: `Column ${column} not found` }, { status: 404 })
    if (!decrypt && PROTECTED.has(column.toLowerCase())) {
      return NextResponse.json(
        { error: `Column "${column}" is a key/audit column and can't be encrypted (random-IV ciphertext breaks lookups).` },
        { status: 400 },
      )
    }

    // Active key version doubles as the "is encryption enabled?" gate.
    let keyVersion: number | null = null
    try {
      keyVersion = (await getActiveEncryptionKey()).version
    } catch (e) {
      if (!decrypt) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : 'App encryption is not enabled — configure a key in System Settings → Encryption.' },
          { status: 400 },
        )
      }
    }

    if (action === 'preview') {
      const willMigrateRows = isLocal ? await routerCount(t as any).catch(() => 0) : 0
      return NextResponse.json({
        column,
        decrypt,
        local: isLocal,
        keyVersion,
        willMigrateRows,
        note: isLocal
          ? undefined
          : 'External table: only Orch-written rows get encrypted; rows written by other systems are left as-is.',
      })
    }

    // ── apply ───────────────────────────────────────────────────────────
    // Persist the schemaJson with the column's app-encryption flag flipped.
    // Prefer the stored schema (keeps other columns' flags), else a fresh
    // describe.
    const baseSchema: any[] = Array.isArray(t.schemaJson) && (t.schemaJson as any[]).length
      ? (t.schemaJson as any[]).map((c) => ({ ...c }))
      : (cols as any[]).map((c) => ({ ...c }))
    let scol = baseSchema.find((c) => c.name === column)
    if (!scol) {
      scol = { name: target.name, type: target.type, nullable: target.nullable }
      baseSchema.push(scol)
    }

    let migratedRows = 0
    if (decrypt) {
      if (isLocal) migratedRows = await migrateColumnDecrypt(t.name, column)
      scol.appEncrypted = false
      delete scol.keyVersion
    } else {
      if (isLocal) migratedRows = await migrateColumnEncrypt(t.name, column)
      scol.appEncrypted = true
      scol.keyVersion = keyVersion
    }

    await prisma.repoTable.update({
      where: { id },
      data: { schemaJson: baseSchema as any, lastAlterAt: new Date() },
    })

    return NextResponse.json({
      applied: true,
      column,
      decrypt,
      local: isLocal,
      appEncrypted: !decrypt,
      keyVersion: decrypt ? null : keyVersion,
      migratedRows,
      schema: baseSchema,
      note: isLocal
        ? undefined
        : 'External table: flag set — Orch encrypts only its own writes here.',
    })
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 })
  }
}
