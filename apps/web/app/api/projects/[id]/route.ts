import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const updateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  nameEn: z.string().optional(),
  slug: z.string().optional(),
  description: z.string().optional(),
  image: z.string().nullable().optional(),
  themeColor: z.string().optional(),
  projectGroup: z.string().nullable().optional(),
  agency: z.string().nullable().optional(),
  tags: z.any().optional(),
  baseUrl: z.string().min(1).optional(),
  proxyTargetUrl: z.string().nullable().optional(),
  authType: z.enum(['NONE', 'JWT', 'API_KEY', 'OAUTH2', 'BASIC']).optional(),
  apiKey: z.string().nullable().optional(),
  apiKeyHeader: z.string().nullable().optional(),
  owner: z.string().nullable().optional(),
  contactEmail: z.string().email('Invalid email format').optional().or(z.literal('')).or(z.null()),
  status: z.enum(['ACTIVE', 'INACTIVE', 'DEPRECATED']).optional(),
})

const detailInclude = {
  apis: {
    select: {
      id: true,
      name: true,
      endpoint: true,
      method: true,
      backendUrl: true,
      apiType: true,
      routeType: true,
      routingKey: true,
      status: true,
      _count: {
        select: { messageFormats: true },
      },
    },
    orderBy: { createdAt: 'desc' as const },
  },
  creator: {
    select: {
      id: true,
      username: true,
      firstName: true,
      lastName: true,
    },
  },
  _count: {
    select: { apis: true },
  },
}

// GET /api/projects/[id] - Get project by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const project = await prisma.project.findUnique({
      where: { id },
      include: detailInclude,
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    return NextResponse.json(project)
  } catch (error) {
    console.error('Error fetching project:', error)
    return NextResponse.json({ error: 'Failed to fetch project' }, { status: 500 })
  }
}

// PUT /api/projects/[id] - Update project
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    // Validate input
    const validated = updateProjectSchema.parse(body)

    // Check if project exists
    const existing = await prisma.project.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Check slug uniqueness if changed
    if (validated.slug && validated.slug !== existing.slug) {
      const existingSlug = await prisma.project.findUnique({
        where: { slug: validated.slug },
      })
      if (existingSlug) {
        return NextResponse.json(
          { error: 'A project with this slug already exists' },
          { status: 409 }
        )
      }
    }

    const project = await prisma.project.update({
      where: { id },
      data: validated,
      include: detailInclude,
    })

    return NextResponse.json(project)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Error updating project:', error)
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 })
  }
}

// DELETE /api/projects/[id] - Delete project
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const existing = await prisma.project.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // api_logs has its FK to api_registrations dropped — logs are
    // append-only history that must survive deletion of the source
    // API for audit/forensic purposes (spec). The Project →
    // ApiRegistration cascade fires cleanly because nothing else
    // blocks it.
    await prisma.project.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting project:', error)
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: 'Failed to delete project', details: message }, { status: 500 })
  }
}
