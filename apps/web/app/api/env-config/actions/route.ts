import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const bulkUpdateSchema = z.object({
  updates: z.array(z.object({
    key: z.string().min(1),
    value: z.string(),
  })),
})

// POST /api/env-config/actions - Bulk update configs (action=bulk-update)
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const action = searchParams.get('action')

    if (action === 'bulk-update') {
      const body = await request.json()
      const { updates } = bulkUpdateSchema.parse(body)

      // Update each config sequentially (upsert with nullable composite
      // unique is not supported in Prisma v6, so do findFirst + update/create)
      const results: Array<Awaited<ReturnType<typeof prisma.systemConfig.create>>> = []
      for (const { key, value } of updates) {
        const existing = await prisma.systemConfig.findFirst({
          where: { key, projectId: null },
        })
        const row = existing
          ? await prisma.systemConfig.update({
              where: { id: existing.id },
              data: { value, updatedAt: new Date() },
            })
          : await prisma.systemConfig.create({
              data: { key, value, category: 'GENERAL' },
            })
        results.push(row)
      }

      return NextResponse.json({ 
        success: true, 
        updated: results.length,
        data: results 
      })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.issues }, { status: 400 })
    }
    console.error('Error updating configs:', error)
    return NextResponse.json({ error: 'Failed to update configuration' }, { status: 500 })
  }
}
