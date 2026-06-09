// ==========================================
// Deploy Flow to Orch Broker
// POST /api/flows/:id/deploy
// ==========================================

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getBrokerUrl } from '@/lib/system-config'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const ORCH_BROKER_URL = await getBrokerUrl()
    
    // Get flow from database
    const flow = await prisma.flowIntegration.findUnique({
      where: { id },
    })

    if (!flow) {
      return NextResponse.json(
        { error: 'Flow not found' },
        { status: 404 }
      )
    }

    // Prepare deploy payload
    const deployPayload = {
      name: flow.name,
      triggerType: flow.triggerType,
      triggerConfig: flow.triggerConfig,
      execution_strategy: flow.executionStrategy || 'fast',
      custom_queue_config: flow.customQueueConfig || null,
      nodes: flow.nodes || [],
      edges: flow.edges || [],
      isActive: true,
    }

    // Deploy to orch-broker
    const brokerResponse = await fetch(`${ORCH_BROKER_URL}/deploy/flows/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(deployPayload),
    })

    if (!brokerResponse.ok) {
      const errorText = await brokerResponse.text()
      console.error('Orch broker deploy failed:', errorText)
      return NextResponse.json(
        { error: 'Failed to deploy to orch-broker', details: errorText },
        { status: 502 }
      )
    }

    const brokerData = await brokerResponse.json()

    // Check broker-level validation: broker may return HTTP 200 with { success: false }
    if (brokerData.success === false) {
      console.error('Orch broker deploy validation failed:', brokerData)
      return NextResponse.json(
        {
          error: brokerData.error || 'Flow validation failed on broker',
          details: brokerData.details || brokerData,
        },
        { status: 422 }
      )
    }

    // Update flow status in database
    await prisma.flowIntegration.update({
      where: { id },
      data: { 
        isActive: true,
        updatedAt: new Date(),
      },
    })

    return NextResponse.json({
      success: true,
      message: 'Flow deployed successfully',
      flowId: id,
      brokerResponse: brokerData,
    })
  } catch (error) {
    console.error('Error deploying flow:', error)
    return NextResponse.json(
      { error: 'Failed to deploy flow' },
      { status: 500 }
    )
  }
}
