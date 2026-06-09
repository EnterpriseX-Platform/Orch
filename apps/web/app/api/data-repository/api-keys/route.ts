// /api/data-repository/api-keys — RepoApiKey CRUD (TODO: full impl).
// Uses the existing RepoApiKey Prisma model so admins can mint keys
// scoped to /api/repo/* operations.
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'
import { ok, fail } from '../_helpers'

function genKey() {
  // 32 bytes = 64 hex chars; prefix the first 8 for display.
  const raw = crypto.randomBytes(32).toString('hex')
  return { key: raw, keyHash: crypto.createHash('sha256').update(raw).digest('hex'), keyPrefix: raw.slice(0, 8) }
}

export async function GET() {
  try {
    const keys = await prisma.repoApiKey.findMany({ orderBy: { createdAt: 'desc' } })
    const safe = keys.map((k) => ({
      id: k.id,
      name: k.name,
      key: `${k.keyPrefix}…`,
      permissions: k.permissions,
      isActive: k.isActive,
      expiresAt: k.expiresAt,
      createdAt: k.createdAt,
    }))
    return ok({ keys: safe })
  } catch (e: any) {
    return fail(String(e?.message ?? e), 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body?.name) return fail('Name required')
    const { key, keyHash, keyPrefix } = genKey()
    const created = await prisma.repoApiKey.create({
      data: {
        name: body.name,
        keyHash,
        keyPrefix,
        permissions: body.permissions ?? 'read',
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      },
    })
    // Return the plaintext key ONCE — admin must save it now.
    return ok({ key: { ...created, key } }, { status: 201 })
  } catch (e: any) {
    return fail(String(e?.message ?? e), 500)
  }
}
