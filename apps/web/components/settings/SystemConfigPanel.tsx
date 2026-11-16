'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Settings,
  Save,
  RefreshCw,
  Lock,
  Eye,
  EyeOff,
  Plus,
  History,
} from 'lucide-react'
import {
  Button,
  Checkbox,
  Modal,
  Search,
  Select,
  SelectItem,
  Tag,
  TextArea,
  TextInput,
} from '@carbon/react'
import { useAuthStore } from '@/stores/authStore'

const FONT = '"IBM Plex Sans Thai", "IBM Plex Sans", "Sarabun", system-ui, sans-serif'

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
            <Settings size={20} color="#525252" />
            <h1 style={{ fontSize: 20, fontWeight: 400, margin: 0 }}>System Configuration</h1>
          </div>
        )}
        {embedded && <div />}
        <div style={{ display: 'flex', gap: 8 }}>
          {projectScope && (
            <Button
              kind={showAdd ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setShowAdd((v) => !v)}
              renderIcon={Plus}
            >
              {showAdd ? 'Cancel' : 'Add Key'}
            </Button>
          )}
          <Button
            kind="ghost"
            size="sm"
            onClick={() => reloadMutation.mutate()}
            title="Clear cache so new values take effect immediately"
            renderIcon={RefreshCw}
          >
            Reload Cache
          </Button>
          {!projectScope && (
            <Button kind="ghost" size="sm" onClick={() => seedMutation.mutate()} renderIcon={Plus}>
              Seed Defaults
            </Button>
          )}
          <Button kind="ghost" size="sm" onClick={() => setShowSecrets((v) => !v)} renderIcon={showSecrets ? EyeOff : Eye}>
            {showSecrets ? 'Hide' : 'Show'} Secrets
          </Button>
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
            background: '#f4f4f4',
            borderRadius: 0,
            marginBottom: 16,
          }}
        >
          <TextInput
            id="sysconfig-new-key"
            labelText="Key"
            hideLabel
            size="sm"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="key (e.g. backendUrl, jwt.secret)"
          />
          <TextInput
            id="sysconfig-new-value"
            labelText="Value"
            hideLabel
            size="sm"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="value"
            type={newSecret ? 'password' : 'text'}
          />
          <Checkbox
            id="sysconfig-new-secret"
            labelText="Secret"
            checked={newSecret}
            onChange={(e) => setNewSecret(e.target.checked)}
          />
          <Button
            kind="primary"
            size="sm"
            onClick={() => createMutation.mutate()}
            disabled={!newKey.trim() || createMutation.isPending}
            renderIcon={Plus}
          >
            {createMutation.isPending ? 'Adding…' : 'Add'}
          </Button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <div style={{ flex: 1, maxWidth: 360 }}>
          <Search
            id="sysconfig-search"
            size="sm"
            labelText="Search key / label / description"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search key / label / description"
          />
        </div>
        <Select
          id="sysconfig-category"
          labelText="Category"
          hideLabel
          size="sm"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <SelectItem value="" text="All categories" />
          {CATEGORIES.map((c) => (
            <SelectItem key={c.value} value={c.value} text={c.label} />
          ))}
        </Select>
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
              <tr>
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
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{row.key}</div>
                      {row.label && <div style={{ fontSize: 12, color: '#525252' }}>{row.label}</div>}
                      {row.description && <div style={{ fontSize: 12, color: '#6f6f6f', marginTop: 2 }}>{row.description}</div>}
                      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                        {row.isRequired && <Tag size="sm" type="warm-gray">required</Tag>}
                        {row.isSecret && <Tag size="sm" type="red" renderIcon={Lock}>secret</Tag>}
                        {row.isReadOnly && <Tag size="sm" type="gray">read-only</Tag>}
                        {row.group && <Tag size="sm" type="blue">{row.group}</Tag>}
                      </div>
                    </td>
                    <td style={td}>
                      <span style={{ fontSize: 12, color: '#525252' }}>{row.category}</span>
                    </td>
                    <td style={td}>
                      <span style={{ fontSize: 12, color: '#6f6f6f' }}>{row.valueType}</span>
                    </td>
                    <td style={td}>
                      {row.valueType === 'BOOLEAN' ? (
                        <Select
                          id={`sysconfig-val-${row.id}`}
                          labelText={row.key}
                          hideLabel
                          size="sm"
                          value={current}
                          disabled={row.isReadOnly}
                          onChange={(e) => setEditing((p) => ({ ...p, [row.key]: e.target.value }))}
                        >
                          <SelectItem value="true" text="true" />
                          <SelectItem value="false" text="false" />
                        </Select>
                      ) : row.valueType === 'JSON' ? (
                        <TextArea
                          id={`sysconfig-val-${row.id}`}
                          labelText={row.key}
                          hideLabel
                          value={current}
                          disabled={row.isReadOnly}
                          onChange={(e) => setEditing((p) => ({ ...p, [row.key]: e.target.value }))}
                          rows={3}
                          style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11 }}
                        />
                      ) : (
                        <TextInput
                          id={`sysconfig-val-${row.id}`}
                          labelText={row.key}
                          hideLabel
                          size="sm"
                          type={row.isSecret && !showSecrets ? 'password' : 'text'}
                          value={current}
                          disabled={row.isReadOnly}
                          onChange={(e) => setEditing((p) => ({ ...p, [row.key]: e.target.value }))}
                        />
                      )}
                    </td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {dirty && (
                          <Button
                            kind="primary"
                            size="sm"
                            onClick={() => saveMutation.mutate(row)}
                            disabled={saveMutation.isPending}
                            renderIcon={Save}
                          >
                            Save
                          </Button>
                        )}
                        <Button
                          kind="ghost"
                          size="sm"
                          hasIconOnly
                          renderIcon={History}
                          iconDescription="History"
                          onClick={() => setHistoryKey(row.key)}
                        />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        open={!!historyKey}
        passiveModal
        onRequestClose={() => setHistoryKey(null)}
        modalHeading={`History: ${historyKey ?? ''}`}
      >
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              {(history || []).map((h) => (
                <div key={h.id} style={{ padding: 10, borderBottom: '1px solid var(--t-border-light)', fontSize: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--t-text-muted)' }}>
                    <span>{new Date(h.changedAt).toLocaleString()}</span>
                    <span>by {h.changedBy}</span>
                  </div>
                  {h.reason && <div style={{ fontStyle: 'italic', fontSize: 11 }}>— {h.reason}</div>}
                  <div style={{ marginTop: 4, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>
                    <span style={{ color: '#da1e28' }}>- {valueToDisplay(h.oldValue)}</span>
                    <br />
                    <span style={{ color: '#24a148' }}>+ {valueToDisplay(h.newValue)}</span>
                  </div>
                </div>
              ))}
              {!history?.length && <div style={{ padding: 20, textAlign: 'center', color: 'var(--t-text-muted)' }}>No history yet</div>}
            </div>
      </Modal>
    </div>
  )
}

// ------------- Styles -------------
const panel: React.CSSProperties = {
  background: 'var(--t-panel)',
  border: '1px solid var(--t-border)',
  borderRadius: 0,
  overflow: 'hidden',
}
const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '0 12px',
  height: 40,
  fontSize: 12,
  color: '#161616',
  fontWeight: 600,
  background: '#e0e0e0',
}
const td: React.CSSProperties = { padding: '10px 12px', fontSize: 12, verticalAlign: 'top' }
