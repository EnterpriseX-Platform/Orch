'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Settings,
  Search,
  Save,
  RefreshCw,
  Lock,
  Eye,
  EyeOff,
  Plus,
  History,
  X,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'

const FONT = "'Prompt', sans-serif"

const CATEGORIES = [
  { value: 'GENERAL',       label: 'General' },
  { value: 'BACKEND_URLS',  label: 'Backend URLs' },
  { value: 'KAFKA',         label: 'Kafka' },
  { value: 'AUDIT',         label: 'Audit Policy' },
  { value: 'SECURITY',      label: 'Security' },
  { value: 'PERFORMANCE',   label: 'Performance' },
  { value: 'ALERTS',        label: 'Alerts' },
  { value: 'FEATURE_FLAGS', label: 'Feature Flags' },
  { value: 'UI_BRANDING',   label: 'UI Branding' },
  { value: 'PROJECT',       label: 'Project' },
] as const

interface ConfigRow {
  id: string
  key: string
  value: unknown
  valueType: string
  category: string
  label?: string | null
  description?: string | null
  group?: string | null
  isSecret: boolean
  isRequired: boolean
  isReadOnly: boolean
  projectId?: string | null
  updatedAt: string
  updatedBy?: string | null
}

interface HistoryRow {
  id: string
  configKey: string
  oldValue: unknown
  newValue: unknown
  changedBy: string
  changedAt: string
  reason?: string | null
}

function valueToDisplay(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return JSON.stringify(v, null, 2)
  return String(v)
}

function authHeaders(token: string | null): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) h['Authorization'] = `Bearer ${token}`
  return h
}

/**
 * Admin UI for the `system_configs` table — central environment/config
 * values used by both web + broker. Renders a searchable table with
 * inline editing, secret masking, history modal, and seed/reload-cache
 * controls.
 *
 * @param embedded - when true, hides the big page-level title so the
 *                   panel can be dropped into another page (e.g. the
 *                   Settings "Environment" tab) that already has its
 *                   own header.
 */
export function SystemConfigPanel({
  embedded = false,
  projectScope,
}: {
  embedded?: boolean
  /**
   * When set, the panel becomes a per-project Environment editor:
   *   - GET filters by ?projectId=<id> (only project-scoped rows)
   *   - PUT/POST/PATCH carry projectId so writes stay scoped
   *   - Header shows the project name instead of the global label
   * Leave undefined to keep the original global-config behaviour.
   */
  projectScope?: { id: string; name: string }
} = {}) {
  const token = useAuthStore((s) => s.accessToken)
  const qc = useQueryClient()
  const [category, setCategory] = useState<string>('')
  const [search, setSearch] = useState('')
  const [showSecrets, setShowSecrets] = useState(false)
  const [editing, setEditing] = useState<Record<string, string>>({})
  const [historyKey, setHistoryKey] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['system-config', category, showSecrets, projectScope?.id ?? null],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (category) params.set('category', category)
      if (showSecrets) params.set('includeSecrets', 'true')
      if (projectScope) params.set('projectId', projectScope.id)
      const res = await fetch(`/orch/api/admin/system-config?${params}`, {
        headers: authHeaders(token),
      })
      if (!res.ok) throw new Error(await res.text())
      const j = await res.json()
      return j.data as ConfigRow[]
    },
    enabled: !!token,
  })

  const filtered = useMemo(() => {
    if (!data) return []
    const q = search.trim().toLowerCase()
    if (!q) return data
    return data.filter(
      (r) =>
        r.key.toLowerCase().includes(q) ||
        (r.label || '').toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q),
    )
  }, [data, search])

  const saveMutation = useMutation({
    mutationFn: async (row: ConfigRow) => {
      const raw = editing[row.key]
      let value: unknown = raw
      if (row.valueType === 'BOOLEAN') value = raw === 'true'
      else if (row.valueType === 'NUMBER') value = Number(raw)
      else if (row.valueType === 'JSON') value = JSON.parse(raw)

      const res = await fetch(`/orch/api/admin/system-config/${encodeURIComponent(row.key)}`, {
        method: 'PUT',
        headers: authHeaders(token),
        body: JSON.stringify({
          value,
          reason: 'Updated via admin UI',
          // Per-project rows must carry projectId so the handler updates
          // the right scope (otherwise it falls back to global).
          ...(projectScope ? { projectId: projectScope.id } : {}),
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: (_, row) => {
      toast.success(`Updated ${row.key}`)
      setEditing((prev) => {
        const n = { ...prev }
        delete n[row.key]
        return n
      })
      qc.invalidateQueries({ queryKey: ['system-config'] })
    },
    onError: (err: Error) => toast.error(`Save failed: ${err.message}`),
  })

  const seedMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/orch/api/admin/system-config/seed', {
        method: 'POST',
        headers: authHeaders(token),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: (d) => {
      toast.success(`Seed: created ${d.created}, skipped ${d.skipped}`)
      qc.invalidateQueries({ queryKey: ['system-config'] })
    },
    onError: (err: Error) => toast.error(`Seed failed: ${err.message}`),
  })

  const reloadMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/orch/api/admin/system-config?reloadCache=true', {
        method: 'DELETE',
        headers: authHeaders(token),
      })
      return res.json()
    },
    onSuccess: () => toast.success('Cache invalidated — new values take effect immediately on all pods'),
  })

  // Inline "Add Key" form state. Only shown when projectScope is set
  // (per-project Environment tab) — global config keys are owned by
  // the seed/migration path, not ad-hoc creation.
  const [showAdd, setShowAdd] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [newSecret, setNewSecret] = useState(false)

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/orch/api/admin/system-config', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({
          key: newKey.trim(),
          value: newValue,
          valueType: 'STRING',
          category: 'PROJECT',
          isSecret: newSecret,
          projectId: projectScope?.id ?? null,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => {
      toast.success(`Added ${newKey}`)
      setNewKey('')
      setNewValue('')
      setNewSecret(false)
      setShowAdd(false)
      qc.invalidateQueries({ queryKey: ['system-config'] })
    },
    onError: (err: Error) => toast.error(`Add failed: ${err.message}`),
  })

  const { data: history } = useQuery({
    queryKey: ['system-config-history', historyKey],
    queryFn: async () => {
      const res = await fetch(
        `/orch/api/admin/system-config/history?key=${encodeURIComponent(historyKey!)}&limit=50`,
        { headers: authHeaders(token) },
      )
      const j = await res.json()
      return j.data as HistoryRow[]
    },
    enabled: !!historyKey && !!token,
  })

  return (
    <div style={{ padding: embedded ? 0 : 24, fontFamily: FONT }}>
      {/* Header — hidden in embedded mode (parent page shows its own title) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        {!embedded && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Settings size={24} color="var(--t-accent)" />
            <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>System Configuration</h1>
          </div>
        )}
        {embedded && <div />}
        <div style={{ display: 'flex', gap: 8 }}>
          {projectScope && (
            <button
              onClick={() => setShowAdd((v) => !v)}
              style={{
                ...btnGhost,
                background: showAdd ? 'var(--t-accent-light)' : btnGhost.background,
                color: showAdd ? 'var(--t-accent)' : btnGhost.color,
              }}
            >
              <Plus size={14} /> {showAdd ? 'Cancel' : 'Add Key'}
            </button>
          )}
          <button
            onClick={() => reloadMutation.mutate()}
            style={btnGhost}
            title="Clear cache so new values take effect immediately"
          >
            <RefreshCw size={14} /> Reload Cache
          </button>
          {!projectScope && (
            <button onClick={() => seedMutation.mutate()} style={btnGhost}>
              <Plus size={14} /> Seed Defaults
            </button>
          )}
          <button onClick={() => setShowSecrets((v) => !v)} style={btnGhost}>
            {showSecrets ? <EyeOff size={14} /> : <Eye size={14} />}
            {showSecrets ? 'Hide' : 'Show'} Secrets
          </button>
        </div>
      </div>

      {/* Add Key inline form (project-scope only) */}
      {projectScope && showAdd && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(200px, 1fr) minmax(200px, 2fr) auto auto',
            gap: 8,
            alignItems: 'center',
            padding: 12,
            background: 'var(--t-panel)',
            border: '1px solid var(--t-border)',
            borderRadius: 8,
            marginBottom: 16,
          }}
        >
          <input
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="key (e.g. backendUrl, jwt.secret)"
            style={input}
          />
          <input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="value"
            type={newSecret ? 'password' : 'text'}
            style={input}
          />
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--t-text-muted)' }}>
            <input type="checkbox" checked={newSecret} onChange={(e) => setNewSecret(e.target.checked)} /> Secret
          </label>
          <button
            onClick={() => createMutation.mutate()}
            disabled={!newKey.trim() || createMutation.isPending}
            style={{
              ...btnGhost,
              background: 'var(--t-accent)',
              color: '#fff',
              opacity: !newKey.trim() || createMutation.isPending ? 0.5 : 1,
            }}
          >
            <Plus size={14} /> {createMutation.isPending ? 'Adding…' : 'Add'}
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
          <Search
            size={14}
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--t-text-muted)' }}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search key / label / description"
            style={{ ...input, paddingLeft: 32 }}
          />
        </div>
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={input}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div style={panel}>
        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--t-text-muted)' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--t-text-muted)' }}>
            No config yet — click <b>Seed Defaults</b> to create defaults
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--t-border)' }}>
                <th style={th}>Key / Label</th>
                <th style={th}>Category</th>
                <th style={th}>Type</th>
                <th style={th}>Value</th>
                <th style={{ ...th, width: 140 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const current = editing[row.key] ?? valueToDisplay(row.value)
                const dirty = editing[row.key] !== undefined
                return (
                  <tr key={row.id} style={{ borderBottom: '1px solid var(--t-border-light)' }}>
                    <td style={td}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{row.key}</div>
                      {row.label && <div style={{ fontSize: 11, color: 'var(--t-text-secondary)' }}>{row.label}</div>}
                      {row.description && <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 2 }}>{row.description}</div>}
                      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                        {row.isRequired && <span style={badge('#F5974618')}>required</span>}
                        {row.isSecret && <span style={badge('#EF444418')}><Lock size={9} /> secret</span>}
                        {row.isReadOnly && <span style={badge('#8B92A518')}>read-only</span>}
                        {row.group && <span style={badge('#3B82F618')}>{row.group}</span>}
                      </div>
                    </td>
                    <td style={td}>
                      <span style={{ fontSize: 11, color: 'var(--t-text-secondary)' }}>{row.category}</span>
                    </td>
                    <td style={td}>
                      <span style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>{row.valueType}</span>
                    </td>
                    <td style={td}>
                      {row.valueType === 'BOOLEAN' ? (
                        <select
                          value={current}
                          disabled={row.isReadOnly}
                          onChange={(e) => setEditing((p) => ({ ...p, [row.key]: e.target.value }))}
                          style={input}
                        >
                          <option value="true">true</option>
                          <option value="false">false</option>
                        </select>
                      ) : row.valueType === 'JSON' ? (
                        <textarea
                          value={current}
                          disabled={row.isReadOnly}
                          onChange={(e) => setEditing((p) => ({ ...p, [row.key]: e.target.value }))}
                          rows={3}
                          style={{ ...input, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}
                        />
                      ) : (
                        <input
                          type={row.isSecret && !showSecrets ? 'password' : 'text'}
                          value={current}
                          disabled={row.isReadOnly}
                          onChange={(e) => setEditing((p) => ({ ...p, [row.key]: e.target.value }))}
                          style={input}
                        />
                      )}
                    </td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {dirty && (
                          <button
                            onClick={() => saveMutation.mutate(row)}
                            style={btnPrimary}
                            disabled={saveMutation.isPending}
                          >
                            <Save size={12} /> Save
                          </button>
                        )}
                        <button onClick={() => setHistoryKey(row.key)} style={btnGhost} title="History">
                          <History size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {historyKey && (
        <div style={modalOverlay} onClick={() => setHistoryKey(null)}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>History: {historyKey}</h2>
              <button onClick={() => setHistoryKey(null)} style={btnGhost}>
                <X size={14} />
              </button>
            </div>
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              {(history || []).map((h) => (
                <div key={h.id} style={{ padding: 10, borderBottom: '1px solid var(--t-border-light)', fontSize: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--t-text-muted)' }}>
                    <span>{new Date(h.changedAt).toLocaleString()}</span>
                    <span>by {h.changedBy}</span>
                  </div>
                  {h.reason && <div style={{ fontStyle: 'italic', fontSize: 11 }}>— {h.reason}</div>}
                  <div style={{ marginTop: 4, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>
                    <span style={{ color: '#EF4444' }}>- {valueToDisplay(h.oldValue)}</span>
                    <br />
                    <span style={{ color: '#10B981' }}>+ {valueToDisplay(h.newValue)}</span>
                  </div>
                </div>
              ))}
              {!history?.length && <div style={{ padding: 20, textAlign: 'center', color: 'var(--t-text-muted)' }}>No history yet</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ------------- Styles -------------
const panel: React.CSSProperties = {
  background: 'var(--t-panel)',
  border: '1px solid var(--t-border)',
  borderRadius: 8,
  overflow: 'hidden',
}
const input: React.CSSProperties = {
  background: 'var(--t-bg)',
  border: '1px solid var(--t-border)',
  borderRadius: 6,
  padding: '6px 10px',
  color: 'var(--t-text)',
  fontSize: 12,
  fontFamily: FONT,
  width: '100%',
}
const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  fontSize: 11,
  textTransform: 'uppercase',
  color: 'var(--t-text-muted)',
  fontWeight: 600,
}
const td: React.CSSProperties = { padding: '10px 12px', fontSize: 12, verticalAlign: 'top' }
const btnGhost: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--t-border)',
  borderRadius: 6,
  padding: '6px 10px',
  color: 'var(--t-text)',
  fontSize: 12,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  fontFamily: FONT,
}
const btnPrimary: React.CSSProperties = {
  ...btnGhost,
  background: 'var(--t-accent)',
  borderColor: 'var(--t-accent)',
  color: '#fff',
}
const modalOverlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.5)',
  zIndex: 1000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}
const modal: React.CSSProperties = {
  background: 'var(--t-panel)',
  border: '1px solid var(--t-border)',
  borderRadius: 8,
  padding: 20,
  width: 600,
  maxWidth: '90vw',
}
const badge = (bg: string): React.CSSProperties => ({
  background: bg,
  padding: '2px 6px',
  borderRadius: 4,
  fontSize: 10,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 3,
})
