import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateOpenApiSpec } from '@/lib/openapi-generator'

// GET /api/projects/[id]/openapi — Return stored spec or generate if not exists
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const project = await prisma.project.findUnique({
      where: { id },
      select: {
        id: true,
        openApiSpec: true,
        openApiSpecUpdatedAt: true,
      },
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Return stored spec if available
    if (project.openApiSpec) {
      return NextResponse.json({
        spec: project.openApiSpec,
        updatedAt: project.openApiSpecUpdatedAt,
      })
    }

    // Generate on first access
    const spec = await generateOpenApiSpec(id)
    const now = new Date()

    await prisma.project.update({
      where: { id },
      data: {
        openApiSpec: spec,
        openApiSpecUpdatedAt: now,
      },
    })

    return NextResponse.json({
      spec,
      updatedAt: now.toISOString(),
    })
  } catch (error) {
    console.error('Error fetching OpenAPI spec:', error)
    return NextResponse.json({ error: 'Failed to fetch OpenAPI spec' }, { status: 500 })
  }
}

// POST /api/projects/[id]/openapi — Force regenerate spec
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Check if project exists
    const existing = await prisma.project.findUnique({
      where: { id },
      select: { id: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Regenerate spec
    const spec = await generateOpenApiSpec(id)
    const now = new Date()

    await prisma.project.update({
      where: { id },
      data: {
        openApiSpec: spec,
        openApiSpecUpdatedAt: now,
      },
    })

    return NextResponse.json({
      spec,
      updatedAt: now.toISOString(),
    })
  } catch (error) {
    console.error('Error regenerating OpenAPI spec:', error)
    return NextResponse.json({ error: 'Failed to regenerate OpenAPI spec' }, { status: 500 })
  }
}
