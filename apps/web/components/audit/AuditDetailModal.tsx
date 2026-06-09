'use client'

/**
 * AuditDetailModal — full-screen detail view for one audit_logs row.
 *
 * Replaces the old inline-expand on /orch/audit. Admins complained the
 * diff table + raw JSON got cramped inside the expanded row. Modal
 * gives more vertical space and lets us group the content into tabs.
 *
 * Tabs:
 *   - Summary   : who/what/when metadata
 *   - Changes   : field-by-field Old → New diff (ChangeDiff rendered)
 *   - Raw JSON  : oldValues + newValues + changes side-by-side
 */
import { useState, type ReactNode } from 'react'
import { X, FileJson, Info, GitCompare } from 'lucide-react'

export interface AuditDetailData {
  id: string
  timestamp: string
  action: string
  entityType: string
  entityId?: string
  userIp?: string
  description?: string
  oldValues?: unknown
  newValues?: unknown
  changes?: unknown
  user?: { id: string; username: string; firstName?: string; lastName?: string }
}

type TabId = 'summary' | 'changes' | 'raw'

function formatDateTime(ts: string) {
  try { return new Date(ts).toLocaleString('th-TH') } catch { return ts }
}

export function AuditDetailModal({
  log,
  onClose,
  renderDiff,
}: {
  log: AuditDetailData | null
  onClose: () => void
  /** Inject the existing ChangeDiff component so we don't re-implement the diff logic. */
  renderDiff: (log: AuditDetailData) => ReactNode
}) {
  const [tab, setTab] = useState<TabId>('summary')
  if (!log) return null

  const tabs: Array<{ id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'summary', label: 'Summary', icon: Info },
    { id: 'changes', label: 'Changes', icon: GitCompare },
    { id: 'raw',     label: 'Raw JSON', icon: FileJson },
  ]

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--t-panel)] border border-[var(--t-border)] rounded-xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--t-border)]">
          <div className="flex items-center gap-3 min-w-0">
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[#3B82F6]/20 text-[#60A5FA]">
              {log.action}
            </span>
            <span className="text-[11px] text-[var(--t-text-muted)]">on</span>
            <span className="text-xs font-semibold text-[var(--t-text)]">{log.entityType}</span>
            {log.entityId && (
              <code className="text-xs font-mono text-[var(--t-text-secondary)] truncate">
                · {log.entityId}
              </code>
            )}
            <span className="text-xs text-[var(--t-text-muted)] shrink-0">
              · {formatDateTime(log.timestamp)}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-[var(--t-panel-hover)] text-[var(--t-text-muted)] shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-5 pt-2 border-b border-[var(--t-border)] flex gap-1">
          {tabs.map((t) => {
            const Icon = t.icon
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                  active
                    ? 'border-[var(--t-accent)] text-[var(--t-accent)]'
                    : 'border-transparent text-[var(--t-text-muted)] hover:text-[var(--t-text)]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            )
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-5 text-sm">
          {tab === 'summary' && (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Action">
                <span className="text-xs text-[var(--t-text)]">{log.action}</span>
              </Field>
              <Field label="Timestamp">
                <span className="text-xs text-[var(--t-text)]">{formatDateTime(log.timestamp)}</span>
              </Field>
              <Field label="User">
                <span className="text-xs text-[var(--t-text)]">
                  {(log.changes as { username?: string } | undefined)?.username
                    || (log.user?.firstName
                      ? `${log.user.firstName} ${log.user.lastName || ''} (${log.user.username})`
                      : log.user?.username)
                    || 'system'}
                </span>
              </Field>
              <Field label="Client IP">
                <span className="text-xs text-[var(--t-text)]">{log.userIp || '—'}</span>
              </Field>
              <Field label="Entity Type">
                <span className="text-xs text-[var(--t-text)]">{log.entityType}</span>
              </Field>
              <Field label="Entity ID">
                <code className="text-xs font-mono text-[var(--t-text)] break-all">
                  {log.entityId || '—'}
                </code>
              </Field>
              {log.description && (
                <Field label="Description" full>
                  <p className="text-xs text-[var(--t-text-secondary)] break-words">{log.description}</p>
                </Field>
              )}
            </div>
          )}

          {tab === 'changes' && (
            <div>
              <div className="grid grid-cols-3 gap-3 mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--t-text-muted)]">
                <div>Field</div>
                <div className="text-red-400">Old Value</div>
                <div className="text-emerald-400">New Value</div>
              </div>
              <div className="space-y-1">{renderDiff(log)}</div>
            </div>
          )}

          {tab === 'raw' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Block label="Old Values" content={JSON.stringify(log.oldValues, null, 2)} />
              <Block label="New Values" content={JSON.stringify(log.newValues, null, 2)} />
              <div className="md:col-span-2">
                <Block label="Changes" content={JSON.stringify(log.changes, null, 2)} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <p className="text-[10px] font-semibold text-[var(--t-text-muted)] uppercase tracking-wider mb-0.5">{label}</p>
      {children}
    </div>
  )
}

function Block({ label, content }: { label: string; content: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-[var(--t-text-muted)] uppercase tracking-wider mb-1">{label}</p>
      <pre className="px-3 py-2 rounded bg-[var(--t-bg)] border border-[var(--t-border)] text-[var(--t-text-secondary)] text-xs font-mono whitespace-pre-wrap break-all max-h-[50vh] overflow-auto">
        {content || '(empty)'}
      </pre>
    </div>
  )
}
