import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/flows/trigger-config?path=/api/v1/payments&method=POST
// Used by orch-broker to find a flow from path
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const path = searchParams.get('path')
    const method = searchParams.get('method') || 'ANY'
    
    if (!path) {
      return NextResponse.json(
        { error: 'Path is required' },
        { status: 400 }
      )
    }
    
    // Find flow that matches path pattern
    const flows = await prisma.flowIntegration.findMany({
      where: {
        isActive: true,
        flowCategory: 'API_GATEWAY',
      },
      select: {
        id: true,
        name: true,
        triggerConfig: true,
        executionMode: true,
        nodes: true,
        edges: true,
      }
    })
    
    // Match path pattern
    const matchedFlow = flows.find((flow: any) => {
      const config = flow.triggerConfig as any
      if (!config || !config.path) return false
      
      const flowPath = config.path as string
      const flowMethod = (config.method || 'ANY').toUpperCase()
      
      // Check method match
      if (flowMethod !== 'ANY' && flowMethod !== method.toUpperCase()) {
        return false
      }
      
      // Check path match (exact or wildcard)
      if (flowPath.endsWith('/*')) {
        const prefix = flowPath.slice(0, -1)
        return path.startsWith(prefix)
      }
      
      // Support path params like /api/v1/payments/:id
      if (flowPath.includes('/:')) {
        const flowParts = flowPath.split('/')
        const pathParts = path.split('/')
        
        if (flowParts.length !== pathParts.length) return false
        
        return flowParts.every((part, i) => {
          if (part.startsWith(':')) return true // Path param matches anything
          return part === pathParts[i]
        })
      }
      
      return flowPath === path
    })
    
    if (!matchedFlow) {
      return NextResponse.json(
        { error: 'No flow found for path', path, method },
        { status: 404 }
      )
    }
    
    return NextResponse.json({ data: matchedFlow })
  } catch (error) {
    console.error('Flow trigger config lookup error:', error)
    return NextResponse.json(
      { error: 'Failed to lookup flow' },
      { status: 500 }
    )
  }
}

// POST /api/flows/trigger-config
// Save trigger config for a flow
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { flowId, path, method, description } = body
    
    if (!flowId || !path) {
      return NextResponse.json(
        { error: 'flowId and path are required' },
        { status: 400 }
      )
    }
    
    // Validate path format
    if (!path.startsWith('/')) {
      return NextResponse.json(
        { error: 'Path must start with /' },
        { status: 400 }
      )
    }
    
    // Check for duplicate path (active flows only)
    // Note: Prisma JSON filtering varies by database. Using a simpler approach here.
    const existingFlows = await prisma.flowIntegration.findMany({
      where: {
        id: { not: flowId },
        isActive: true,
      }
    })
    
    const existing = existingFlows.find((f: any) => {
      const config = f.triggerConfig as any
      return config?.path === path
    })
    
    if (existing) {
      return NextResponse.json(
        { error: 'Path already in use by another active flow', existingFlowId: existing.id },
        { status: 409 }
      )
    }
    
    // Update flow with trigger config
    const flow = await prisma.flowIntegration.update({
      where: { id: flowId },
      data: {
        triggerConfig: {
          path,
          method: method || 'ANY',
          description,
          createdAt: new Date().toISOString()
        }
      }
    })
    
    return NextResponse.json({ data: flow })
  } catch (error) {
    console.error('Flow trigger config update error:', error)
    return NextResponse.json(
      { error: 'Failed to update trigger config' },
      { status: 500 }
    )
  }
}
