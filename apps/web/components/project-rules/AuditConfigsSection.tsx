'use client'

/**
 * AuditConfigsSection — project-scoped audit-policy library editor.
 * Same Add/Edit modal in dedicated page + Rules tab.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Shield, Loader2 } from 'lucide-react'
import { auditConfigApi } from '@/lib/api'
import { toast } from 'sonner'
import { confirmDialog } from '@/components/common/ConfirmDialog'

type AC = {
  id: string
  name: string
  description?: string | null
  enabled: boolean
  projectId?: string | null
  _count?: { messageFormats: number }
}

export function AuditConfigsSection({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<AC | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['audit-configs', projectId],
    queryFn: () => auditConfigApi.list({ projectId }),
  })
  const items: AC[] = (data as any)?.data ?? []

  const del = useMutation({
    mutationFn: (id: string) => auditConfigApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['audit-configs', projectId] }); toast.success('Deleted') },
    onError: (e: any) => toast.error(e?.message ?? 'Delete failed'),
  })

  return (
    <div>
      <div className="flex items-center justify-end mb-3">
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-[var(--t-accent)] hover:bg-[#2563EB]">
          <Plus className="w-3.5 h-3.5" /> New Config
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-10 text-[var(--t-text-muted)]"><Loader2 className="w-5 h-5 animate-spin inline mr-2" />Loading…</div>
      ) : items.length === 0 ? (
        <Empty onCreate={() => setShowCreate(true)} />
      ) : (
        <div className="rounded-lg bg-[var(--t-panel)] border border-[var(--t-border)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--t-border)] bg-[var(--t-bg)]">
                <Th>Name</Th><Th>Status</Th><Th>Used by</Th><Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((ac) => (
                <tr key={ac.id} className="border-b border-[var(--t-border-light)] hover:bg-[var(--t-panel-hover)]">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-[var(--t-text)]">{ac.name}</div>
                    {ac.description && <div className="text-xs text-[var(--t-text-muted)]">{ac.description}</div>}
                    {!ac.projectId && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 mt-1 inline-block">global</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${ac.enabled ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-500/20 text-slate-400'}`}>
                      {ac.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs font-semibold">{ac._count?.messageFormats ?? 0}</span>
                    <span className="text-xs text-[var(--t-text-muted)]"> formats</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setEditing(ac)} className="p-1.5 rounded hover:bg-[var(--t-panel-hover)]">
                        <Pencil className="w-3.5 h-3.5 text-[var(--t-text-muted)]" />
                      </button>
                      <button onClick={async () => { if (await confirmDialog({ title: `Delete "${ac.name}"?`, variant: 'danger' })) del.mutate(ac.id) }} className="p-1.5 rounded hover:bg-red-500/10">
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(showCreate || editing) && (
        <Editor
          item={editing}
          projectId={projectId}
          onClose={() => { setShowCreate(false); setEditing(null) }}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['audit-configs', projectId] }); setShowCreate(false); setEditing(null) }}
        />
      )}
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--t-text-muted)]">{children}</th>
}

function Empty({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="text-center py-12 rounded-lg bg-[var(--t-panel)] border border-dashed border-[var(--t-border)]">
      <Shield className="w-8 h-8 text-[var(--t-text-muted)] mx-auto mb-2" />
      <p className="text-sm text-[var(--t-text)]">No audit configs yet</p>
      <button onClick={onCreate} className="mt-3 text-xs px-3 py-1.5 rounded bg-[var(--t-accent)] text-white">Create one</button>
    </div>
  )
}

function Editor({ item, projectId, onClose, onSaved }: { item: AC | null; projectId: string; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!item
  const [form, setForm] = useState<Partial<AC>>(item ?? { name: '', enabled: true, projectId })
  const set = <K extends keyof AC>(k: K, v: AC[K]) => setForm((p) => ({ ...p, [k]: v }))

  const save = useMutation({
    mutationFn: () => isEdit && item
      ? auditConfigApi.update(item.id, form)
      : auditConfigApi.create({ ...form, projectId }),
    onSuccess: () => { toast.success(isEdit ? 'Updated' : 'Created'); onSaved() },
    onError: (e: any) => toast.error(e?.message ?? 'Save failed'),
  })

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[var(--t-panel)] border border-[var(--t-border)] rounded-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--t-border)]">
          <h2 className="text-lg font-semibold text-[var(--t-text)]">{isEdit ? 'Edit Audit Config' : 'New Audit Config'}</h2>
          <button onClick={onClose} className="text-[var(--t-text-muted)]">✕</button>
        </div>
        <div className="p-5 space-y-4">
          <Field label="Name *">
            <input value={form.name ?? ''} onChange={(e) => set('name', e.target.value)} className="w-full px-3 py-2 text-sm rounded border border-[var(--t-border)] bg-[var(--t-input)] text-[var(--t-text)]" placeholder="Strict / Default / Off" />
          </Field>
          <Field label="Description">
            <input value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} className="w-full px-3 py-2 text-sm rounded border border-[var(--t-border)] bg-[var(--t-input)] text-[var(--t-text)]" />
          </Field>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.enabled ?? true} onChange={(e) => set('enabled', e.target.checked)} className="rounded" />
            <span className="text-sm text-[var(--t-text)]">Enabled (write to audit_logs)</span>
          </label>
        </div>
        <div className="px-5 py-3 border-t border-[var(--t-border)] flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-[var(--t-text-secondary)]">Cancel</button>
          <button onClick={() => save.mutate()} disabled={!form.name || save.isPending} className="px-4 py-2 text-sm rounded bg-[var(--t-accent)] text-white disabled:opacity-50">
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin inline mr-1" /> : null}Save
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs font-medium text-[var(--t-text-secondary)] mb-1">{label}</label>{children}</div>
}
