import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthPayload } from '@/lib/auth'

// GET /api/admin/system-config/history?key=<k>&limit=50
export async function GET(req: NextRequest) {
  const payload = getAuthPayload(req)
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const roles = payload.roles || []
  if (!roles.includes('admin') && !roles.includes('superadmin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = req.nextUrl
  const key = searchParams.get('key') || undefined
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 500)

  const rows = await prisma.systemConfigHistory.findMany({
    where: key ? { configKey: key } : undefined,
    orderBy: { changedAt: 'desc' },
    take: limit,
  })

  return NextResponse.json({ data: rows, total: rows.length })
}
