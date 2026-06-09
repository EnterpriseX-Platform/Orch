import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

// Get worker config from database by CUID or workerId
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Try to find by CUID first, then by legacy workerId
    let config = await prisma.workerConfig.findUnique({
      where: { workerCuid: id },
    });

    // If not found by CUID, try by workerId (legacy)
    if (!config) {
      config = await prisma.workerConfig.findFirst({
        where: { 
          OR: [
            { workerId: id },
            { queue: id.replace('worker-', '') }
          ]
        },
      });
    }

    if (config) {
      return Response.json({
        success: true,
        workerCuid: config.workerCuid,
        queue: config.queue,
        config: {
          auto_restart: config.autoRestart,
          enable_logging: config.enableLogging,
          high_priority: config.highPriority,
          max_retries: config.maxRetries,
          timeout: config.timeout,
        },
      });
    }

    // Return default config if not found
    return Response.json({
      success: true,
      workerCuid: null,
      queue: id.replace('worker-', ''),
      config: {
        auto_restart: true,
        enable_logging: true,
        high_priority: false,
        max_retries: 3,
        timeout: 30000,
      },
    });
  } catch (error) {
    console.error('Get worker config error:', error);
    return Response.json(
      { success: false, error: 'Failed to get config', message: String(error) },
      { status: 500 }
    );
  }
}

// Update worker config in database by CUID or workerId
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { 
      auto_restart, 
      enable_logging, 
      high_priority, 
      max_retries, 
      timeout,
      name,
      queue,
    } = body;

    // Try to find by CUID first, then by legacy workerId
    let existingConfig = await prisma.workerConfig.findUnique({
      where: { workerCuid: id },
    });

    if (!existingConfig) {
      existingConfig = await prisma.workerConfig.findFirst({
        where: { 
          OR: [
            { workerId: id },
            { queue: id.replace('worker-', '') }
          ]
        },
      });
    }

    const workerQueue = queue || id.replace('worker-', '');
    const workerName = name || `Worker-${workerQueue}`;

    // Upsert config
    const config = await prisma.workerConfig.upsert({
      where: existingConfig ? { id: existingConfig.id } : { id: 'new' },
      update: {
        ...(auto_restart !== undefined && { autoRestart: auto_restart }),
        ...(enable_logging !== undefined && { enableLogging: enable_logging }),
        ...(high_priority !== undefined && { highPriority: high_priority }),
        ...(max_retries !== undefined && { maxRetries: max_retries }),
        ...(timeout !== undefined && { timeout }),
        ...(name !== undefined && { name }),
      },
      create: {
        workerCuid: id.startsWith('wrk_') ? id : null, // If id looks like CUID, use it
        workerId: `worker-${workerQueue}`,
        name: workerName,
        queue: workerQueue,
        autoRestart: auto_restart ?? true,
        enableLogging: enable_logging ?? true,
        highPriority: high_priority ?? false,
        maxRetries: max_retries ?? 3,
        timeout: timeout ?? 30000,
      },
    });

    return Response.json({
      success: true,
      workerCuid: config.workerCuid,
      queue: config.queue,
      config: {
        auto_restart: config.autoRestart,
        enable_logging: config.enableLogging,
        high_priority: config.highPriority,
        max_retries: config.maxRetries,
        timeout: config.timeout,
      },
    });
  } catch (error) {
    console.error('Update worker config error:', error);
    return Response.json(
      { success: false, error: 'Failed to update config', message: String(error) },
      { status: 500 }
    );
  }
}
