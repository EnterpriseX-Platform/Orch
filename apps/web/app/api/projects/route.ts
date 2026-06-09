import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createId } from '@paralleldrive/cuid2'
import { z } from 'zod'

const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required'),
  nameEn: z.string().optional(),
  slug: z.string().optional(),
  description: z.string().optional(),
  image: z.string().optional(),
  themeColor: z.string().optional(),
  projectGroup: z.string().optional(),
  agency: z.string().optional(),
  tags: z.any().optional(),
  baseUrl: z.string().min(1, 'Base URL is required'),
  proxyTargetUrl: z.string().optional(),
  authType: z.enum(['NONE', 'JWT', 'API_KEY', 'OAUTH2', 'BASIC']).default('NONE'),
  apiKey: z.string().optional(),
  apiKeyHeader: z.string().optional(),
  owner: z.string().optional(),
  contactEmail: z.string().email('Invalid email format').optional().or(z.literal('')),
  status: z.enum(['ACTIVE', 'INACTIVE', 'DEPRECATED']).default('ACTIVE'),
})

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\u0E00-\u0E7F-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

// GET /api/projects - List all projects
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '100')
    const status = searchParams.get('status') || undefined
    const search = searchParams.get('search') || undefined
    const projectGroup = searchParams.get('projectGroup') || undefined
    const agency = searchParams.get('agency') || undefined

    const skip = (page - 1) * limit

    // Build where clause
    const where: any = {}

    if (status) {
      where.status = status
    }

    if (projectGroup) {
      where.projectGroup = projectGroup
    }

    if (agency) {
      where.agency = agency
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { nameEn: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
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
        },
      }),
      prisma.project.count({ where }),
    ])

    return NextResponse.json({
      data: projects,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    console.error('Error fetching projects:', error)
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 })
  }
}

// POST /api/projects - Create new project
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate input
    const validated = createProjectSchema.parse(body)

    // Generate slug from name if not provided
    const slug = validated.slug || generateSlug(validated.name)

    // Check slug uniqueness
    const existingSlug = await prisma.project.findUnique({
      where: { slug },
    })
    if (existingSlug) {
      return NextResponse.json(
        { error: 'A project with this slug already exists' },
        { status: 409 }
      )
    }

    const { getUserId, resolveUserId } = await import('@/lib/auth')
    // resolveUserId falls back to an existing admin if the JWT carries
    // a stale userId (e.g. session from before a DB reseed). Without
    // this, projects.created_by FK fires before the row is written.
    const userId = await resolveUserId(getUserId(request))
    if (!userId) {
      return NextResponse.json(
        { error: 'No valid user found to attribute project creation' },
        { status: 500 }
      )
    }

    const project = await prisma.project.create({
      data: {
        id: createId(),
        name: validated.name,
        nameEn: validated.nameEn,
        slug,
        description: validated.description,
        image: validated.image,
        themeColor: validated.themeColor,
        projectGroup: validated.projectGroup,
        agency: validated.agency,
        tags: validated.tags || null,
        baseUrl: validated.baseUrl,
        proxyTargetUrl: validated.proxyTargetUrl || null,
        authType: validated.authType,
        apiKey: validated.apiKey,
        apiKeyHeader: validated.apiKeyHeader,
        owner: validated.owner,
        contactEmail: validated.contactEmail || undefined,
        status: validated.status,
        createdBy: userId,
      },
      include: {
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
      },
    })

    return NextResponse.json(project, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Error creating project:', error)
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 })
  }
}
