import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getTenantContext, featureGuard, isForeign } from '@/lib/tenant'

// DELETE /api/api-keys/[id] — revoke a key (soft delete via revokedAt)
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const tctx = await getTenantContext(_req)
  const blocked = featureGuard(tctx, 'projects')
  if (blocked) return blocked
  try {
    const { id } = await ctx.params
    const existing = await prisma.apiKey.findUnique({ where: { id } })
    if (!existing || isForeign(tctx, existing)) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 })
    }
    if (existing.revokedAt) {
      return NextResponse.json({ ok: true, alreadyRevoked: true })
    }
    await prisma.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('Error revoking api key', e)
    return NextResponse.json({ error: 'Failed to revoke api key' }, { status: 500 })
  }
}
