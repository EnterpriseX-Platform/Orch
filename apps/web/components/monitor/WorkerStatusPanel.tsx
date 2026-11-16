'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { InlineNotification, Tag, Table, TableHead, TableRow, TableHeader, TableBody, TableCell } from '@carbon/react';
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
      <InlineNotification kind="error" title={error} hideCloseButton lowContrast />
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
            <Table size="md">
              <TableHead>
                <TableRow>
                  <TableHeader>Worker Name</TableHeader>
                  <TableHeader>Queue</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader>Started At</TableHeader>
                  <TableHeader className="text-right">Processed</TableHeader>
                  <TableHeader className="text-right">Failed</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {workers.map((worker) => {
                  return (
                    <TableRow key={worker.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-sm">{worker.name}</span>
                          <span className="text-xs text-muted-foreground">ID: {worker.id}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Tag type="outline" size="sm">{worker.queue}</Tag>
                      </TableCell>
                      <TableCell>
                        <WorkerStatusBadge status={worker.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {new Date(worker.started_at).toLocaleTimeString('th-TH')}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {worker.processed.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        <span className={worker.failed > 0 ? 'text-[#da1e28]' : ''}>
                          {worker.failed.toLocaleString()}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function WorkerStatusBadge({ status }: { status: string }) {
  const statusType: Record<string, 'green' | 'gray' | 'warm-gray' | 'red'> = {
    running: 'green',
    stopped: 'gray',
    paused: 'warm-gray',
    error: 'red',
  };

  return (
    <Tag type={statusType[status.toLowerCase()] ?? 'gray'} size="sm">
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Tag>
  );
}
