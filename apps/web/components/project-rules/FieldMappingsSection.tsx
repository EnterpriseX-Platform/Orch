'use client'

/**
 * FieldMappingsSection — project-scoped Field Mapping library editor.
 * Reused by both the dedicated page and the Rules tab on the project
 * detail page so admins get the same Add/Edit modal in both places.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Tag, Loader2 } from 'lucide-react'
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
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-[var(--t-accent)] hover:bg-[#2563EB]"
        >
          <Plus className="w-3.5 h-3.5" /> New Mapping
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-10 text-[var(--t-text-muted)]"><Loader2 className="w-5 h-5 animate-spin inline mr-2" /> Loading…</div>
      ) : items.length === 0 ? (
        <Empty onCreate={() => setShowCreate(true)} />
      ) : (
        <div className="rounded-lg bg-[var(--t-panel)] border border-[var(--t-border)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--t-border)] bg-[var(--t-bg)]">
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
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 mt-1 inline-block">global</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {fm.refType ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded bg-[var(--t-accent)]/15 text-[var(--t-accent)]">
                        <Tag className="w-3 h-3" />{fm.refType}
                      </span>
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
                      <button onClick={() => setEditing(fm)} className="p-1.5 rounded hover:bg-[var(--t-panel-hover)]" title="Edit">
                        <Pencil className="w-3.5 h-3.5 text-[var(--t-text-muted)]" />
                      </button>
                      <button
                        onClick={async () => {
                          if (await confirmDialog({
                            title: `Delete "${fm.name}"?`,
                            body: 'Bound MessageFormats will keep working with their per-row override fields.',
                            variant: 'danger',
                          })) del.mutate(fm.id)
                        }}
                        className="p-1.5 rounded hover:bg-red-500/10"
                        title="Delete"
                      >
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
          onSaved={() => { qc.invalidateQueries({ queryKey: ['field-mappings', projectId] }); setShowCreate(false); setEditing(null) }}
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
      <Tag className="w-8 h-8 text-[var(--t-text-muted)] mx-auto mb-2" />
      <p className="text-sm text-[var(--t-text)]">No field mappings yet</p>
      <p className="text-xs text-[var(--t-text-muted)] mt-1 mb-3">Create a reusable extraction template</p>
      <button onClick={onCreate} className="text-xs px-3 py-1.5 rounded bg-[var(--t-accent)] text-white">
        Create one
      </button>
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
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[var(--t-panel)] border border-[var(--t-border)] rounded-xl w-full max-w-2xl max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--t-border)]">
          <h2 className="text-lg font-semibold text-[var(--t-text)]">{isEdit ? 'Edit Field Mapping' : 'New Field Mapping'}</h2>
          <button onClick={onClose} className="text-[var(--t-text-muted)] hover:text-[var(--t-text)]">✕</button>
        </div>

        <div className="p-5 space-y-4">
          <Field label="Name *">
            <input value={form.name ?? ''} onChange={(e) => set('name', e.target.value)} className="input" placeholder="e.g. Standard Mapping" />
          </Field>
          <Field label="Description">
            <input value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} className="input" />
          </Field>

          <Section title="Entity (ref) tracking">
            <Grid>
              <Field label="Ref Type" hint="e.g. WORK_PLAN, ITEM">
                <input value={form.refType ?? ''} onChange={(e) => set('refType', e.target.value)} className="input" />
              </Field>
              <Field label="Ref ID Path">
                <input value={form.refIdPath ?? ''} onChange={(e) => set('refIdPath', e.target.value)} className="input font-mono" placeholder="$.object.input.REF_ID" />
              </Field>
              <Field label="Ref No Path">
                <input value={form.refNoPath ?? ''} onChange={(e) => set('refNoPath', e.target.value)} className="input font-mono" placeholder="$.object.input.REF_NO" />
              </Field>
              <Field label="Ref Name Path">
                <input value={form.refNamePath ?? ''} onChange={(e) => set('refNamePath', e.target.value)} className="input font-mono" placeholder="$.object.name" />
              </Field>
              <Field label="PK XPath">
                <input value={form.pkXPath ?? ''} onChange={(e) => set('pkXPath', e.target.value)} className="input font-mono" placeholder="$.uniqueId" />
              </Field>
            </Grid>
          </Section>

          <Section title="Username extraction">
            <Grid>
              <Field label="Source">
                <select value={form.usernameSource ?? ''} onChange={(e) => set('usernameSource', e.target.value || null)} className="input">
                  {USERNAME_SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </Field>
              {form.usernameSource && form.usernameSource !== 'STATIC' && form.usernameSource !== 'SESSION' && (
                <Field label="Field" hint={
                  form.usernameSource === 'JWT_CLAIM' ? 'Claim name' :
                  form.usernameSource === 'HEADER'    ? 'Header name' :
                  form.usernameSource === 'BODY_PATH' ? 'JSONPath' : ''
                }>
                  <input value={form.usernameField ?? ''} onChange={(e) => set('usernameField', e.target.value)} className="input" />
                </Field>
              )}
              {form.usernameSource === 'STATIC' && (
                <Field label="Fixed value">
                  <input value={form.usernameStatic ?? ''} onChange={(e) => set('usernameStatic', e.target.value)} className="input" />
                </Field>
              )}
            </Grid>
          </Section>

          <Section title="Transaction grouping">
            <Field
              label="CLOB Path"
              hint="JSONPath to a stringified CLOB inside the body (supports * wildcard). Leave blank to disable transaction grouping."
            >
              <input value={form.clobPath ?? ''} onChange={(e) => set('clobPath', e.target.value)} className="input font-mono" placeholder="$.object.*.request" />
            </Field>
            <Field
              label="Transaction Key Fields"
              hint="Field names INSIDE the parsed CLOB. Comma-separated. Their values are joined with '|' to form the transaction key."
            >
              <input
                value={(form.transactionKeyFields ?? []).join(', ')}
                onChange={(e) =>
                  set(
                    'transactionKeyFields',
                    e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                  )
                }
                className="input font-mono"
                placeholder="ORDER_YEAR, ORG_ID"
              />
            </Field>
          </Section>
        </div>

        <div className="px-5 py-3 border-t border-[var(--t-border)] flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded text-[var(--t-text-secondary)] hover:bg-[var(--t-panel-hover)]">Cancel</button>
          <button
            onClick={() => save.mutate()}
            disabled={!form.name || save.isPending}
            className="px-4 py-2 text-sm rounded bg-[var(--t-accent)] text-white disabled:opacity-50"
          >
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin inline mr-1" /> : null}
            Save
          </button>
        </div>
      </div>

      <style jsx>{`
        .input {
          width: 100%;
          padding: 6px 10px;
          background: var(--t-input);
          border: 1px solid var(--t-border);
          border-radius: 6px;
          font-size: 13px;
          color: var(--t-text);
          outline: none;
        }
        .input:focus { border-color: var(--t-accent); }
      `}</style>
    </div>
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
  return <div><p className="text-xs font-semibold uppercase tracking-wider text-[var(--t-text-muted)] mb-2">{title}</p>{children}</div>
}
function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>
}
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <div><label className="block text-xs font-medium text-[var(--t-text-secondary)] mb-1">{label}</label>{children}{hint && <p className="text-[10px] text-[var(--t-text-muted)] mt-0.5">{hint}</p>}</div>
}
