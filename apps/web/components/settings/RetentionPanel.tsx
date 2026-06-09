'use client'

/**
 * RetentionPanel — admin control for how long logs live.
 *
 * Reads + writes four system_configs keys:
 *   audit.retentionDays     (e.g. 365)
 *   logs.retentionDays      (e.g. 30)
 *   events.retentionDays    (e.g. 30)
 *   retention.cronSchedule  (e.g. "0 3 * * *")
 *
 * Also exposes a "Run cleanup now" button that calls
 * POST /api/admin/retention/prune. Dry-run first to preview counts,
 * then confirm with a second click.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Save, Play, AlertTriangle, ClipboardList, FileText, Activity, Clock } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'

type RetentionKey =
  | 'audit.retentionDays'
  | 'logs.retentionDays'
  | 'events.retentionDays'
  | 'retention.cronSchedule'

const KEYS: Array<{
  key: RetentionKey
  label: string
  icon: React.ComponentType<{ className?: string }>
  unit?: string
  hint: string
}> = [
  { key: 'audit.retentionDays',    label: 'Audit Log Retention',   icon: ClipboardList, unit: 'days', hint: 'audit_logs — write-only operations (UPDATE / DELETE / SIGNOFF). Keep longer.' },
  { key: 'logs.retentionDays',     label: 'API Log Retention',     icon: FileText,      unit: 'days', hint: 'api_logs — every request with method/status/duration + JSON bodies. Volume is high, keep shorter.' },
  { key: 'events.retentionDays',   label: 'Event Log Retention',   icon: Activity,      unit: 'days', hint: 'event_logs — emitted by eventLog nodes in flows. Same volume tier as API logs.' },
  { key: 'retention.cronSchedule', label: 'Cleanup Schedule',      icon: Clock,                      hint: 'Cron (UTC) — when the prune job runs automatically. 5-field syntax.' },
]

const authHeaders = (token: string | null) => {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

export function RetentionPanel() {
  const token = useAuthStore((s) => s.accessToken)
  const qc = useQueryClient()
  const [edits, setEdits] = useState<Partial<Record<RetentionKey, string>>>({})

  const { data, isLoading } = useQuery({
    queryKey: ['retention-settings'],
    enabled: !!token,
    queryFn: async () => {
      const rows: Record<string, unknown> = {}
      for (const k of KEYS) {
        const r = await fetch(`/orch/api/admin/system-config/${encodeURIComponent(k.key)}`, {
          headers: authHeaders(token),
        })
        if (r.ok) rows[k.key] = (await r.json()).data?.value
      }
      return rows
    },
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      const updates = Object.entries(edits)
      for (const [key, raw] of updates) {
        const isNumber = key.endsWith('retentionDays')
        const value: number | string = isNumber ? Number(raw) : String(raw)
        const r = await fetch(`/orch/api/admin/system-config/${encodeURIComponent(key)}`, {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({ value, reason: 'Updated via Retention panel' }),
        })
        if (!r.ok) throw new Error(`Save ${key} failed: ${r.status}`)
      }
      return updates.length
    },
    onSuccess: (n) => {
      toast.success(`Saved ${n} setting${n === 1 ? '' : 's'}`)
      setEdits({})
      qc.invalidateQueries({ queryKey: ['retention-settings'] })
      qc.invalidateQueries({ queryKey: ['system-config'] })
    },
    onError: (e: Error) => toast.error(`Save failed: ${e.message}`),
  })

  const [dryRun, setDryRun] = useState<Record<string, { wouldDelete?: number; deleted?: number }> | null>(null)

  const pruneMutation = useMutation({
    mutationFn: async (args: { dry: boolean }) => {
      const r = await fetch('/orch/api/admin/retention/prune', {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ dryRun: args.dry }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    },
    onSuccess: (d, args) => {
      if (args.dry) {
        setDryRun(d)
        toast('Preview ready — click "Run cleanup" again to delete')
      } else {
        const deleted = (['audit_logs', 'api_logs', 'event_logs'] as const)
          .map((n) => `${n}: ${d[n]?.deleted ?? 0}`)
          .join(', ')
        toast.success(`Cleanup done — ${deleted}`)
        setDryRun(null)
      }
    },
    onError: (e: Error) => toast.error(`Cleanup failed: ${e.message}`),
  })

  const currentValue = (k: RetentionKey): string => {
    if (edits[k] !== undefined) return edits[k]!
    const v = data?.[k]
    return v == null ? '' : String(v)
  }
  const dirty = Object.keys(edits).length > 0

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold text-[var(--t-text)]">Log Retention</h2>
          <p className="text-xs text-[var(--t-text-muted)] mt-0.5">
            Set retention period per log type. 0 = keep forever.
          </p>
        </div>
        <div className="flex gap-2">
          {dirty && (
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="px-3 py-1.5 rounded bg-[var(--t-accent)] text-white text-xs flex items-center gap-1.5 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" /> Save {Object.keys(edits).length}
            </button>
          )}
          <button
            onClick={() => pruneMutation.mutate({ dry: true })}
            disabled={pruneMutation.isPending}
            className="px-3 py-1.5 rounded border border-[var(--t-border)] bg-[var(--t-bg)] text-[var(--t-text)] text-xs flex items-center gap-1.5"
          >
            <AlertTriangle className="w-3.5 h-3.5" /> Preview
          </button>
          <button
            onClick={() => pruneMutation.mutate({ dry: false })}
            disabled={pruneMutation.isPending}
            className="px-3 py-1.5 rounded bg-red-500/15 border border-red-500/40 text-red-400 text-xs flex items-center gap-1.5 hover:bg-red-500/25"
          >
            <Play className="w-3.5 h-3.5" /> Run cleanup now
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-[var(--t-text-muted)] text-sm">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {KEYS.map(({ key, label, icon: Icon, unit, hint }) => (
            <div key={key} className="p-3 rounded-lg border border-[var(--t-border)] bg-[var(--t-bg)]">
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-4 h-4 text-[var(--t-accent)]" />
                <span className="text-sm font-semibold text-[var(--t-text)]">{label}</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type={key.endsWith('retentionDays') ? 'number' : 'text'}
                  min={key.endsWith('retentionDays') ? 0 : undefined}
                  value={currentValue(key)}
                  onChange={(e) => setEdits((p) => ({ ...p, [key]: e.target.value }))}
                  className="flex-1 px-3 py-1.5 rounded bg-[var(--t-panel)] border border-[var(--t-border)] text-[var(--t-text)] text-sm"
                />
                {unit && <span className="text-xs text-[var(--t-text-muted)]">{unit}</span>}
              </div>
              <p className="text-[11px] text-[var(--t-text-muted)] mt-2">{hint}</p>
              {dryRun && key !== 'retention.cronSchedule' && (
                <p className="text-[11px] mt-1 text-amber-400">
                  {(() => {
                    const tableName = key.replace('.retentionDays', '_logs').replace('logs_logs', 'api_logs').replace('events_logs', 'event_logs').replace('audit_logs_logs', 'audit_logs')
                    const n = dryRun[tableName]?.wouldDelete
                    return n != null ? `Would delete ${n} row(s)` : null
                  })()}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
