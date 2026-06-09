'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';
import { Activity, Cpu, HardDrive, Clock, Layers } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';

const THEME = {
  bg: 'var(--t-bg)',
  panel: 'var(--t-panel)',
  border: 'var(--t-border)',
  borderLight: 'var(--t-border-light)',
  text: { primary: 'var(--t-text)', secondary: 'var(--t-text-secondary)', muted: 'var(--t-text-muted)' },
  colors: {
    blue: '#3B82F6',
    emerald: '#10B981',
    red: '#EF4444',
    amber: '#F59E0B',
    purple: '#8B5CF6',
  }
};

interface MetricPoint {
  time: string;
  timestamp: number;
  cpu: number;
  memory: number;
  pending: number;
  processing: number;
  uptime: number;
}

export function LiveMetricsChart() {
  const [data, setData] = useState<MetricPoint[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const token = useAuthStore((s) => s.accessToken);

  const fetchMetrics = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch('/orch/api/monitor?type=metrics', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      const metrics = data.metrics || {};

      const now = new Date();
      const newPoint: MetricPoint = {
        time: now.toLocaleTimeString('th-TH', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        timestamp: now.getTime(),
        cpu: Math.round((metrics.cpuUsage || 0) * 100) / 100,
        // broker sends memoryUsageMb directly — don't divide again
        memory: Math.round((metrics.memoryUsageMb || (metrics.memoryUsage ? metrics.memoryUsage / 1024 / 1024 : 0)) * 100) / 100,
        pending: 0,
        processing: 0,
        uptime: Math.round((metrics.uptimeSeconds || metrics.uptime || 0) / 60),
      };

      setData(prev => {
        const newData = [...prev, newPoint];
        if (newData.length > 60) {
          return newData.slice(-60);
        }
        return newData;
      });

      setIsConnected(true);
      setLastUpdate(now);
      setError(null);
    } catch (err) {
      setIsConnected(false);
      setError(`Cannot connect to broker${err instanceof Error ? ': ' + err.message : ''}`);
    }
  }, [token]);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 2000);
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  const latest = data[data.length - 1];

  const statCards = [
    { label: 'CPU Usage', value: latest ? `${latest.cpu}%` : '0%', icon: Cpu, color: THEME.colors.blue },
    { label: 'Memory', value: latest ? `${latest.memory} MB` : '0 MB', icon: HardDrive, color: THEME.colors.purple },
    { label: 'Queue Pending', value: latest ? `${latest.pending}` : '0', icon: Layers, color: THEME.colors.amber },
    { label: 'Uptime', value: latest ? `${latest.uptime} min` : '0 min', icon: Clock, color: THEME.colors.emerald },
  ];

  return (
    <div className="space-y-4">
      {/* Status Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 10px',
            borderRadius: 6,
            fontSize: 12, fontWeight: 500,
            background: isConnected ? '#10B98112' : '#EF444412',
            color: isConnected ? THEME.colors.emerald : THEME.colors.red,
            border: `1px solid ${isConnected ? '#10B98130' : '#EF444430'}`,
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: isConnected ? THEME.colors.emerald : THEME.colors.red,
              boxShadow: isConnected ? '0 0 6px #10B98180' : 'none',
            }} />
            {isConnected ? 'Live' : 'Disconnected'}
          </div>
          {lastUpdate && (
            <span style={{ fontSize: 12, color: THEME.text.muted }}>
              Last updated: {lastUpdate.toLocaleTimeString('en-US')}
            </span>
          )}
        </div>
        {error && (
          <span style={{ fontSize: 12, color: THEME.colors.red }}>{error}</span>
        )}
      </div>

      {/* Current Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {statCards.map(card => (
          <div key={card.label} style={{
            background: THEME.panel,
            border: `1px solid ${THEME.border}`,
            borderRadius: 8,
            padding: 12,
          }}>
            <div className="flex items-center gap-2 mb-2">
              <div style={{
                width: 28, height: 28, borderRadius: 6,
                background: `${card.color}12`,
                border: `1px solid ${card.color}30`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <card.icon size={14} style={{ color: card.color }} />
              </div>
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: THEME.text.primary, lineHeight: 1.2 }}>
              {card.value}
            </div>
            <div style={{ fontSize: 11, color: THEME.text.muted, marginTop: 2 }}>
              {card.label}
            </div>
          </div>
        ))}
      </div>

      {/* CPU & Memory Chart */}
      <div style={{
        background: THEME.panel,
        border: `1px solid ${THEME.border}`,
        borderRadius: 8,
        padding: 16,
      }}>
        <div className="flex items-center gap-2 mb-4">
          <Activity size={14} style={{ color: THEME.colors.blue }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: THEME.text.primary }}>
            CPU & Memory Usage
          </span>
        </div>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--t-border-light)" />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 11, fill: 'var(--t-text-muted)' }}
              stroke="var(--t-border)"
              interval="preserveStartEnd"
            />
            <YAxis yAxisId="left" tick={{ fontSize: 11, fill: 'var(--t-text-muted)' }} stroke="var(--t-border)" />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: 'var(--t-text-muted)' }} stroke="var(--t-border)" />
            <Tooltip
              contentStyle={{
                background: 'var(--t-panel)',
                border: '1px solid var(--t-border)',
                borderRadius: 6,
                fontSize: 12,
                color: 'var(--t-text)',
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: 'var(--t-text-secondary)' }} />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="cpu"
              stroke={THEME.colors.red}
              strokeWidth={2}
              dot={false}
              name="CPU (%)"
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="memory"
              stroke={THEME.colors.blue}
              strokeWidth={2}
              dot={false}
              name="Memory (MB)"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Queue Metrics Chart */}
      <div style={{
        background: THEME.panel,
        border: `1px solid ${THEME.border}`,
        borderRadius: 8,
        padding: 16,
      }}>
        <div className="flex items-center gap-2 mb-4">
          <Layers size={14} style={{ color: THEME.colors.amber }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: THEME.text.primary }}>
            Queue Metrics
          </span>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--t-border-light)" />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 11, fill: 'var(--t-text-muted)' }}
              stroke="var(--t-border)"
              interval="preserveStartEnd"
            />
            <YAxis tick={{ fontSize: 11, fill: 'var(--t-text-muted)' }} stroke="var(--t-border)" />
            <Tooltip
              contentStyle={{
                background: 'var(--t-panel)',
                border: '1px solid var(--t-border)',
                borderRadius: 6,
                fontSize: 12,
                color: 'var(--t-text)',
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: 'var(--t-text-secondary)' }} />
            <Area
              type="monotone"
              dataKey="pending"
              stackId="1"
              stroke={THEME.colors.amber}
              fill={THEME.colors.amber}
              fillOpacity={0.15}
              name="Pending Jobs"
            />
            <Area
              type="monotone"
              dataKey="processing"
              stackId="1"
              stroke={THEME.colors.emerald}
              fill={THEME.colors.emerald}
              fillOpacity={0.15}
              name="Processing Jobs"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Data Table */}
      {data.length > 0 && (
        <div style={{
          background: THEME.panel,
          border: `1px solid ${THEME.border}`,
          borderRadius: 8,
          padding: 16,
        }}>
          <div className="flex items-center gap-2 mb-4">
            <Clock size={14} style={{ color: THEME.text.muted }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: THEME.text.primary }}>
              Recent Metrics (Last 10 points)
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: `1px solid ${THEME.border}` }}>
                  <th className="text-left p-2" style={{ fontSize: 12, fontWeight: 600, color: THEME.text.secondary }}>Time</th>
                  <th className="text-right p-2" style={{ fontSize: 12, fontWeight: 600, color: THEME.text.secondary }}>CPU</th>
                  <th className="text-right p-2" style={{ fontSize: 12, fontWeight: 600, color: THEME.text.secondary }}>Memory</th>
                  <th className="text-right p-2" style={{ fontSize: 12, fontWeight: 600, color: THEME.text.secondary }}>Pending</th>
                  <th className="text-right p-2" style={{ fontSize: 12, fontWeight: 600, color: THEME.text.secondary }}>Processing</th>
                </tr>
              </thead>
              <tbody>
                {data.slice(-10).reverse().map((point, idx) => (
                  <tr key={idx} style={{ borderBottom: `1px solid ${THEME.borderLight}` }}>
                    <td className="p-2 font-mono" style={{ fontSize: 12, color: THEME.text.primary }}>{point.time}</td>
                    <td className="text-right p-2" style={{ fontSize: 12, color: THEME.text.primary }}>{point.cpu}%</td>
                    <td className="text-right p-2" style={{ fontSize: 12, color: THEME.text.primary }}>{point.memory} MB</td>
                    <td className="text-right p-2" style={{ fontSize: 12, color: THEME.text.primary }}>{point.pending}</td>
                    <td className="text-right p-2" style={{ fontSize: 12, color: THEME.text.primary }}>{point.processing}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
