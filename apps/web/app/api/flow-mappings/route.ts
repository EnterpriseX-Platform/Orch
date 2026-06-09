import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/flow-mappings
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const flowId = searchParams.get('flowId')
    const isActive = searchParams.get('isActive')
    
    const mappings = await prisma.apiFlowMapping.findMany({
      where: {
        ...(flowId && { flowId }),
        ...(isActive !== null && { isActive: isActive === 'true' })
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' }
      ]
    })
    
    return NextResponse.json({ data: mappings })
  } catch (error) {
    console.error('Flow mappings fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch flow mappings' },
      { status: 500 }
    )
  }
}

// POST /api/flow-mappings
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const mapping = await prisma.apiFlowMapping.create({
      data: {
        apiId: body.apiId,
        apiName: body.apiName,
        pathPattern: body.pathPattern,
        method: body.method || 'ANY',
        flowId: body.flowId,
        flowName: body.flowName,
        domain: body.domain,
        basePath: body.basePath,
        upstreamUrl: body.upstreamUrl,
        stripPrefix: body.stripPrefix ?? true,
        preserveHost: body.preserveHost ?? false,
        addHeaders: body.addHeaders || {},
        removeHeaders: body.removeHeaders || [],
        requestTransform: body.requestTransform,
        responseTransform: body.responseTransform,
        priority: body.priority || 0,
        description: body.description,
        isActive: body.isActive ?? true
      }
    })
    
    return NextResponse.json({ data: mapping }, { status: 201 })
  } catch (error) {
    console.error('Flow mapping create error:', error)
    return NextResponse.json(
      { error: 'Failed to create flow mapping' },
      { status: 500 }
    )
  }
}

// PUT /api/flow-mappings
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, ...data } = body
    
    const mapping = await prisma.apiFlowMapping.update({
      where: { id },
      data
    })
    
    return NextResponse.json({ data: mapping })
  } catch (error) {
    console.error('Flow mapping update error:', error)
    return NextResponse.json(
      { error: 'Failed to update flow mapping' },
      { status: 500 }
    )
  }
}

// DELETE /api/flow-mappings?id=xxx
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    
    if (!id) {
      return NextResponse.json(
        { error: 'ID is required' },
        { status: 400 }
      )
    }
    
    await prisma.apiFlowMapping.delete({
      where: { id }
    })
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Flow mapping delete error:', error)
    return NextResponse.json(
      { error: 'Failed to delete flow mapping' },
      { status: 500 }
    )
  }
}
