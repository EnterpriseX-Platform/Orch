/**
 * /api/message/formats/:id/call-sites — list ScreenButtons that
 * trigger this MessageFormat. Used by the MessageFormat modal's
 * Call Sites section so admins can see "where is this format
 * invoked from" without flipping back and forth between pages.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: messageFormatId } = await params
  const buttons = await prisma.screenButton.findMany({
    where: { messageFormatId },
    include: {
      screen: {
        include: {
          client: { select: { id: true, name: true, appCode: true } },
        },
      },
    },
    orderBy: [{ buttonLabel: 'asc' }],
  })
  return NextResponse.json({ data: buttons })
}
