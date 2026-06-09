'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Server,
  Database,
  Layers,
  Cpu,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  Zap,
  Users,
  BarChart3,
  RefreshCw,
  Wifi,
  WifiOff,
  HardDrive,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { LiveMetricsChart } from '@/components/monitor/LiveMetricsChart';
import { WorkerStatusPanel } from '@/components/monitor/WorkerStatusPanel';
import { useAuthStore } from '@/stores/authStore';

const FONT = "'Prompt', sans-serif";

const THEME = {
  bg: 'var(--t-bg)',
  panel: 'var(--t-panel)',
  border: 'var(--t-border)',
  borderLight: 'var(--t-border-light)',
  text: { primary: 'var(--t-text)', secondary: 'var(--t-text-secondary)', muted: 'var(--t-text-muted)' },
  accent: 'var(--t-accent)',
  colors: {
    blue: '#3B82F6',
    emerald: '#10B981',
    purple: '#8B5CF6',
    amber: '#F59E0B',
    red: '#EF4444',
    cyan: '#06B6D4',
  }
};

interface HealthStatus {
  status: 'online' | 'offline' | 'error' | 'degraded' | 'unknown';
  latency?: number;
  size?: number;
  message?: string;
}

interface MonitorData {
  timestamp: string;
  health: {
    gateway: HealthStatus;
    database: HealthStatus;
    kafka: HealthStatus;
    cache: HealthStatus;
  };
  metrics: {
    requestsPerHour: number;
    errorsPerHour: number;
    avgResponseTime: number;
    errorRate: string;
    perMinute: Array<{
      minute: string;
      count: number;
      avg_response_time: number;
      errors: number;
    }>;
    uptime?: number;
    memoryUsage?: number;
    cpuUsage?: number;
  };
  queue: {
    default: { pending: number; processing: number };
    high: { pending: number; processing: number };
    low: { pending: number; processing: number };
  };
  errors: Array<{
    id: string;
    method: string;
    path: string;
    statusCode: number;
    responseTime: number;
    timestamp: string;
    message: string;
  }>;
  connections: {
    websocket: number;
    http: number;
    concurrent: number;
  };
}

function StatusBadge({ status, latency }: { status: string; latency?: number }) {
  const config = {
    online: { icon: CheckCircle, color: '#10B981', bg: '#10B98112', border: '#10B98135' },
    offline: { icon: XCircle, color: '#EF4444', bg: '#EF444412', border: '#EF444435' },
    error: { icon: AlertCircle, color: '#EF4444', bg: '#EF444412', border: '#EF444435' },
    degraded: { icon: AlertCircle, color: '#F59E0B', bg: '#F59E0B12', border: '#F59E0B35' },
    unknown: { icon: Clock, color: 'var(--t-text-muted)', bg: '#5A617812', border: '#5A617835' },
  };

  const { icon: Icon, color, bg, border } = config[status as keyof typeof config] || config.unknown;

  return (
    <div className="flex items-center gap-2">
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '2px 8px', borderRadius: 6,
        background: bg, border: `1px solid ${border}`,
      }}>
        <Icon className="w-3 h-3" style={{ color }} />
        <span style={{ fontSize: 12, fontWeight: 600, color, textTransform: 'capitalize' }}>
          {status}
        </span>
      </div>
      {latency !== undefined && latency >= 0 && (
        <span style={{ fontSize: 11, color: THEME.text.muted }}>
          {latency}ms
        </span>
      )}
    </div>
  );
}

function MetricCard({ 
  title, 
  value, 
  unit = '', 
  icon: Icon, 
  color, 
  trend,
  subtext,
}: { 
  title: string; 
  value: string | number; 
  unit?: string;
  icon: any; 
  color: string;
  trend?: { value: string; direction: 'up' | 'down' | 'neutral' };
  subtext?: string;
}) {
  return (
    <div style={{
      background: THEME.panel,
      border: `1px solid ${THEME.border}`,
      borderRadius: 10,
      padding: '12px',
    }}>
      <div className="flex items-start justify-between mb-2">
        <div style={{
          width: 32, height: 24,
          background: `${color}12`,
          border: `1px solid ${color}35`,
          borderRadius: 6,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
        {trend && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 2,
            fontSize: 12, fontWeight: 500,
            color: trend.direction === 'up' ? '#10B981' : trend.direction === 'down' ? '#EF4444' : 'var(--t-text-muted)',
          }}>
            {trend.direction === 'up' ? <TrendingUp className="w-3 h-3" /> : 
             trend.direction === 'down' ? <TrendingDown className="w-3 h-3" /> : null}
            {trend.value}
          </div>
        )}
      </div>
      <p style={{ fontSize: 24, fontWeight: 700, color: THEME.text.primary, marginBottom: 0 }}>
        {value}{unit && <span style={{ fontSize: 14, marginLeft: 4 }}>{unit}</span>}
      </p>
      <p style={{ fontSize: 12, color: THEME.text.muted }}>{title}</p>
      {subtext && (
        <p style={{ fontSize: 11, color: THEME.text.muted, marginTop: 4 }}>{subtext}</p>
      )}
    </div>
  );
}

function MiniChart({ data, color }: { data: number[]; color: string }) {
  if (!data.length) return <div style={{ height: 40, background: THEME.bg, borderRadius: 3 }} />;
  
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', height: 40, gap: 1 }}>
      {data.map((v, i) => {
        const height = ((v - min) / range) * 100;
        return (
          <div
            key={i}
            style={{
              flex: 1,
              height: `${Math.max(height, 5)}%`,
              background: color,
              borderRadius: 1,
              opacity: 0.7 + (i / data.length) * 0.3,
            }}
          />
        );
      })}
    </div>
  );
}

export default function MonitorPage() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'live' | 'workers' | 'metrics' | 'queue' | 'errors'>('overview');
  const token = useAuthStore((s) => s.accessToken);

  const { data, isLoading, refetch } = useQuery<MonitorData>({
    queryKey: ['monitor'],
    queryFn: async () => {
      const res = await fetch('/orch/api/monitor', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Failed to fetch monitor data');
      return res.json();
    },
    refetchInterval: autoRefresh ? 5000 : false,
    enabled: !!token,
  });

  // Auto-refresh toggle
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => refetch(), 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, refetch]);

  const healthItems = [
    { name: 'Orch Broker', key: 'gateway', icon: Server },
    { name: 'Database', key: 'database', icon: Database },
    { name: 'Kafka', key: 'kafka', icon: Layers },
    { name: 'Cache', key: 'cache', icon: Cpu },
  ];

  const queueItems = data?.queue ? [
    { name: 'High Priority', key: 'high', color: '#EF4444' },
    { name: 'Default', key: 'default', color: '#3B82F6' },
    { name: 'Low Priority', key: 'low', color: 'var(--t-text-muted)' },
  ] : [];

  // Chart data preparation
  const requestChartData = data?.metrics?.perMinute?.map(m => Number(m.count)) || [];
  const latencyChartData = data?.metrics?.perMinute?.map(m => Math.round(Number(m.avg_response_time) || 0)) || [];

  return (
    <div style={{ fontFamily: FONT, minHeight: '100%' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: THEME.text.primary, marginBottom: 2 }}>
            System Monitor
          </h1>
          <p style={{ fontSize: 13, color: THEME.text.muted }}>
            Real-time system health and performance metrics
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 10px', fontSize: 12,
              borderRadius: 6, border: `1px solid ${THEME.border}`,
              background: autoRefresh ? '#10B98112' : THEME.panel,
              color: autoRefresh ? '#10B981' : THEME.text.secondary,
            }}
          >
            <RefreshCw className={cn("w-3 h-3", autoRefresh && "animate-spin")} />
            {autoRefresh ? 'Auto' : 'Manual'}
          </button>
          <button
            onClick={() => refetch()}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 10px', fontSize: 12,
              borderRadius: 6, border: `1px solid ${THEME.border}`,
              background: THEME.panel, color: THEME.text.secondary,
            }}
          >
            <RefreshCw className="w-3 h-3" />
            Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4" style={{ borderBottom: `1px solid ${THEME.border}` }}>
        {[
          { key: 'overview', label: 'Overview', icon: Activity },
          { key: 'live', label: 'Live Metrics', icon: Wifi },
          { key: 'workers', label: 'Workers', icon: Cpu },
          { key: 'metrics', label: 'Metrics', icon: BarChart3 },
          { key: 'queue', label: 'Queue Status', icon: Layers },
          { key: 'errors', label: 'Recent Errors', icon: AlertCircle },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '8px 14px', fontSize: 13, fontWeight: 500,
              borderBottom: `2px solid ${activeTab === tab.key ? '#3B82F6' : 'transparent'}`,
              color: activeTab === tab.key ? '#3B82F6' : THEME.text.secondary,
              background: 'transparent',
              marginBottom: -1,
              cursor: 'pointer',
            }}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* System Health Cards */}
          <div style={{
            background: THEME.panel,
            border: `1px solid ${THEME.border}`,
            borderRadius: 10,
            padding: 12,
          }}>
            <div className="flex items-center gap-2 mb-3">
              <div style={{
                width: 28, height: 22,
                background: '#10B98112',
                border: '1px solid #10B98135',
                borderRadius: 6,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Activity className="w-3.5 h-3.5" style={{ color: '#10B981' }} />
              </div>
              <div>
                <h3 style={{ fontSize: 13, fontWeight: 600, color: THEME.text.primary }}>
                  System Health
                </h3>
                <p style={{ fontSize: 11, color: THEME.text.muted }}>
                  Last updated: {data?.timestamp ? new Date(data.timestamp).toLocaleTimeString() : '-'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {healthItems.map(item => {
                const health = data?.health?.[item.key as keyof typeof data.health];
                return (
                  <div key={item.key} style={{
                    background: THEME.bg,
                    border: `1px solid ${THEME.borderLight}`,
                    borderRadius: 6,
                    padding: 10,
                  }}>
                    <div className="flex items-center gap-2 mb-2">
                      <item.icon className="w-3.5 h-3.5" style={{ color: THEME.text.muted }} />
                      <span style={{ fontSize: 12, color: THEME.text.secondary }}>{item.name}</span>
                    </div>
                    <StatusBadge status={health?.status || 'unknown'} latency={health?.latency} />
                    {item.key === 'cache' && health?.size !== undefined && (
                      <p style={{ fontSize: 11, color: THEME.text.muted, marginTop: 4 }}>
                        {health.size} entries
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard
              title="Requests/hour"
              value={data?.metrics?.requestsPerHour?.toLocaleString() || '0'}
              icon={Zap}
              color={THEME.colors.blue}
              trend={{ value: '+12%', direction: 'up' }}
            />
            <MetricCard
              title="Avg Response Time"
              value={data?.metrics?.avgResponseTime || 0}
              unit="ms"
              icon={Clock}
              color={THEME.colors.purple}
              subtext="Last hour"
            />
            <MetricCard
              title="Error Rate"
              value={data?.metrics?.errorRate || '0.00'}
              unit="%"
              icon={AlertCircle}
              color={THEME.colors.red}
              trend={{ value: '-2%', direction: 'down' }}
            />
            <MetricCard
              title="Concurrent"
              value={data?.connections?.concurrent || 0}
              icon={Users}
              color={THEME.colors.emerald}
              subtext="Active connections"
            />
          </div>

          {/* Charts Preview */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div style={{
              background: THEME.panel,
              border: `1px solid ${THEME.border}`,
              borderRadius: 10,
              padding: 12,
            }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-3.5 h-3.5" style={{ color: THEME.colors.blue }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: THEME.text.primary }}>
                    Request Rate (last hour)
                  </span>
                </div>
              </div>
              <MiniChart data={requestChartData.slice(-30)} color={THEME.colors.blue} />
            </div>

            <div style={{
              background: THEME.panel,
              border: `1px solid ${THEME.border}`,
              borderRadius: 10,
              padding: 12,
            }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5" style={{ color: THEME.colors.purple }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: THEME.text.primary }}>
                    Response Time (last hour)
                  </span>
                </div>
              </div>
              <MiniChart data={latencyChartData.slice(-30)} color={THEME.colors.purple} />
            </div>
          </div>
        </div>
      )}

      {/* Live Metrics Tab */}
      {activeTab === 'live' && (
        <div className="space-y-4">
          <LiveMetricsChart />
        </div>
      )}

      {/* Workers Tab */}
      {activeTab === 'workers' && (
        <div className="space-y-4">
          <WorkerStatusPanel />
        </div>
      )}

      {/* Metrics Tab */}
      {activeTab === 'metrics' && (
        <div className="space-y-4">
          <div style={{
            background: THEME.panel,
            border: `1px solid ${THEME.border}`,
            borderRadius: 10,
            padding: 12,
          }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: THEME.text.primary, marginBottom: 12 }}>
              Runtime Metrics
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard
                title="Memory Usage"
                value={data?.metrics?.memoryUsage || 0}
                unit="MB"
                icon={HardDrive}
                color={THEME.colors.cyan}
              />
              <MetricCard
                title="CPU Usage"
                value={data?.metrics?.cpuUsage || 0}
                unit="%"
                icon={Cpu}
                color={THEME.colors.amber}
              />
              <MetricCard
                title="Uptime"
                value={data?.metrics?.uptime || 0}
                unit="h"
                icon={Clock}
                color={THEME.colors.emerald}
              />
              <MetricCard
                title="Total Errors"
                value={data?.metrics?.errorsPerHour || 0}
                icon={XCircle}
                color={THEME.colors.red}
              />
            </div>
          </div>

          {/* Per-minute breakdown */}
          <div style={{
            background: THEME.panel,
            border: `1px solid ${THEME.border}`,
            borderRadius: 10,
            padding: 12,
          }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: THEME.text.primary, marginBottom: 12 }}>
              Per-Minute Statistics
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${THEME.borderLight}`, background: THEME.bg }}>
                    <th className="text-left px-3 py-2 text-[12px] font-semibold uppercase" style={{ color: THEME.text.muted }}>Time</th>
                    <th className="text-right px-3 py-2 text-[12px] font-semibold uppercase" style={{ color: THEME.text.muted }}>Requests</th>
                    <th className="text-right px-3 py-2 text-[12px] font-semibold uppercase" style={{ color: THEME.text.muted }}>Avg Latency</th>
                    <th className="text-right px-3 py-2 text-[12px] font-semibold uppercase" style={{ color: THEME.text.muted }}>Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.metrics?.perMinute?.slice(-10).reverse().map((m, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${THEME.borderLight}` }}>
                      <td className="px-3 py-2" style={{ fontSize: 12, color: THEME.text.secondary }}>
                        {new Date(m.minute).toLocaleTimeString()}
                      </td>
                      <td className="px-3 py-2 text-right" style={{ fontSize: 12, color: THEME.text.primary, fontWeight: 500 }}>
                        {Number(m.count).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right" style={{ fontSize: 12, color: THEME.text.secondary }}>
                        {Math.round(Number(m.avg_response_time) || 0)}ms
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span style={{
                          fontSize: 12,
                          color: Number(m.errors) > 0 ? '#EF4444' : THEME.text.secondary,
                          fontWeight: Number(m.errors) > 0 ? 600 : 400,
                        }}>
                          {Number(m.errors).toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Queue Tab */}
      {activeTab === 'queue' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {queueItems.map(queue => {
              const queueData = data?.queue?.[queue.key as keyof typeof data.queue];
              const total = (queueData?.pending || 0) + (queueData?.processing || 0);
              return (
                <div key={queue.key} style={{
                  background: THEME.panel,
                  border: `1px solid ${THEME.border}`,
                  borderRadius: 10,
                  padding: 12,
                }}>
                  <div className="flex items-center gap-2 mb-3">
                    <div style={{
                      width: 28, height: 22,
                      background: `${queue.color}12`,
                      border: `1px solid ${queue.color}35`,
                      borderRadius: 6,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Layers className="w-3.5 h-3.5" style={{ color: queue.color }} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: THEME.text.primary }}>
                      {queue.name}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span style={{ fontSize: 12, color: THEME.text.secondary }}>Pending</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: THEME.colors.amber }}>
                        {queueData?.pending || 0}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span style={{ fontSize: 12, color: THEME.text.secondary }}>Processing</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: THEME.colors.blue }}>
                        {queueData?.processing || 0}
                      </span>
                    </div>
                    <div style={{ borderTop: `1px solid ${THEME.borderLight}`, marginTop: 8, paddingTop: 8 }} className="flex items-center justify-between">
                      <span style={{ fontSize: 12, color: THEME.text.muted }}>Total</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: THEME.text.primary }}>
                        {total}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Worker Status */}
          <div style={{
            background: THEME.panel,
            border: `1px solid ${THEME.border}`,
            borderRadius: 10,
            padding: 12,
          }}>
            <div className="flex items-center gap-2 mb-3">
              <Cpu className="w-3.5 h-3.5" style={{ color: THEME.colors.purple }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: THEME.text.primary }}>
                Worker Status
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {(() => {
                // Pull real numbers from /api/monitor (falls back to 0 when broker is unreachable).
                const q = (data?.queue as Record<string, { pending: number; processing: number }> | undefined) || {}
                const workersObj = (data as unknown as { workers?: { running?: number; total?: number; total_processed?: number; total_failed?: number } })?.workers
                const activeWorkers = workersObj?.running ?? 0
                const totalJobs = workersObj?.total_processed ?? 0
                const totalFailed = workersObj?.total_failed ?? 0
                const successRate = totalJobs > 0
                  ? (((totalJobs - totalFailed) / totalJobs) * 100).toFixed(1) + '%'
                  : '—'
                const pending = Object.values(q).reduce((s, qq) => s + (qq?.pending || 0), 0)
                const processing = Object.values(q).reduce((s, qq) => s + (qq?.processing || 0), 0)
                return [
                  { name: 'Active Workers', value: activeWorkers, icon: Users, color: '#10B981' },
                  { name: 'Processed (total)', value: totalJobs, icon: Zap, color: '#3B82F6' },
                  { name: 'Success Rate', value: successRate, icon: CheckCircle, color: '#10B981' },
                  { name: 'Pending / Processing', value: `${pending} / ${processing}`, icon: Clock, color: '#8B5CF6' },
                ]
              })().map(stat => (
                <div key={stat.name} style={{
                  background: THEME.bg,
                  border: `1px solid ${THEME.borderLight}`,
                  borderRadius: 6,
                  padding: 10,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <stat.icon className="w-4 h-4" style={{ color: stat.color }} />
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 700, color: THEME.text.primary }}>
                      {stat.value}
                    </p>
                    <p style={{ fontSize: 11, color: THEME.text.muted }}>{stat.name}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Errors Tab */}
      {activeTab === 'errors' && (
        <div style={{
          background: THEME.panel,
          border: `1px solid ${THEME.border}`,
          borderRadius: 10,
          overflow: 'hidden',
        }}>
          <div className="flex items-center justify-between px-3 py-2.5 border-b" style={{ borderColor: THEME.borderLight }}>
            <div className="flex items-center gap-2">
              <div style={{
                width: 28, height: 22,
                background: '#EF444412',
                border: '1px solid #EF444435',
                borderRadius: 6,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <AlertCircle className="w-3.5 h-3.5" style={{ color: '#EF4444' }} />
              </div>
              <div>
                <h3 style={{ fontSize: 13, fontWeight: 600, color: THEME.text.primary }}>Recent Errors</h3>
                <p style={{ fontSize: 11, color: THEME.text.muted }}>Last 10 failed requests</p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: `1px solid ${THEME.borderLight}`, background: THEME.bg }}>
                  <th className="text-left px-3 py-2 text-[12px] font-semibold uppercase" style={{ color: THEME.text.muted }}>Time</th>
                  <th className="text-left px-3 py-2 text-[12px] font-semibold uppercase" style={{ color: THEME.text.muted }}>Method</th>
                  <th className="text-left px-3 py-2 text-[12px] font-semibold uppercase" style={{ color: THEME.text.muted }}>Path</th>
                  <th className="text-center px-3 py-2 text-[12px] font-semibold uppercase" style={{ color: THEME.text.muted }}>Status</th>
                  <th className="text-right px-3 py-2 text-[12px] font-semibold uppercase" style={{ color: THEME.text.muted }}>Latency</th>
                  <th className="text-left px-3 py-2 text-[12px] font-semibold uppercase" style={{ color: THEME.text.muted }}>Message</th>
                </tr>
              </thead>
              <tbody>
                {data?.errors?.length ? (
                  data.errors.map((error) => (
                    <tr key={error.id} style={{ borderBottom: `1px solid ${THEME.borderLight}` }} className="hover:bg-[var(--t-panel-hover)]">
                      <td className="px-3 py-2" style={{ fontSize: 12, color: THEME.text.muted }}>
                        {new Date(error.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="px-3 py-2">
                        <span style={{
                          padding: '1px 5px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                          background: '#EF444415', color: '#EF4444', border: '1px solid #EF444430',
                        }}>
                          {error.method}
                        </span>
                      </td>
                      <td className="px-3 py-2" style={{ fontSize: 12, color: THEME.text.secondary, fontFamily: FONT }}>
                        {error.path}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span style={{
                          padding: '1px 6px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                          background: '#EF444415', color: '#EF4444',
                        }}>
                          {error.statusCode}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right" style={{ fontSize: 12, color: THEME.text.muted }}>
                        {error.responseTime}ms
                      </td>
                      <td className="px-3 py-2 truncate" style={{ fontSize: 12, color: THEME.text.secondary, maxWidth: 200 }}>
                        {error.message}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <CheckCircle className="w-8 h-8" style={{ color: '#10B981' }} />
                        <p style={{ fontSize: 13, color: THEME.text.secondary }}>No recent errors</p>
                        <p style={{ fontSize: 11, color: THEME.text.muted }}>Everything is running smoothly</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
