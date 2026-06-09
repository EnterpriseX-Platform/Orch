'use client'

/**
 * EventLogDetailModal — full-screen detail for one event_logs row.
 *
 * Sibling of LogDetailModal (which is api_logs-shaped). This one renders
 * a business event: type/level/message + the structured `data` payload +
 * the flow / request / user context that produced it.
 *
 * Tabs:
 *   - Info : eventType, level, message, flow, request id, user, timestamp
 *   - Data : the structured `data` JSON payload
 */
import { useState } from 'react'
import { X, Info, FileJson, GitBranch, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { eventDisplay, eventKindColor } from '@/lib/event-logs'

export interface EventLogDetailData {
  id: string
  requestId: string
  timestamp: string
  createdAt?: string
  eventType: string
  level: string
  message?: string | null
  data?: unknown
  flowId?: string | null
  flowName?: string | null
  userId?: string | null
  userIp?: string | null
}

// Use `backgroundColor` (not `bg`) — these objects are spread straight into a
// React inline `style`, where `bg` is not a valid CSS property and gets
// dropped. With only `color:#FFF` applying, the badge was invisible on the
// light-mode panel (white text, no fill). `backgroundColor` makes the colored
// pill render in both light and dark mode.
const LEVEL_HEX: Record<string, { backgroundColor: string; color: string }> = {
  info:  { backgroundColor: '#3B82F6', color: '#FFFFFF' },
  warn:  { backgroundColor: '#F59E0B', color: '#FFFFFF' },
  error: { backgroundColor: '#EF4444', color: '#FFFFFF' },
  debug: { backgroundColor: '#64748B', color: '#FFFFFF' },
}

function formatJson(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') {
    const t = value.trim()
    if (t.startsWith('{') || t.startsWith('[')) {
      try { return JSON.stringify(JSON.parse(t), null, 2) } catch { /* fallthrough */ }
    }
    return value
  }
  try { return JSON.stringify(value, null, 2) } catch { return String(value) }
}

type TabId = 'info' | 'data'

export function EventLogDetailModal({
  log,
  onClose,
}: {
  log: EventLogDetailData | null
  onClose: () => void
}) {
  const [tab, setTab] = useState<TabId>('info')

  if (!log) return null

  const levelStyle = LEVEL_HEX[log.level?.toLowerCase()] || LEVEL_HEX.info
  const dataStr = formatJson(log.data)

  const tabs: Array<{ id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'info', label: 'Info', icon: Info },
    { id: 'data', label: 'Data', icon: FileJson },
  ]

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--t-panel)] border border-[var(--t-border)] rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--t-border)]">
          <div className="flex items-center gap-3 min-w-0">
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold uppercase" style={levelStyle}>
              {log.level || 'info'}
            </span>
            {(() => {
              const ev = eventDisplay(log)
              const c = eventKindColor(ev.kind)
              return (
                <span className="flex items-center gap-2 min-w-0">
                  <span title={log.eventType} className="text-[10px] font-bold tracking-wide px-1.5 py-0.5 rounded shrink-0" style={{ background: c + '1F', color: c }}>
                    {ev.kind}
                  </span>
                  {ev.name && (
                    <code className="text-xs font-mono text-[var(--t-text-secondary)] truncate">{ev.name}</code>
                  )}
                </span>
              )
            })()}
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
          {tab === 'info' && (
            <div className="grid grid-cols-2 gap-4">
              <InfoRow label="Event Type">
                {(() => {
                  const ev = eventDisplay(log)
                  const c = eventKindColor(ev.kind)
                  return (
                    <span className="flex items-center gap-2">
                      <span title={log.eventType} className="text-[10px] font-bold tracking-wide px-1.5 py-0.5 rounded" style={{ background: c + '1F', color: c }}>
                        {ev.kind}
                      </span>
                      {ev.name && <code className="text-xs font-mono text-[var(--t-text)]">{ev.name}</code>}
                    </span>
                  )
                })()}
              </InfoRow>
              <InfoRow label="Level">
                <span className="px-2 py-0.5 rounded text-[11px] font-semibold uppercase" style={levelStyle}>
                  {log.level || 'info'}
                </span>
              </InfoRow>
              {log.message && (
                <InfoRow label="Message" full>
                  <span className="text-xs text-[var(--t-text)] break-words">{log.message}</span>
                </InfoRow>
              )}
              <InfoRow label="Flow">
                {log.flowId ? (
                  <Link
                    href={`/flows/builder/${log.flowId}`}
                    className="text-xs text-[var(--t-accent)] inline-flex items-center gap-1 hover:underline"
                  >
                    <GitBranch className="w-3 h-3" />
                    {log.flowName || log.flowId} <ExternalLink className="w-3 h-3" />
                  </Link>
                ) : <span className="text-xs text-[var(--t-text-muted)]">—</span>}
              </InfoRow>
              <InfoRow label="Request ID">
                <code className="text-xs font-mono text-[var(--t-text-secondary)] break-all">{log.requestId}</code>
              </InfoRow>
              <InfoRow label="User">
                <span className="text-xs text-[var(--t-text)]">{log.userId || '—'}</span>
              </InfoRow>
              <InfoRow label="Client IP">
                <span className="text-xs text-[var(--t-text)] font-mono">{log.userIp || '—'}</span>
              </InfoRow>
              <InfoRow label="Timestamp">
                <span className="text-xs text-[var(--t-text)]">
                  {new Date(log.timestamp || log.createdAt || Date.now()).toLocaleString('th-TH')}
                </span>
              </InfoRow>
            </div>
          )}

          {tab === 'data' && (
            <div>
              <p className="text-[10px] font-semibold text-[var(--t-text-muted)] uppercase tracking-wider mb-1">
                Data payload
              </p>
              <pre className="px-3 py-2 rounded bg-[var(--t-bg)] border border-[var(--t-border)] text-[var(--t-text-secondary)] text-xs font-mono whitespace-pre-wrap break-all max-h-[60vh] overflow-auto">
                {dataStr || '(empty)'}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <p className="text-[10px] font-semibold text-[var(--t-text-muted)] uppercase tracking-wider mb-0.5">{label}</p>
      {children}
    </div>
  )
}
