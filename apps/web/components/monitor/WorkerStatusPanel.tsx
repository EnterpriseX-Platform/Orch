'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Cpu, Activity, Clock, AlertCircle, CheckCircle } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';

interface WorkerDetail {
  id: string;
  name: string;
  queue: string;
  status: string;
  started_at: string;
  last_activity: string | null;
  processed: number;
  failed: number;
  cpu: number;
  memory: number;
  host: string;
  pid: number;
  config?: {
    auto_restart: boolean;
    enable_logging: boolean;
    high_priority: boolean;
  };
}

interface WorkerStats {
  total: number;
  running: number;
  stopped: number;
  paused: number;
  error: number;
}

interface WorkerData {
  success: boolean;
  stats: WorkerStats;
  workers: WorkerDetail[];
  timestamp: string;
}

export function WorkerStatusPanel() {
  const [data, setData] = useState<WorkerData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const token = useAuthStore((s) => s.accessToken);

  const fetchWorkerData = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch('/orch/api/workers', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      setData(result);
      setError(null);
    } catch (err) {
      setError(`Cannot connect to broker${err instanceof Error ? ': ' + err.message : ''}`);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchWorkerData();
    const interval = setInterval(fetchWorkerData, 5000); // Update every 5 seconds
    return () => clearInterval(interval);
  }, [fetchWorkerData]);

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading worker data...</div>;
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-[#da1e28]">
        <AlertCircle className="w-4 h-4" />
        <span className="text-sm">{error}</span>
      </div>
    );
  }

  if (!data?.success) {
    return <div className="text-sm text-muted-foreground">No worker data available</div>;
  }

  const { stats, workers } = data;

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Cpu className="w-4 h-4 text-[#525252]" />
            <div>
              <div className="text-2xl font-light">{stats.total}</div>
              <div className="text-xs text-muted-foreground">Total Workers</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle className="w-4 h-4 text-[#525252]" />
            <div>
              <div className="text-2xl font-light">{stats.running}</div>
              <div className="text-xs text-muted-foreground">Running</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <AlertCircle className="w-4 h-4 text-[#525252]" />
            <div>
              <div className="text-2xl font-light">{stats.error}</div>
              <div className="text-xs text-muted-foreground">Errors</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="w-4 h-4 text-[#525252]" />
            <div>
              <div className="text-2xl font-light">{stats.stopped}</div>
              <div className="text-xs text-muted-foreground">Stopped</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Worker Details Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Active Workers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2 font-medium">Worker Name</th>
                  <th className="text-left p-2 font-medium">Queue</th>
                  <th className="text-left p-2 font-medium">Status</th>
                  <th className="text-left p-2 font-medium">Started At</th>
                  <th className="text-right p-2 font-medium">Processed</th>
                  <th className="text-right p-2 font-medium">Failed</th>
                </tr>
              </thead>
              <tbody>
                {workers.map((worker) => {
                  return (
                    <tr key={worker.id} className="border-b last:border-0">
                      <td className="p-2">
                        <div className="flex flex-col">
                          <span className="font-medium text-sm">{worker.name}</span>
                          <span className="text-xs text-muted-foreground">ID: {worker.id}</span>
                        </div>
                      </td>
                      <td className="p-2">
                        <Badge variant="outline" className="text-xs">{worker.queue}</Badge>
                      </td>
                      <td className="p-2">
                        <WorkerStatusBadge status={worker.status} />
                      </td>
                      <td className="p-2 text-muted-foreground text-xs">
                        {new Date(worker.started_at).toLocaleTimeString('th-TH')}
                      </td>
                      <td className="p-2 text-right font-mono text-xs">
                        {worker.processed.toLocaleString()}
                      </td>
                      <td className="p-2 text-right font-mono text-xs">
                        <span className={worker.failed > 0 ? 'text-[#da1e28]' : ''}>
                          {worker.failed.toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function WorkerStatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { color: string; bg: string }> = {
    'running': { color: 'text-[#0e6027]', bg: 'bg-[#defbe6]' },
    'stopped': { color: 'text-[#525252]', bg: 'bg-[#e0e0e0]' },
    'paused': { color: 'text-[#8a3800]', bg: 'bg-[#fcf4d6]' },
    'error': { color: 'text-[#a2191f]', bg: 'bg-[#ffd7d9]' },
  };

  const config = statusConfig[status.toLowerCase()] || { color: 'text-[#525252]', bg: 'bg-[#e0e0e0]' };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 cds-tag text-xs font-medium ${config.bg} ${config.color}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
