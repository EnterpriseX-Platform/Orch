import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const { requestId } = await params

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial connection message
      const encoder = new TextEncoder()
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected', requestId })}\n\n`))

      let lastExecutionCount = 0
      let isCompleted = false
      const maxChecks = 300 // 5 minutes timeout (300 * 1 second)
      let checkCount = 0

      // Poll database every 1 second and push updates via SSE
      const checkInterval = setInterval(async () => {
        try {
          checkCount++
          
          // Check timeout
          if (checkCount > maxChecks) {
            clearInterval(checkInterval)
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'timeout', requestId })}\n\n`))
            controller.close()
            return
          }

          // Check if client closed connection
          if (request.signal.aborted) {
            clearInterval(checkInterval)
            controller.close()
            return
          }

          // Fetch executions from database
          const executions = await prisma.flowExecution.findMany({
            where: {
              inputData: {
                path: ['requestId'],
                equals: requestId
              }
            },
            orderBy: {
              startedAt: 'desc'
            },
            take: 20
          })

          if (executions.length > lastExecutionCount || !isCompleted) {
            lastExecutionCount = executions.length
            
            const allCompleted = executions.every(e => 
              e.status === 'SUCCESS' || e.status === 'FAILED'
            )
            
            const latestExecution = executions[0]

            // Send update
            const message = {
              type: allCompleted ? 'completed' : 'progress',
              requestId,
              timestamp: new Date().toISOString(),
              data: {
                totalExecutions: executions.length,
                allCompleted,
                executions: executions.map(e => ({
                  id: e.id,
                  flowId: e.flowId,
                  status: e.status,
                  inputData: e.inputData,
                  outputData: e.outputData,
                  startedAt: e.startedAt,
                  completedAt: e.completedAt,
                  duration: e.duration
                })),
                latestOutput: latestExecution?.outputData
              }
            }

            controller.enqueue(encoder.encode(`data: ${JSON.stringify(message)}\n\n`))

            if (allCompleted) {
              isCompleted = true
              clearInterval(checkInterval)
              // Keep connection open for a bit then close
              setTimeout(() => {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done', requestId })}\n\n`))
                controller.close()
              }, 1000)
            }
          }
        } catch (error) {
          console.error('Error in SSE stream:', error)
          clearInterval(checkInterval)
          controller.error(error)
        }
      }, 1000) // Check every 1 second

      // Cleanup on abort
      request.signal.addEventListener('abort', () => {
        clearInterval(checkInterval)
        controller.close()
      })
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
