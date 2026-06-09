import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/settings/oidc - Get OIDC configuration
export async function GET(request: NextRequest) {
  try {
    const config = await prisma.systemConfig.findFirst({
      where: { key: 'oidc_config', projectId: null },
    })

    if (!config) {
      // Return default config
      return NextResponse.json({
        data: {
          enabled: false,
          provider: '',
          clientId: '',
          clientSecret: '',
          issuerUrl: '',
          authorizationEndpoint: '',
          tokenEndpoint: '',
          userinfoEndpoint: '',
          jwksUri: '',
          scope: 'openid profile email',
          usernameClaim: 'preferred_username',
          emailClaim: 'email',
          nameClaim: 'name',
          redirectUri: '',
        }
      })
    }

    return NextResponse.json({ data: config.value })
  } catch (error) {
    console.error('Error fetching OIDC config:', error)
    return NextResponse.json({ error: 'Failed to fetch OIDC configuration' }, { status: 500 })
  }
}

// POST /api/settings/oidc - Update OIDC configuration
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const existing = await prisma.systemConfig.findFirst({
      where: { key: 'oidc_config', projectId: null },
    })
    const config = existing
      ? await prisma.systemConfig.update({
          where: { id: existing.id },
          data: { value: body, updatedAt: new Date() },
        })
      : await prisma.systemConfig.create({
          data: {
            key: 'oidc_config',
            value: body,
            category: 'SECURITY',
            description: 'OIDC/SSO Configuration',
          },
        })

    return NextResponse.json({ data: config.value })
  } catch (error) {
    console.error('Error saving OIDC config:', error)
    return NextResponse.json({ error: 'Failed to save OIDC configuration' }, { status: 500 })
  }
}
