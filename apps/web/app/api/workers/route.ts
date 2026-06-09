import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createId } from '@paralleldrive/cuid2';
import { getBrokerUrl } from '@/lib/system-config';

// Get workers list from Broker + config from Database
export async function GET(req: NextRequest) {
  try {
    const BROKER_URL = await getBrokerUrl();
    // Fetch from broker
    const brokerResponse = await fetch(`${BROKER_URL}/broker/admin/workers`, {
      signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json' },
    });

    if (!brokerResponse.ok) {
      const errorText = await brokerResponse.text();
      console.error('Broker workers error:', errorText);
      return Response.json(
        { success: false, error: 'Broker error', details: errorText },
        { status: brokerResponse.status }
      );
    }

    const brokerData = await brokerResponse.json();
    
    // Fetch configs from database by queue name
    const configs = await prisma.workerConfig.findMany();
    const configMap = new Map(configs.map(c => [c.queue, c]));

    // Merge broker data with database configs
    const workers = brokerData.workers.map((w: any) => {
      const dbConfig = configMap.get(w.queue);
      return {
        ...w,
        id: dbConfig?.workerCuid || w.id, // Use CUID if available
        name: dbConfig?.name || w.name,
        config: dbConfig ? {
          auto_restart: dbConfig.autoRestart,
          enable_logging: dbConfig.enableLogging,
          high_priority: dbConfig.highPriority,
          max_retries: dbConfig.maxRetries,
          timeout: dbConfig.timeout,
        } : w.config,
      };
    });

    return Response.json({
      ...brokerData,
      workers,
    });
  } catch (error) {
    console.error('Workers API error:', error);
    return Response.json(
      { success: false, error: 'Failed to connect to broker', message: String(error) },
      { status: 503 }
    );
  }
}

// Create new worker via Broker + save config to Database with CUID
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, queue } = body;

    // Generate CUID for the worker
    const workerCuid = createId();

    const BROKER_URL = await getBrokerUrl();
    // Create worker in broker
    const brokerResponse = await fetch(`${BROKER_URL}/broker/admin/workers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queue, name }),
      signal: AbortSignal.timeout(10000),
    });

    if (!brokerResponse.ok) {
      const errorText = await brokerResponse.text();
      console.error('Broker create worker error:', errorText);
      return Response.json(
        { success: false, error: 'Broker error', details: errorText },
        { status: brokerResponse.status }
      );
    }

    const brokerData = await brokerResponse.json();
    
    // Save config to database with CUID
    await prisma.workerConfig.upsert({
      where: { workerCuid: workerCuid },
      update: {
        name: name || `Worker-${queue}`,
        queue: queue,
      },
      create: {
        workerCuid: workerCuid,
        workerId: `worker-${queue}`,
        name: name || `Worker-${queue}`,
        queue: queue,
        autoRestart: true,
        enableLogging: true,
        highPriority: false,
        maxRetries: 3,
        timeout: 30000,
      },
    });

    return Response.json({
      ...brokerData,
      worker: {
        ...brokerData.worker,
        id: workerCuid,
      },
    });
  } catch (error) {
    console.error('Create worker error:', error);
    return Response.json(
      { success: false, error: 'Failed to connect to broker', message: String(error) },
      { status: 503 }
    );
  }
}
