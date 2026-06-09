import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/settings
export async function GET() {
  try {
    const settings = await prisma.systemConfig.findMany({
      where: {
        key: {
          in: [
            'DOMAIN_CONFIG',
            'BASE_PATH_CONFIG', 
            'UPSTREAM_URLS',
            'FLOW_DEFAULTS'
          ]
        }
      }
    })
    
    return NextResponse.json({ data: settings })
  } catch (error) {
    console.error('Settings fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    )
  }
}

// POST /api/settings
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { key, value, description } = body
    
    const existing = await prisma.systemConfig.findFirst({
      where: { key, projectId: null }
    })
    const setting = existing
      ? await prisma.systemConfig.update({
          where: { id: existing.id },
          data: { value, description, updatedAt: new Date() },
        })
      : await prisma.systemConfig.create({
          data: { key, value, description },
        })

    return NextResponse.json({ data: setting })
  } catch (error) {
    console.error('Settings save error:', error)
    return NextResponse.json(
      { error: 'Failed to save settings' },
      { status: 500 }
    )
  }
}
