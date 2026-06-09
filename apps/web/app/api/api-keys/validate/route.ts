import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'

// POST /api/api-keys/validate — broker calls this to validate an API key
// Body: { key: "sk_..." }  OR  { keyHash: "..." }
// Returns: { valid: true, id, projectId, scopes, expiresAt } or { valid: false, reason }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { key, keyHash } = body as { key?: string; keyHash?: string }

    let hash = keyHash
    if (!hash && typeof key === 'string') {
      hash = crypto.createHash('sha256').update(key).digest('hex')
    }
    if (!hash) {
      return NextResponse.json({ valid: false, reason: 'missing_key' }, { status: 400 })
    }

    const record = await prisma.apiKey.findUnique({ where: { keyHash: hash } })
    if (!record) {
      return NextResponse.json({ valid: false, reason: 'not_found' })
    }
    if (record.revokedAt) {
      return NextResponse.json({ valid: false, reason: 'revoked' })
    }
    if (record.expiresAt && record.expiresAt < new Date()) {
      return NextResponse.json({ valid: false, reason: 'expired' })
    }

    // Touch lastUsedAt (best-effort, non-blocking)
    prisma.apiKey
      .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {})

    return NextResponse.json({
      valid: true,
      id: record.id,
      projectId: record.projectId,
      scopes: record.scopes,
      expiresAt: record.expiresAt,
      prefix: record.prefix,
    })
  } catch (e) {
    console.error('Error validating api key', e)
    return NextResponse.json({ valid: false, reason: 'error' }, { status: 500 })
  }
}
