'use client'

/**
 * FieldMappingsSection — project-scoped Field Mapping library editor.
 * Reused by both the dedicated page and the Rules tab on the project
 * detail page so admins get the same Add/Edit modal in both places.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Tag, Loader2 } from 'lucide-react'
import { Button, Modal, Select, SelectItem, Tag as CTag, TextInput } from '@carbon/react'
import { fieldMappingApi } from '@/lib/api'
import { toast } from 'sonner'
import { confirmDialog } from '@/components/common/ConfirmDialog'

type FM = {
  id: string
  name: string
  description?: string | null
  refType?: string | null
  refIdPath?: string | null
  refNoPath?: string | null
  refNamePath?: string | null
  pkXPath?: string | null
  usernameSource?: string | null
  usernameField?: string | null
  usernameStatic?: string | null
  clobPath?: string | null
  transactionKeyFields?: string[] | null
  projectId?: string | null
  _count?: { messageFormats: number }
}

const USERNAME_SOURCES = [
  { value: '', label: '— none —' },
  { value: 'JWT_CLAIM', label: 'JWT token claim' },
  { value: 'HEADER',    label: 'Request header' },
  { value: 'BODY_PATH', label: 'Request body (JSONPath)' },
  { value: 'SESSION',   label: 'Orch session' },
  { value: 'STATIC',    label: 'Fixed value' },
]

export function FieldMappingsSection({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<FM | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['field-mappings', projectId],
    queryFn: () => fieldMappingApi.list({ projectId }),
  })
  const items: FM[] = (data as any)?.data ?? []

  const del = useMutation({
    mutationFn: (id: string) => fieldMappingApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['field-mappings', projectId] }); toast.success('Deleted') },
    onError: (e: any) => toast.error(e?.message ?? 'Delete failed'),
  })

  return (
    <div>
      <div className="flex items-center justify-end mb-3">
        <Button kind="primary" size="sm" renderIcon={Plus} onClick={() => setShowCreate(true)}>
          New Mapping
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-10 text-[var(--t-text-muted)]"><Loader2 className="w-5 h-5 animate-spin inline mr-2" /> Loading…</div>
      ) : items.length === 0 ? (
        <Empty onCreate={() => setShowCreate(true)} />
      ) : (
        <div className="rounded-none bg-[var(--t-panel)] border border-[var(--t-border)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#e0e0e0] h-10">
                <Th>Name</Th>
                <Th>Ref Type</Th>
                <Th>Ref ID Path</Th>
                <Th>User Source</Th>
                <Th>Used by</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((fm) => (
                <tr key={fm.id} className="border-b border-[var(--t-border-light)] hover:bg-[var(--t-panel-hover)]">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-[var(--t-text)]">{fm.name}</div>
                    {fm.description && <div className="text-xs text-[var(--t-text-muted)]">{fm.description}</div>}
                    {!fm.projectId && (
                      <CTag type="warm-gray" size="sm" className="mt-1">global</CTag>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {fm.refType ? (
                      <CTag type="blue" size="sm" renderIcon={Tag}>{fm.refType}</CTag>
                    ) : <span className="text-[var(--t-text-muted)] text-xs">—</span>}
                  </td>
                  <td className="px-4 py-2.5"><code className="text-xs font-mono text-[var(--t-text-secondary)]">{fm.refIdPath ?? '—'}</code></td>
                  <td className="px-4 py-2.5"><span className="text-xs">{fm.usernameSource ?? '—'}</span></td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs font-semibold text-[var(--t-text)]">{fm._count?.messageFormats ?? 0}</span>
                    <span className="text-xs text-[var(--t-text-muted)]"> formats</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <Button kind="ghost" size="sm" hasIconOnly renderIcon={Pencil} iconDescription="Edit" onClick={() => setEditing(fm)} />
                      <Button
                        kind="danger--ghost"
                        size="sm"
                        hasIconOnly
                        renderIcon={Trash2}
                        iconDescription="Delete"
                        onClick={async () => {
                          if (await confirmDialog({
                            title: `Delete "${fm.name}"?`,
                            body: 'Bound MessageFormats will keep working with their per-row override fields.',
                            variant: 'danger',
                          })) del.mutate(fm.id)
                        }}
                      />
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
          onSaved={() => { qc.invalidateQueries({ queryKey: ['field-mappings', projectId] }); setShowCreate(false); setEditing(null) }}
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
      <Tag className="w-8 h-8 text-[var(--t-text-muted)] mx-auto mb-2" />
      <p className="text-sm text-[var(--t-text)]">No field mappings yet</p>
      <p className="text-xs text-[var(--t-text-muted)] mt-1 mb-3">Create a reusable extraction template</p>
      <Button kind="primary" size="sm" onClick={onCreate}>
        Create one
      </Button>
    </div>
  )
}

function Editor({
  item, projectId, onClose, onSaved,
}: {
  item: FM | null
  projectId: string
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!item
  const [form, setForm] = useState<Partial<FM>>(item ?? { name: '', usernameSource: '', projectId })
  const set = <K extends keyof FM>(k: K, v: FM[K]) => setForm((p) => ({ ...p, [k]: v }))

  const save = useMutation({
    mutationFn: () => isEdit && item
      ? fieldMappingApi.update(item.id, sanitize(form))
      : fieldMappingApi.create(sanitize({ ...form, projectId })),
    onSuccess: () => { toast.success(isEdit ? 'Updated' : 'Created'); onSaved() },
    onError: (e: any) => toast.error(e?.message ?? 'Save failed'),
  })

  return (
    <Modal
      open
      size="md"
      modalHeading={isEdit ? 'Edit Field Mapping' : 'New Field Mapping'}
      primaryButtonText={save.isPending ? 'Saving…' : 'Save'}
      secondaryButtonText="Cancel"
      primaryButtonDisabled={!form.name || save.isPending}
      onRequestClose={onClose}
      onRequestSubmit={() => save.mutate()}
    >
        <div className="space-y-4">
          <TextInput id="fm-name" labelText="Name *" value={form.name ?? ''} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Standard Mapping"  />
          <TextInput id="fm-description" labelText="Description" value={form.description ?? ''} onChange={(e) => set('description', e.target.value)}  />

          <Section title="Entity (ref) tracking">
            <Grid>
              <TextInput id="fm-ref-type" labelText="Ref Type" helperText="e.g. WORK_PLAN, ITEM" value={form.refType ?? ''} onChange={(e) => set('refType', e.target.value)}  />
              <TextInput id="fm-ref-id-path" labelText="Ref ID Path" className="font-mono" value={form.refIdPath ?? ''} onChange={(e) => set('refIdPath', e.target.value)} placeholder="$.object.input.REF_ID"  />
              <TextInput id="fm-ref-no-path" labelText="Ref No Path" className="font-mono" value={form.refNoPath ?? ''} onChange={(e) => set('refNoPath', e.target.value)} placeholder="$.object.input.REF_NO"  />
              <TextInput id="fm-ref-name-path" labelText="Ref Name Path" className="font-mono" value={form.refNamePath ?? ''} onChange={(e) => set('refNamePath', e.target.value)} placeholder="$.object.name"  />
              <TextInput id="fm-pk-xpath" labelText="PK XPath" className="font-mono" value={form.pkXPath ?? ''} onChange={(e) => set('pkXPath', e.target.value)} placeholder="$.uniqueId"  />
            </Grid>
          </Section>

          <Section title="Username extraction">
            <Grid>
              <Select id="fm-username-source" labelText="Source" value={form.usernameSource ?? ''} onChange={(e) => set('usernameSource', e.target.value || null)}>
                {USERNAME_SOURCES.map((s) => <SelectItem key={s.value} value={s.value} text={s.label} />)}
              </Select>
              {form.usernameSource && form.usernameSource !== 'STATIC' && form.usernameSource !== 'SESSION' && (
                <TextInput id="fm-field" labelText="Field" helperText={
                  form.usernameSource === 'JWT_CLAIM' ? 'Claim name' :
                  form.usernameSource === 'HEADER'    ? 'Header name' :
                  form.usernameSource === 'BODY_PATH' ? 'JSONPath' : ''
                } value={form.usernameField ?? ''} onChange={(e) => set('usernameField', e.target.value)}  />
              )}
              {form.usernameSource === 'STATIC' && (
                <TextInput id="fm-fixed-value" labelText="Fixed value" value={form.usernameStatic ?? ''} onChange={(e) => set('usernameStatic', e.target.value)}  />
              )}
            </Grid>
          </Section>

          <Section title="Transaction grouping">
            <TextInput id="fm-clob-path" labelText="CLOB Path" helperText="JSONPath to a stringified CLOB inside the body (supports * wildcard). Leave blank to disable transaction grouping." className="font-mono" value={form.clobPath ?? ''} onChange={(e) => set('clobPath', e.target.value)} placeholder="$.object.*.request"  />
            <TextInput id="fm-transaction-key-fields" labelText="Transaction Key Fields" helperText="Field names INSIDE the parsed CLOB. Comma-separated. Their values are joined with '|' to form the transaction key." className="font-mono"
                value={(form.transactionKeyFields ?? []).join(', ')}
                onChange={(e) =>
                  set(
                    'transactionKeyFields',
                    e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                  )
                }
                placeholder="FISCAL_YEAR, AGC_ID"
               />
          </Section>
        </div>

    </Modal>
  )
}

function sanitize(form: Partial<FM>): any {
  const out: any = {}
  for (const [k, v] of Object.entries(form)) {
    if (v === undefined) continue
    if (v === '') { out[k] = null; continue }
    out[k] = v
  }
  return out
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><p className="text-xs text-[#525252] mb-2">{title}</p>{children}</div>
}
function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>
}
