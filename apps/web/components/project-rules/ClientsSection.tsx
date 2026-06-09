'use client'

/**
 * /orch/projects/{id}/clients — Catalog of consumer apps for this
 * project, with their Screens + buttons.
 *
 * Three nesting levels:
 *   Client (e.g. "Web Client")
 *     └─ Screen (e.g. "APP-01-SC02-T4C")
 *         └─ Button (e.g. "Confirm Sign-Off") → bound to MessageFormat
 *
 * Each level is collapsible. Add buttons let admins build out the
 * catalog without leaving the page. Screens auto-tag themselves with
 * the parent Client + project so backfill is unnecessary for new
 * entries.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Pencil, Trash2, Loader2, ChevronRight, ChevronDown,
  MonitorSmartphone, Smartphone,
} from 'lucide-react'
import { clientAppApi, screenApi, messageFormatApi } from '@/lib/api'
import { toast } from 'sonner'
import { confirmDialog } from '@/components/common/ConfirmDialog'

type Btn = {
  id: string
  buttonLabel: string
  tabName?: string | null
  actionType?: string | null
  messageFormat?: { id: string; name: string; code?: string | null; actionType?: string | null } | null
  detectionSource?: string | null
}
type Scr = {
  id: string
  code: string
  name: string
  buttons: Btn[]
}
type Cl = {
  id: string
  name: string
  appCode?: string | null
  description?: string | null
  _count?: { screens: number }
}

export function ClientsSection({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<Cl | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [expandedClient, setExpandedClient] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['clients', projectId],
    queryFn: () => clientAppApi.list(projectId),
  })
  const items: Cl[] = (data as any)?.data ?? []

  const del = useMutation({
    mutationFn: (id: string) => clientAppApi.delete(projectId, id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clients', projectId] }); toast.success('Deleted') },
    onError: (e: any) => toast.error(e?.message ?? 'Delete failed'),
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-[var(--t-text-muted)]">
          Consumer apps for this project. Each client has its own screens and buttons that map to MessageFormats.
        </p>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-[var(--t-accent)] hover:bg-[#2563EB]">
          <Plus className="w-3.5 h-3.5" /> New Client
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-10 text-[var(--t-text-muted)]"><Loader2 className="w-5 h-5 animate-spin inline mr-2" />Loading…</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 rounded-lg bg-[var(--t-panel)] border border-dashed border-[var(--t-border)]">
          <Smartphone className="w-8 h-8 text-[var(--t-text-muted)] mx-auto mb-2" />
          <p className="text-sm text-[var(--t-text)]">No client apps yet</p>
          <p className="text-xs text-[var(--t-text-muted)] mt-1 mb-3">e.g. Web Client, Mobile App</p>
          <button onClick={() => setShowCreate(true)} className="text-xs px-3 py-1.5 rounded bg-[var(--t-accent)] text-white">Create one</button>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(c => (
            <ClientRow
              key={c.id}
              client={c}
              projectId={projectId}
              expanded={expandedClient === c.id}
              onToggle={() => setExpandedClient(expandedClient === c.id ? null : c.id)}
              onEdit={() => setEditing(c)}
              onDelete={async () => {
                if (await confirmDialog({
                  title: `Delete "${c.name}"?`,
                  body: 'Screens belonging to this client will remain (clientId set to null).',
                  variant: 'danger',
                })) del.mutate(c.id)
              }}
            />
          ))}
        </div>
      )}

      {(showCreate || editing) && (
        <Editor
          item={editing}
          projectId={projectId}
          onClose={() => { setShowCreate(false); setEditing(null) }}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['clients', projectId] }); setShowCreate(false); setEditing(null) }}
        />
      )}
    </div>
  )
}

function ClientRow({
  client, projectId, expanded, onToggle, onEdit, onDelete,
}: {
  client: Cl
  projectId: string
  expanded: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="rounded-lg bg-[var(--t-panel)] border border-[var(--t-border)] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 hover:bg-[var(--t-panel-hover)] cursor-pointer" onClick={onToggle}>
        <div className="flex items-center gap-2 min-w-0">
          {expanded ? <ChevronDown className="w-4 h-4 text-[var(--t-text-muted)]" /> : <ChevronRight className="w-4 h-4 text-[var(--t-text-muted)]" />}
          <Smartphone className="w-4 h-4 text-[var(--t-accent)]" />
          <span className="text-sm font-semibold text-[var(--t-text)]">{client.name}</span>
          {client.appCode && <code className="text-xs font-mono px-1.5 py-0.5 rounded bg-[var(--t-bg)] text-[var(--t-text-muted)]">{client.appCode}</code>}
          <span className="text-[10px] text-[var(--t-text-muted)]">· {client._count?.screens ?? 0} screen{client._count?.screens === 1 ? '' : 's'}</span>
          {client.description && <span className="text-xs text-[var(--t-text-muted)] ml-2 truncate">{client.description}</span>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={(e) => { e.stopPropagation(); onEdit() }} className="p-1.5 rounded hover:bg-[var(--t-panel-hover)]">
            <Pencil className="w-3.5 h-3.5 text-[var(--t-text-muted)]" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onDelete() }} className="p-1.5 rounded hover:bg-red-500/10">
            <Trash2 className="w-3.5 h-3.5 text-red-400" />
          </button>
        </div>
      </div>
      {expanded && <ScreensPanel clientId={client.id} projectId={projectId} />}
    </div>
  )
}

function ScreensPanel({ clientId, projectId }: { clientId: string; projectId: string }) {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [expandedScreen, setExpandedScreen] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['screens', { clientId }],
    queryFn: () => screenApi.list({ clientId }),
  })
  const screens: any[] = (data as any)?.data ?? []

  const create = useMutation({
    mutationFn: (form: any) => screenApi.create({ ...form, clientId, projectId }),
    onSuccess: () => { toast.success('Screen added'); setShowAdd(false); qc.invalidateQueries({ queryKey: ['screens', { clientId }] }); qc.invalidateQueries({ queryKey: ['clients', projectId] }) },
  })
  const del = useMutation({
    mutationFn: (id: string) => screenApi.delete(id),
    onSuccess: () => { toast.success('Removed'); qc.invalidateQueries({ queryKey: ['screens', { clientId }] }); qc.invalidateQueries({ queryKey: ['clients', projectId] }) },
  })

  return (
    <div className="border-t border-[var(--t-border)] bg-[var(--t-bg)] p-4">
      {isLoading ? (
        <div className="text-xs text-[var(--t-text-muted)]"><Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" />Loading screens…</div>
      ) : screens.length === 0 ? (
        <p className="text-xs text-[var(--t-text-muted)] italic mb-3">No screens yet — add ones for this client</p>
      ) : (
        <div className="space-y-1 mb-3">
          {screens.map(s => (
            <div key={s.id} className="rounded bg-[var(--t-panel)] border border-[var(--t-border)] overflow-hidden">
              <div
                className="flex items-center justify-between px-3 py-2 hover:bg-[var(--t-panel-hover)] cursor-pointer"
                onClick={() => setExpandedScreen(expandedScreen === s.id ? null : s.id)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {expandedScreen === s.id ? <ChevronDown className="w-3.5 h-3.5 text-[var(--t-text-muted)]" /> : <ChevronRight className="w-3.5 h-3.5 text-[var(--t-text-muted)]" />}
                  <MonitorSmartphone className="w-3.5 h-3.5 text-[var(--t-accent)]" />
                  <code className="text-xs font-mono text-[var(--t-text-secondary)]">{s.code}</code>
                  <span className="text-xs text-[var(--t-text)] truncate">{s.name}</span>
                  <span className="text-[10px] text-[var(--t-text-muted)]">· {s.buttons?.length ?? 0} btn</span>
                </div>
                <button onClick={(e) => { e.stopPropagation(); del.mutate(s.id) }} className="p-1 hover:bg-red-500/10 rounded">
                  <Trash2 className="w-3 h-3 text-red-400" />
                </button>
              </div>
              {expandedScreen === s.id && <ButtonsList screen={s} onChange={() => qc.invalidateQueries({ queryKey: ['screens', { clientId }] })} />}
            </div>
          ))}
        </div>
      )}

      {showAdd ? (
        <ScreenAddForm onCancel={() => setShowAdd(false)} onSubmit={d => create.mutate(d)} pending={create.isPending} />
      ) : (
        <button onClick={() => setShowAdd(true)} className="text-xs px-3 py-1.5 rounded bg-[var(--t-accent)] text-white inline-flex items-center gap-1">
          <Plus className="w-3.5 h-3.5" />Add screen
        </button>
      )}
    </div>
  )
}

function ScreenAddForm({ onCancel, onSubmit, pending }: { onCancel: () => void; onSubmit: (d: any) => void; pending: boolean }) {
  const [f, setF] = useState({ code: '', name: '', system: '' })
  return (
    <div className="rounded bg-[var(--t-panel)] border border-[var(--t-border)] p-3 space-y-2">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <input placeholder="Screen code *" value={f.code} onChange={e => setF({ ...f, code: e.target.value })} className="px-2 py-1.5 text-sm rounded border border-[var(--t-border)] bg-[var(--t-input)] text-[var(--t-text)] font-mono" />
        <input placeholder="Screen name (Thai)" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} className="px-2 py-1.5 text-sm rounded border border-[var(--t-border)] bg-[var(--t-input)] text-[var(--t-text)]" />
        <input placeholder="System tag (optional)" value={f.system} onChange={e => setF({ ...f, system: e.target.value })} className="px-2 py-1.5 text-sm rounded border border-[var(--t-border)] bg-[var(--t-input)] text-[var(--t-text)]" />
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-1 text-xs text-[var(--t-text-secondary)]">Cancel</button>
        <button onClick={() => onSubmit({ ...f, system: f.system || null, name: f.name || f.code })} disabled={!f.code || pending} className="px-3 py-1 text-xs rounded bg-[var(--t-accent)] text-white disabled:opacity-50">
          {pending ? <Loader2 className="w-3 h-3 animate-spin inline mr-1" /> : null}Add
        </button>
      </div>
    </div>
  )
}

function ButtonsList({ screen, onChange }: { screen: any; onChange: () => void }) {
  const [showAdd, setShowAdd] = useState(false)
  const { data: formats } = useQuery({
    queryKey: ['message-formats-all'],
    queryFn: () => messageFormatApi.list({ limit: 500 } as any),
  })
  const formatOptions: any[] = (formats as any)?.data ?? []

  const create = useMutation({
    mutationFn: (data: any) => screenApi.buttons.create(screen.id, data),
    onSuccess: () => { toast.success('Button added'); setShowAdd(false); onChange() },
  })
  const del = useMutation({
    mutationFn: (buttonId: string) => screenApi.buttons.delete(screen.id, buttonId),
    onSuccess: () => { toast.success('Removed'); onChange() },
  })

  return (
    <div className="border-t border-[var(--t-border-light)] bg-[var(--t-bg)] p-3">
      {(screen.buttons ?? []).length === 0 ? (
        <p className="text-[11px] text-[var(--t-text-muted)] italic mb-2">No buttons yet</p>
      ) : (
        <table className="w-full text-xs mb-2">
          <thead>
            <tr className="border-b border-[var(--t-border-light)]">
              <th className="text-left px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--t-text-muted)]">Button</th>
              <th className="text-left px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--t-text-muted)]">Action</th>
              <th className="text-left px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--t-text-muted)]">Format</th>
              <th className="text-left px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--t-text-muted)]">Detect</th>
              <th> </th>
            </tr>
          </thead>
          <tbody>
            {screen.buttons.map((b: any) => (
              <tr key={b.id} className="border-b border-[var(--t-border-light)]">
                <td className="px-2 py-1">{b.buttonLabel}</td>
                <td className="px-2 py-1">{b.actionType && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[var(--t-accent)]/15 text-[var(--t-accent)]">{b.actionType}</span>}</td>
                <td className="px-2 py-1 font-mono">{b.messageFormat ? (b.messageFormat.code ?? b.messageFormat.name) : <span className="text-[var(--t-text-muted)]">unbound</span>}</td>
                <td className="px-2 py-1 text-[10px] text-[var(--t-text-muted)]">{b.detectionSource ?? '—'}</td>
                <td className="px-2 py-1 text-right">
                  <button onClick={() => del.mutate(b.id)} className="p-0.5 hover:bg-red-500/10 rounded">
                    <Trash2 className="w-3 h-3 text-red-400" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {showAdd ? (
        <ButtonAddForm formats={formatOptions} onCancel={() => setShowAdd(false)} onSubmit={d => create.mutate(d)} pending={create.isPending} />
      ) : (
        <button onClick={() => setShowAdd(true)} className="text-[11px] px-2 py-1 rounded bg-[var(--t-accent)] text-white inline-flex items-center gap-1">
          <Plus className="w-3 h-3" />Add button
        </button>
      )}
    </div>
  )
}

function ButtonAddForm({ formats, onCancel, onSubmit, pending }: { formats: any[]; onCancel: () => void; onSubmit: (d: any) => void; pending: boolean }) {
  const [f, setF] = useState({
    buttonLabel: '', tabName: '', actionType: '', messageFormatId: '',
    detectionSource: '', detectionField: '', detectionValue: '',
  })
  return (
    <div className="rounded bg-[var(--t-panel)] border border-[var(--t-border)] p-2 space-y-1.5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-1.5">
        <input placeholder="Button label *" value={f.buttonLabel} onChange={e => setF({ ...f, buttonLabel: e.target.value })} className="px-2 py-1 text-xs rounded border border-[var(--t-border)] bg-[var(--t-input)] text-[var(--t-text)]" />
        <input placeholder="Tab" value={f.tabName} onChange={e => setF({ ...f, tabName: e.target.value })} className="px-2 py-1 text-xs rounded border border-[var(--t-border)] bg-[var(--t-input)] text-[var(--t-text)]" />
        <input placeholder="Action (e.g. SIGNOFF)" value={f.actionType} onChange={e => setF({ ...f, actionType: e.target.value })} className="px-2 py-1 text-xs rounded border border-[var(--t-border)] bg-[var(--t-input)] text-[var(--t-text)]" />
      </div>
      <select value={f.messageFormatId} onChange={e => setF({ ...f, messageFormatId: e.target.value })} className="w-full px-2 py-1 text-xs rounded border border-[var(--t-border)] bg-[var(--t-input)] text-[var(--t-text)]">
        <option value="">— bind MessageFormat (optional) —</option>
        {formats.map((fmt: any) => <option key={fmt.id} value={fmt.id}>{fmt.code ?? fmt.name}{fmt.actionType ? ` · ${fmt.actionType}` : ''}</option>)}
      </select>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-2 py-0.5 text-xs text-[var(--t-text-secondary)]">Cancel</button>
        <button
          disabled={!f.buttonLabel || pending}
          onClick={() => onSubmit({
            ...f,
            tabName: f.tabName || null,
            actionType: f.actionType || null,
            messageFormatId: f.messageFormatId || null,
            detectionSource: f.detectionSource || null,
            detectionField: f.detectionField || null,
            detectionValue: f.detectionValue || null,
          })}
          className="px-2 py-0.5 text-xs rounded bg-[var(--t-accent)] text-white disabled:opacity-50"
        >
          {pending ? <Loader2 className="w-3 h-3 animate-spin inline mr-1" /> : null}Add
        </button>
      </div>
    </div>
  )
}

function Editor({ item, projectId, onClose, onSaved }: { item: Cl | null; projectId: string; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!item
  const [f, setF] = useState<Partial<Cl>>(item ?? { name: '', appCode: '' })
  const save = useMutation({
    mutationFn: () => isEdit && item
      ? clientAppApi.update(projectId, item.id, f)
      : clientAppApi.create(projectId, f),
    onSuccess: () => { toast.success(isEdit ? 'Updated' : 'Created'); onSaved() },
    onError: (e: any) => toast.error(e?.message ?? 'Save failed'),
  })
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[var(--t-panel)] border border-[var(--t-border)] rounded-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--t-border)]">
          <h2 className="text-lg font-semibold text-[var(--t-text)]">{isEdit ? 'Edit Client' : 'New Client'}</h2>
          <button onClick={onClose} className="text-[var(--t-text-muted)]">✕</button>
        </div>
        <div className="p-5 space-y-3">
          <FieldRow label="Name *">
            <input value={f.name ?? ''} onChange={e => setF(p => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2 text-sm rounded border border-[var(--t-border)] bg-[var(--t-input)] text-[var(--t-text)]" placeholder="e.g. Web Client" />
          </FieldRow>
          <FieldRow label="App Code" hint="Stable identifier — frontend can send via X-Client-App header">
            <input value={f.appCode ?? ''} onChange={e => setF(p => ({ ...p, appCode: e.target.value }))} className="w-full px-3 py-2 text-sm rounded border border-[var(--t-border)] bg-[var(--t-input)] text-[var(--t-text)] font-mono" placeholder="e.g. WEB_CLIENT" />
          </FieldRow>
          <FieldRow label="Description">
            <input value={f.description ?? ''} onChange={e => setF(p => ({ ...p, description: e.target.value }))} className="w-full px-3 py-2 text-sm rounded border border-[var(--t-border)] bg-[var(--t-input)] text-[var(--t-text)]" />
          </FieldRow>
        </div>
        <div className="px-5 py-3 border-t border-[var(--t-border)] flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-[var(--t-text-secondary)]">Cancel</button>
          <button onClick={() => save.mutate()} disabled={!f.name || save.isPending} className="px-4 py-2 text-sm rounded bg-[var(--t-accent)] text-white disabled:opacity-50">
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin inline mr-1" /> : null}Save
          </button>
        </div>
      </div>
    </div>
  )
}

function FieldRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--t-text-secondary)] mb-1">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-[var(--t-text-muted)] mt-0.5">{hint}</p>}
    </div>
  )
}
