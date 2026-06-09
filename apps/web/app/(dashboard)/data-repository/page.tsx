'use client'

import { useState, useEffect, useCallback, useMemo, useRef, DragEvent } from 'react';
import dynamic from 'next/dynamic';
import 'swagger-ui-react/swagger-ui.css';

// Lazy-load swagger-ui-react — heavy + client-only, dropping it into
// the initial bundle would balloon the page weight.
const SwaggerUI = dynamic(() => import('swagger-ui-react'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-16 text-[var(--t-text-muted)]">
      <Loader2 size={20} className="animate-spin" />
    </div>
  ),
});
import {
  Database, Key, Play, Pencil, Trash2, Plus,
  Eye, EyeOff, Copy, Check, X, RefreshCw,
  AlertCircle, Loader2, Upload,
  FolderOpen, FolderPlus, ChevronRight, ChevronDown,
  Table2, Download, Settings, Search,
  GripVertical, Columns, Clock, Terminal, Hash, Code,
  Lock, Unlock,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';


// ─── Auth helper ──────────────────────────────────────────────────────────────

function authFetch(url: string, options?: RequestInit): Promise<Response> {
  const token = useAuthStore.getState().accessToken;
  const headers = new Headers(options?.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(url, { ...options, headers, credentials: 'include' });
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ConnectionType = 'postgresql' | 'mysql' | 'oracle';
type ConnectionStatus = 'Connected' | 'Disconnected' | 'Error';
type Permission = 'read' | 'write' | 'admin';
type SyncStatus = 'idle' | 'syncing' | 'error' | 'success';
type SettingsTab = 'connections' | 'apikeys';

interface RepoConnectionConfig {
  host: string;
  port: string;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
}

interface RepoConnection {
  id: string;
  name: string;
  type: ConnectionType;
  status: ConnectionStatus;
  config: RepoConnectionConfig;
  createdAt: string;
}

interface RepoApiKey {
  id: string;
  name: string;
  key: string;
  permissions: Permission;
  isActive: boolean;
  expiresAt?: string;
  createdAt: string;
}

interface RepoTable {
  id: string;
  name: string;
  description?: string;
  connectionId?: string;
  connectionName?: string;
  folderId?: string | null;
  rowCount: number;
  sortOrder: number;
  syncStatus: SyncStatus;
  lastSyncAt?: string;
  createdAt: string;
}

interface RepoFolder {
  id: string;
  name: string;
  parentId?: string | null;
  sortOrder: number;
  children?: RepoFolder[];
  tables?: { id: string }[];
  createdAt: string;
}

interface ColInfo {
  name: string;
  type: string;
  nullable?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CONNECTION_TYPE_LABELS: Record<ConnectionType, string> = {
  postgresql: 'PostgreSQL',
  mysql: 'MySQL',
  oracle: 'Oracle',
};

const CONNECTION_TYPE_COLORS: Record<ConnectionType, string> = {
  postgresql: 'bg-blue-100 text-blue-700',
  mysql: 'bg-orange-100 text-orange-700',
  oracle: 'bg-red-100 text-red-700',
};

const STATUS_COLORS: Record<ConnectionStatus, string> = {
  Connected: 'bg-green-100 text-green-700',
  Disconnected: 'bg-[var(--t-panel-hover)] text-[var(--t-text-secondary)]',
  Error: 'bg-red-100 text-red-700',
};

const PERMISSION_COLORS: Record<Permission, string> = {
  read: 'bg-blue-100 text-blue-700',
  write: 'bg-amber-100 text-amber-700',
  admin: 'bg-red-100 text-red-700',
};

const DEFAULT_PORTS: Record<ConnectionType, string> = {
  postgresql: '5432',
  mysql: '3306',
  oracle: '1521',
};

// ─── Modal ────────────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-[var(--t-panel)] rounded-xl shadow-2xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--t-border)]">
          <h2 className="text-lg font-semibold text-[var(--t-text)]">{title}</h2>
          <button onClick={onClose} className="p-1 text-[var(--t-text-muted)] hover:text-[var(--t-text-secondary)] rounded">
            <X size={20} />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

// ─── Confirm dialog ───────────────────────────────────────────────────────────

function ConfirmDialog({ message, onConfirm, onCancel }: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-[var(--t-panel)] rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <p className="text-[var(--t-text)] mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 text-sm rounded-lg border border-[var(--t-border)] text-[var(--t-text-secondary)] hover:bg-[var(--t-bg)]">
            Cancel
          </button>
          <button onClick={onConfirm} className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Custom Select ───────────────────────────────────────────────────────────

interface SelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  description?: string;
}

function CustomSelect({
  value, onChange, options, placeholder, label,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  label?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [isOpen]);

  const selected = options.find(o => o.value === value);

  return (
    <div ref={ref} className="relative">
      {label && <label className="block text-sm font-medium text-[var(--t-text-secondary)] mb-1">{label}</label>}
      <button
        type="button"
        onClick={() => setIsOpen(o => !o)}
        className={`w-full flex items-center justify-between px-3 py-2 bg-[var(--t-panel)] border rounded-lg text-sm transition-all ${
          isOpen
            ? 'border-teal-500 ring-2 ring-teal-100'
            : 'border-[var(--t-border)] hover:border-teal-400'
        }`}
      >
        <span className="flex items-center gap-2 truncate">
          {selected?.icon}
          <span className={selected ? 'text-[var(--t-text)]' : 'text-[var(--t-text-muted)]'}>
            {selected?.label ?? placeholder ?? 'Select...'}
          </span>
        </span>
        <ChevronDown size={14} className={`text-[var(--t-text-muted)] transition-transform duration-200 flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-[60] w-full mt-1 bg-[var(--t-panel)] border border-[var(--t-border)] rounded-lg shadow-lg max-h-60 overflow-y-auto py-1">
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setIsOpen(false); }}
              className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${
                value === opt.value ? 'bg-teal-50 text-teal-700' : 'text-[var(--t-text-secondary)] hover:bg-[var(--t-bg)]'
              }`}
            >
              {opt.icon}
              <div className="flex-1 min-w-0">
                <div className="truncate">{opt.label}</div>
                {opt.description && <div className="text-[10px] text-[var(--t-text-muted)]">{opt.description}</div>}
              </div>
              {value === opt.value && <Check size={13} className="text-teal-500 flex-shrink-0" />}
            </button>
          ))}
          {options.length === 0 && (
            <div className="px-3 py-4 text-xs text-[var(--t-text-muted)] text-center">No options</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Section: Connections ─────────────────────────────────────────────────────

function ConnectionsSection() {
  const [connections, setConnections] = useState<RepoConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<RepoConnection | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RepoConnection | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const [testingId, setTestingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState<{
    name: string;
    type: ConnectionType;
    host: string;
    port: string;
    database: string;
    username: string;
    password: string;
    ssl: boolean;
  }>({
    name: '', type: 'postgresql', host: '', port: '5432',
    database: '', username: '', password: '', ssl: false,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(`/orch/api/data-repository/connections`);
      const json = await res.json();
      if (json.success) {
        const raw = json.data?.connections ?? json.data ?? [];
        setConnections(raw.map((c: any) => ({ ...c, config: typeof c.config === 'string' ? JSON.parse(c.config) : c.config })));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditTarget(null);
    setForm({ name: '', type: 'postgresql', host: '', port: '5432', database: '', username: '', password: '', ssl: false });
    setError('');
    setShowModal(true);
  }

  function openEdit(c: RepoConnection) {
    setEditTarget(c);
    setForm({
      name: c.name, type: c.type,
      host: c.config.host, port: c.config.port,
      database: c.config.database, username: c.config.username,
      password: c.config.password, ssl: c.config.ssl,
    });
    setError('');
    setShowModal(true);
  }

  async function handleSubmit() {
    if (!form.name || !form.host || !form.database || !form.username) {
      setError('Please fill in all required fields.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const body = {
        name: form.name, type: form.type,
        config: { host: form.host, port: form.port, database: form.database, username: form.username, password: form.password, ssl: form.ssl },
      };
      const url = editTarget
        ? `/orch/api/data-repository/connections/${editTarget.id}`
        : `/orch/api/data-repository/connections`;
      const res = await authFetch(url, {
        method: editTarget ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed');
      setShowModal(false);
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(c: RepoConnection) {
    const res = await authFetch(`/orch/api/data-repository/connections/${c.id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) { setDeleteTarget(null); load(); }
  }

  async function handleTest(c: RepoConnection) {
    setTestingId(c.id);
    try {
      const res = await authFetch(`/orch/api/data-repository/connections/${c.id}/test`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        const d = json.data;
        setTestResults(prev => ({ ...prev, [c.id]: { ok: true, msg: `${d?.count ?? d?.tables?.length ?? 0} tables found` } }));
      } else {
        setTestResults(prev => ({ ...prev, [c.id]: { ok: false, msg: json.error || 'Test failed' } }));
      }
    } catch {
      setTestResults(prev => ({ ...prev, [c.id]: { ok: false, msg: 'Connection error' } }));
    } finally {
      setTestingId(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-[var(--t-text)]">Connections</h2>
          <p className="text-sm text-[var(--t-text-muted)] mt-0.5">Manage database connections for data import and sync</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700">
          <Plus size={16} /> New Connection
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-teal-500" size={28} />
        </div>
      ) : connections.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-[var(--t-text-muted)]">
          <Database size={40} className="mb-3 opacity-50" />
          <p className="text-sm">No connections yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {connections.map(c => (
            <div key={c.id} className="bg-[var(--t-panel)] border border-[var(--t-border)] rounded-lg px-3 py-2.5 hover:border-[var(--t-border)] transition-colors">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <Database size={15} className="text-teal-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-[var(--t-text)] truncate">{c.name}</span>
                      <span className={`text-[10px] px-1.5 py-px rounded-full font-medium leading-tight ${CONNECTION_TYPE_COLORS[c.type]}`}>
                        {CONNECTION_TYPE_LABELS[c.type]}
                      </span>
                      <span className={`text-[10px] px-1.5 py-px rounded-full font-medium leading-tight ${STATUS_COLORS[c.status]}`}>
                        {c.status}
                      </span>
                      {testResults[c.id] && (
                        <span className={`text-[10px] px-1.5 py-px rounded-full font-medium leading-tight ${testResults[c.id].ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                          {testResults[c.id].ok ? <Check size={10} className="inline mr-0.5" /> : <AlertCircle size={10} className="inline mr-0.5" />}
                          {testResults[c.id].msg}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[var(--t-text-muted)] truncate mt-0.5">
                      {c.config.username}@{c.config.host}:{c.config.port}/{c.config.database}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={() => handleTest(c)}
                    disabled={testingId === c.id}
                    title="Test connection"
                    className="p-1.5 rounded-md text-[var(--t-text-muted)] hover:text-green-600 hover:bg-green-50 disabled:opacity-50"
                  >
                    {testingId === c.id ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                  </button>
                  <button onClick={() => openEdit(c)} title="Edit" className="p-1.5 rounded-md text-[var(--t-text-muted)] hover:text-teal-600 hover:bg-teal-50">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => setDeleteTarget(c)} title="Delete" className="p-1.5 rounded-md text-[var(--t-text-muted)] hover:text-red-600 hover:bg-red-50">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <Modal title={editTarget ? 'Edit Connection' : 'New Connection'} onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--t-text-secondary)] mb-1">Name <span className="text-red-500">*</span></label>
              <input
                className="w-full border border-[var(--t-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="My Database"
              />
            </div>
            <CustomSelect
              label="Type"
              value={form.type}
              onChange={v => {
                const t = v as ConnectionType;
                setForm(f => ({ ...f, type: t, port: DEFAULT_PORTS[t] }));
              }}
              options={[
                { value: 'postgresql', label: 'PostgreSQL', icon: <Database size={14} className="text-blue-500" /> },
                { value: 'mysql', label: 'MySQL', icon: <Database size={14} className="text-orange-500" /> },
                { value: 'oracle', label: 'Oracle', icon: <Database size={14} className="text-red-500" /> },
              ]}
            />
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-[var(--t-text-secondary)] mb-1">Host <span className="text-red-500">*</span></label>
                <input
                  className="w-full border border-[var(--t-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  value={form.host}
                  onChange={e => setForm(f => ({ ...f, host: e.target.value }))}
                  placeholder="localhost"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--t-text-secondary)] mb-1">Port</label>
                <input
                  className="w-full border border-[var(--t-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  value={form.port}
                  onChange={e => setForm(f => ({ ...f, port: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--t-text-secondary)] mb-1">Database <span className="text-red-500">*</span></label>
              <input
                className="w-full border border-[var(--t-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={form.database}
                onChange={e => setForm(f => ({ ...f, database: e.target.value }))}
                placeholder="mydb"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-[var(--t-text-secondary)] mb-1">Username <span className="text-red-500">*</span></label>
                <input
                  className="w-full border border-[var(--t-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  value={form.username}
                  onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--t-text-secondary)] mb-1">Password</label>
                <input
                  type="password"
                  className="w-full border border-[var(--t-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 accent-teal-600"
                checked={form.ssl}
                onChange={e => setForm(f => ({ ...f, ssl: e.target.checked }))}
              />
              <span className="text-sm text-[var(--t-text-secondary)]">Enable SSL</span>
            </label>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                <AlertCircle size={14} /> {error}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm rounded-lg border border-[var(--t-border)] text-[var(--t-text-secondary)] hover:bg-[var(--t-bg)]">
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-4 py-2 text-sm rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-60 flex items-center gap-2"
              >
                {submitting && <Loader2 size={14} className="animate-spin" />}
                {editTarget ? 'Save Changes' : 'Create'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmDialog
          message={`Delete connection "${deleteTarget.name}"? This action cannot be undone.`}
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

// ─── Section: API Keys ────────────────────────────────────────────────────────

function ApiKeysSection() {
  const [keys, setKeys] = useState<RepoApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RepoApiKey | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', permissions: 'read' as Permission, expiresAt: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(`/orch/api/data-repository/api-keys`);
      const json = await res.json();
      if (json.success) setKeys(json.data?.apiKeys ?? json.data?.keys ?? json.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    if (!form.name) { setError('Name is required.'); return; }
    setSubmitting(true);
    setError('');
    try {
      const body: { name: string; permissions: Permission; expiresAt?: string } = {
        name: form.name, permissions: form.permissions,
      };
      if (form.expiresAt) body.expiresAt = form.expiresAt;
      const res = await authFetch(`/orch/api/data-repository/api-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed');
      const keyData = json.data?.key;
      setNewKey(typeof keyData === 'object' ? keyData?.key : keyData ?? null);
      setShowModal(false);
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggle(k: RepoApiKey) {
    await authFetch(`/orch/api/data-repository/api-keys/${k.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !k.isActive }),
    });
    load();
  }

  async function handleDelete(k: RepoApiKey) {
    const res = await authFetch(`/orch/api/data-repository/api-keys/${k.id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) { setDeleteTarget(null); load(); }
  }

  function maskKey(key: string) {
    if (key.length <= 8) return '••••••••';
    return key.slice(0, 4) + '••••••••' + key.slice(-4);
  }

  function copyKey(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-[var(--t-text)]">API Keys</h2>
          <p className="text-sm text-[var(--t-text-muted)] mt-0.5">Manage access tokens for the Data Repository API</p>
        </div>
        <button
          onClick={() => { setForm({ name: '', permissions: 'read', expiresAt: '' }); setError(''); setShowModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700"
        >
          <Plus size={16} /> New API Key
        </button>
      </div>

      {newKey && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-xl">
          <p className="text-sm font-medium text-green-800 mb-2">API key created. Copy it now — it won't be shown again.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono bg-[var(--t-panel)] border border-green-200 rounded px-3 py-2 text-green-900 truncate">{newKey}</code>
            <button onClick={() => copyKey(newKey)} className="p-2 rounded-lg bg-green-600 text-white hover:bg-green-700">
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
            <button onClick={() => setNewKey(null)} className="p-2 rounded-lg text-green-700 hover:bg-green-100">
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-teal-500" size={28} />
        </div>
      ) : keys.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-[var(--t-text-muted)]">
          <Key size={40} className="mb-3 opacity-50" />
          <p className="text-sm">No API keys yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {keys.map(k => (
            <div key={k.id} className="bg-[var(--t-panel)] border border-[var(--t-border)] rounded-xl p-4 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-[var(--t-text)]">{k.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PERMISSION_COLORS[k.permissions]}`}>
                      {k.permissions}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${k.isActive ? 'bg-green-100 text-green-700' : 'bg-[var(--t-panel-hover)] text-[var(--t-text-muted)]'}`}>
                      {k.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <code className="text-xs font-mono text-[var(--t-text-muted)] bg-[var(--t-bg)] px-2 py-1 rounded">
                      {revealed[k.id] ? k.key : maskKey(k.key)}
                    </code>
                    <button onClick={() => setRevealed(r => ({ ...r, [k.id]: !r[k.id] }))} className="text-[var(--t-text-muted)] hover:text-[var(--t-text-secondary)]">
                      {revealed[k.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    {revealed[k.id] && (
                      <button onClick={() => copyKey(k.key)} className="text-[var(--t-text-muted)] hover:text-teal-600">
                        <Copy size={14} />
                      </button>
                    )}
                  </div>
                  {k.expiresAt && (
                    <p className="text-xs text-[var(--t-text-muted)] mt-1">Expires: {new Date(k.expiresAt).toLocaleDateString()}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleToggle(k)}
                    title={k.isActive ? 'Deactivate' : 'Activate'}
                    className={`p-2 rounded-lg ${k.isActive ? 'text-green-600 hover:bg-green-50' : 'text-[var(--t-text-muted)] hover:bg-[var(--t-bg)]'}`}
                  >
                    <RefreshCw size={16} />
                  </button>
                  <button onClick={() => setDeleteTarget(k)} className="p-2 rounded-lg text-[var(--t-text-muted)] hover:text-red-600 hover:bg-red-50">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <Modal title="New API Key" onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--t-text-secondary)] mb-1">Name <span className="text-red-500">*</span></label>
              <input
                className="w-full border border-[var(--t-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="My app key"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--t-text-secondary)] mb-2">Permissions</label>
              <div className="space-y-2">
                {(['read', 'write', 'admin'] as Permission[]).map(p => (
                  <label key={p} className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="repo-permissions"
                      value={p}
                      checked={form.permissions === p}
                      onChange={() => setForm(f => ({ ...f, permissions: p }))}
                      className="accent-teal-600"
                    />
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PERMISSION_COLORS[p]}`}>{p}</span>
                    <span className="text-sm text-[var(--t-text-secondary)]">
                      {p === 'read' ? 'Read-only access to tables' : p === 'write' ? 'Read and write access' : 'Full admin access'}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--t-text-secondary)] mb-1">Expires At (optional)</label>
              <input
                type="date"
                className="w-full border border-[var(--t-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={form.expiresAt}
                onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))}
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                <AlertCircle size={14} /> {error}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm rounded-lg border border-[var(--t-border)] text-[var(--t-text-secondary)] hover:bg-[var(--t-bg)]">
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={submitting}
                className="px-4 py-2 text-sm rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-60 flex items-center gap-2"
              >
                {submitting && <Loader2 size={14} className="animate-spin" />}
                Create Key
              </button>
            </div>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmDialog
          message={`Delete API key "${deleteTarget.name}"? This cannot be undone.`}
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

// ─── Folder tree helpers ─────────────────────────────────────────────────────

function buildFolderTree(folders: RepoFolder[]): RepoFolder[] {
  const map: Record<string, RepoFolder> = {};
  folders.forEach(f => { map[f.id] = { ...f, children: [] }; });
  const roots: RepoFolder[] = [];
  folders.forEach(f => {
    if (f.parentId && map[f.parentId]) {
      map[f.parentId].children!.push(map[f.id]);
    } else {
      roots.push(map[f.id]);
    }
  });
  return roots;
}

// ─── Section: Table Data Viewer ───────────────────────────────────────────────

function TableDataSection({ table }: { table: RepoTable }) {
  const [columns, setColumns] = useState<ColInfo[]>([]);
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const [editRid, setEditRid] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, any>>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');

  const [showAddRow, setShowAddRow] = useState(false);
  const [newValues, setNewValues] = useState<Record<string, any>>({});
  const [savingNew, setSavingNew] = useState(false);
  const [newError, setNewError] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<Record<string, any> | null>(null);
  const [deletingRid, setDeletingRid] = useState<string | null>(null);

  const loadData = useCallback(async (p: number) => {
    setLoading(true);
    setError('');
    try {
      const res = await authFetch(`/orch/api/data-repository/tables/${table.id}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: PAGE_SIZE, offset: p * PAGE_SIZE }),
      });
      const json = await res.json();
      if (json.success) {
        // Handle graceful table-not-found error from backend
        if (json.data.error) {
          setError(json.data.error);
          setRows([]);
          setTotalCount(0);
        } else {
          setRows(json.data.rows ?? []);
          setTotalCount(json.data.totalCount ?? 0);
          if (json.data.columns?.length > 0) {
            setColumns(json.data.columns.filter((c: ColInfo) => c.name !== '_rid'));
          }
        }
      } else {
        setError(json.error || 'Failed to load data');
      }
    } catch {
      setError('Request failed');
    } finally {
      setLoading(false);
    }
  }, [table.id]);

  useEffect(() => {
    let cols: ColInfo[] = [];
    try { cols = JSON.parse((table as any).schema || '[]'); } catch {}
    if (cols.length > 0) setColumns(cols.filter(c => c.name !== '_rid'));
    setPage(0);
    loadData(0);
  }, [table.id]);

  function startEdit(row: Record<string, any>) {
    const vals: Record<string, any> = {};
    columns.forEach(c => { vals[c.name] = row[c.name] !== null && row[c.name] !== undefined ? String(row[c.name]) : ''; });
    setEditRid(row._rid);
    setEditValues(vals);
    setEditError('');
    setShowAddRow(false);
  }

  async function saveEdit() {
    if (!editRid) return;
    setSavingEdit(true);
    setEditError('');
    try {
      const originalRow = rows.find(r => r._rid === editRid);
      const res = await authFetch(`/orch/api/data-repository/tables/${table.id}/rows`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rid: editRid, newValues: editValues, originalRow }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Update failed');
      setEditRid(null);
      loadData(page);
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setSavingEdit(false);
    }
  }

  async function confirmDelete(row: Record<string, any>) {
    setDeletingRid(row._rid);
    try {
      const res = await authFetch(`/orch/api/data-repository/tables/${table.id}/rows`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rid: row._rid, originalRow: row }),
      });
      const json = await res.json();
      if (json.success) {
        setDeleteTarget(null);
        const newPage = rows.length === 1 && page > 0 ? page - 1 : page;
        setPage(newPage);
        loadData(newPage);
      }
    } finally {
      setDeletingRid(null);
    }
  }

  async function insertRow() {
    setSavingNew(true);
    setNewError('');
    try {
      const res = await authFetch(`/orch/api/data-repository/tables/${table.id}/rows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: newValues }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Insert failed');
      setShowAddRow(false);
      setNewValues({});
      loadData(page);
    } catch (e: unknown) {
      setNewError(e instanceof Error ? e.message : 'Insert failed');
    } finally {
      setSavingNew(false);
    }
  }

  function goPage(p: number) {
    setPage(p);
    loadData(p);
  }

  async function fetchAllRows(): Promise<Record<string, any>[]> {
    const BATCH = 1000;
    let all: Record<string, any>[] = [];
    let offset = 0;
    while (true) {
      const res = await authFetch(`/orch/api/data-repository/tables/${table.id}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: BATCH, offset }),
      });
      const json = await res.json();
      if (!json.success) break;
      const batch: Record<string, any>[] = json.data.rows ?? [];
      all = all.concat(batch);
      if (batch.length < BATCH) break;
      offset += BATCH;
    }
    return all;
  }

  const [exporting, setExporting] = useState<'csv' | 'xlsx' | null>(null);

  async function exportCSV() {
    setExporting('csv');
    try {
      const allRows = await fetchAllRows();
      const colNames = columns.map(c => c.name);
      const header = colNames.join(',');
      const body = allRows.map(row =>
        colNames.map(col => {
          const val = row[col] !== null && row[col] !== undefined ? String(row[col]) : '';
          return val.includes(',') || val.includes('"') || val.includes('\n')
            ? `"${val.replace(/"/g, '""')}"`
            : val;
        }).join(',')
      );
      const csv = [header, ...body].join('\n');
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${table.name}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(null);
    }
  }

  async function exportXLSX() {
    setExporting('xlsx');
    try {
      const allRows = await fetchAllRows();
      const colNames = columns.map(c => c.name);
      const wsData = [
        colNames,
        ...allRows.map(row => colNames.map(col => row[col] !== null && row[col] !== undefined ? row[col] : '')),
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      // Auto column width
      const colWidths = colNames.map(col => {
        const maxLen = Math.max(col.length, ...allRows.slice(0, 100).map(r => String(r[col] ?? '').length));
        return { wch: Math.min(maxLen + 2, 50) };
      });
      ws['!cols'] = colWidths;
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, table.name.substring(0, 31));
      XLSX.writeFile(wb, `${table.name}.xlsx`);
    } finally {
      setExporting(null);
    }
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const startRow = page * PAGE_SIZE + 1;
  const endRow = Math.min((page + 1) * PAGE_SIZE, totalCount);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div className="flex items-center gap-2 text-xs text-[var(--t-text-muted)]">
          <span>{totalCount.toLocaleString()} rows total</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadData(page)}
            className="p-2 text-[var(--t-text-muted)] hover:text-teal-600 rounded-lg hover:bg-teal-50"
            title="Refresh"
          >
            <RefreshCw size={14} />
          </button>
          <div className="flex items-center gap-1 border border-[var(--t-border)] rounded-lg overflow-hidden">
            <button
              onClick={exportCSV}
              disabled={exporting !== null}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[var(--t-text-secondary)] hover:bg-[var(--t-bg)] disabled:opacity-50"
              title="Export CSV"
            >
              {exporting === 'csv' ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
              CSV
            </button>
            <div className="w-px h-5 bg-[var(--t-border-light)]" />
            <button
              onClick={exportXLSX}
              disabled={exporting !== null}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[var(--t-text-secondary)] hover:bg-[var(--t-bg)] disabled:opacity-50"
              title="Export Excel"
            >
              {exporting === 'xlsx' ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
              XLSX
            </button>
          </div>
          <button
            onClick={() => {
              const init: Record<string, any> = {};
              columns.forEach(c => { init[c.name] = ''; });
              setNewValues(init);
              setShowAddRow(true);
              setEditRid(null);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700"
          >
            <Plus size={14} /> Add Row
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex-shrink-0">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto rounded-xl border border-[var(--t-border)] bg-[var(--t-panel)] shadow-sm min-h-0">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-teal-500" size={28} />
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[var(--t-bg)] border-b border-[var(--t-border)]">
                <th className="w-10 text-center px-3 py-2.5 text-xs font-semibold text-[var(--t-text-muted)] border-r border-[var(--t-border)] select-none">#</th>
                {columns.map(col => (
                  <th key={col.name} className="px-3 py-2.5 text-left border-r border-[var(--t-border)] whitespace-nowrap min-w-[100px]">
                    <div className="text-xs font-semibold text-[var(--t-text-secondary)]">{col.name}</div>
                    <div className="text-[10px] font-normal text-[var(--t-text-muted)] uppercase">{col.type}</div>
                  </th>
                ))}
                <th className="w-20 px-2 py-2.5 text-center text-xs font-semibold text-[var(--t-text-muted)] sticky right-0 bg-[var(--t-bg)]"></th>
              </tr>
            </thead>
            <tbody>
              {/* Add Row inline form */}
              {showAddRow && (
                <tr className="bg-teal-50 border-b border-teal-100">
                  <td className="text-center px-3 py-2 text-xs text-teal-400 border-r border-teal-100 font-bold">+</td>
                  {columns.map(col => (
                    <td key={col.name} className="px-2 py-1.5 border-r border-teal-100">
                      <input
                        className="w-full px-2 py-1 text-xs border border-teal-300 rounded focus:outline-none focus:ring-1 focus:ring-teal-500 bg-[var(--t-panel)] min-w-[80px]"
                        value={newValues[col.name] ?? ''}
                        onChange={e => setNewValues(v => ({ ...v, [col.name]: e.target.value }))}
                        placeholder={col.name}
                      />
                    </td>
                  ))}
                  <td className="px-2 py-1.5 sticky right-0 bg-teal-50">
                    <div className="flex items-center justify-center gap-1">
                      {newError && <span className="text-[10px] text-red-500 absolute -top-4 left-0 whitespace-nowrap">{newError}</span>}
                      <button onClick={insertRow} disabled={savingNew} className="p-1 text-teal-600 hover:text-teal-800 disabled:opacity-50" title="Save">
                        {savingNew ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      </button>
                      <button onClick={() => { setShowAddRow(false); setNewError(''); }} className="p-1 text-[var(--t-text-muted)] hover:text-[var(--t-text-secondary)]" title="Cancel">
                        <X size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              )}

              {rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 2} className="text-center py-16 text-[var(--t-text-muted)] text-sm">
                    No rows found
                  </td>
                </tr>
              ) : rows.map((row, i) => {
                const isEditing = editRid === row._rid;
                return (
                  <tr
                    key={row._rid ?? i}
                    className={`border-b border-[var(--t-border-light)] transition-colors ${
                      isEditing ? 'bg-teal-50' : i % 2 === 0 ? 'bg-[var(--t-panel)]' : 'bg-[var(--t-bg)]/40'
                    } hover:bg-teal-50/30`}
                  >
                    <td className="text-center px-3 py-2 text-[11px] text-[var(--t-text-muted)] border-r border-[var(--t-border-light)] select-none">
                      {startRow + i}
                    </td>
                    {columns.map(col => (
                      <td key={col.name} className="px-3 py-1.5 border-r border-[var(--t-border-light)] max-w-[220px]">
                        {isEditing ? (
                          <input
                            className="w-full px-1.5 py-0.5 text-xs border border-teal-300 rounded focus:outline-none focus:ring-1 focus:ring-teal-500 bg-[var(--t-panel)] min-w-[80px]"
                            value={editValues[col.name] ?? ''}
                            onChange={e => setEditValues(v => ({ ...v, [col.name]: e.target.value }))}
                          />
                        ) : (
                          <span className={`text-xs block truncate ${row[col.name] === null || row[col.name] === undefined ? 'text-[var(--t-text-muted)] italic' : 'text-[var(--t-text-secondary)]'}`}>
                            {row[col.name] === null || row[col.name] === undefined ? 'null' : String(row[col.name])}
                          </span>
                        )}
                      </td>
                    ))}
                    <td
                      className={`px-2 py-1.5 sticky right-0 border-l border-[var(--t-border-light)] ${
                        isEditing ? 'bg-teal-50' : i % 2 === 0 ? 'bg-[var(--t-panel)]' : 'bg-[var(--t-bg)]'
                      }`}
                      style={{ boxShadow: '-4px 0 6px -2px rgba(0,0,0,0.04)' }}
                    >
                      <div className="flex items-center justify-center gap-0.5">
                        {isEditing ? (
                          <>
                            {editError && <span className="text-[10px] text-red-500 mr-0.5">{editError}</span>}
                            <button onClick={saveEdit} disabled={savingEdit} className="p-1 text-teal-600 hover:text-teal-800 disabled:opacity-50" title="Save">
                              {savingEdit ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                            </button>
                            <button onClick={() => { setEditRid(null); setEditError(''); }} className="p-1 text-[var(--t-text-muted)] hover:text-[var(--t-text-secondary)]" title="Cancel">
                              <X size={13} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => startEdit(row)} className="p-1 text-[var(--t-text-muted)] hover:text-teal-600 transition-colors" title="Edit row">
                              <Pencil size={13} />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(row)}
                              disabled={deletingRid === row._rid}
                              className="p-1 text-[var(--t-text-muted)] hover:text-red-500 transition-colors disabled:opacity-40"
                              title="Delete row"
                            >
                              {deletingRid === row._rid ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4 flex-shrink-0 text-xs text-[var(--t-text-muted)]">
        <span>{totalCount > 0 ? `Rows ${startRow}–${endRow} of ${totalCount.toLocaleString()}` : '0 rows'}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => goPage(page - 1)}
            disabled={page === 0 || loading}
            className="px-3 py-1.5 rounded-lg border border-[var(--t-border)] hover:bg-[var(--t-bg)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ← Prev
          </button>
          <span>Page {page + 1} / {Math.max(1, totalPages)}</span>
          <button
            onClick={() => goPage(page + 1)}
            disabled={page >= totalPages - 1 || loading}
            className="px-3 py-1.5 rounded-lg border border-[var(--t-border)] hover:bg-[var(--t-bg)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </div>
      </div>

      {/* Delete confirm */}
      {deleteTarget && (
        <ConfirmDialog
          message="Delete this row? This cannot be undone."
          onConfirm={() => confirmDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

// ─── Settings Modal ──────────────────────────────────────────────────────────

function SettingsModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<SettingsTab>('connections');
  const TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'connections', label: 'Connections', icon: <Database size={13} /> },
    { id: 'apikeys', label: 'API Keys', icon: <Key size={13} /> },
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-[var(--t-panel)] rounded-xl shadow-2xl w-[900px] max-w-[95vw] flex flex-col" style={{ height: '80vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2 font-bold text-[var(--t-text)]">
            <Settings size={16} className="text-teal-500" /> Settings
          </div>
          <button onClick={onClose} className="p-1 hover:bg-[var(--t-panel-hover)] rounded-lg text-[var(--t-text-muted)] hover:text-[var(--t-text-secondary)]">
            <X size={16} />
          </button>
        </div>
        {/* Tab bar */}
        <div className="flex border-b px-6 gap-1">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                tab === t.id ? 'border-teal-500 text-teal-600' : 'border-transparent text-[var(--t-text-muted)] hover:text-[var(--t-text-secondary)]'
              }`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {tab === 'connections' && <ConnectionsSection />}
          {tab === 'apikeys' && <ApiKeysSection />}
        </div>
      </div>
    </div>
  );
}

// ─── Left Panel: Tree view (folders + tables) ──────────────────────────────

function LeftTreePanel({
  tables, folders, selectedTable, onSelectTable, onCreateTable, onCreateFolder,
  onDeleteFolder, onMoveTable, onRenameFolder, onOpenSettings, loading,
}: {
  tables: RepoTable[];
  folders: RepoFolder[];
  selectedTable: RepoTable | null;
  onSelectTable: (t: RepoTable) => void;
  onCreateTable: () => void;
  onCreateFolder: () => void;
  onDeleteFolder: (f: RepoFolder) => void;
  onMoveTable: (tableId: string, folderId: string | null) => void;
  onRenameFolder?: (folderId: string, newName: string) => void;
  onOpenSettings?: () => void;
  loading: boolean;
}) {
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [dragItem, setDragItem] = useState<{ id: string; type: 'table' | 'folder' } | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; tableId: string; tableName: string; folderId: string | null } | null>(null);
  const [editingFolder, setEditingFolder] = useState<string | null>(null);
  const [editFolderName, setEditFolderName] = useState('');
  const contextRef = useRef<HTMLDivElement>(null);

  // Close context menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (contextRef.current && !contextRef.current.contains(e.target as Node)) setContextMenu(null);
    }
    if (contextMenu) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [contextMenu]);

  const filtered = tables.filter(t => !search || t.name.toLowerCase().includes(search.toLowerCase()));
  const folderTree = buildFolderTree(folders);

  // Tables at root (no folder)
  const rootTables = filtered.filter(t => !t.folderId);
  // Tables in folders
  const folderTablesMap: Record<string, RepoTable[]> = {};
  filtered.forEach(t => {
    if (t.folderId) {
      if (!folderTablesMap[t.folderId]) folderTablesMap[t.folderId] = [];
      folderTablesMap[t.folderId].push(t);
    }
  });

  function handleDragStart(e: DragEvent, id: string, type: 'table' | 'folder') {
    setDragItem({ id, type });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({ id, type }));
  }

  function handleDragOver(e: DragEvent, targetId: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(targetId);
  }

  function handleDrop(e: DragEvent, targetFolderId: string | null) {
    e.preventDefault();
    setDragOver(null);
    if (!dragItem) return;
    if (dragItem.type === 'table') {
      onMoveTable(dragItem.id, targetFolderId);
    }
    setDragItem(null);
  }

  function handleContextMenu(e: React.MouseEvent, t: RepoTable) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, tableId: t.id, tableName: t.name, folderId: t.folderId ?? null });
  }

  function handleFolderRename(folderId: string) {
    if (editFolderName.trim() && onRenameFolder) {
      onRenameFolder(folderId, editFolderName.trim());
    }
    setEditingFolder(null);
    setEditFolderName('');
  }

  function renderTableItem(t: RepoTable, depth = 0) {
    const isDragging = dragItem?.id === t.id;
    return (
      <button
        key={t.id}
        draggable
        onDragStart={e => handleDragStart(e, t.id, 'table')}
        onDragEnd={() => { setDragItem(null); setDragOver(null); }}
        onClick={() => onSelectTable(t)}
        onContextMenu={e => handleContextMenu(e, t)}
        className={`w-full text-left flex items-center gap-1.5 py-1 px-2 transition-colors border-l-2 group ${
          isDragging ? 'opacity-40' :
          selectedTable?.id === t.id
            ? 'bg-teal-50 border-l-teal-500 text-teal-800'
            : 'border-l-transparent text-[var(--t-text-secondary)] hover:bg-[var(--t-bg)]'
        }`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
      >
        <GripVertical size={10} className="text-[var(--t-text-muted)] opacity-0 group-hover:opacity-100 cursor-grab flex-shrink-0" />
        <Table2 size={11} className={selectedTable?.id === t.id ? 'text-teal-500' : 'text-[var(--t-text-muted)]'} />
        <span className="flex-1 min-w-0 text-xs font-medium truncate">{t.name}</span>
        {t.rowCount > 0 && <span className="text-[10px] text-[var(--t-text-muted)] shrink-0">{t.rowCount.toLocaleString()}</span>}
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
          t.syncStatus === 'error' ? 'bg-red-400' :
          t.syncStatus === 'syncing' ? 'bg-teal-400 animate-pulse' :
          'bg-[var(--t-border)]'
        }`} />
      </button>
    );
  }

  function renderFolderNode(folder: RepoFolder, depth = 0) {
    const isCollapsed = collapsed[folder.id];
    const folderTables = folderTablesMap[folder.id] || [];
    const hasContent = folderTables.length > 0 || (folder.children && folder.children.length > 0);
    const isDragTarget = dragOver === folder.id;
    const isEditing = editingFolder === folder.id;

    return (
      <div key={folder.id}>
        <div
          className={`flex items-center gap-1.5 py-1 px-2 group cursor-pointer transition-all ${
            isDragTarget
              ? 'bg-teal-50 border-l-2 border-l-teal-500 border border-dashed border-teal-400 rounded-r-md mx-1'
              : 'border-l-2 border-l-transparent hover:bg-[var(--t-bg)]'
          }`}
          style={{ paddingLeft: `${8 + depth * 16}px` }}
          onClick={() => { if (!isEditing) setCollapsed(c => ({ ...c, [folder.id]: !c[folder.id] })); }}
          onDragOver={e => handleDragOver(e, folder.id)}
          onDragLeave={() => setDragOver(null)}
          onDrop={e => handleDrop(e, folder.id)}
        >
          <span className="w-3 text-[var(--t-text-muted)] flex-shrink-0">
            {hasContent ? (isCollapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />) : <span className="w-3" />}
          </span>
          <FolderOpen size={12} className={isDragTarget ? 'text-teal-500' : 'text-amber-500'} />
          {isEditing ? (
            <input
              autoFocus
              className="flex-1 min-w-0 text-xs font-semibold text-[var(--t-text)] bg-[var(--t-panel)] border border-teal-400 rounded px-1 py-0.5 focus:outline-none"
              value={editFolderName}
              onChange={e => setEditFolderName(e.target.value)}
              onBlur={() => handleFolderRename(folder.id)}
              onKeyDown={e => { if (e.key === 'Enter') handleFolderRename(folder.id); if (e.key === 'Escape') { setEditingFolder(null); setEditFolderName(''); } }}
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <span
              className="flex-1 min-w-0 text-xs font-semibold text-[var(--t-text-secondary)] truncate"
              onDoubleClick={e => {
                e.stopPropagation();
                setEditingFolder(folder.id);
                setEditFolderName(folder.name);
              }}
              title="Double-click to rename"
            >{folder.name}</span>
          )}
          <span className="text-[10px] text-[var(--t-text-muted)]">{folderTables.length}</span>
          <button
            onClick={e => { e.stopPropagation(); onDeleteFolder(folder); }}
            className="opacity-0 group-hover:opacity-100 text-[var(--t-text-muted)] hover:text-red-500 p-0.5"
          >
            <Trash2 size={10} />
          </button>
        </div>
        {!isCollapsed && (
          <>
            {folder.children?.map(child => renderFolderNode(child, depth + 1))}
            {folderTables.map(t => renderTableItem(t, depth + 1))}
          </>
        )}
      </div>
    );
  }

  // Build interleaved list: folders and root tables sorted by sortOrder
  type TreeItem = { type: 'folder'; data: RepoFolder } | { type: 'table'; data: RepoTable };
  const rootItems: TreeItem[] = [
    ...folderTree.map(f => ({ type: 'folder' as const, data: f })),
    ...rootTables.map(t => ({ type: 'table' as const, data: t })),
  ].sort((a, b) => {
    const aOrder = a.type === 'folder' ? a.data.sortOrder : a.data.sortOrder;
    const bOrder = b.type === 'folder' ? b.data.sortOrder : b.data.sortOrder;
    return aOrder - bOrder;
  });

  const isRootDropTarget = dragOver === 'root' && dragItem != null;

  return (
    <div className="w-[280px] flex-shrink-0 border-r border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-[var(--t-border-light)]">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-bold text-[var(--t-text-muted)] uppercase tracking-wider">Tables</h3>
          <div className="flex items-center gap-0.5">
            <button onClick={onCreateFolder} className="p-1 rounded-md text-[var(--t-text-muted)] hover:text-amber-600 hover:bg-amber-50" title="New Folder">
              <FolderPlus size={13} />
            </button>
            <button onClick={onCreateTable} className="p-1 rounded-md text-teal-600 hover:bg-teal-50" title="Add Table">
              <Plus size={13} />
            </button>
            {onOpenSettings && (
              <button onClick={onOpenSettings} className="p-1 rounded-md text-[var(--t-text-muted)] hover:text-teal-600 hover:bg-teal-50" title="Settings (connections, API keys)">
                <Settings size={13} />
              </button>
            )}
          </div>
        </div>
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--t-text-muted)]" />
          <input
            className="w-full pl-7 pr-3 py-1.5 text-xs border border-[var(--t-border)] rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-500 bg-[var(--t-bg)]"
            placeholder="Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Tree list */}
      <div
        className={`flex-1 overflow-y-auto py-1 transition-all ${
          isRootDropTarget ? 'bg-teal-50/30 border-2 border-dashed border-teal-300 rounded-lg m-1' : ''
        }`}
        onDragOver={e => { e.preventDefault(); setDragOver('root'); }}
        onDragLeave={() => setDragOver(null)}
        onDrop={e => handleDrop(e, null)}
      >
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 size={16} className="animate-spin text-teal-400" />
          </div>
        ) : rootItems.length === 0 && search ? (
          <div className="py-10 text-center text-[var(--t-text-muted)] text-xs">No match</div>
        ) : rootItems.length === 0 ? (
          <div className="py-10 text-center text-[var(--t-text-muted)] text-xs">No tables yet</div>
        ) : (
          <>
            {rootItems.map(item =>
              item.type === 'folder'
                ? renderFolderNode(item.data)
                : renderTableItem(item.data)
            )}
            {/* Drop zone hint at bottom when dragging */}
            {dragItem && (
              <div className="mx-2 mt-2 py-3 text-center text-[10px] text-teal-500 border-2 border-dashed border-teal-300 rounded-lg bg-teal-50/50 transition-all">
                Drop here to move to root
              </div>
            )}
          </>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={contextRef}
          className="fixed z-[100] bg-[var(--t-panel)] border border-[var(--t-border)] rounded-lg shadow-xl py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <div className="px-3 py-1.5 text-[10px] font-semibold text-[var(--t-text-muted)] uppercase tracking-wider border-b border-[var(--t-border-light)] mb-0.5">
            {contextMenu.tableName}
          </div>
          {folders.length > 0 && (
            <>
              {folders.map(f => (
                <button
                  key={f.id}
                  onClick={() => { onMoveTable(contextMenu.tableId, f.id); setContextMenu(null); }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-[var(--t-bg)] flex items-center gap-2 transition-colors ${
                    contextMenu.folderId === f.id ? 'text-teal-600 font-medium' : 'text-[var(--t-text-secondary)]'
                  }`}
                >
                  <FolderOpen size={11} className="text-amber-500" />
                  Move to {f.name}
                  {contextMenu.folderId === f.id && <Check size={10} className="ml-auto text-teal-500" />}
                </button>
              ))}
            </>
          )}
          {contextMenu.folderId && (
            <button
              onClick={() => { onMoveTable(contextMenu.tableId, null); setContextMenu(null); }}
              className="w-full text-left px-3 py-1.5 text-xs text-[var(--t-text-secondary)] hover:bg-[var(--t-bg)] flex items-center gap-2 transition-colors"
            >
              <X size={11} className="text-[var(--t-text-muted)]" />
              Remove from folder
            </button>
          )}
          <div className="border-t border-[var(--t-border-light)] mt-0.5 pt-0.5">
            <button
              onClick={() => {
                const t = tables.find(t => t.id === contextMenu.tableId);
                if (t) onSelectTable(t);
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-[var(--t-text-secondary)] hover:bg-[var(--t-bg)] flex items-center gap-2 transition-colors"
            >
              <Eye size={11} className="text-[var(--t-text-muted)]" />
              View data
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SQL Editor Panel ─────────────────────────────────────────────────────────

interface SqlTab {
  id: string;
  name: string;
  sql: string;
  result: { columns: { name: string }[]; rows: any[]; error?: string; time?: number; rowCount?: number } | null;
  running: boolean;
  resultTab: 'results' | 'messages';
  messages: string[];
}

interface SchemaTable {
  name: string;
  columns?: { name: string; type: string }[];
  expanded?: boolean;
}

// ─── API Spec Panel — fetches the auto-generated OpenAPI/REST spec
//     for a single RepoTable's CRUD endpoints. The /openapi endpoint
//     returns a YAML/JSON OpenAPI doc the admin can copy or download. ─
function ApiSpecPanel({ tableId, tableName }: { tableId: string; tableName: string }) {
  const [specText, setSpecText] = useState<string>('')
  const [specObj, setSpecObj] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState<'swagger' | 'raw'>('swagger')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(''); setSpecText(''); setSpecObj(null)
    authFetch(`/orch/api/repo/tables/${tableId}/openapi`)
      .then(async (r) => {
        const text = await r.text()
        if (cancelled) return
        if (!r.ok) { setError(text || `HTTP ${r.status}`); return }
        setSpecText(text)
        try { setSpecObj(JSON.parse(text)) } catch { /* not JSON — swagger-ui can still parse YAML strings */ }
      })
      .catch((e) => { if (!cancelled) setError(String(e?.message ?? e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [tableId])

  // Memoise so SwaggerUI doesn't reset state on every parent render.
  const memoSpec = useMemo(() => specObj, [specObj])

  function copy() {
    navigator.clipboard?.writeText(specText).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1500)
    }).catch(() => undefined)
  }
  function download() {
    const blob = new Blob([specText], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${tableName}-openapi.json`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <div className="flex-shrink-0 px-5 py-3 bg-[var(--t-panel)] border-b border-[var(--t-border-light)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Code size={14} className="text-teal-500" />
          <span className="text-sm font-semibold text-[var(--t-text)]">OpenAPI spec — {tableName}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="inline-flex rounded border border-[var(--t-border)] overflow-hidden mr-2">
            <button
              onClick={() => setView('swagger')}
              className={`px-2 py-1 text-[11px] font-medium ${view === 'swagger' ? 'bg-teal-500 text-white' : 'text-[var(--t-text-muted)] hover:bg-[var(--t-panel-hover)]'}`}
            >Swagger</button>
            <button
              onClick={() => setView('raw')}
              className={`px-2 py-1 text-[11px] font-medium ${view === 'raw' ? 'bg-teal-500 text-white' : 'text-[var(--t-text-muted)] hover:bg-[var(--t-panel-hover)]'}`}
            >Raw</button>
          </div>
          <button
            onClick={copy}
            disabled={!specText}
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-[var(--t-text-muted)] hover:bg-[var(--t-panel-hover)] disabled:opacity-50"
            title="Copy to clipboard"
          >
            {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />} Copy
          </button>
          <button
            onClick={download}
            disabled={!specText}
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-[var(--t-text-muted)] hover:bg-[var(--t-panel-hover)] disabled:opacity-50"
            title="Download as JSON"
          >
            <Download size={12} /> Download
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto bg-[var(--t-bg)]">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={20} className="animate-spin text-teal-400" />
          </div>
        ) : error ? (
          <div className="m-4 flex items-center gap-2 text-sm text-amber-700 bg-amber-50 rounded-lg px-4 py-3">
            <AlertCircle size={16} /> {error}
          </div>
        ) : view === 'swagger' && memoSpec ? (
          // swagger-ui-react renders interactive operation cards with
          // request/response schemas and Try-It-Out (uses the live
          // backend by default).
          <div className="swagger-ui-wrap p-2"><SwaggerUI spec={memoSpec} /></div>
        ) : (
          <pre className="p-4 text-[12px] font-mono whitespace-pre-wrap text-[var(--t-text)] leading-5">
            {specText || '— empty —'}
          </pre>
        )}
      </div>
    </div>
  )
}

function SqlEditorPanel({ connections }: { connections: RepoConnection[] }) {
  const [connId, setConnId] = useState('');
  const [tabs, setTabs] = useState<SqlTab[]>([
    { id: '1', name: 'Query 1', sql: '', result: null, running: false, resultTab: 'results', messages: [] },
  ]);
  const [activeTabId, setActiveTabId] = useState('1');
  const [tabCounter, setTabCounter] = useState(2);
  const [schemaTables, setSchemaTables] = useState<SchemaTable[]>([]);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaSearch, setSchemaSearch] = useState('');
  const [showSchema, setShowSchema] = useState(true);
  const [history, setHistory] = useState<{ sql: string; time: string; connName: string }[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);

  const activeTab = tabs.find(t => t.id === activeTabId) ?? tabs[0];

  // Close history dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) setShowHistory(false);
    }
    if (showHistory) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showHistory]);

  // Load schema when connection changes
  useEffect(() => {
    if (!connId) { setSchemaTables([]); return; }
    setSchemaLoading(true);
    authFetch(`/orch/api/data-repository/connections/${connId}/tables`)
      .then(r => r.json())
      .then(json => {
        if (json.success) {
          const tableList = json.data?.tables ?? json.data ?? [];
          setSchemaTables(tableList.map((t: any) => ({ name: t.name ?? t, columns: undefined, expanded: false })));
        }
      })
      .catch(() => {})
      .finally(() => setSchemaLoading(false));
  }, [connId]);

  function updateTab(id: string, patch: Partial<SqlTab>) {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
  }

  function addTab() {
    const newId = String(tabCounter);
    setTabs(prev => [...prev, { id: newId, name: `Query ${tabCounter}`, sql: '', result: null, running: false, resultTab: 'results', messages: [] }]);
    setActiveTabId(newId);
    setTabCounter(c => c + 1);
  }

  function closeTab(id: string) {
    if (tabs.length <= 1) return;
    const idx = tabs.findIndex(t => t.id === id);
    const newTabs = tabs.filter(t => t.id !== id);
    if (activeTabId === id) {
      setActiveTabId(newTabs[Math.min(idx, newTabs.length - 1)].id);
    }
    setTabs(newTabs);
  }

  async function runQuery(sqlOverride?: string) {
    const sql = (sqlOverride ?? activeTab.sql).trim();
    if (!sql || !connId) return;
    const tabId = activeTab.id;
    updateTab(tabId, { running: true, result: null, messages: [] });
    const connName = connections.find(c => c.id === connId)?.name ?? '';
    const start = performance.now();
    try {
      const res = await authFetch(`/orch/api/data-repository/sql/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId: connId, sql }),
      });
      const elapsed = Math.round(performance.now() - start);
      const json = await res.json();
      if (json.success) {
        const cols = json.data.columns ?? [];
        const rows = json.data.rows ?? [];
        updateTab(tabId, {
          running: false,
          result: { columns: cols, rows, time: elapsed, rowCount: rows.length },
          messages: [`Query executed successfully in ${elapsed}ms. ${rows.length} row(s) returned.`],
          resultTab: 'results',
        });
      } else {
        updateTab(tabId, {
          running: false,
          result: { columns: [], rows: [], error: json.error || 'Query failed', time: elapsed },
          messages: [`Error: ${json.error || 'Query failed'}`],
          resultTab: 'messages',
        });
      }
    } catch (e: unknown) {
      const elapsed = Math.round(performance.now() - start);
      const msg = e instanceof Error ? e.message : 'Request failed';
      updateTab(tabId, {
        running: false,
        result: { columns: [], rows: [], error: msg, time: elapsed },
        messages: [`Error: ${msg}`],
        resultTab: 'messages',
      });
    }
    // Add to history
    setHistory(prev => {
      const next = [{ sql, time: new Date().toLocaleTimeString(), connName }, ...prev];
      return next.slice(0, 20);
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        // Run selected text only
        const ta = textareaRef.current;
        if (ta) {
          const selected = ta.value.substring(ta.selectionStart, ta.selectionEnd).trim();
          if (selected) { runQuery(selected); return; }
        }
      }
      runQuery();
    }
  }

  function formatSql(sql: string): string {
    const keywords = ['SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER',
      'ON', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET', 'INSERT', 'INTO', 'VALUES',
      'UPDATE', 'SET', 'DELETE', 'CREATE', 'ALTER', 'DROP', 'TABLE', 'INDEX', 'VIEW',
      'AS', 'IN', 'NOT', 'NULL', 'IS', 'LIKE', 'BETWEEN', 'EXISTS', 'UNION', 'ALL',
      'DISTINCT', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'ASC', 'DESC', 'COUNT', 'SUM',
      'AVG', 'MIN', 'MAX', 'CAST', 'COALESCE', 'WITH', 'RECURSIVE'];
    let result = sql;
    keywords.forEach(kw => {
      const regex = new RegExp(`\\b${kw.replace(/\s+/g, '\\s+')}\\b`, 'gi');
      result = result.replace(regex, kw);
    });
    return result;
  }

  function insertTableName(name: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const newSql = activeTab.sql.substring(0, start) + name + activeTab.sql.substring(end);
    updateTab(activeTab.id, { sql: newSql });
    setTimeout(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = start + name.length; }, 0);
  }

  async function toggleTableExpand(tableName: string) {
    const tbl = schemaTables.find(t => t.name === tableName);
    if (!tbl) return;
    if (tbl.expanded) {
      setSchemaTables(prev => prev.map(t => t.name === tableName ? { ...t, expanded: false } : t));
      return;
    }
    // Fetch columns if not loaded
    if (!tbl.columns) {
      try {
        const res = await authFetch(`/orch/api/data-repository/sql/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            connectionId: connId,
            sql: `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${tableName}' ORDER BY ordinal_position`,
          }),
        });
        const json = await res.json();
        if (json.success && json.data.rows) {
          const cols = json.data.rows.map((r: any) => ({ name: r.column_name, type: r.data_type }));
          setSchemaTables(prev => prev.map(t => t.name === tableName ? { ...t, columns: cols, expanded: true } : t));
          return;
        }
      } catch { /* fall through */ }
    }
    setSchemaTables(prev => prev.map(t => t.name === tableName ? { ...t, expanded: !t.expanded } : t));
  }

  function exportCsv() {
    if (!activeTab.result || activeTab.result.error || !activeTab.result.columns.length) return;
    const { columns, rows } = activeTab.result;
    const header = columns.map(c => c.name).join(',');
    const body = rows.map(row => columns.map(c => {
      const v = row[c.name];
      if (v === null || v === undefined) return '';
      const s = String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')).join('\n');
    const blob = new Blob([header + '\n' + body], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `query_result.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  function exportXlsx() {
    if (!activeTab.result || activeTab.result.error || !activeTab.result.columns.length) return;
    const { columns, rows } = activeTab.result;
    const ws = XLSX.utils.json_to_sheet(rows, { header: columns.map(c => c.name) });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Query Result');
    XLSX.writeFile(wb, 'query_result.xlsx');
  }

  const filteredSchema = schemaTables.filter(t => !schemaSearch || t.name.toLowerCase().includes(schemaSearch.toLowerCase()));
  const lineCount = (activeTab.sql.match(/\n/g) || []).length + 1;

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Top toolbar */}
      <div className="flex-shrink-0 px-3 py-2 bg-[var(--t-panel)] border-b border-[var(--t-border)] flex items-center gap-2">
        <div className="w-48">
          <CustomSelect
            value={connId}
            onChange={v => setConnId(v)}
            placeholder="Connection..."
            options={connections.map(c => ({
              value: c.id,
              label: c.name,
              icon: <Database size={12} className={c.type === 'postgresql' ? 'text-blue-500' : c.type === 'mysql' ? 'text-orange-500' : 'text-red-500'} />,
            }))}
          />
        </div>
        <button
          onClick={() => runQuery()}
          disabled={activeTab.running || !connId || !activeTab.sql.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 transition-colors"
          title="Run (Ctrl+Enter)"
        >
          {activeTab.running ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
          Run
        </button>
        <button
          onClick={() => updateTab(activeTab.id, { sql: formatSql(activeTab.sql) })}
          disabled={!activeTab.sql.trim()}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[var(--t-text-secondary)] hover:bg-[var(--t-panel-hover)] disabled:opacity-40 transition-colors"
          title="Format SQL"
        >
          <Code size={12} /> Format
        </button>
        <div className="relative" ref={historyRef}>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[var(--t-text-secondary)] hover:bg-[var(--t-panel-hover)] transition-colors"
            title="Query History"
          >
            <Clock size={12} /> History
          </button>
          {showHistory && history.length > 0 && (
            <div className="absolute top-full left-0 mt-1 w-96 max-h-72 overflow-y-auto bg-[var(--t-panel)] border border-[var(--t-border)] rounded-xl shadow-xl z-50">
              <div className="px-3 py-2 border-b border-[var(--t-border-light)] text-[10px] font-semibold text-[var(--t-text-muted)] uppercase tracking-wider">Recent Queries</div>
              {history.map((h, i) => (
                <button
                  key={i}
                  onClick={() => { updateTab(activeTab.id, { sql: h.sql }); setShowHistory(false); }}
                  className="w-full text-left px-3 py-2 hover:bg-[var(--t-bg)] border-b border-[var(--t-border-light)] transition-colors"
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] text-[var(--t-text-muted)]">{h.time}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--t-panel-hover)] text-[var(--t-text-muted)]">{h.connName}</span>
                  </div>
                  <div className="text-xs font-mono text-[var(--t-text-secondary)] truncate">{h.sql}</div>
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => setShowSchema(s => !s)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${showSchema ? 'text-teal-600 bg-teal-50' : 'text-[var(--t-text-secondary)] hover:bg-[var(--t-panel-hover)]'}`}
          title="Toggle Schema Browser"
        >
          <Table2 size={12} /> Schema
        </button>
        <div className="flex-1" />
        {activeTab.result && !activeTab.result.error && activeTab.result.columns.length > 0 && (
          <div className="flex items-center gap-1">
            <button onClick={exportCsv} className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium text-[var(--t-text-muted)] hover:bg-[var(--t-panel-hover)] transition-colors" title="Export CSV">
              <Download size={10} /> CSV
            </button>
            <button onClick={exportXlsx} className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium text-[var(--t-text-muted)] hover:bg-[var(--t-panel-hover)] transition-colors" title="Export XLSX">
              <Download size={10} /> XLSX
            </button>
          </div>
        )}
        {activeTab.result?.time != null && (
          <span className="text-[10px] text-[var(--t-text-muted)] ml-1">{activeTab.result.time}ms</span>
        )}
      </div>

      {/* Query tabs */}
      <div className="flex-shrink-0 bg-[var(--t-bg)] border-b border-[var(--t-border)] flex items-center gap-0 px-2 overflow-x-auto">
        {tabs.map(tab => (
          <div
            key={tab.id}
            onClick={() => setActiveTabId(tab.id)}
            className={`group flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium cursor-pointer border-b-2 transition-colors whitespace-nowrap ${
              activeTabId === tab.id
                ? 'border-teal-500 text-teal-700 bg-[var(--t-panel)]'
                : 'border-transparent text-[var(--t-text-muted)] hover:text-[var(--t-text-secondary)] hover:bg-[var(--t-panel-hover)]'
            }`}
          >
            <Terminal size={10} className={activeTabId === tab.id ? 'text-teal-500' : 'text-[var(--t-text-muted)]'} />
            {tab.name}
            {tab.running && <Loader2 size={10} className="animate-spin text-teal-500" />}
            {tabs.length > 1 && (
              <button
                onClick={e => { e.stopPropagation(); closeTab(tab.id); }}
                className="ml-1 opacity-0 group-hover:opacity-100 text-[var(--t-text-muted)] hover:text-red-500 transition-opacity"
              >
                <X size={10} />
              </button>
            )}
          </div>
        ))}
        <button onClick={addTab} className="p-1 text-[var(--t-text-muted)] hover:text-teal-600 hover:bg-[var(--t-panel-hover)] rounded transition-colors ml-1" title="New Tab">
          <Plus size={12} />
        </button>
      </div>

      {/* Main area: schema browser + editor + results */}
      <div className="flex-1 flex overflow-hidden">
        {/* Schema sidebar */}
        {showSchema && connId && (
          <div className="w-52 flex-shrink-0 bg-[var(--t-panel)] border-r border-[var(--t-border)] flex flex-col overflow-hidden">
            <div className="px-2 py-2 border-b border-[var(--t-border-light)]">
              <div className="relative">
                <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--t-text-muted)]" />
                <input
                  className="w-full pl-7 pr-2 py-1 text-[11px] border border-[var(--t-border)] rounded-md focus:outline-none focus:ring-1 focus:ring-teal-500 bg-[var(--t-bg)]"
                  placeholder="Filter tables..."
                  value={schemaSearch}
                  onChange={e => setSchemaSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto py-1">
              {schemaLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 size={14} className="animate-spin text-teal-400" />
                </div>
              ) : filteredSchema.length === 0 ? (
                <div className="text-center py-6 text-[11px] text-[var(--t-text-muted)]">No tables found</div>
              ) : (
                filteredSchema.map(tbl => (
                  <div key={tbl.name}>
                    <div
                      className="flex items-center gap-1 px-2 py-1 hover:bg-[var(--t-bg)] cursor-pointer group transition-colors"
                      onClick={() => toggleTableExpand(tbl.name)}
                      onDoubleClick={() => insertTableName(tbl.name)}
                      title="Double-click to insert, click to expand"
                    >
                      <span className="w-3 flex-shrink-0 text-[var(--t-text-muted)]">
                        {tbl.expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                      </span>
                      <Table2 size={10} className="text-blue-400 flex-shrink-0" />
                      <span className="flex-1 text-[11px] font-mono text-[var(--t-text-secondary)] truncate">{tbl.name}</span>
                      <button
                        onClick={e => { e.stopPropagation(); insertTableName(tbl.name); }}
                        className="opacity-0 group-hover:opacity-100 text-[var(--t-text-muted)] hover:text-teal-600 p-0.5 transition-opacity"
                        title="Insert table name"
                      >
                        <Plus size={9} />
                      </button>
                    </div>
                    {tbl.expanded && tbl.columns && (
                      <div className="ml-5 border-l border-[var(--t-border-light)]">
                        {tbl.columns.map(col => (
                          <div
                            key={col.name}
                            className="flex items-center gap-1.5 px-2 py-0.5 text-[10px] hover:bg-[var(--t-bg)] cursor-pointer transition-colors"
                            onClick={() => insertTableName(col.name)}
                            title={`${col.type} - Click to insert`}
                          >
                            <Hash size={8} className="text-[var(--t-text-muted)] flex-shrink-0" />
                            <span className="text-[var(--t-text-secondary)] font-mono truncate">{col.name}</span>
                            <span className="text-[var(--t-text-muted)] text-[9px] ml-auto flex-shrink-0">{col.type}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Editor + Results split */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* SQL Editor with line numbers */}
          <div className="flex-shrink-0 border-b border-[var(--t-border)]" style={{ height: '40%', minHeight: 120 }}>
            <div className="h-full flex bg-[var(--t-bg)] overflow-hidden">
              {/* Line numbers gutter */}
              <div className="flex-shrink-0 w-10 bg-[var(--t-panel)] text-right pr-2 pt-3 pb-3 overflow-hidden select-none">
                {Array.from({ length: Math.max(lineCount, 10) }, (_, i) => (
                  <div key={i} className="text-[11px] leading-[1.375rem] text-[var(--t-text-secondary)] font-mono">{i + 1}</div>
                ))}
              </div>
              {/* Textarea */}
              <textarea
                ref={textareaRef}
                className="flex-1 bg-[var(--t-bg)] text-green-400 text-xs font-mono p-3 resize-none focus:outline-none leading-[1.375rem] placeholder-[var(--t-text-muted)]"
                value={activeTab.sql}
                onChange={e => updateTab(activeTab.id, { sql: e.target.value })}
                onKeyDown={handleKeyDown}
                placeholder="-- Write your SQL here...&#10;-- Ctrl+Enter to run, Ctrl+Shift+Enter to run selection"
                spellCheck={false}
              />
            </div>
          </div>

          {/* Results area */}
          <div className="flex-1 flex flex-col overflow-hidden bg-[var(--t-panel)]">
            {/* Results/Messages tabs */}
            <div className="flex-shrink-0 flex items-center gap-0 px-3 border-b border-[var(--t-border)] bg-[var(--t-bg)]">
              <button
                onClick={() => updateTab(activeTab.id, { resultTab: 'results' })}
                className={`px-3 py-1.5 text-[11px] font-medium border-b-2 transition-colors ${
                  activeTab.resultTab === 'results' ? 'border-teal-500 text-teal-700' : 'border-transparent text-[var(--t-text-muted)] hover:text-[var(--t-text-secondary)]'
                }`}
              >
                <Table2 size={10} className="inline mr-1 -mt-0.5" />
                Results
                {activeTab.result && !activeTab.result.error && (
                  <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--t-border-light)] text-[var(--t-text-secondary)]">{activeTab.result.rowCount ?? 0}</span>
                )}
              </button>
              <button
                onClick={() => updateTab(activeTab.id, { resultTab: 'messages' })}
                className={`px-3 py-1.5 text-[11px] font-medium border-b-2 transition-colors ${
                  activeTab.resultTab === 'messages' ? 'border-teal-500 text-teal-700' : 'border-transparent text-[var(--t-text-muted)] hover:text-[var(--t-text-secondary)]'
                }`}
              >
                <Terminal size={10} className="inline mr-1 -mt-0.5" />
                Messages
                {activeTab.messages.length > 0 && activeTab.result?.error && (
                  <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                )}
              </button>
              <div className="flex-1" />
              {activeTab.result?.time != null && (
                <span className="text-[10px] text-[var(--t-text-muted)]">
                  <Clock size={9} className="inline mr-0.5 -mt-0.5" />
                  {activeTab.result.time}ms &middot; {activeTab.result.rowCount ?? 0} rows
                </span>
              )}
            </div>

            {/* Results content */}
            <div className="flex-1 overflow-auto">
              {activeTab.resultTab === 'messages' ? (
                /* Messages tab */
                <div className="p-3 font-mono text-xs space-y-1">
                  {activeTab.messages.length === 0 ? (
                    <div className="text-[var(--t-text-muted)] text-center py-8">No messages</div>
                  ) : (
                    activeTab.messages.map((msg, i) => (
                      <div key={i} className={`px-2 py-1 rounded ${msg.startsWith('Error') ? 'text-red-600 bg-red-50' : 'text-[var(--t-text-secondary)] bg-[var(--t-bg)]'}`}>
                        {msg}
                      </div>
                    ))
                  )}
                </div>
              ) : activeTab.running ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 size={20} className="animate-spin text-teal-400" />
                  <span className="ml-2 text-xs text-[var(--t-text-muted)]">Executing query...</span>
                </div>
              ) : activeTab.result?.error ? (
                <div className="px-4 py-3 text-xs text-red-600 bg-red-50 flex items-start gap-2 m-3 rounded-lg">
                  <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                  <pre className="whitespace-pre-wrap font-mono">{activeTab.result.error}</pre>
                </div>
              ) : activeTab.result && activeTab.result.columns.length > 0 ? (
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 bg-[var(--t-bg)] z-10">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-[var(--t-text-muted)] border-b border-[var(--t-border)] w-10 text-[10px]">#</th>
                      {activeTab.result.columns.map(col => (
                        <th key={col.name} className="px-3 py-2 text-left font-medium text-[var(--t-text-secondary)] border-b border-[var(--t-border)] whitespace-nowrap text-[11px]">{col.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeTab.result.rows.map((row, i) => (
                      <tr key={i} className={`border-b border-[var(--t-border-light)] hover:bg-[var(--t-accent-light)]/30 transition-colors ${i % 2 === 0 ? 'bg-[var(--t-panel)]' : 'bg-[var(--t-bg)]/30'}`}>
                        <td className="px-3 py-1.5 text-[10px] text-[var(--t-text-muted)]">{i + 1}</td>
                        {activeTab.result!.columns.map(col => (
                          <td key={col.name} className="px-3 py-1.5 text-[var(--t-text-secondary)] whitespace-nowrap max-w-[300px] truncate font-mono text-[11px]">
                            {row[col.name] === null ? <span className="text-[var(--t-text-muted)] italic">NULL</span> : String(row[col.name])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-[var(--t-text-muted)]">
                  <Database size={28} className="mb-2 opacity-20" />
                  <p className="text-xs font-medium">Run a query to see results</p>
                  <p className="text-[10px] text-[var(--t-text-muted)] mt-1.5">Ctrl+Enter to execute &middot; Ctrl+Shift+Enter for selection</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DataRepository() {
  const [showSettings, setShowSettings] = useState(false);
  const [tables, setTables] = useState<RepoTable[]>([]);
  const [folders, setFolders] = useState<RepoFolder[]>([]);
  const [connections, setConnections] = useState<RepoConnection[]>([]);
  const [selectedTable, setSelectedTable] = useState<RepoTable | null>(null);
  const [loading, setLoading] = useState(true);

  // Create table state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', description: '', connectionId: '', folderId: '' });
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState('');

  // Create folder state
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [folderForm, setFolderForm] = useState({ name: '', parentId: '' });
  const [folderSubmitting, setFolderSubmitting] = useState(false);
  const [folderError, setFolderError] = useState('');

  // Discover existing tables state
  const [discoverConnId, setDiscoverConnId] = useState('');
  const [discoveredTables, setDiscoveredTables] = useState<{ name: string; schema?: string }[]>([]);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [discoverError, setDiscoverError] = useState('');
  const [selectedExisting, setSelectedExisting] = useState<Set<string>>(new Set());
  const [discoverSearch, setDiscoverSearch] = useState('');

  // Import state
  const [importingId, setImportingId] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Delete states
  const [deleteTarget, setDeleteTarget] = useState<RepoTable | null>(null);
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<RepoFolder | null>(null);

  // Edit-table-properties state. Reference page didn't expose a way
  // to update displayName / description / category / folder, but
  // admins want to fix typos + reorganise without re-creating the
  // record. Opens via the pencil button on the Data-tab action bar.
  const [editTable, setEditTable] = useState<RepoTable | null>(null);
  const [editTableForm, setEditTableForm] = useState({ name: '', description: '', folderId: '' });
  const [editTableSaving, setEditTableSaving] = useState(false);

  async function handleSaveEditTable() {
    if (!editTable) return;
    setEditTableSaving(true);
    try {
      const res = await authFetch(`/orch/api/data-repository/tables/${editTable.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editTableForm.name,
          description: editTableForm.description,
          folderId: editTableForm.folderId || null,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setEditTable(null);
        loadAll();
      }
    } finally {
      setEditTableSaving(false);
    }
  }

  // Right panel tab state
  const [rightTab, setRightTab] = useState<'data' | 'properties' | 'spec' | 'sql'>('data');

  // Table structure state — `encrypted` is added so Properties tab
  // can show 🔒/🔓 buttons per column (spec).
  const [structureCols, setStructureCols] = useState<{ name: string; type: string; nullable: boolean; encrypted?: boolean; length?: number; precision?: number; scale?: number }[]>([]);
  const [structureLoading, setStructureLoading] = useState(false);
  const [structureError, setStructureError] = useState('');
  const [structureEngine, setStructureEngine] = useState('');
  const [encryptingCol, setEncryptingCol] = useState<string | null>(null);
  const [encryptPreview, setEncryptPreview] = useState<{ column: string; decrypt: boolean; willMigrateRows: number; keyVersion: number | null; local: boolean } | null>(null);

  // PK / key / audit columns must NOT be encrypted — encrypting a key
  // column breaks foreign keys & joins (this is exactly what Oracle's
  // ORA-28335 guards against). Block them in the UI.
  const isKeyColumn = (name: string) => ['id', 'created_at', 'updated_at'].includes(name.toLowerCase());

  // Run preview / apply against /api/repo/tables/:id/encrypt.
  async function runEncryptAction(tableId: string, column: string, decrypt: boolean, action: 'preview' | 'apply') {
    setEncryptingCol(column);
    try {
      const res = await authFetch(`/orch/api/repo/tables/${tableId}/encrypt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ column, decrypt, action }),
      });
      const json = await res.json().catch(() => ({}));
      // Surface API errors (e.g. Oracle ORA-28335 on FK columns) instead of
      // silently swallowing them — previously the user saw nothing happen.
      if (!res.ok || json?.error) {
        toast.error(json?.error || `${decrypt ? 'Decrypt' : 'Encrypt'} failed (HTTP ${res.status})`);
        return;
      }
      if (action === 'preview') {
        setEncryptPreview({
          column, decrypt,
          willMigrateRows: Number(json.willMigrateRows ?? 0),
          keyVersion: json.keyVersion ?? null,
          local: json.local !== false,
        });
      } else {
        setEncryptPreview(null);
        toast.success(`${decrypt ? 'Decrypted' : 'Encrypted'} column "${column}"`);
        if (selectedTable) loadStructure(selectedTable.id);
      }
    } catch (e) {
      console.error('Encrypt action failed', e);
      toast.error(`${decrypt ? 'Decrypt' : 'Encrypt'} request failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setEncryptingCol(null);
    }
  }

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, cRes, fRes] = await Promise.all([
        authFetch(`/orch/api/data-repository/tables`),
        authFetch(`/orch/api/data-repository/connections`),
        authFetch(`/orch/api/data-repository/folders`),
      ]);
      const tJson = await tRes.json();
      const cJson = await cRes.json();
      const fJson = await fRes.json();
      if (tJson.success) setTables(tJson.data?.tables ?? tJson.data ?? []);
      if (cJson.success) {
        const raw = cJson.data?.connections ?? cJson.data ?? [];
        setConnections(raw.map((c: any) => ({ ...c, config: typeof c.config === 'string' ? JSON.parse(c.config) : c.config })));
      }
      if (fJson.success) setFolders(fJson.data?.folders ?? fJson.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Load table structure
  async function loadStructure(tableId: string) {
    setStructureLoading(true);
    setStructureError('');
    setStructureCols([]);
    try {
      const res = await authFetch(`/orch/api/data-repository/tables/${tableId}/structure`);
      const json = await res.json();
      if (json.success) {
        if (json.data.error) {
          setStructureError(json.data.error);
        } else {
          setStructureCols(json.data.columns ?? []);
          setStructureEngine(json.data.engine ?? '');
        }
      } else {
        setStructureError(json.error || 'Failed');
      }
    } catch (e: unknown) {
      setStructureError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setStructureLoading(false);
    }
  }

  // When selecting a table, auto-load structure if on properties tab
  useEffect(() => {
    if (selectedTable && rightTab === 'properties') loadStructure(selectedTable.id);
  }, [selectedTable?.id, rightTab]);

  async function handleCreateTable() {
    if (!createForm.name) { setCreateError('Table name is required.'); return; }
    setCreateSubmitting(true);
    setCreateError('');
    try {
      const body: { name: string; description: string; connectionId?: string; folderId?: string } = {
        name: createForm.name, description: createForm.description,
      };
      if (createForm.connectionId) body.connectionId = createForm.connectionId;
      if (createForm.folderId) body.folderId = createForm.folderId;
      const res = await authFetch(`/orch/api/data-repository/tables`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed');
      setShowCreateModal(false);
      loadAll();
    } catch (e: unknown) {
      setCreateError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setCreateSubmitting(false);
    }
  }

  async function handleCreateFolder() {
    if (!folderForm.name) { setFolderError('Folder name is required.'); return; }
    setFolderSubmitting(true);
    setFolderError('');
    try {
      const res = await authFetch(`/orch/api/data-repository/folders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: folderForm.name, parentId: folderForm.parentId || undefined }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed');
      setShowFolderModal(false);
      loadAll();
    } catch (e: unknown) {
      setFolderError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setFolderSubmitting(false);
    }
  }

  async function handleDeleteFolder(f: RepoFolder) {
    const res = await authFetch(`/orch/api/data-repository/folders/${f.id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) { setDeleteFolderTarget(null); loadAll(); }
  }

  async function handleRenameFolder(folderId: string, newName: string) {
    await authFetch(`/orch/api/data-repository/folders/${folderId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    });
    loadAll();
  }

  async function handleMoveTable(tableId: string, folderId: string | null) {
    await authFetch(`/orch/api/data-repository/tables/${tableId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderId: folderId || null }),
    });
    loadAll();
  }

  async function handleDiscoverTables(connectionId: string) {
    if (!connectionId) return;
    setDiscoverLoading(true);
    setDiscoverError('');
    setDiscoveredTables([]);
    setSelectedExisting(new Set());
    try {
      const res = await authFetch(`/orch/api/data-repository/connections/${connectionId}/tables`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed');
      const dbTables: { name: string; schema?: string }[] = json.data?.tables ?? [];
      const existingNames = new Set(tables.map(t => t.name.toUpperCase()));
      const available = dbTables.filter(t => !existingNames.has(t.name.toUpperCase()));
      setDiscoveredTables(available);
      if (available.length === 0 && dbTables.length > 0) {
        setDiscoverError(`All ${dbTables.length} tables are already in the repository.`);
      }
    } catch (e: unknown) {
      setDiscoverError(e instanceof Error ? e.message : 'Failed to discover tables');
    } finally {
      setDiscoverLoading(false);
    }
  }

  async function handleAddExistingTables() {
    if (selectedExisting.size === 0 || !discoverConnId) return;
    setCreateSubmitting(true);
    setCreateError('');
    try {
      const connName = connections.find(c => c.id === discoverConnId)?.name || '';
      for (const tableName of selectedExisting) {
        await authFetch(`/orch/api/data-repository/tables`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: tableName, description: `From ${connName}`, connectionId: discoverConnId, folderId: createForm.folderId || undefined }),
        });
      }
      setShowCreateModal(false);
      loadAll();
    } catch (e: unknown) {
      setCreateError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setCreateSubmitting(false);
    }
  }

  async function handleDeleteTable(t: RepoTable) {
    const res = await authFetch(`/orch/api/data-repository/tables/${t.id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) {
      setDeleteTarget(null);
      if (selectedTable?.id === t.id) setSelectedTable(null);
      loadAll();
    }
  }

  async function handleImport(file: File) {
    if (!selectedTable) return;
    setImportingId(selectedTable.id);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const token = useAuthStore.getState().accessToken;
      const headers = new Headers();
      if (token) headers.set('Authorization', `Bearer ${token}`);
      const res = await fetch(`/orch/api/data-repository/tables/${selectedTable.id}/import`, {
        method: 'POST',
        headers,
        body: fd,
      });
      const json = await res.json();
      if (json.success) {
        setImportResult({ ok: true, msg: json.data?.message ?? 'Import successful' });
        loadAll();
      } else {
        setImportResult({ ok: false, msg: json.error || 'Import failed' });
      }
    } catch {
      setImportResult({ ok: false, msg: 'Upload failed' });
    } finally {
      setImportingId(null);
      setTimeout(() => setImportResult(null), 5000);
    }
  }

  return (
    <div className="flex flex-col h-full bg-[var(--t-bg)] overflow-hidden">
      {/* Main content — top wordmark bar removed; Settings now lives
          inline with the sidebar's New Folder / Add Table actions
          so the empty header doesn't waste vertical space. */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel: Tree (folders + tables) */}
        <LeftTreePanel
          tables={tables}
          folders={folders}
          selectedTable={selectedTable}
          onSelectTable={setSelectedTable}
          onOpenSettings={() => setShowSettings(true)}
          onCreateTable={() => {
            setCreateForm({ name: '', description: '', connectionId: '', folderId: '' });
            setCreateError('');
            setDiscoverConnId('');
            setDiscoveredTables([]);
            setSelectedExisting(new Set());
            setDiscoverSearch('');
            setShowCreateModal(true);
          }}
          onCreateFolder={() => {
            setFolderForm({ name: '', parentId: '' });
            setFolderError('');
            setShowFolderModal(true);
          }}
          onDeleteFolder={f => setDeleteFolderTarget(f)}
          onMoveTable={handleMoveTable}
          onRenameFolder={handleRenameFolder}
          loading={loading}
        />

        {/* Right panel */}
        <main className="flex-1 overflow-hidden flex flex-col">
          {/* Tab bar */}
          <div className="flex-shrink-0 bg-[var(--t-panel)] border-b border-[var(--t-border)] flex items-center gap-0 px-4">
            <button
              onClick={() => setRightTab('data')}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${rightTab === 'data' ? 'border-teal-500 text-teal-700' : 'border-transparent text-[var(--t-text-muted)] hover:text-[var(--t-text-secondary)]'}`}
            >
              <Table2 size={12} className="inline mr-1 -mt-0.5" /> Data
            </button>
            <button
              onClick={() => setRightTab('properties')}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${rightTab === 'properties' ? 'border-teal-500 text-teal-700' : 'border-transparent text-[var(--t-text-muted)] hover:text-[var(--t-text-secondary)]'}`}
            >
              <Columns size={12} className="inline mr-1 -mt-0.5" /> Properties
            </button>
            <button
              onClick={() => setRightTab('spec')}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${rightTab === 'spec' ? 'border-teal-500 text-teal-700' : 'border-transparent text-[var(--t-text-muted)] hover:text-[var(--t-text-secondary)]'}`}
            >
              <Code size={12} className="inline mr-1 -mt-0.5" /> API Spec
            </button>
            <button
              onClick={() => setRightTab('sql')}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${rightTab === 'sql' ? 'border-teal-500 text-teal-700' : 'border-transparent text-[var(--t-text-muted)] hover:text-[var(--t-text-secondary)]'}`}
            >
              <Database size={12} className="inline mr-1 -mt-0.5" /> SQL Editor
            </button>
          </div>

          {rightTab === 'data' ? (
            /* ── Data Tab ── */
            selectedTable ? (
              <div className="flex-1 overflow-hidden flex flex-col">
                {/* Table action bar */}
                <div className="flex-shrink-0 px-5 py-2 bg-[var(--t-panel)] border-b border-[var(--t-border-light)] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Table2 size={14} className="text-teal-500" />
                    <span className="text-sm font-semibold text-[var(--t-text)]">{selectedTable.name}</span>
                    {selectedTable.rowCount > 0 && <span className="text-[11px] text-[var(--t-text-muted)]">{selectedTable.rowCount.toLocaleString()} rows</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    <input type="file" accept=".csv,.tsv,.json,.xlsx,.xls,.zip" className="hidden" ref={fileInputRef}
                      onChange={e => { const file = e.target.files?.[0]; if (file) handleImport(file); e.target.value = ''; }}
                    />
                    <button onClick={() => fileInputRef.current?.click()} disabled={importingId !== null}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-[var(--t-text-muted)] hover:bg-[var(--t-panel-hover)] disabled:opacity-50" title="Import file">
                      {importingId ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} Import
                    </button>
                    <button
                      onClick={() => {
                        setEditTable(selectedTable);
                        setEditTableForm({
                          name: selectedTable.name ?? '',
                          description: selectedTable.description ?? '',
                          folderId: selectedTable.folderId ?? '',
                        });
                      }}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-[var(--t-text-muted)] hover:text-teal-600 hover:bg-teal-500/10"
                      title="Edit table properties"
                    >
                      <Pencil size={12} />
                    </button>
                    <button onClick={() => setDeleteTarget(selectedTable)}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-[var(--t-text-muted)] hover:text-red-600 hover:bg-red-50" title="Remove from list">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {importResult && (
                  <div className={`flex-shrink-0 px-5 py-1.5 text-xs flex items-center gap-2 ${importResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                    {importResult.ok ? <Check size={12} /> : <AlertCircle size={12} />}
                    {importResult.msg}
                    <button onClick={() => setImportResult(null)} className="ml-auto text-[var(--t-text-muted)] hover:text-[var(--t-text-secondary)]"><X size={12} /></button>
                  </div>
                )}

                <div className="flex-1 overflow-hidden flex flex-col px-5 py-3">
                  <TableDataSection table={selectedTable} />
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-[var(--t-text-muted)]">
                <Database size={40} className="mb-3 opacity-30" />
                <p className="text-sm font-medium">Select a table to view data</p>
                <p className="text-xs mt-1 text-[var(--t-text-muted)]">Or add a table from the left panel</p>
              </div>
            )
          ) : rightTab === 'properties' ? (
            /* ── Properties Tab ── */
            selectedTable ? (
              <div className="flex-1 overflow-hidden flex flex-col">
                <div className="flex-shrink-0 px-5 py-3 bg-[var(--t-panel)] border-b border-[var(--t-border-light)]">
                  <div className="flex items-center gap-2 mb-2">
                    <Table2 size={14} className="text-teal-500" />
                    <span className="text-sm font-semibold text-[var(--t-text)]">{selectedTable.name}</span>
                    {structureEngine && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--t-panel-hover)] text-[var(--t-text-muted)] font-medium">{structureEngine}</span>}
                  </div>
                  {selectedTable.description && <p className="text-xs text-[var(--t-text-muted)]">{selectedTable.description}</p>}
                  <div className="flex items-center gap-4 mt-2 text-[11px] text-[var(--t-text-muted)]">
                    <span>Connection: <span className="text-[var(--t-text-secondary)]">{connections.find(c => c.id === selectedTable.connectionId)?.name ?? 'None'}</span></span>
                    <span>Columns: <span className="text-[var(--t-text-secondary)]">{structureCols.length}</span></span>
                  </div>
                </div>

                <div className="flex-1 overflow-auto p-5">
                  {structureLoading ? (
                    <div className="flex items-center justify-center py-16">
                      <Loader2 size={20} className="animate-spin text-teal-400" />
                    </div>
                  ) : structureError ? (
                    <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 rounded-lg px-4 py-3">
                      <AlertCircle size={16} /> {structureError}
                    </div>
                  ) : structureCols.length === 0 ? (
                    <div className="text-center py-16 text-[var(--t-text-muted)] text-sm">No columns found</div>
                  ) : (
                    <div className="rounded-xl border border-[var(--t-border)] overflow-hidden bg-[var(--t-panel)] shadow-sm">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="bg-[var(--t-bg)] border-b border-[var(--t-border)]">
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--t-text-muted)] w-10">#</th>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--t-text-secondary)]">Column Name</th>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--t-text-secondary)]">Data Type</th>
                            <th className="px-4 py-2.5 text-center text-xs font-semibold text-[var(--t-text-secondary)]">Nullable</th>
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-[var(--t-text-secondary)]">Length/Precision</th>
                            <th className="px-4 py-2.5 text-center text-xs font-semibold text-[var(--t-text-secondary)] w-32">Encryption</th>
                          </tr>
                        </thead>
                        <tbody>
                          {structureCols.map((col, i) => (
                            <tr key={col.name} className={`border-b border-[var(--t-border-light)] ${i % 2 === 0 ? 'bg-[var(--t-panel)]' : 'bg-[var(--t-bg)]/40'}`}>
                              <td className="px-4 py-2 text-xs text-[var(--t-text-muted)]">{i + 1}</td>
                              <td className="px-4 py-2">
                                <code className="text-xs font-mono font-medium text-[var(--t-text)]">{col.name}</code>
                              </td>
                              <td className="px-4 py-2">
                                <span className="text-xs px-2 py-0.5 rounded bg-[var(--t-accent-light)] text-blue-700 font-medium">{col.type}</span>
                              </td>
                              <td className="px-4 py-2 text-center">
                                {col.nullable
                                  ? <span className="text-xs text-[var(--t-text-muted)]">YES</span>
                                  : <span className="text-xs text-red-500 font-medium">NOT NULL</span>
                                }
                              </td>
                              <td className="px-4 py-2 text-xs text-[var(--t-text-muted)]">
                                {col.precision != null ? `${col.precision}${col.scale != null ? `,${col.scale}` : ''}` :
                                 col.length != null ? col.length : '—'}
                              </td>
                              <td className="px-4 py-2 text-center">
                                {(col as any).appEncrypted ? (
                                  <button
                                    onClick={() => selectedTable && runEncryptAction(selectedTable.id, col.name, true, 'preview')}
                                    disabled={encryptingCol === col.name}
                                    className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 disabled:opacity-50"
                                    title="Decrypt this column (app-level AES-256-GCM)"
                                  ><Unlock size={11} /> Decrypt</button>
                                ) : (
                                  <button
                                    onClick={() => { if (selectedTable && !isKeyColumn(col.name)) runEncryptAction(selectedTable.id, col.name, false, 'preview'); }}
                                    disabled={encryptingCol === col.name || isKeyColumn(col.name)}
                                    className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                                    title={isKeyColumn(col.name) ? 'Key/audit columns cannot be encrypted (random-IV ciphertext breaks lookups)' : 'Encrypt this column (app-level AES-256-GCM)'}
                                  ><Lock size={11} /> Encrypt</button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-[var(--t-text-muted)]">
                <Columns size={40} className="mb-3 opacity-30" />
                <p className="text-sm font-medium">Select a table to view structure</p>
              </div>
            )
          ) : rightTab === 'spec' ? (
            /* ── API Spec Tab — shows the auto-generated REST + OpenAPI
                  for this table's CRUD endpoints. ── */
            selectedTable ? <ApiSpecPanel tableId={selectedTable.id} tableName={selectedTable.name} /> : (
              <div className="flex-1 flex flex-col items-center justify-center text-[var(--t-text-muted)]">
                <Code size={40} className="mb-3 opacity-30" />
                <p className="text-sm font-medium">Select a table to view its API spec</p>
              </div>
            )
          ) : (
            /* ── SQL Editor Tab ── */
            <SqlEditorPanel connections={connections} />
          )}
        </main>
      </div>

      {/* Settings modal */}
      {showSettings && <SettingsModal onClose={() => { setShowSettings(false); loadAll(); }} />}

      {/* Edit Table Properties modal */}
      {editTable && (
        <Modal title={`Edit table: ${editTable.name}`} onClose={() => setEditTable(null)}>
          <div className="space-y-3">
            <label className="block">
              <span className="text-[11px] text-[var(--t-text-muted)] block mb-1">Display Name</span>
              <input
                value={editTableForm.name}
                onChange={(e) => setEditTableForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-1.5 text-sm rounded border border-[var(--t-border)] bg-[var(--t-input)] text-[var(--t-text)]"
              />
            </label>
            <label className="block">
              <span className="text-[11px] text-[var(--t-text-muted)] block mb-1">Description</span>
              <textarea
                rows={3}
                value={editTableForm.description}
                onChange={(e) => setEditTableForm((f) => ({ ...f, description: e.target.value }))}
                className="w-full px-3 py-1.5 text-sm rounded border border-[var(--t-border)] bg-[var(--t-input)] text-[var(--t-text)]"
              />
            </label>
            <label className="block">
              <span className="text-[11px] text-[var(--t-text-muted)] block mb-1">Folder</span>
              <select
                value={editTableForm.folderId}
                onChange={(e) => setEditTableForm((f) => ({ ...f, folderId: e.target.value }))}
                className="w-full px-3 py-1.5 text-sm rounded border border-[var(--t-border)] bg-[var(--t-input)] text-[var(--t-text)]"
              >
                <option value="">— Root (no folder) —</option>
                {folders.map((fl: any) => (
                  <option key={fl.id} value={fl.id}>{fl.name}</option>
                ))}
              </select>
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setEditTable(null)}
                className="px-3 py-1.5 text-xs rounded border border-[var(--t-border)] text-[var(--t-text-secondary)] hover:bg-[var(--t-panel-hover)]"
              >Cancel</button>
              <button
                onClick={handleSaveEditTable}
                disabled={editTableSaving}
                className="px-3 py-1.5 text-xs rounded bg-teal-500 text-white font-medium hover:bg-teal-600 disabled:opacity-50"
              >{editTableSaving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Encrypt / Decrypt preview modal — shows the engine-aware DDL
          before running it so admins can sanity-check or copy/paste.
          spec column-level encryption. */}
      {encryptPreview && selectedTable && (
        <Modal
          title={`${encryptPreview.decrypt ? 'Decrypt' : 'Encrypt'} column: ${encryptPreview.column}`}
          onClose={() => setEncryptPreview(null)}
        >
          <div className="space-y-3">
            <p className="text-xs text-[var(--t-text-secondary)]">
              {encryptPreview.decrypt
                ? 'Reverts the column to plaintext (app-level AES-256-GCM). Existing rows are decrypted in place.'
                : 'Encrypts the column with app-level AES-256-GCM — encrypt-on-write, decrypt-on-read through Orch’s API. Existing rows are migrated in place.'}
            </p>
            <div className="text-[12px] p-3 rounded-lg border border-[var(--t-border)] bg-[var(--t-bg)] space-y-1">
              <div className="flex justify-between"><span className="text-[var(--t-text-muted)]">Column</span><code className="text-[var(--t-text)]">{encryptPreview.column}</code></div>
              {!encryptPreview.decrypt && (
                <div className="flex justify-between"><span className="text-[var(--t-text-muted)]">Key version</span><span className="text-[var(--t-text)]">{encryptPreview.keyVersion != null ? `v${encryptPreview.keyVersion}` : '—'}</span></div>
              )}
              <div className="flex justify-between">
                <span className="text-[var(--t-text-muted)]">Rows to {encryptPreview.decrypt ? 'decrypt' : 'encrypt'}</span>
                <span className="text-[var(--t-text)]">{encryptPreview.local ? encryptPreview.willMigrateRows.toLocaleString() : 'flag only (external table)'}</span>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setEncryptPreview(null)}
                className="px-3 py-1.5 text-xs rounded border border-[var(--t-border)] text-[var(--t-text-secondary)] hover:bg-[var(--t-panel-hover)]"
              >Cancel</button>
              <button
                onClick={() => runEncryptAction(selectedTable.id, encryptPreview.column, encryptPreview.decrypt, 'apply')}
                disabled={encryptingCol === encryptPreview.column}
                className="px-3 py-1.5 text-xs rounded bg-amber-500 text-white font-medium hover:bg-amber-600 disabled:opacity-50"
              >{encryptingCol === encryptPreview.column ? 'Applying…' : 'Apply'}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Add Table Modal */}
      {showCreateModal && (
        <Modal title="Add Table" onClose={() => { setShowCreateModal(false); setDiscoverConnId(''); setDiscoveredTables([]); setSelectedExisting(new Set()); setDiscoverSearch(''); setCreateForm({ name: '', description: '', connectionId: '', folderId: '' }); }}>
          <div className="space-y-4">
            {/* Connection selector */}
            <CustomSelect
              label="Connection"
              value={createForm.connectionId}
              onChange={v => {
                setCreateForm(f => ({ ...f, connectionId: v }));
                setDiscoverConnId(v);
                setSelectedExisting(new Set());
                setDiscoverSearch('');
                if (v) handleDiscoverTables(v);
                else setDiscoveredTables([]);
              }}
              placeholder="None (file import only)"
              options={[
                { value: '', label: 'None (file import only)' },
                ...connections.map(c => ({
                  value: c.id,
                  label: c.name,
                  icon: <Database size={14} className={c.type === 'postgresql' ? 'text-blue-500' : c.type === 'mysql' ? 'text-orange-500' : 'text-red-500'} />,
                  description: CONNECTION_TYPE_LABELS[c.type],
                })),
              ]}
            />

            {/* Folder selector */}
            {folders.length > 0 && (
              <CustomSelect
                label="Add to Folder"
                value={createForm.folderId}
                onChange={v => setCreateForm(f => ({ ...f, folderId: v }))}
                placeholder="Root (no folder)"
                options={[
                  { value: '', label: 'Root (no folder)' },
                  ...folders.map(f => ({
                    value: f.id,
                    label: f.name,
                    icon: <FolderOpen size={14} className="text-amber-500" />,
                  })),
                ]}
              />
            )}

            {/* Discover existing tables from connection */}
            {createForm.connectionId && (
              <>
                {discoverLoading && (
                  <div className="flex items-center justify-center py-6 text-[var(--t-text-muted)]">
                    <Loader2 size={18} className="animate-spin mr-2" /> Discovering tables...
                  </div>
                )}

                {discoverError && (
                  <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                    <AlertCircle size={14} /> {discoverError}
                  </div>
                )}

                {!discoverLoading && discoveredTables.length > 0 && (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-[var(--t-text-secondary)]">Existing Tables</label>
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--t-text-muted)]" />
                      <input
                        className="w-full border border-[var(--t-border)] rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                        placeholder="Search tables..."
                        value={discoverSearch}
                        onChange={e => setDiscoverSearch(e.target.value)}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-[var(--t-text-muted)]">
                      <span>{discoveredTables.length} available &middot; {selectedExisting.size} selected</span>
                      <button
                        className="text-teal-600 hover:text-teal-700 font-medium"
                        onClick={() => {
                          const filtered = discoveredTables.filter(t => !discoverSearch || t.name.toLowerCase().includes(discoverSearch.toLowerCase()));
                          setSelectedExisting(prev => prev.size === filtered.length ? new Set() : new Set(filtered.map(t => t.name)));
                        }}
                      >
                        {selectedExisting.size === discoveredTables.filter(t => !discoverSearch || t.name.toLowerCase().includes(discoverSearch.toLowerCase())).length ? 'Deselect all' : 'Select all'}
                      </button>
                    </div>
                    <div className="max-h-48 overflow-y-auto border border-[var(--t-border)] rounded-lg divide-y divide-[var(--t-border-light)]">
                      {discoveredTables
                        .filter(t => !discoverSearch || t.name.toLowerCase().includes(discoverSearch.toLowerCase()))
                        .map(t => (
                          <label
                            key={t.name}
                            className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-[var(--t-bg)] transition-colors ${selectedExisting.has(t.name) ? 'bg-teal-50' : ''}`}
                          >
                            <input
                              type="checkbox"
                              className="accent-teal-600 w-4 h-4"
                              checked={selectedExisting.has(t.name)}
                              onChange={() => {
                                setSelectedExisting(prev => {
                                  const next = new Set(prev);
                                  if (next.has(t.name)) next.delete(t.name); else next.add(t.name);
                                  return next;
                                });
                              }}
                            />
                            <Table2 size={14} className="text-[var(--t-text-muted)] flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium text-[var(--t-text)]">{t.name}</span>
                              {t.schema && <span className="text-xs text-[var(--t-text-muted)] ml-2">{t.schema}</span>}
                            </div>
                          </label>
                        ))
                      }
                    </div>
                  </div>
                )}

                {/* Divider between existing and manual */}
                {!discoverLoading && (
                  <div className="flex items-center gap-3 text-xs text-[var(--t-text-muted)]">
                    <div className="flex-1 border-t border-[var(--t-border)]" />
                    or add manually
                    <div className="flex-1 border-t border-[var(--t-border)]" />
                  </div>
                )}
              </>
            )}

            {/* Manual table name + description */}
            <div>
              <label className="block text-sm font-medium text-[var(--t-text-secondary)] mb-1">
                Table Name {!createForm.connectionId && <span className="text-red-500">*</span>}
              </label>
              <input
                className="w-full border border-[var(--t-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={createForm.name}
                onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))}
                placeholder={createForm.connectionId ? 'Type a table name to add manually...' : 'my_table'}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--t-text-secondary)] mb-1">Description (optional)</label>
              <textarea
                className="w-full border border-[var(--t-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                rows={2}
                value={createForm.description}
                onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>

            {createError && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                <AlertCircle size={14} /> {createError}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-sm rounded-lg border border-[var(--t-border)] text-[var(--t-text-secondary)] hover:bg-[var(--t-bg)]">
                Cancel
              </button>
              {selectedExisting.size > 0 ? (
                <button
                  onClick={handleAddExistingTables}
                  disabled={createSubmitting}
                  className="px-4 py-2 text-sm rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-60 flex items-center gap-2"
                >
                  {createSubmitting && <Loader2 size={14} className="animate-spin" />}
                  Add {selectedExisting.size} Table{selectedExisting.size > 1 ? 's' : ''}
                </button>
              ) : (
                <button
                  onClick={handleCreateTable}
                  disabled={createSubmitting || !createForm.name}
                  className="px-4 py-2 text-sm rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-60 flex items-center gap-2"
                >
                  {createSubmitting && <Loader2 size={14} className="animate-spin" />}
                  Add Table
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Create Folder Modal */}
      {showFolderModal && (
        <Modal title="Create Folder" onClose={() => setShowFolderModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--t-text-secondary)] mb-1">Folder Name <span className="text-red-500">*</span></label>
              <input
                className="w-full border border-[var(--t-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={folderForm.name}
                onChange={e => setFolderForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. RESDB Tables"
                autoFocus
              />
            </div>
            {folders.length > 0 && (
              <CustomSelect
                label="Parent Folder (optional)"
                value={folderForm.parentId}
                onChange={v => setFolderForm(f => ({ ...f, parentId: v }))}
                placeholder="None (root)"
                options={[
                  { value: '', label: 'None (root)', icon: <FolderOpen size={14} className="text-[var(--t-text-muted)]" /> },
                  ...folders.map(f => ({
                    value: f.id,
                    label: f.name,
                    icon: <FolderOpen size={14} className="text-amber-500" />,
                  })),
                ]}
              />
            )}
            {folderError && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                <AlertCircle size={14} /> {folderError}
              </div>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowFolderModal(false)} className="px-4 py-2 text-sm rounded-lg border border-[var(--t-border)] text-[var(--t-text-secondary)] hover:bg-[var(--t-bg)]">
                Cancel
              </button>
              <button
                onClick={handleCreateFolder}
                disabled={folderSubmitting || !folderForm.name}
                className="px-4 py-2 text-sm rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-60 flex items-center gap-2"
              >
                {folderSubmitting && <Loader2 size={14} className="animate-spin" />}
                Create
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Table Confirm */}
      {deleteTarget && (
        <ConfirmDialog
          message={`Remove "${deleteTarget.name}" from the list? The actual database table will NOT be affected.`}
          onConfirm={() => handleDeleteTable(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* Delete Folder Confirm */}
      {deleteFolderTarget && (
        <ConfirmDialog
          message={`Delete folder "${deleteFolderTarget.name}"? Tables inside will be moved to root.`}
          onConfirm={() => handleDeleteFolder(deleteFolderTarget)}
          onCancel={() => setDeleteFolderTarget(null)}
        />
      )}
    </div>
  );
}
