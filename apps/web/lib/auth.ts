// ==========================================
// Auth Utility — extract userId from JWT
// ==========================================

import { NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'
import { prisma } from './prisma'

const JWT_SECRET = process.env.JWT_SECRET || 'orch-secret-key'

// System user ID fallback (used when no auth token or in dev)
const SYSTEM_USER_ID = 'system'

export interface JwtPayload {
  userId: string
  username: string
  roles: string[]
}

/**
 * Extract user ID from JWT in Authorization header.
 * Returns 'system' as fallback if no token or invalid.
 *
 * This string might NOT be a valid User.id — for writes that FK to
 * users, call `resolveUserId()` instead so invalid ids fall back to
 * an existing admin.
 */
export function getUserId(request: NextRequest): string {
  try {
    const authHeader = request.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token) return SYSTEM_USER_ID

    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload
    return decoded.userId || SYSTEM_USER_ID
  } catch {
    return SYSTEM_USER_ID
  }
}

// Process-local cache for the resolved fallback User.id — avoids a
// DB query on every internal broker → web write. Invalidated only on
// process restart; that's fine because users rarely get deleted.
let _systemUserIdCache: string | null = null

async function loadSystemUserId(): Promise<string | null> {
  // Prefer an exact `system` username if one exists
  const exact = await prisma.user.findFirst({ where: { username: 'system' } })
  if (exact) return exact.id
  // Otherwise, the oldest admin user (deterministic)
  const admin = await prisma.user.findFirst({
    where: { roles: { has: 'admin' } },
    orderBy: { createdAt: 'asc' },
  })
  return admin?.id ?? null
}

/**
 * Return a User.id that is GUARANTEED to exist in the users table,
 * so FK-backed writes (audit_logs, message_formats, etc.) don't fail.
 *
 * Rules:
 *   1. If `raw` is a non-placeholder string AND exists in DB → return it
 *   2. Else return the first admin user id (cached in-process)
 *   3. Else null (caller should decide — usually means empty DB)
 */
export async function resolveUserId(raw: unknown): Promise<string | null> {
  if (typeof raw === 'string' && raw && raw !== 'system' && raw !== 'anonymous') {
    const found = await prisma.user.findUnique({ where: { id: raw }, select: { id: true } })
    if (found) return raw
  }
  if (!_systemUserIdCache) {
    _systemUserIdCache = await loadSystemUserId()
  }
  return _systemUserIdCache
}

/**
 * Extract full JWT payload from Authorization header.
 * Returns null if no token or invalid.
 */
export function getAuthPayload(request: NextRequest): JwtPayload | null {
  try {
    const authHeader = request.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token) return null

    return jwt.verify(token, JWT_SECRET) as JwtPayload
  } catch {
    return null
  }
}
