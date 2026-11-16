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
  Pause,
  X,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  WifiOff,
  Edit2,
  Check,
  Plus,
} from 'lucide-react';
import {
  Button,
  TextInput,
  Toggle,
  Tag,
  Modal,
  ComposedModal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  OverflowMenu,
  OverflowMenuItem,
  RadioButtonGroup,
  RadioButton,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
} from '@carbon/react';


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

// Simple Toggle Switch Component (Carbon Toggle)
function ToggleSwitch({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  id: string;
}) {
  return (
    <div className="py-2">
      <Toggle
        id={id}
        size="sm"
        labelText={label}
        labelA="Off"
        labelB="On"
        toggled={checked}
        onToggle={(next: boolean) => onChange(next)}
      />
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
      running: { type: 'green', label: 'Running' },
      paused: { type: 'warm-gray', label: 'Paused' },
      stopped: { type: 'gray', label: 'Stopped' },
      error: { type: 'red', label: 'Error' },
    } as const;
    const c = config[status];
    return (
      <Tag type={c.type} size="sm">
        {c.label}
      </Tag>
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
        <Button kind="tertiary" size="sm" renderIcon={RefreshCw} onClick={() => refetch()} className="mt-4">
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
          <Tag type="gray" size="sm">{workers.length}</Tag>
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
            kind="tertiary"
            size="sm"
            onClick={() => refetch()}
            renderIcon={(props: React.SVGProps<SVGSVGElement>) => (
              <RefreshCw {...props} className={`${props.className ?? ''} ${isFetching ? 'animate-spin' : ''}`} />
            )}
          >
            Refresh
          </Button>
          <Button kind="primary" size="sm" renderIcon={Plus} onClick={() => setShowAddDialog(true)}>
            Add Worker
          </Button>
        </div>
      </div>

      {/* Workers Table */}
      <div style={{ border: `1px solid ${THEME.border}`, overflow: 'hidden' }}>
        <Table size="lg" useZebraStyles={false}>
          <TableHead>
            <TableRow>
              <TableHeader>Worker</TableHeader>
              <TableHeader>Queue</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader>Host:PID</TableHeader>
              <TableHeader className="text-right">Processed</TableHeader>
              <TableHeader className="text-right">Failed</TableHeader>
              <TableHeader className="text-right">CPU</TableHeader>
              <TableHeader className="text-right">Memory</TableHeader>
              <TableHeader className="text-center">Actions</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {workers.map((worker) => (
              <TableRow key={worker.id} className="group">
                <TableCell>
                  {editingWorkerId === worker.id ? (
                    <div className="flex items-center gap-1">
                      <div className="w-40">
                        <TextInput
                          id={`worker-rename-${worker.id}`}
                          labelText="Worker name"
                          hideLabel
                          size="sm"
                          value={editNameValue}
                          onChange={(e) => setEditNameValue(e.target.value)}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEditName();
                            if (e.key === 'Escape') cancelEditName();
                          }}
                        />
                      </div>
                      <Button kind="ghost" size="sm" hasIconOnly renderIcon={Check} iconDescription="Save" onClick={saveEditName} />
                      <Button kind="ghost" size="sm" hasIconOnly renderIcon={X} iconDescription="Cancel" onClick={cancelEditName} />
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
                      <Button
                        kind="ghost"
                        size="sm"
                        hasIconOnly
                        renderIcon={Edit2}
                        iconDescription="Rename"
                        onClick={() => startEditName(worker)}
                        className="opacity-0 group-hover:opacity-100 transition-all"
                      />
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <Tag type="gray" size="sm">{worker.queue}</Tag>
                </TableCell>
                <TableCell>{getStatusBadge(worker.status)}</TableCell>
                <TableCell>
                  <div style={{ fontSize: 11, color: THEME.text.secondary, fontFamily: 'monospace' }}>
                    {worker.status === 'error' ? '-' : `${worker.host}:${worker.pid}`}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <span style={{ fontSize: 12, fontWeight: 500, color: THEME.text.primary, fontFamily: 'monospace' }}>
                    {worker.processed.toLocaleString()}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <span style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: worker.failed > 0 ? THEME.colors.red : THEME.text.muted,
                    fontFamily: 'monospace'
                  }}>
                    {worker.failed.toLocaleString()}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <span style={{ fontSize: 11, color: THEME.text.secondary, fontFamily: 'monospace' }}>
                    {worker.status === 'running' ? `${worker.cpu.toFixed(1)}%` : '-'}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <span style={{ fontSize: 11, color: THEME.text.secondary, fontFamily: 'monospace' }}>
                    {worker.status === 'running' ? `${worker.memory.toFixed(1)} MB` : '-'}
                  </span>
                </TableCell>
                <TableCell className="text-center">
                  <OverflowMenu size="sm" flipped iconDescription="Actions" aria-label="Worker actions">
                    <OverflowMenuItem itemText="Rename" onClick={() => startEditName(worker)} />
                    {(worker.status === 'stopped' || worker.status === 'error') && (
                      <OverflowMenuItem hasDivider itemText="Start" onClick={() => handleStart(worker.id)} />
                    )}
                    {worker.status === 'running' && (
                      <OverflowMenuItem hasDivider itemText="Pause" onClick={() => handlePause(worker.id)} />
                    )}
                    {worker.status === 'paused' && (
                      <OverflowMenuItem hasDivider itemText="Resume" onClick={() => handleResume(worker.id)} />
                    )}
                    {(worker.status === 'running' || worker.status === 'paused') && (
                      <OverflowMenuItem itemText="Stop" onClick={() => handleStop(worker.id)} />
                    )}
                    <OverflowMenuItem hasDivider itemText="Restart" onClick={() => handleRestart(worker.id)} />
                    <OverflowMenuItem
                      itemText="Configure"
                      onClick={() => {
                        setSelectedWorker(worker);
                        setShowConfigDialog(true);
                      }}
                    />
                    <OverflowMenuItem hasDivider isDelete itemText="Remove" onClick={() => handleRemove(worker)} />
                  </OverflowMenu>
                </TableCell>
              </TableRow>
            ))}
            {workers.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center" style={{ padding: '48px 16px' }}>
                  <div className="flex flex-col items-center gap-2">
                    <Cpu className="w-12 h-12 text-[#6f6f6f]" />
                    <p className="text-sm text-[#6f6f6f]">No workers found</p>
                    <Button kind="tertiary" size="sm" renderIcon={Plus} onClick={() => setShowAddDialog(true)} className="mt-2">
                      Add Worker
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add Worker Dialog */}
      <Modal
        open={showAddDialog}
        size="sm"
        modalHeading="Add New Worker"
        primaryButtonText={createMutation.isPending ? 'Creating...' : 'Create Worker'}
        secondaryButtonText="Cancel"
        primaryButtonDisabled={createMutation.isPending || !newWorkerName.trim()}
        onRequestSubmit={handleAddWorker}
        onRequestClose={() => setShowAddDialog(false)}
        onSecondarySubmit={() => {
          setShowAddDialog(false);
          setNewWorkerName('');
          setNewWorkerQueue('default');
        }}
      >
        {showAddDialog && (
          <div className="space-y-4">
            <TextInput
              id="add-worker-name"
              labelText="Worker Name *"
              value={newWorkerName}
              onChange={(e) => setNewWorkerName(e.target.value)}
              placeholder="e.g., Worker-001"
              autoFocus
              data-modal-primary-focus
            />
            <RadioButtonGroup
              legendText="Queue"
              name="add-worker-queue"
              orientation="horizontal"
              valueSelected={newWorkerQueue}
              onChange={(value) => setNewWorkerQueue(String(value))}
            >
              {['default', 'high', 'low', 'critical'].map(queue => (
                <RadioButton key={queue} id={`add-worker-queue-${queue}`} value={queue} labelText={queue} />
              ))}
            </RadioButtonGroup>
          </div>
        )}
      </Modal>

      {/* CONFIG DIALOG - SIMPLIFIED VERSION */}
      <ComposedModal
        open={showConfigDialog && !!selectedWorker}
        size="sm"
        onClose={() => {
          setShowConfigDialog(false);
          return false;
        }}
      >
        {selectedWorker && (
          <>
            <ModalHeader title="Worker Configuration" label={selectedWorker.name} />
            <ModalBody>
              <div className="space-y-4">
                {/* Info */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#f4f4f4] p-3">
                    <div className="text-xs text-[#6f6f6f] mb-1">Worker ID</div>
                    <div className="font-mono text-xs text-[#161616] font-medium break-all">{selectedWorker.id}</div>
                  </div>
                  <div className="bg-[#f4f4f4] p-3">
                    <div className="text-xs text-[#6f6f6f] mb-1">Queue</div>
                    <span className="text-xs font-medium">{selectedWorker.queue}</span>
                  </div>
                </div>

                {/* Settings */}
                <div className="border-t pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-semibold text-[#161616]">Settings</h4>
                    {hasConfigChanges && (
                      <Tag type="warm-gray" size="sm">Unsaved changes</Tag>
                    )}
                  </div>
                  <div className="space-y-1">
                    <ToggleSwitch
                      id="worker-config-auto-restart"
                      label="Auto-restart on failure"
                      checked={configAutoRestart}
                      onChange={(v) => { setConfigAutoRestart(v); setHasConfigChanges(true); }}
                    />
                    <ToggleSwitch
                      id="worker-config-enable-logging"
                      label="Enable logging"
                      checked={configEnableLogging}
                      onChange={(v) => { setConfigEnableLogging(v); setHasConfigChanges(true); }}
                    />
                    <ToggleSwitch
                      id="worker-config-high-priority"
                      label="High priority mode"
                      checked={configHighPriority}
                      onChange={(v) => { setConfigHighPriority(v); setHasConfigChanges(true); }}
                    />
                  </div>
                </div>

                {/* Status Control */}
                <div className="border-t pt-4">
                  <h4 className="text-xs font-semibold text-[#161616] mb-3">Status Control</h4>
                  <div className="flex gap-2">
                    {selectedWorker.status === 'running' ? (
                      <Button
                        kind="tertiary"
                        size="sm"
                        renderIcon={Pause}
                        onClick={() => { handlePause(selectedWorker.id); setShowConfigDialog(false); }}
                      >
                        Pause
                      </Button>
                    ) : (
                      <Button
                        kind="tertiary"
                        size="sm"
                        renderIcon={Play}
                        onClick={() => { handleStart(selectedWorker.id); setShowConfigDialog(false); }}
                      >
                        Start
                      </Button>
                    )}
                    <Button
                      kind="secondary"
                      size="sm"
                      renderIcon={RotateCcw}
                      onClick={() => { handleRestart(selectedWorker.id); setShowConfigDialog(false); }}
                    >
                      Restart
                    </Button>
                  </div>
                </div>
              </div>
            </ModalBody>
            <ModalFooter>
              {hasConfigChanges && (
                <Button
                  kind="ghost"
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
              <Button kind="secondary" onClick={() => setShowConfigDialog(false)}>
                {hasConfigChanges ? 'Cancel' : 'Close'}
              </Button>
              {hasConfigChanges && (
                <Button
                  kind="primary"
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
            </ModalFooter>
          </>
        )}
      </ComposedModal>

      {/* Delete Confirm Dialog */}
      <Modal
        open={showDeleteConfirm && !!workerToDelete}
        danger
        size="xs"
        modalHeading="Remove Worker?"
        primaryButtonText={deleteMutation.isPending ? 'Removing...' : 'Remove'}
        secondaryButtonText="Cancel"
        primaryButtonDisabled={deleteMutation.isPending}
        onRequestSubmit={confirmDelete}
        onRequestClose={() => setShowDeleteConfirm(false)}
      >
        {workerToDelete && (
          <p className="text-sm text-[#525252]">
            Are you sure you want to remove <span className="font-medium">{workerToDelete.name}</span>? This action cannot be undone.
          </p>
        )}
      </Modal>
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
