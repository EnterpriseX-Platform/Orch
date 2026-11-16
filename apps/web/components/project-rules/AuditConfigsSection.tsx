'use client'

/**
 * AuditConfigsSection — project-scoped audit-policy library editor.
 * Same Add/Edit modal in dedicated page + Rules tab.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Shield, Loader2 } from 'lucide-react'
import { Button, Checkbox, Modal, Tag, TextInput } from '@carbon/react'
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
        <Button kind="primary" size="sm" renderIcon={Plus} onClick={() => setShowCreate(true)}>
          New Config
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-10 text-[var(--t-text-muted)]"><Loader2 className="w-5 h-5 animate-spin inline mr-2" />Loading…</div>
      ) : items.length === 0 ? (
        <Empty onCreate={() => setShowCreate(true)} />
      ) : (
        <div className="rounded-none bg-[var(--t-panel)] border border-[var(--t-border)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#e0e0e0] h-10">
                <Th>Name</Th><Th>Status</Th><Th>Used by</Th><Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((ac) => (
                <tr key={ac.id} className="border-b border-[var(--t-border-light)] hover:bg-[var(--t-panel-hover)]">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-[var(--t-text)]">{ac.name}</div>
                    {ac.description && <div className="text-xs text-[var(--t-text-muted)]">{ac.description}</div>}
                    {!ac.projectId && <Tag type="warm-gray" size="sm" className="mt-1">global</Tag>}
                  </td>
                  <td className="px-4 py-2.5">
                    <Tag type={ac.enabled ? 'green' : 'gray'} size="sm">
                      {ac.enabled ? 'Enabled' : 'Disabled'}
                    </Tag>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs font-semibold">{ac._count?.messageFormats ?? 0}</span>
                    <span className="text-xs text-[var(--t-text-muted)]"> formats</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <Button kind="ghost" size="sm" hasIconOnly renderIcon={Pencil} iconDescription="Edit" onClick={() => setEditing(ac)} />
                      <Button kind="danger--ghost" size="sm" hasIconOnly renderIcon={Trash2} iconDescription="Delete" onClick={async () => { if (await confirmDialog({ title: `Delete "${ac.name}"?`, variant: 'danger' })) del.mutate(ac.id) }} />
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
  return <th className="text-left px-4 py-2 text-[12px] text-[#525252]">{children}</th>
}

function Empty({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="text-center py-12 rounded-none bg-[var(--t-panel)] border border-dashed border-[var(--t-border)]">
      <Shield className="w-8 h-8 text-[var(--t-text-muted)] mx-auto mb-2" />
      <p className="text-sm text-[var(--t-text)]">No audit configs yet</p>
      <Button kind="primary" size="sm" onClick={onCreate} className="mt-3">Create one</Button>
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
    <Modal
      open
      size="sm"
      modalHeading={isEdit ? 'Edit Audit Config' : 'New Audit Config'}
      primaryButtonText={save.isPending ? 'Saving…' : 'Save'}
      secondaryButtonText="Cancel"
      primaryButtonDisabled={!form.name || save.isPending}
      onRequestClose={onClose}
      onRequestSubmit={() => save.mutate()}
    >
      <div className="space-y-4">
        <TextInput id="audit-config-name" labelText="Name *" value={form.name ?? ''} onChange={(e) => set('name', e.target.value)} placeholder="Strict / Default / Off" />
        <TextInput id="audit-config-description" labelText="Description" value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} />
        <Checkbox id="audit-config-enabled" labelText="Enabled (write to audit_logs)" checked={form.enabled ?? true} onChange={(_, { checked }) => set('enabled', checked)} />
      </div>
    </Modal>
  )
}
