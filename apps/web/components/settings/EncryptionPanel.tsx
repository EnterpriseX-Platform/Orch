'use client'

/**
 * EncryptionPanel — spec column-level encryption manager.
 *
 * Layout:
 *   - Engine badge + suggestion banner
 *   - Filter: All / Suggested / Encrypted
 *   - Table view: every (table, column, type, encrypted?)
 *   - Bulk select + Preview DDL + Apply
 *
 * The "preview" step shows the SQL the system would run before
 * running it, so admins can copy/paste into a DBA tool when they
 * don't want the app to execute DDL directly.
 */
import { useMemo, useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Database, Lock, Unlock, Eye, Zap, Loader2, AlertTriangle, Check } from 'lucide-react'
import { toast } from 'sonner'
import { confirmDialog } from '@/components/common/ConfirmDialog'

type Row = {
  table: string
  column: string
  dataType: string
  encrypted: boolean
  suggested: boolean
}

const FONT = "'Prompt', sans-serif"

export function EncryptionPanel() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin-encryption'],
    queryFn: async () => {
      const r = await fetch('/orch/api/admin/encryption')
      if (!r.ok) throw new Error('Failed to load')
      return r.json() as Promise<{ engine: string; count: number; data: Row[] }>
    },
  })

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'ALL' | 'SUGGESTED' | 'ENCRYPTED'>('SUGGESTED')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [previewDdl, setPreviewDdl] = useState<string[] | null>(null)
  const [previewMode, setPreviewMode] = useState<'encrypt' | 'decrypt'>('encrypt')

  const rows = data?.data ?? []
  const engine = data?.engine ?? 'unknown'

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (filter === 'SUGGESTED' && !r.suggested) return false
      if (filter === 'ENCRYPTED' && !r.encrypted) return false
      if (search && !`${r.table} ${r.column}`.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [rows, filter, search])

  const toggle = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const previewMutation = useMutation({
    mutationFn: async (mode: 'encrypt' | 'decrypt') => {
      const cols = rows.filter(r => selected.has(`${r.table}.${r.column}`)).map(r => ({
        table: r.table,
        column: r.column,
        dataType: r.dataType,
      }))
      const r = await fetch('/orch/api/admin/encryption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'preview', decrypt: mode === 'decrypt', columns: cols }),
      })
      return r.json() as Promise<{ engine: string; ddl: string[] }>
    },
    onSuccess: (res, mode) => {
      setPreviewMode(mode)
      setPreviewDdl(res.ddl)
    },
  })

  const applyMutation = useMutation({
    mutationFn: async (mode: 'encrypt' | 'decrypt') => {
      const cols = rows.filter(r => selected.has(`${r.table}.${r.column}`)).map(r => ({
        table: r.table,
        column: r.column,
        dataType: r.dataType,
      }))
      const r = await fetch('/orch/api/admin/encryption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'apply', decrypt: mode === 'decrypt', columns: cols }),
      })
      return r.json() as Promise<{ log: { table: string; column: string; ok: boolean; error?: string }[] }>
    },
    onSuccess: (res) => {
      const ok = res.log.filter(r => r.ok).length
      const fail = res.log.filter(r => !r.ok).length
      if (fail) toast.error(`${ok} succeeded · ${fail} failed`)
      else toast.success(`${ok} column(s) updated`)
      setSelected(new Set())
      setPreviewDdl(null)
      refetch()
    },
    onError: (e: any) => toast.error(e?.message ?? 'Apply failed'),
  })

  return (
    <div style={{ fontFamily: FONT }} className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[var(--t-text)] flex items-center gap-2">
            <Lock className="w-4 h-4 text-[#10B981]" /> At-rest Encryption
          </h2>
        </div>
        <div className={
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ' +
          (engine === 'postgres'
            ? 'bg-blue-500/10 text-blue-300 border-blue-500/30'
            : engine === 'oracle'
              ? 'bg-red-500/10 text-red-300 border-red-500/30'
              : 'bg-slate-500/10 text-slate-300 border-slate-500/30')
        }>
          <Database className="w-3.5 h-3.5" />
          Engine: {engine}
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center">
        {(['SUGGESTED', 'ALL', 'ENCRYPTED'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={
              'px-3 py-1.5 text-xs font-medium rounded-md transition-colors ' +
              (filter === f
                ? 'bg-[var(--t-accent)] text-white'
                : 'bg-[var(--t-input)] text-[var(--t-text-secondary)] border border-[var(--t-border)]')
            }
          >
            {f === 'SUGGESTED' ? 'Sensitive (suggested)' : f === 'ENCRYPTED' ? 'Encrypted' : 'All columns'}
          </button>
        ))}
        <input
          type="text"
          placeholder="Filter by table or column..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] px-3 py-1.5 text-sm rounded-md border border-[var(--t-border)] bg-[var(--t-input)] text-[var(--t-text)]"
        />
        <span className="text-xs text-[var(--t-text-muted)]">
          {selected.size} selected · {filtered.length} of {rows.length}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-[var(--t-border)] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[var(--t-bg)] border-b border-[var(--t-border)]">
            <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--t-text-muted)]">
              <th className="px-4 py-2 w-10"></th>
              <th className="px-4 py-2">Table</th>
              <th className="px-4 py-2">Column</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Note</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-[var(--t-text-muted)]">
                <Loader2 className="w-5 h-5 animate-spin inline mr-2" />Loading columns…
              </td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-[var(--t-text-muted)] italic">No columns match.</td></tr>
            ) : (
              filtered.map(r => {
                const key = `${r.table}.${r.column}`
                const isSelected = selected.has(key)
                return (
                  <tr
                    key={key}
                    onClick={() => toggle(key)}
                    className="border-b border-[var(--t-border-light)] hover:bg-[var(--t-panel-hover)] cursor-pointer last:border-0"
                  >
                    <td className="px-4 py-2 align-middle">
                      <input type="checkbox" checked={isSelected} onChange={() => toggle(key)} className="w-3.5 h-3.5" />
                    </td>
                    <td className="px-4 py-2 align-middle font-mono text-xs text-[var(--t-text)]">{r.table}</td>
                    <td className="px-4 py-2 align-middle font-mono text-xs text-[var(--t-text)]">{r.column}</td>
                    <td className="px-4 py-2 align-middle text-xs text-[var(--t-text-muted)]">{r.dataType}</td>
                    <td className="px-4 py-2 align-middle">
                      {r.encrypted ? (
                        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                          <Lock className="w-3 h-3" /> Encrypted
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-slate-500/15 text-slate-300 border border-slate-500/30">
                          <Unlock className="w-3 h-3" /> Plain
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 align-middle">
                      {r.suggested ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-amber-400">
                          <AlertTriangle className="w-3 h-3" /> Suggested
                        </span>
                      ) : (
                        <span className="text-[11px] text-[var(--t-text-muted)]">—</span>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Action bar */}
      {selected.size > 0 && (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => previewMutation.mutate('encrypt')}
            disabled={previewMutation.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-[var(--t-input)] text-[var(--t-text)] border border-[var(--t-border)] hover:bg-[var(--t-panel-hover)]"
          >
            <Eye className="w-3.5 h-3.5" /> Preview DDL
          </button>
          <button
            onClick={async () => {
              const ok = await confirmDialog({
                title: `Encrypt ${selected.size} column${selected.size === 1 ? '' : 's'}?`,
                body: `The system will run engine-specific DDL on the database. This is a destructive change — make sure you have a backup. Engine: ${engine}.`,
                variant: 'danger',
                confirmLabel: 'Run DDL',
              })
              if (ok) applyMutation.mutate('encrypt')
            }}
            disabled={applyMutation.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-[var(--t-accent)] text-white hover:bg-[#2563EB]"
          >
            {applyMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            Apply Encryption
          </button>
        </div>
      )}

      {/* Preview overlay */}
      {previewDdl && (
        <div className="rounded-lg border border-[var(--t-border)] bg-[var(--t-bg)] overflow-hidden">
          <div className="px-4 py-2 border-b border-[var(--t-border)] flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wider text-[var(--t-text-muted)]">
              {previewMode === 'decrypt' ? 'Decrypt DDL Preview' : 'Encrypt DDL Preview'} ({engine})
            </div>
            <button
              onClick={() => setPreviewDdl(null)}
              className="text-xs text-[var(--t-text-muted)] hover:text-[var(--t-text)]"
            >
              Close
            </button>
          </div>
          <pre className="px-4 py-3 text-[12px] font-mono text-[var(--t-text)] overflow-auto max-h-80 whitespace-pre">
            {previewDdl.join('\n\n')}
          </pre>
          <div className="px-4 py-2 border-t border-[var(--t-border)] flex justify-end gap-2">
            <button
              onClick={() => navigator.clipboard.writeText(previewDdl.join('\n\n')).then(() => toast.success('Copied'))}
              className="text-xs px-3 py-1.5 rounded-md bg-[var(--t-input)] text-[var(--t-text)] border border-[var(--t-border)]"
            >
              <Check className="w-3 h-3 inline mr-1" /> Copy SQL
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
