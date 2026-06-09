import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const authConfigSchema = z.object({
  authScheme: z.enum(['NONE', 'JWT', 'API_KEY', 'OAUTH2', 'BASIC', 'CUSTOM']).default('NONE'),
  // JWT
  jwtIssuer: z.string().optional(),
  jwtAudience: z.string().optional(),
  jwtClaims: z.record(z.string(), z.any()).optional(),
  jwtAlgorithm: z.string().optional(),
  // OAuth2
  oauth2AuthUrl: z.string().url().optional(),
  oauth2TokenUrl: z.string().url().optional(),
  oauth2Scopes: z.array(z.string()).optional(),
  oauth2Flow: z.enum(['AUTHORIZATION_CODE', 'CLIENT_CREDENTIALS', 'IMPLICIT', 'PASSWORD']).optional(),
  // API Key
  apiKeyLocation: z.enum(['HEADER', 'QUERY', 'COOKIE']).optional(),
  apiKeyName: z.string().optional(),
  apiKeyValue: z.string().optional(),
  // Basic
  basicUsername: z.string().optional(),
  basicPassword: z.string().optional(),
  // Custom
  customAuthConfig: z.record(z.string(), z.any()).optional(),
})

// GET /api/registers/[id]/auth
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const config = await prisma.apiAuthConfig.findUnique({
      where: { apiRegistrationId: id },
    })
    if (!config) {
      // Return default config instead of 404 when no auth config exists yet
      return NextResponse.json({
        apiRegistrationId: id,
        authScheme: 'NONE',
      })
    }
    return NextResponse.json(config)
  } catch (error) {
    console.error('Error fetching auth config:', error)
    return NextResponse.json({ error: 'Failed to fetch auth config' }, { status: 500 })
  }
}

// PUT /api/registers/[id]/auth - Upsert
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const validated = authConfigSchema.parse(body)

    // Check API exists
    const api = await prisma.apiRegistration.findUnique({ where: { id } })
    if (!api) {
      return NextResponse.json({ error: 'API not found' }, { status: 404 })
    }

    const config = await prisma.apiAuthConfig.upsert({
      where: { apiRegistrationId: id },
      update: validated,
      create: {
        ...validated,
        apiRegistrationId: id,
      },
    })

    return NextResponse.json(config)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.issues }, { status: 400 })
    }
    console.error('Error updating auth config:', error)
    return NextResponse.json({ error: 'Failed to update auth config' }, { status: 500 })
  }
}

// DELETE /api/registers/[id]/auth
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const existing = await prisma.apiAuthConfig.findUnique({
      where: { apiRegistrationId: id },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Auth config not found' }, { status: 404 })
    }
    await prisma.apiAuthConfig.delete({ where: { apiRegistrationId: id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting auth config:', error)
    return NextResponse.json({ error: 'Failed to delete auth config' }, { status: 500 })
  }
}
