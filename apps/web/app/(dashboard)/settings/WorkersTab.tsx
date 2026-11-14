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
    blue: '#0f62fe',
    emerald: '#24a148',
    purple: '#8a3ffc',
    amber: '#ba4e00',
    red: '#da1e28',
    cyan: '#1192e8',
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
      <span className="text-sm text-[#525252]">{label}</span>
      <button
        onClick={() => onChange(!checked)}
        className={`
          relative inline-flex h-6 w-11 items-center rounded-full transition-colors
          ${checked ? 'bg-[#0f62fe]' : 'bg-[var(--t-border)]'}
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
      running: { color: '#0e6027', bg: '#a7f0ba', border: 'transparent', label: 'Running', dot: '#24a148' },
      paused: { color: '#8a3800', bg: '#fff1e6', border: 'transparent', label: 'Paused', dot: '#ba4e00' },
      stopped: { color: '#161616', bg: '#e0e0e0', border: 'transparent', label: 'Stopped', dot: '#9CA3AF' },
      error: { color: '#a2191f', bg: '#ffd7d9', border: 'transparent', label: 'Error', dot: '#da1e28' },
    };
    const c = config[status];
    return (
      <span className="cds-tag" style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 8px',
        fontSize: 12,
        fontWeight: 400,
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
        <RefreshCw className="w-8 h-8 animate-spin text-[#0f62fe]" />
      </div>
    );
  }

  // Error card shows only when we have never received data. A transient
  // refetch failure falls through to the table view with stale data.
  if (error && !workerData) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-[#da1e28]">
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
    <div style={{ fontFamily: '"IBM Plex Sans Thai", "IBM Plex Sans", "Sarabun", system-ui, sans-serif' }}>
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
          <h3 style={{ fontSize: 16, fontWeight: 400, color: THEME.text.primary }}>
            Worker Instances
          </h3>
          <span className="cds-tag" style={{
            fontSize: 12,
            padding: '2px 8px',
            background: '#e0e0e0',
            color: '#161616',
            fontWeight: 400,
          }}>
            {workers.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Background refetch failed but we're still showing prior data — flag
              it so the admin knows the numbers may be stale. */}
          {error && workerData && (
            <span className="flex items-center gap-1 text-[11px] text-[#8a3800]">
              <WifiOff className="w-3.5 h-3.5" />
              Live updates paused
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="h-8 text-sm rounded-none border-[#0f62fe] text-[#0f62fe] bg-transparent hover:bg-[#0f62fe] hover:text-white"
          >
            <RefreshCw className={`w-4 h-4 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddDialog(true)}
            className="h-8 text-sm rounded-none border-[#0f62fe] text-[#0f62fe] bg-transparent hover:bg-[#0f62fe] hover:text-white"
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
        borderRadius: 0,
        overflow: 'hidden',
        boxShadow: 'none',
      }}>
        <table className="w-full">
          <thead>
            <tr style={{ background: '#e0e0e0', borderBottom: `1px solid #e0e0e0` }}>
              <th className="text-left px-4 h-10 text-[12px] font-semibold" style={{ color: '#161616' }}>Worker</th>
              <th className="text-left px-4 h-10 text-[12px] font-semibold" style={{ color: '#161616' }}>Queue</th>
              <th className="text-left px-4 h-10 text-[12px] font-semibold" style={{ color: '#161616' }}>Status</th>
              <th className="text-left px-4 h-10 text-[12px] font-semibold" style={{ color: '#161616' }}>Host:PID</th>
              <th className="text-right px-4 h-10 text-[12px] font-semibold" style={{ color: '#161616' }}>Processed</th>
              <th className="text-right px-4 h-10 text-[12px] font-semibold" style={{ color: '#161616' }}>Failed</th>
              <th className="text-right px-4 h-10 text-[12px] font-semibold" style={{ color: '#161616' }}>CPU</th>
              <th className="text-right px-4 h-10 text-[12px] font-semibold" style={{ color: '#161616' }}>Memory</th>
              <th className="text-center px-4 h-10 text-[12px] font-semibold" style={{ color: '#161616' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {workers.map((worker) => (
              <tr 
                key={worker.id} 
                style={{ borderBottom: `1px solid ${THEME.borderLight}` }}
                className="hover:bg-[#e8e8e8]"
              >
                <td className="px-4 py-3">
                  {editingWorkerId === worker.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editNameValue}
                        onChange={(e) => setEditNameValue(e.target.value)}
                        className="h-8 text-xs w-32 px-2"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEditName();
                          if (e.key === 'Escape') cancelEditName();
                        }}
                      />
                      <button 
                        onClick={saveEditName}
                        className="p-1 text-[#24a148] hover:bg-[#e8e8e8]"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={cancelEditName}
                        className="p-1 text-[#525252] hover:bg-[#e8e8e8]"
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
                        <div style={{ fontSize: 12, color: '#6f6f6f', marginTop: 2 }}>
                          Started {new Date(worker.startedAt).toLocaleDateString('th-TH')}
                        </div>
                      </div>
                      <button 
                        onClick={() => startEditName(worker)}
                        className="p-1 text-[#6f6f6f] hover:text-[#161616] hover:bg-[#e8e8e8] opacity-0 group-hover:opacity-100 transition-all"
                        style={{ marginLeft: 4 }}
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className="cds-tag text-[12px] font-normal px-2 py-0.5 border-0 bg-[#e0e0e0] text-[#161616]">
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
                      className="w-[180px] bg-[var(--t-panel)] border border-[var(--t-border)] p-1"
                    >
                      <DropdownMenuItem 
                        onClick={() => startEditName(worker)} 
                        className="text-xs cursor-pointer hover:bg-[#e8e8e8] rounded-none px-2 py-1.5 h-8"
                      >
                        <Edit2 className="w-3.5 h-3.5 mr-2 text-[#525252] flex-shrink-0" />
                        <span className="truncate">Rename</span>
                      </DropdownMenuItem>
                      
                      <DropdownMenuSeparator className="my-1 h-px bg-[var(--t-panel-hover)]" />
                      
                      {(worker.status === 'stopped' || worker.status === 'error') && (
                        <DropdownMenuItem 
                          onClick={() => handleStart(worker.id)} 
                          className="text-xs cursor-pointer hover:bg-[#e8e8e8] rounded-none px-2 py-1.5 h-8"
                        >
                          <Play className="w-3.5 h-3.5 mr-2 text-[#525252] flex-shrink-0" />
                          <span className="truncate">Start</span>
                        </DropdownMenuItem>
                      )}
                      
                      {worker.status === 'running' && (
                        <DropdownMenuItem 
                          onClick={() => handlePause(worker.id)} 
                          className="text-xs cursor-pointer hover:bg-[#e8e8e8] rounded-none px-2 py-1.5 h-8"
                        >
                          <Pause className="w-3.5 h-3.5 mr-2 text-[#525252] flex-shrink-0" />
                          <span className="truncate">Pause</span>
                        </DropdownMenuItem>
                      )}
                      
                      {worker.status === 'paused' && (
                        <DropdownMenuItem 
                          onClick={() => handleResume(worker.id)} 
                          className="text-xs cursor-pointer hover:bg-[#e8e8e8] rounded-none px-2 py-1.5 h-8"
                        >
                          <Play className="w-3.5 h-3.5 mr-2 text-[#525252] flex-shrink-0" />
                          <span className="truncate">Resume</span>
                        </DropdownMenuItem>
                      )}
                      
                      {(worker.status === 'running' || worker.status === 'paused') && (
                        <DropdownMenuItem 
                          onClick={() => handleStop(worker.id)} 
                          className="text-xs cursor-pointer hover:bg-[var(--t-panel-hover)] rounded-none px-2 py-1.5 h-8"
                        >
                          <Square className="w-3.5 h-3.5 mr-2 text-[#525252] flex-shrink-0" />
                          <span className="truncate">Stop</span>
                        </DropdownMenuItem>
                      )}
                      
                      <DropdownMenuSeparator className="my-1 h-px bg-[var(--t-panel-hover)]" />
                      
                      <DropdownMenuItem 
                        onClick={() => handleRestart(worker.id)} 
                        className="text-xs cursor-pointer hover:bg-[#e8e8e8] rounded-none px-2 py-1.5 h-8"
                      >
                        <RotateCcw className="w-3.5 h-3.5 mr-2 text-[#525252] flex-shrink-0" />
                        <span className="truncate">Restart</span>
                      </DropdownMenuItem>
                      
                      <DropdownMenuItem 
                        onClick={() => { 
                          setSelectedWorker(worker); 
                          setShowConfigDialog(true); 
                        }} 
                        className="text-xs cursor-pointer hover:bg-[var(--t-panel-hover)] rounded-none px-2 py-1.5 h-8"
                      >
                        <Settings2 className="w-3.5 h-3.5 mr-2 text-[#525252] flex-shrink-0" />
                        <span className="truncate">Configure</span>
                      </DropdownMenuItem>
                      
                      <DropdownMenuSeparator className="my-1 h-px bg-[var(--t-panel-hover)]" />
                      
                      <DropdownMenuItem 
                        onClick={() => handleRemove(worker)} 
                        className="text-xs text-[#da1e28] cursor-pointer hover:bg-[#e8e8e8] rounded-none px-2 py-1.5 h-8"
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
                    <Cpu className="w-12 h-12 text-[#6f6f6f]" />
                    <p className="text-sm text-[#6f6f6f]">No workers found</p>
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
          style={{ backgroundColor: 'rgba(22,22,22,0.5)' }}
          onClick={() => setShowAddDialog(false)}
        >
          <div className="flex items-center justify-center min-h-screen p-4">
            <div 
              className="bg-[var(--t-panel)] rounded-none w-full max-w-md"

              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-[var(--t-border)]">
                <h2 className="text-[20px] font-normal text-[#161616]">Add New Worker</h2>
                <button 
                  onClick={() => setShowAddDialog(false)}
                  className="w-8 h-8 flex items-center justify-center hover:bg-[#e8e8e8]"
                >
                  <X className="w-4 h-4 text-[#161616]" />
                </button>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <label className="block text-xs text-[#525252] mb-1.5">
                    Worker Name <span className="text-[#da1e28]">*</span>
                  </label>
                  <input
                    type="text"
                    value={newWorkerName}
                    onChange={(e) => setNewWorkerName(e.target.value)}
                    placeholder="e.g., Worker-001"
                    className="w-full h-10 px-3 text-sm"
                    autoFocus
                  />
                </div>
                
                <div>
                  <label className="block text-xs text-[#525252] mb-1.5">
                    Queue
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {['default', 'high', 'low', 'critical'].map(queue => (
                      <button
                        key={queue}
                        onClick={() => setNewWorkerQueue(queue)}
                        className={`flex items-center gap-2 p-2.5 text-left border rounded-none transition-all ${
                          newWorkerQueue === queue 
                            ? 'border-[#0f62fe] bg-[#e0e0e0]' 
                            : 'border-[var(--t-border)] hover:bg-[var(--t-panel-hover)]'
                        }`}
                      >
                        <Cpu className={`w-3.5 h-3.5 ${newWorkerQueue === queue ? 'text-[#0f62fe]' : 'text-[var(--t-text-secondary)]'}`} />
                        <span className={`text-xs font-medium capitalize ${newWorkerQueue === queue ? 'text-[#0f62fe]' : 'text-[#525252]'}`}>
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
                  className="flex-1 h-8 text-sm rounded-none border-0 bg-[#393939] text-white hover:bg-[#474747] hover:text-white"
                  onClick={() => {
                    setShowAddDialog(false);
                    setNewWorkerName('');
                    setNewWorkerQueue('default');
                  }}
                >
                  Cancel
                </Button>
                <Button 
                  className="flex-1 h-8 text-sm rounded-none bg-[#0f62fe] hover:bg-[#0353e9] text-white"
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
          style={{ backgroundColor: 'rgba(22,22,22,0.5)' }}
          onClick={() => setShowConfigDialog(false)}
        >
          <div 
            className="bg-[var(--t-panel)] rounded-none w-full max-w-md"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-[var(--t-border)]">
              <div>
                <h2 className="text-[20px] font-normal text-[#161616]">Worker Configuration</h2>
                <p className="text-xs text-[#6f6f6f] mt-0.5">{selectedWorker.name}</p>
              </div>
              <button 
                onClick={() => setShowConfigDialog(false)}
                className="w-8 h-8 flex items-center justify-center hover:bg-[#e8e8e8]"
              >
                <X className="w-4 h-4 text-[#161616]" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4">
              {/* Info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#f4f4f4] p-3">
                  <label className="text-xs text-[#6f6f6f] block mb-1">Worker ID</label>
                  <div className="font-mono text-xs text-[#161616] font-medium">{selectedWorker.id}</div>
                </div>
                <div className="bg-[#f4f4f4] p-3">
                  <label className="text-xs text-[#6f6f6f] block mb-1">Queue</label>
                  <span className="text-xs font-medium">{selectedWorker.queue}</span>
                </div>
              </div>

              {/* Settings - WORKING VERSION */}
              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-semibold text-[#161616]">Settings</h4>
                  {hasConfigChanges && (
                    <span className="cds-tag text-[12px] text-[#8a3800] bg-[#fff1e6] px-2 py-0.5">
                      Unsaved changes
                    </span>
                  )}
                </div>
                
                <div className="space-y-1">
                  {/* Auto Restart Toggle */}
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-[#525252]">Auto-restart on failure</span>
                    <button
                      onClick={() => {
                        setConfigAutoRestart(!configAutoRestart);
                        setHasConfigChanges(true);
                      }}
                      className={`
                        relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                        ${configAutoRestart ? 'bg-[#0f62fe]' : 'bg-[var(--t-border)]'}
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
                    <span className="text-sm text-[#525252]">Enable logging</span>
                    <button
                      onClick={() => {
                        setConfigEnableLogging(!configEnableLogging);
                        setHasConfigChanges(true);
                      }}
                      className={`
                        relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                        ${configEnableLogging ? 'bg-[#0f62fe]' : 'bg-[var(--t-border)]'}
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
                    <span className="text-sm text-[#525252]">High priority mode</span>
                    <button
                      onClick={() => {
                        setConfigHighPriority(!configHighPriority);
                        setHasConfigChanges(true);
                      }}
                      className={`
                        relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                        ${configHighPriority ? 'bg-[#0f62fe]' : 'bg-[var(--t-border)]'}
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
                <h4 className="text-xs font-semibold text-[#161616] mb-3">Status Control</h4>
                <div className="flex gap-2">
                  {selectedWorker.status === 'running' ? (
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="flex-1 h-8 text-sm rounded-none border-[#0f62fe] text-[#0f62fe] bg-transparent hover:bg-[#0f62fe] hover:text-white"
                      onClick={() => { handlePause(selectedWorker.id); setShowConfigDialog(false); }}
                    >
                      <Pause className="w-3.5 h-3.5 mr-1.5" />
                      Pause
                    </Button>
                  ) : (
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="flex-1 h-8 text-sm rounded-none border-[#0f62fe] text-[#0f62fe] bg-transparent hover:bg-[#0f62fe] hover:text-white"
                      onClick={() => { handleStart(selectedWorker.id); setShowConfigDialog(false); }}
                    >
                      <Play className="w-3.5 h-3.5 mr-1.5" />
                      Start
                    </Button>
                  )}
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="flex-1 h-8 text-sm rounded-none border-0 bg-[#393939] text-white hover:bg-[#474747] hover:text-white"
                    onClick={() => { handleRestart(selectedWorker.id); setShowConfigDialog(false); }}
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                    Restart
                  </Button>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 p-4 border-t border-[var(--t-border)]">
              {hasConfigChanges && (
                <Button 
                  variant="outline" 
                  size="sm"
                  className="h-8 text-sm rounded-none border-0 bg-[#393939] text-white hover:bg-[#474747] hover:text-white"
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
                className="h-8 text-sm rounded-none border-0 bg-[#393939] text-white hover:bg-[#474747] hover:text-white"
                onClick={() => setShowConfigDialog(false)}
              >
                {hasConfigChanges ? 'Cancel' : 'Close'}
              </Button>
              {hasConfigChanges && (
                <Button 
                  size="sm"
                  className="h-8 text-sm rounded-none bg-[#0f62fe] hover:bg-[#0353e9] text-white"
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
          style={{ backgroundColor: 'rgba(22,22,22,0.5)' }}
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div 
            className="bg-[var(--t-panel)] rounded-none w-full max-w-sm"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 text-center">
              <div className="flex items-center justify-center mx-auto mb-3">
                <AlertTriangle className="w-5 h-5 text-[#da1e28]" />
              </div>
              <h3 className="text-[20px] font-normal text-[#161616] mb-1">Remove Worker?</h3>
              <p className="text-xs text-[#6f6f6f]">
                Are you sure you want to remove <span className="font-medium">{workerToDelete.name}</span>? This action cannot be undone.
              </p>
            </div>
            <div className="flex gap-3 p-4 pt-0">
              <Button 
                variant="outline" 
                className="flex-1 h-8 text-sm rounded-none border-0 bg-[#393939] text-white hover:bg-[#474747] hover:text-white"
                onClick={() => setShowDeleteConfirm(false)}
              >
                Cancel
              </Button>
              <Button 
                variant="destructive"
                className="flex-1 h-8 text-sm rounded-none bg-[#da1e28] hover:bg-[#b81921] text-white"
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
      borderRadius: 0,
      padding: '12px 14px',
      boxShadow: 'none',
    }}>
      <div className="flex items-center gap-3">
        <Icon className="w-4 h-4" style={{ color: '#525252' }} />
        <div>
          <div style={{ fontSize: 20, fontWeight: 300, color: THEME.text.primary, lineHeight: 1.2 }}>
            {value}
          </div>
          <div style={{ fontSize: 12, color: '#525252' }}>{title}</div>
        </div>
      </div>
    </div>
  );
}
