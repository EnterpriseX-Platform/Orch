/**
 * /api/admin/encryption/key — app-level encryption KEY management (admin).
 *
 * Owns the KEK/DEK envelope state in SystemConfig (`security.encryption`,
 * stored isSecret+isReadOnly so the generic config editor can't touch it).
 * The raw key is NEVER returned — only status/version metadata.
 *
 *   GET                    → { enabled, activeKeyVersion, versions[], kekConfigured }
 *   POST { action }        → generate | rotate | enable | disable
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthPayload } from '@/lib/auth'
import { invalidateConfig } from '@/lib/system-config'
import {
  ENCRYPTION_CONFIG_KEY,
  getEncryptionState,
  mintWrappedDEK,
  clearKeyCache,
  getKEK,
  type EncryptionState,
} from '@/lib/encryption-keys'

function requireAdmin(req: NextRequest) {
  const payload = getAuthPayload(req)
  if (!payload) return { error: 'Unauthorized', status: 401 as const }
  const roles = (payload as { roles?: string[] }).roles || []
  if (!roles.includes('admin') && !roles.includes('superadmin')) {
    return { error: 'Forbidden — admin role required', status: 403 as const }
  }
  return { user: payload }
}

// Persist the envelope state. Writes directly (bypassing setConfig's
// isReadOnly guard) because the key state is intentionally read-only to the
// generic config editor — only this route may change it.
async function persistState(state: EncryptionState, userId: string) {
  const existing = await prisma.systemConfig.findFirst({
    where: { key: ENCRYPTION_CONFIG_KEY, projectId: null },
  })
  if (existing) {
    await prisma.systemConfig.update({
      where: { id: existing.id },
      data: { value: state as never, isSecret: true, isReadOnly: true, updatedBy: userId },
    })
  } else {
    await prisma.systemConfig.create({
      data: {
        key: ENCRYPTION_CONFIG_KEY,
        value: state as never,
        projectId: null,
        isSecret: true,
        isReadOnly: true,
        updatedBy: userId,
      },
    })
  }
  invalidateConfig(ENCRYPTION_CONFIG_KEY)
  clearKeyCache()
}

export async function GET(req: NextRequest) {
  const auth = requireAdmin(req)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let kekConfigured = false
  try {
    getKEK()
    kekConfigured = !!process.env.ORCH_ENCRYPTION_KEK // true only when the real secret is set
  } catch {
    kekConfigured = false
  }

  const st = await getEncryptionState()
  return NextResponse.json({
    configured: !!st && Object.keys(st.keys ?? {}).length > 0,
    enabled: st?.enabled ?? false,
    activeKeyVersion: st?.activeKeyVersion ?? null,
    versions: st ? Object.keys(st.keys).map(Number).sort((a, b) => a - b) : [],
    kekConfigured,
  })
}

export async function POST(req: NextRequest) {
  const auth = requireAdmin(req)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const userId = (auth.user as { userId?: string }).userId || 'system'

  // KEK must be usable before we mint DEKs (else we'd store keys we can't unwrap).
  try {
    getKEK()
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'KEK unavailable' }, { status: 400 })
  }

  let body: { action?: string } = {}
  try {
    body = await req.json()
  } catch {
    /* empty body */
  }
  const action = String(body.action || '')

  const st: EncryptionState =
    (await getEncryptionState()) || { enabled: false, activeKeyVersion: 0, keys: {} }
  const hasKeys = Object.keys(st.keys).length > 0

  switch (action) {
    case 'generate':
    case 'rotate': {
      if (action === 'rotate' && !hasKeys) {
        return NextResponse.json({ error: 'No key to rotate — generate one first' }, { status: 400 })
      }
      const nextV = (st.activeKeyVersion || 0) + 1
      st.keys[String(nextV)] = mintWrappedDEK()
      st.activeKeyVersion = nextV
      st.enabled = true
      await persistState(st, userId)
      return NextResponse.json({ ok: true, activeKeyVersion: nextV, enabled: true })
    }
    case 'enable':
    case 'disable': {
      if (!hasKeys) return NextResponse.json({ error: 'Generate a key first' }, { status: 400 })
      st.enabled = action === 'enable'
      await persistState(st, userId)
      return NextResponse.json({ ok: true, enabled: st.enabled })
    }
    default:
      return NextResponse.json({ error: `Unknown action "${action}"` }, { status: 400 })
  }
}
