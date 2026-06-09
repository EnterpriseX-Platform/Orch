import { NextRequest } from 'next/server';
import { getBrokerUrl } from '@/lib/system-config';

// Rename worker
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name } = body;

    const BROKER_URL = await getBrokerUrl();
    // Forward to broker
    const response = await fetch(`${BROKER_URL}/broker/admin/workers/${id}/rename`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      // If broker doesn't support rename, return error
      const errorText = await response.text();
      console.error('Broker rename worker error:', errorText);
      return Response.json(
        { success: false, error: 'Rename not supported by broker', details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    console.error('Rename worker error:', error);
    return Response.json(
      { success: false, error: 'Failed to connect to broker', message: String(error) },
      { status: 503 }
    );
  }
}
