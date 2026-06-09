import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createId } from '@paralleldrive/cuid2'
import { prisma } from '@/lib/prisma'
import { getUserId, resolveUserId } from '@/lib/auth'
import { z } from 'zod'

const createSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  projectId: z.string().min(1, 'Project is required'),
  scopes: z.array(z.string()).optional().default([]),
  expiresAt: z.string().datetime().optional().nullable(),
})

function hashKey(plain: string): string {
  return crypto.createHash('sha256').update(plain).digest('hex')
}

function generateKey(): { plain: string; prefix: string; hash: string } {
  // sk_ prefix + 40 random hex chars
  const random = crypto.randomBytes(24).toString('hex')
  const plain = `sk_${random}`
  const prefix = plain.slice(0, 11) // "sk_" + 8 chars
  return { plain, prefix, hash: hashKey(plain) }
}

// GET /api/api-keys?projectId=... — list keys (safe fields only)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const projectId = searchParams.get('projectId') || undefined
    const where: any = { revokedAt: null }
    if (projectId) where.projectId = projectId

    const keys = await prisma.apiKey.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        prefix: true,
        projectId: true,
        scopes: true,
        expiresAt: true,
        lastUsedAt: true,
        createdAt: true,
        createdBy: true,
        revokedAt: true,
      },
    })

    return NextResponse.json({ data: keys, total: keys.length })
  } catch (e) {
    console.error('Error listing api keys', e)
    return NextResponse.json({ error: 'Failed to list api keys' }, { status: 500 })
  }
}

// POST /api/api-keys — create new API key. Returns full plain key ONCE.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const input = createSchema.parse(body)

    const project = await prisma.project.findUnique({ where: { id: input.projectId } })
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const userId = await resolveUserId(getUserId(request))
    if (!userId) {
      return NextResponse.json(
        { error: 'No valid user found to attribute API key creation' },
        { status: 500 }
      )
    }
    const { plain, prefix, hash } = generateKey()

    const created = await prisma.apiKey.create({
      data: {
        id: createId(),
        name: input.name,
        keyHash: hash,
        prefix,
        projectId: input.projectId,
        scopes: input.scopes ?? [],
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        createdBy: userId,
      },
      select: {
        id: true,
        name: true,
        prefix: true,
        projectId: true,
        scopes: true,
        expiresAt: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ ...created, key: plain }, { status: 201 })
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: e.issues }, { status: 400 })
    }
    console.error('Error creating api key', e)
    return NextResponse.json({ error: 'Failed to create api key' }, { status: 500 })
  }
}
