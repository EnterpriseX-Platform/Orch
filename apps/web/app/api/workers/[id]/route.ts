import { NextRequest } from 'next/server';
import { getBrokerUrl } from '@/lib/system-config';

// Worker actions (start, stop, pause, restart) via Broker
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { action } = body;

    const BROKER_URL = await getBrokerUrl();

    // Map actions to broker endpoints
    let endpoint: string;
    switch (action) {
      case 'stop':
      case 'pause':
        endpoint = `${BROKER_URL}/broker/admin/workers/${id}/stop`;
        break;
      case 'restart':
        endpoint = `${BROKER_URL}/broker/admin/workers/${id}/restart`;
        break;
      case 'start':
      case 'resume':
        // For start/resume, we need to add the worker back
        // Broker doesn't have a direct "start" endpoint, so we use restart
        endpoint = `${BROKER_URL}/broker/admin/workers/${id}/restart`;
        break;
      default:
        return Response.json(
          { success: false, error: 'Unknown action' },
          { status: 400 }
        );
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Broker ${action} worker error:`, errorText);
      return Response.json(
        { success: false, error: 'Broker error', details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    console.error('Worker action error:', error);
    return Response.json(
      { success: false, error: 'Failed to connect to broker', message: String(error) },
      { status: 503 }
    );
  }
}

// Delete worker via Broker
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const BROKER_URL = await getBrokerUrl();

    const response = await fetch(`${BROKER_URL}/broker/admin/workers/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Broker delete worker error:', errorText);
      return Response.json(
        { success: false, error: 'Broker error', details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    console.error('Delete worker error:', error);
    return Response.json(
      { success: false, error: 'Failed to connect to broker', message: String(error) },
      { status: 503 }
    );
  }
}
