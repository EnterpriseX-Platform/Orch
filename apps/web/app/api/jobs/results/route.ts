import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const jobResultSchema = z.object({
  job_id: z.string(),
  request_id: z.string(),
  flow_id: z.string(),
  node_id: z.string(),
  node_type: z.string(),
  queue_name: z.string(),
  status: z.string(),
  input_data: z.any(),
  output_data: z.any().optional(),
  error_message: z.string().optional(),
  started_at: z.string().optional(),
  completed_at: z.string().optional(),
  retry_count: z.number().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validated = jobResultSchema.parse(body)

    // Use flow_executions instead of job_results table (reuse existing table)
    const execution = await prisma.flowExecution.create({
      data: {
        flowId: validated.flow_id,
        status: validated.status as any,
        inputData: validated.input_data,
        outputData: validated.output_data || undefined,
        duration: validated.completed_at && validated.started_at 
          ? new Date(validated.completed_at).getTime() - new Date(validated.started_at).getTime()
          : 0,
      }
    })

    return NextResponse.json({ success: true, execution })
  } catch (error) {
    console.error('Error saving job result:', error)
    return NextResponse.json(
      { error: 'Failed to save job result' },
      { status: 500 }
    )
  }
}
