'use client';

// TODO: External Workers Support (Future)
// See: docs/external-workers-design.md
// - Add worker type selector (built-in vs external)
// - Show worker endpoint/hostname for external workers
// - Add connection status indicator for external workers

import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { 
  Cpu, 
  Play, 
  Square, 
  RotateCcw, 
  Trash2, 
  Plus, 
  AlertCircle, 
  CheckCircle, 
  Pause,
  X,
  AlertTriangle,
  MoreHorizontal,
  Settings2,
  RefreshCw,
  WifiOff,
  Edit2,
  Check
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

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

interface WorkerConfig {
  auto_restart: boolean;
  enable_logging: boolean;
  high_priority: boolean;
  max_retries: number;
  timeout: number;
}

interface Worker {
  id: string;
  name: string;
  queue: string;
  status: 'running' | 'stopped' | 'paused' | 'error';
  host: string;
  pid: number;
  startedAt: string;
  lastActivity: string | null;
  processed: number;
  failed: number;
  cpu: number;
  memory: number;
  config?: WorkerConfig;
}

interface WorkerData {
  success: boolean;
  stats: {
    total: number;
    running: number;
    paused: number;
    stopped: number;
    error: number;
  };
  workers: Worker[];
  timestamp: string;
}

// Simple Toggle Switch Component
function ToggleSwitch({ 
  checked, 
  onChange, 
  label 
}: { 
  checked: boolean; 
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-gray-700">{label}</span>
      <button
        onClick={() => onChange(!checked)}
        className={`
          relative inline-flex h-6 w-11 items-center rounded-full transition-colors
          ${checked ? 'bg-blue-600' : 'bg-[var(--t-border)]'}
        `}
      >
        <span
          className={`
            inline-block h-4 w-4 transform rounded-full bg-[var(--t-panel)] transition-transform
            ${checked ? 'translate-x-6' : 'translate-x-1'}
          `}
        />
      </button>
    </div>
  );
}

export function WorkersTab() {
  const queryClient = useQueryClient();
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  
  // Dialog states
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [workerToDelete, setWorkerToDelete] = useState<Worker | null>(null);
  
  // Add worker form
  const [newWorkerName, setNewWorkerName] = useState('');
  const [newWorkerQueue, setNewWorkerQueue] = useState('default');
  
  // Edit name states
  const [editingWorkerId, setEditingWorkerId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState('');
  
  // Config states - with default values
  const [configAutoRestart, setConfigAutoRestart] = useState(true);
  const [configEnableLogging, setConfigEnableLogging] = useState(true);
  const [configHighPriority, setConfigHighPriority] = useState(false);
  const [hasConfigChanges, setHasConfigChanges] = useState(false);

  // Fetch workers from API.
  //
  // `placeholderData: keepPreviousData` + `isPending` guard fixes the
  // flicker admins reported: when the broker occasionally returns 5xx
  // or times out on a refetch, we used to flip to the full-screen
  // "Failed to load workers" view and then back to the table 5s later.
  // Now we keep rendering the last good snapshot and only show the
  // error card on the very first load.
  const { data: workerData, isPending, error, refetch, isFetching } = useQuery<WorkerData>({
    queryKey: ['workers'],
    queryFn: async () => {
      const response = await fetch('/orch/api/workers');
      if (!response.ok) {
        throw new Error('Failed to fetch workers');
      }
      return response.json();
    },
    refetchInterval: 5000,
    placeholderData: (prev) => prev,
    staleTime: 2000,
  });

  const workers = workerData?.workers || [];
  const stats = workerData?.stats || { total: 0, running: 0, paused: 0, stopped: 0, error: 0 };

  // Load config when opening dialog
  useEffect(() => {
    if (showConfigDialog && selectedWorker) {
      const cfg = selectedWorker.config;
      setConfigAutoRestart(cfg?.auto_restart ?? true);
      setConfigEnableLogging(cfg?.enable_logging ?? true);
      setConfigHighPriority(cfg?.high_priority ?? false);
      setHasConfigChanges(false);
    }
  }, [showConfigDialog, selectedWorker]);

  // Mutations
  const actionMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: string }) => {
      const response = await fetch(`/orch/api/workers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) throw new Error('Action failed');
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['workers'] });
      toast.success(`Worker ${variables.action}ed successfully`);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Action failed');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/orch/api/workers/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Delete failed');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workers'] });
      setShowDeleteConfirm(false);
      setWorkerToDelete(null);
      toast.success('Worker removed successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Delete failed');
    },
  });

  const createMutation = useMutation({
    mutationFn: async ({ name, queue }: { name: string; queue: string }) => {
      const response = await fetch('/orch/api/workers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, queue }),
      });
      if (!response.ok) throw new Error('Create failed');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workers'] });
      setShowAddDialog(false);
      setNewWorkerName('');
      setNewWorkerQueue('default');
      toast.success('Worker created successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Create failed');
    },
  });

  const configMutation = useMutation({
    mutationFn: async ({ id, config }: { id: string; config: Partial<WorkerConfig> }) => {
      const response = await fetch(`/orch/api/workers/${id}/config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!response.ok) throw new Error('Update config failed');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workers'] });
      toast.success('Configuration saved');
      setShowConfigDialog(false);
      setHasConfigChanges(false);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to save configuration');
    },
  });

  const handleStart = useCallback((workerId: string) => {
    actionMutation.mutate({ id: workerId, action: 'start' });
  }, [actionMutation]);

  const handleStop = useCallback((workerId: string) => {
    actionMutation.mutate({ id: workerId, action: 'stop' });
  }, [actionMutation]);

  const handlePause = useCallback((workerId: string) => {
    actionMutation.mutate({ id: workerId, action: 'pause' });
  }, [actionMutation]);

  const handleResume = useCallback((workerId: string) => {
    actionMutation.mutate({ id: workerId, action: 'start' });
  }, [actionMutation]);

  const handleRestart = useCallback((workerId: string) => {
    actionMutation.mutate({ id: workerId, action: 'restart' });
  }, [actionMutation]);

  const handleRemove = useCallback((worker: Worker) => {
    setWorkerToDelete(worker);
    setShowDeleteConfirm(true);
  }, []);

  const confirmDelete = useCallback(() => {
    if (workerToDelete) {
      deleteMutation.mutate(workerToDelete.id);
    }
  }, [workerToDelete, deleteMutation]);

  const handleAddWorker = useCallback(() => {
    if (!newWorkerName.trim()) {
      toast.error('Please enter a worker name');
      return;
    }
    createMutation.mutate({ 
      name: newWorkerName.trim(), 
      queue: newWorkerQueue 
    });
  }, [newWorkerName, newWorkerQueue, createMutation]);

  const startEditName = (worker: Worker) => {
    setEditingWorkerId(worker.id);
    setEditNameValue(worker.name);
  };

  const saveEditName = () => {
    if (!editNameValue.trim()) {
      toast.error('Name cannot be empty');
      return;
    }
    // TODO: implement rename API
    setEditingWorkerId(null);
    setEditNameValue('');
    toast.success('Rename not implemented yet');
  };

  const cancelEditName = () => {
    setEditingWorkerId(null);
    setEditNameValue('');
  };

  const getStatusBadge = (status: Worker['status']) => {
    const config = {
      running: { color: '#059669', bg: '#D1FAE5', border: '#A7F3D0', label: 'Running', dot: '#10B981' },
      paused: { color: '#D97706', bg: '#FEF3C7', border: '#FDE68A', label: 'Paused', dot: '#F59E0B' },
      stopped: { color: '#6B7280', bg: '#F3F4F6', border: '#E5E7EB', label: 'Stopped', dot: '#9CA3AF' },
      error: { color: '#DC2626', bg: '#FEE2E2', border: '#FECACA', label: 'Error', dot: '#EF4444' },
    };
    const c = config[status];
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        color: c.color,
        background: c.bg,
        border: `1px solid ${c.border}`,
      }}>
        <span style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: c.dot,
          opacity: status === 'running' ? 1 : 0.6,
          boxShadow: status === 'running' ? `0 0 4px ${c.dot}` : 'none',
        }} />
        {c.label}
      </span>
    );
  };

  // Initial load only (no cached data yet). Once we have data from any
  // previous fetch, we keep rendering it across refetches.
  if (isPending && !workerData) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  // Error card shows only when we have never received data. A transient
  // refetch failure falls through to the table view with stale data.
  if (error && !workerData) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-red-500">
        <WifiOff className="w-12 h-12 mb-2" />
        <p className="text-sm">Failed to load workers</p>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-4">
          <RefreshCw className="w-4 h-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'Prompt', sans-serif" }}>
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-5">
        <StatCard title="Total Workers" value={stats.total} icon={Cpu} color={THEME.colors.blue} />
        <StatCard title="Running" value={stats.running} icon={Play} color={THEME.colors.emerald} />
        <StatCard title="Paused" value={stats.paused} icon={Pause} color={THEME.colors.amber} />
        <StatCard title="Stopped" value={stats.stopped} icon={Square} color={THEME.colors.cyan} />
        <StatCard title="Errors" value={stats.error} icon={AlertCircle} color={THEME.colors.red} />
        <StatCard 
          title="Processed" 
          value={workers.reduce((sum, w) => sum + w.processed, 0).toLocaleString()} 
          icon={CheckCircle} 
          color={THEME.colors.purple} 
        />
        <StatCard 
          title="Failed" 
          value={workers.reduce((sum, w) => sum + w.failed, 0).toLocaleString()} 
          icon={AlertCircle} 
          color={THEME.colors.red} 
        />
      </div>

      {/* Actions Bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 style={{ fontSize: 14, fontWeight: 600, color: THEME.text.primary }}>
            Worker Instances
          </h3>
          <span style={{
            fontSize: 11,
            padding: '2px 8px',
            background: THEME.bg,
            border: `1px solid ${THEME.border}`,
            borderRadius: 4,
            color: THEME.text.secondary,
            fontWeight: 500,
          }}>
            {workers.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Background refetch failed but we're still showing prior data — flag
              it so the admin knows the numbers may be stale. */}
          {error && workerData && (
            <span className="flex items-center gap-1 text-[11px] text-amber-500">
              <WifiOff className="w-3.5 h-3.5" />
              Live updates paused
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="h-9 text-xs bg-[var(--t-panel)] hover:bg-[var(--t-panel-hover)]"
          >
            <RefreshCw className={`w-4 h-4 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddDialog(true)}
            className="h-9 text-xs bg-[var(--t-panel)] hover:bg-[var(--t-panel-hover)]"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Add Worker
          </Button>
        </div>
      </div>

      {/* Workers Table */}
      <div style={{
        background: THEME.panel,
        border: `1px solid ${THEME.border}`,
        borderRadius: 6,
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}>
        <table className="w-full">
          <thead>
            <tr style={{ background: THEME.bg, borderBottom: `1px solid ${THEME.border}` }}>
              <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide" style={{ color: THEME.text.muted }}>Worker</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide" style={{ color: THEME.text.muted }}>Queue</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide" style={{ color: THEME.text.muted }}>Status</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wide" style={{ color: THEME.text.muted }}>Host:PID</th>
              <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wide" style={{ color: THEME.text.muted }}>Processed</th>
              <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wide" style={{ color: THEME.text.muted }}>Failed</th>
              <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wide" style={{ color: THEME.text.muted }}>CPU</th>
              <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wide" style={{ color: THEME.text.muted }}>Memory</th>
              <th className="text-center px-4 py-3 text-[11px] font-semibold uppercase tracking-wide" style={{ color: THEME.text.muted }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {workers.map((worker) => (
              <tr 
                key={worker.id} 
                style={{ borderBottom: `1px solid ${THEME.borderLight}` }}
                className="hover:bg-[var(--t-panel-hover)] transition-colors"
              >
                <td className="px-4 py-3">
                  {editingWorkerId === worker.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editNameValue}
                        onChange={(e) => setEditNameValue(e.target.value)}
                        className="h-8 text-xs w-32 px-2 border rounded"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEditName();
                          if (e.key === 'Escape') cancelEditName();
                        }}
                      />
                      <button 
                        onClick={saveEditName}
                        className="p-1 bg-green-100 text-green-600 rounded hover:bg-green-200"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={cancelEditName}
                        className="p-1 bg-[var(--t-panel-hover)] text-[var(--t-text-secondary)] rounded hover:bg-[var(--t-border)]"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: THEME.text.primary }}>
                          {worker.name}
                        </div>
                        <div style={{ fontSize: 10, color: THEME.text.muted, marginTop: 2 }}>
                          Started {new Date(worker.startedAt).toLocaleDateString('th-TH')}
                        </div>
                      </div>
                      <button 
                        onClick={() => startEditName(worker)}
                        className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded opacity-0 group-hover:opacity-100 transition-all"
                        style={{ marginLeft: 4 }}
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className="text-[10px] font-medium px-2 py-0.5">
                    {worker.queue}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  {getStatusBadge(worker.status)}
                </td>
                <td className="px-4 py-3">
                  <div style={{ fontSize: 11, color: THEME.text.secondary, fontFamily: 'monospace' }}>
                    {worker.status === 'error' ? '-' : `${worker.host}:${worker.pid}`}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <span style={{ fontSize: 12, fontWeight: 500, color: THEME.text.primary, fontFamily: 'monospace' }}>
                    {worker.processed.toLocaleString()}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span style={{ 
                    fontSize: 12, 
                    fontWeight: 500, 
                    color: worker.failed > 0 ? THEME.colors.red : THEME.text.muted,
                    fontFamily: 'monospace'
                  }}>
                    {worker.failed.toLocaleString()}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span style={{ fontSize: 11, color: THEME.text.secondary, fontFamily: 'monospace' }}>
                    {worker.status === 'running' ? `${worker.cpu.toFixed(1)}%` : '-'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span style={{ fontSize: 11, color: THEME.text.secondary, fontFamily: 'monospace' }}>
                    {worker.status === 'running' ? `${worker.memory.toFixed(1)} MB` : '-'}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-[var(--t-border)]">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent 
                      align="end" 
                      className="w-[180px] bg-[var(--t-panel)] border border-[var(--t-border)] shadow-lg p-1"
                    >
                      <DropdownMenuItem 
                        onClick={() => startEditName(worker)} 
                        className="text-xs cursor-pointer hover:bg-blue-50 rounded-sm px-2 py-1.5 h-8"
                      >
                        <Edit2 className="w-3.5 h-3.5 mr-2 text-blue-600 flex-shrink-0" />
                        <span className="truncate">Rename</span>
                      </DropdownMenuItem>
                      
                      <DropdownMenuSeparator className="my-1 h-px bg-[var(--t-panel-hover)]" />
                      
                      {(worker.status === 'stopped' || worker.status === 'error') && (
                        <DropdownMenuItem 
                          onClick={() => handleStart(worker.id)} 
                          className="text-xs cursor-pointer hover:bg-green-50 rounded-sm px-2 py-1.5 h-8"
                        >
                          <Play className="w-3.5 h-3.5 mr-2 text-green-600 flex-shrink-0" />
                          <span className="truncate">Start</span>
                        </DropdownMenuItem>
                      )}
                      
                      {worker.status === 'running' && (
                        <DropdownMenuItem 
                          onClick={() => handlePause(worker.id)} 
                          className="text-xs cursor-pointer hover:bg-amber-50 rounded-sm px-2 py-1.5 h-8"
                        >
                          <Pause className="w-3.5 h-3.5 mr-2 text-amber-600 flex-shrink-0" />
                          <span className="truncate">Pause</span>
                        </DropdownMenuItem>
                      )}
                      
                      {worker.status === 'paused' && (
                        <DropdownMenuItem 
                          onClick={() => handleResume(worker.id)} 
                          className="text-xs cursor-pointer hover:bg-green-50 rounded-sm px-2 py-1.5 h-8"
                        >
                          <Play className="w-3.5 h-3.5 mr-2 text-green-600 flex-shrink-0" />
                          <span className="truncate">Resume</span>
                        </DropdownMenuItem>
                      )}
                      
                      {(worker.status === 'running' || worker.status === 'paused') && (
                        <DropdownMenuItem 
                          onClick={() => handleStop(worker.id)} 
                          className="text-xs cursor-pointer hover:bg-[var(--t-panel-hover)] rounded-sm px-2 py-1.5 h-8"
                        >
                          <Square className="w-3.5 h-3.5 mr-2 text-[var(--t-text-secondary)] flex-shrink-0" />
                          <span className="truncate">Stop</span>
                        </DropdownMenuItem>
                      )}
                      
                      <DropdownMenuSeparator className="my-1 h-px bg-[var(--t-panel-hover)]" />
                      
                      <DropdownMenuItem 
                        onClick={() => handleRestart(worker.id)} 
                        className="text-xs cursor-pointer hover:bg-blue-50 rounded-sm px-2 py-1.5 h-8"
                      >
                        <RotateCcw className="w-3.5 h-3.5 mr-2 text-blue-600 flex-shrink-0" />
                        <span className="truncate">Restart</span>
                      </DropdownMenuItem>
                      
                      <DropdownMenuItem 
                        onClick={() => { 
                          setSelectedWorker(worker); 
                          setShowConfigDialog(true); 
                        }} 
                        className="text-xs cursor-pointer hover:bg-[var(--t-panel-hover)] rounded-sm px-2 py-1.5 h-8"
                      >
                        <Settings2 className="w-3.5 h-3.5 mr-2 text-[var(--t-text-secondary)] flex-shrink-0" />
                        <span className="truncate">Configure</span>
                      </DropdownMenuItem>
                      
                      <DropdownMenuSeparator className="my-1 h-px bg-[var(--t-panel-hover)]" />
                      
                      <DropdownMenuItem 
                        onClick={() => handleRemove(worker)} 
                        className="text-xs text-red-600 cursor-pointer hover:bg-red-50 rounded-sm px-2 py-1.5 h-8"
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-2 flex-shrink-0" />
                        <span className="truncate">Remove</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
            {workers.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Cpu className="w-12 h-12 text-gray-300" />
                    <p className="text-sm text-gray-500">No workers found</p>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setShowAddDialog(true)}
                      className="mt-2"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Worker
                    </Button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add Worker Dialog */}
      {showAddDialog && (
        <div 
          className="fixed inset-0 z-[100]"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
          onClick={() => setShowAddDialog(false)}
        >
          <div className="flex items-center justify-center min-h-screen p-4">
            <div 
              className="bg-[var(--t-panel)] rounded-lg w-full max-w-md"
              style={{ boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-[var(--t-border)]">
                <h2 className="text-sm font-semibold text-gray-900">Add New Worker</h2>
                <button 
                  onClick={() => setShowAddDialog(false)}
                  className="p-1 hover:bg-[var(--t-border)] rounded-md transition-colors"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">
                    Worker Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newWorkerName}
                    onChange={(e) => setNewWorkerName(e.target.value)}
                    placeholder="e.g., Worker-001"
                    className="w-full h-10 px-3 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">
                    Queue
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {['default', 'high', 'low', 'critical'].map(queue => (
                      <button
                        key={queue}
                        onClick={() => setNewWorkerQueue(queue)}
                        className={`flex items-center gap-2 p-2.5 text-left border rounded-md transition-all ${
                          newWorkerQueue === queue 
                            ? 'border-blue-500 bg-blue-50' 
                            : 'border-[var(--t-border)] hover:border-blue-300 hover:bg-[var(--t-panel-hover)]'
                        }`}
                      >
                        <div className={`p-1.5 rounded ${newWorkerQueue === queue ? 'bg-blue-200' : 'bg-[var(--t-panel-hover)]'}`}>
                          <Cpu className={`w-3.5 h-3.5 ${newWorkerQueue === queue ? 'text-blue-700' : 'text-[var(--t-text-secondary)]'}`} />
                        </div>
                        <span className={`text-xs font-medium capitalize ${newWorkerQueue === queue ? 'text-blue-700' : 'text-gray-700'}`}>
                          {queue}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex gap-3 p-4 pt-2 border-t border-[var(--t-panel-hover)]">
                <Button 
                  variant="outline" 
                  className="flex-1 h-9 text-xs bg-[var(--t-panel)]"
                  onClick={() => {
                    setShowAddDialog(false);
                    setNewWorkerName('');
                    setNewWorkerQueue('default');
                  }}
                >
                  Cancel
                </Button>
                <Button 
                  className="flex-1 h-9 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={handleAddWorker}
                  disabled={createMutation.isPending || !newWorkerName.trim()}
                >
                  {createMutation.isPending ? 'Creating...' : 'Create Worker'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CONFIG DIALOG - SIMPLIFIED VERSION */}
      {showConfigDialog && selectedWorker && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
          onClick={() => setShowConfigDialog(false)}
        >
          <div 
            className="bg-[var(--t-panel)] rounded-lg w-full max-w-md shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-[var(--t-border)]">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Worker Configuration</h2>
                <p className="text-xs text-gray-500 mt-0.5">{selectedWorker.name}</p>
              </div>
              <button 
                onClick={() => setShowConfigDialog(false)}
                className="p-1 hover:bg-[var(--t-border)] rounded-md transition-colors"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4">
              {/* Info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[var(--t-input)] p-3 rounded-md border border-[var(--t-panel-hover)]">
                  <label className="text-xs text-gray-500 block mb-1">Worker ID</label>
                  <div className="font-mono text-xs text-gray-900 font-medium">{selectedWorker.id}</div>
                </div>
                <div className="bg-[var(--t-input)] p-3 rounded-md border border-[var(--t-panel-hover)]">
                  <label className="text-xs text-gray-500 block mb-1">Queue</label>
                  <span className="text-xs font-medium">{selectedWorker.queue}</span>
                </div>
              </div>

              {/* Settings - WORKING VERSION */}
              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-semibold text-gray-900">Settings</h4>
                  {hasConfigChanges && (
                    <span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
                      Unsaved changes
                    </span>
                  )}
                </div>
                
                <div className="space-y-1">
                  {/* Auto Restart Toggle */}
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-gray-700">Auto-restart on failure</span>
                    <button
                      onClick={() => {
                        setConfigAutoRestart(!configAutoRestart);
                        setHasConfigChanges(true);
                      }}
                      className={`
                        relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                        ${configAutoRestart ? 'bg-blue-600' : 'bg-[var(--t-border)]'}
                      `}
                    >
                      <span
                        className={`
                          inline-block h-4 w-4 transform rounded-full bg-[var(--t-panel)] transition-transform
                          ${configAutoRestart ? 'translate-x-6' : 'translate-x-1'}
                        `}
                      />
                    </button>
                  </div>

                  {/* Enable Logging Toggle */}
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-gray-700">Enable logging</span>
                    <button
                      onClick={() => {
                        setConfigEnableLogging(!configEnableLogging);
                        setHasConfigChanges(true);
                      }}
                      className={`
                        relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                        ${configEnableLogging ? 'bg-blue-600' : 'bg-[var(--t-border)]'}
                      `}
                    >
                      <span
                        className={`
                          inline-block h-4 w-4 transform rounded-full bg-[var(--t-panel)] transition-transform
                          ${configEnableLogging ? 'translate-x-6' : 'translate-x-1'}
                        `}
                      />
                    </button>
                  </div>

                  {/* High Priority Toggle */}
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-gray-700">High priority mode</span>
                    <button
                      onClick={() => {
                        setConfigHighPriority(!configHighPriority);
                        setHasConfigChanges(true);
                      }}
                      className={`
                        relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                        ${configHighPriority ? 'bg-blue-600' : 'bg-[var(--t-border)]'}
                      `}
                    >
                      <span
                        className={`
                          inline-block h-4 w-4 transform rounded-full bg-[var(--t-panel)] transition-transform
                          ${configHighPriority ? 'translate-x-6' : 'translate-x-1'}
                        `}
                      />
                    </button>
                  </div>
                </div>
              </div>

              {/* Status Control */}
              <div className="border-t pt-4">
                <h4 className="text-xs font-semibold text-gray-900 mb-3">Status Control</h4>
                <div className="flex gap-2">
                  {selectedWorker.status === 'running' ? (
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="flex-1 h-9 text-xs border-amber-300 text-amber-700 hover:bg-amber-50 bg-[var(--t-panel)]"
                      onClick={() => { handlePause(selectedWorker.id); setShowConfigDialog(false); }}
                    >
                      <Pause className="w-3.5 h-3.5 mr-1.5" />
                      Pause
                    </Button>
                  ) : (
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="flex-1 h-9 text-xs border-green-300 text-green-700 hover:bg-green-50 bg-[var(--t-panel)]"
                      onClick={() => { handleStart(selectedWorker.id); setShowConfigDialog(false); }}
                    >
                      <Play className="w-3.5 h-3.5 mr-1.5" />
                      Start
                    </Button>
                  )}
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="flex-1 h-9 text-xs bg-[var(--t-panel)]"
                    onClick={() => { handleRestart(selectedWorker.id); setShowConfigDialog(false); }}
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                    Restart
                  </Button>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 p-4 border-t border-[var(--t-border)] bg-[var(--t-input)] rounded-b-lg">
              {hasConfigChanges && (
                <Button 
                  variant="outline" 
                  size="sm"
                  className="h-9 text-xs bg-[var(--t-panel)]"
                  onClick={() => {
                    // Reset to original values
                    const cfg = selectedWorker.config;
                    setConfigAutoRestart(cfg?.auto_restart ?? true);
                    setConfigEnableLogging(cfg?.enable_logging ?? true);
                    setConfigHighPriority(cfg?.high_priority ?? false);
                    setHasConfigChanges(false);
                  }}
                >
                  Reset
                </Button>
              )}
              <Button 
                variant="outline" 
                size="sm"
                className="h-9 text-xs bg-[var(--t-panel)]"
                onClick={() => setShowConfigDialog(false)}
              >
                {hasConfigChanges ? 'Cancel' : 'Close'}
              </Button>
              {hasConfigChanges && (
                <Button 
                  size="sm"
                  className="h-9 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => {
                    configMutation.mutate({
                      id: selectedWorker.id,
                      config: {
                        auto_restart: configAutoRestart,
                        enable_logging: configEnableLogging,
                        high_priority: configHighPriority,
                      },
                    });
                  }}
                  disabled={configMutation.isPending}
                >
                  {configMutation.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Dialog */}
      {showDeleteConfirm && workerToDelete && (
        <div 
          className="fixed inset-0 z-[101] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div 
            className="bg-[var(--t-panel)] rounded-lg w-full max-w-sm shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-sm font-semibold text-gray-900 mb-1">Remove Worker?</h3>
              <p className="text-xs text-gray-500">
                Are you sure you want to remove <span className="font-medium">{workerToDelete.name}</span>? This action cannot be undone.
              </p>
            </div>
            <div className="flex gap-3 p-4 pt-0">
              <Button 
                variant="outline" 
                className="flex-1 h-9 text-xs bg-[var(--t-panel)]"
                onClick={() => setShowDeleteConfirm(false)}
              >
                Cancel
              </Button>
              <Button 
                variant="destructive"
                className="flex-1 h-9 text-xs"
                onClick={confirmDelete}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? 'Removing...' : 'Remove'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ 
  title, 
  value, 
  icon: Icon, 
  color 
}: { 
  title: string; 
  value: string | number; 
  icon: any; 
  color: string;
}) {
  return (
    <div style={{
      background: THEME.panel,
      border: `1px solid ${THEME.border}`,
      borderRadius: 6,
      padding: '12px 14px',
      boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
    }}>
      <div className="flex items-center gap-3">
        <div style={{
          width: 28, height: 24,
          background: `${color}15`,
          border: `1px solid ${color}30`,
          borderRadius: 4,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon className="w-3.5 h-3.5" style={{ color }} />
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: THEME.text.primary, lineHeight: 1.2 }}>
            {value}
          </div>
          <div style={{ fontSize: 10, color: THEME.text.muted, fontWeight: 500 }}>{title}</div>
        </div>
      </div>
    </div>
  );
}
