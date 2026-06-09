import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

// Legacy env-config API — superseded by /api/admin/system-config.
// Kept for back-compat with the existing env-config UI page.

const CATEGORY_ENUM = [
  'GENERAL',
  'BACKEND_URLS',
  'KAFKA',
  'AUDIT',
  'SECURITY',
  'PERFORMANCE',
  'ALERTS',
  'FEATURE_FLAGS',
  'UI_BRANDING',
  'PROJECT',
] as const

// Map legacy short names → new enum
function toCategoryEnum(s: string | undefined): (typeof CATEGORY_ENUM)[number] {
  const v = (s || '').toLowerCase()
  switch (v) {
    case 'database':    return 'GENERAL'
    case 'kafka':       return 'KAFKA'
    case 'security':    return 'SECURITY'
    case 'integration': return 'BACKEND_URLS'
    case 'system':      return 'GENERAL'
    default:
      return (CATEGORY_ENUM as readonly string[]).includes(v.toUpperCase())
        ? (v.toUpperCase() as (typeof CATEGORY_ENUM)[number])
        : 'GENERAL'
  }
}

// GET /api/env-config
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const category = searchParams.get('category') || undefined

    const where: Record<string, unknown> = {}
    if (category) where.category = toCategoryEnum(category)

    const configs = await prisma.systemConfig.findMany({
      where,
      orderBy: [{ category: 'asc' }, { key: 'asc' }],
    })

    const envConfigs = configs.map((c) => ({
      id: c.id,
      key: c.key,
      value: typeof c.value === 'string' ? c.value : JSON.stringify(c.value),
      description: c.description,
      category: String(c.category).toLowerCase(),
      isSecret:
        c.isSecret ||
        c.key.toLowerCase().includes('secret') ||
        c.key.toLowerCase().includes('password') ||
        c.key.toLowerCase().includes('api_key') ||
        c.key.toLowerCase().includes('token'),
      updatedAt: c.updatedAt.toISOString(),
    }))

    return NextResponse.json({ data: envConfigs })
  } catch (error) {
    console.error('Error fetching env configs:', error)
    return NextResponse.json({ error: 'Failed to fetch configuration' }, { status: 500 })
  }
}

const updateConfigSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
  description: z.string().optional(),
  category: z.string().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validated = updateConfigSchema.parse(body)
    const category = toCategoryEnum(validated.category)

    const existing = await prisma.systemConfig.findFirst({
      where: { key: validated.key, projectId: null },
    })
    const config = existing
      ? await prisma.systemConfig.update({
          where: { id: existing.id },
          data: {
            value: validated.value,
            description: validated.description,
            category,
            updatedAt: new Date(),
          },
        })
      : await prisma.systemConfig.create({
          data: {
            key: validated.key,
            value: validated.value,
            description: validated.description,
            category,
          },
        })

    return NextResponse.json({ data: config })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.issues }, { status: 400 })
    }
    console.error('Error saving config:', error)
    return NextResponse.json({ error: 'Failed to save configuration' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const key = searchParams.get('key')
    if (!key) return NextResponse.json({ error: 'Key is required' }, { status: 400 })

    const existing = await prisma.systemConfig.findFirst({
      where: { key, projectId: null },
    })
    if (existing) {
      await prisma.systemConfig.delete({ where: { id: existing.id } })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting config:', error)
    return NextResponse.json({ error: 'Failed to delete configuration' }, { status: 500 })
  }
}
