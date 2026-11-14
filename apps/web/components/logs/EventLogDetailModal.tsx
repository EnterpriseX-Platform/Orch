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
  info:  { backgroundColor: '#d0e2ff', color: '#0043ce' },
  warn:  { backgroundColor: '#fff1e6', color: '#8a3800' },
  error: { backgroundColor: '#ffd7d9', color: '#a2191f' },
  debug: { backgroundColor: '#e0e0e0', color: '#161616' },
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
      className="fixed inset-0 z-50 bg-[rgba(22,22,22,0.5)] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--t-panel)] border border-[var(--t-border)] rounded-none w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--t-border)]">
          <div className="flex items-center gap-3 min-w-0">
            <span className="cds-tag px-2 py-0.5 text-[12px]" style={levelStyle}>
              {log.level || 'info'}
            </span>
            {(() => {
              const ev = eventDisplay(log)
              const c = eventKindColor(ev.kind)
              return (
                <span className="flex items-center gap-2 min-w-0">
                  <span title={log.eventType} className="cds-tag text-[12px] px-2 py-0.5 shrink-0 bg-[#e0e0e0]" style={{ color: c }}>
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
            className="w-8 h-8 flex items-center justify-center hover:bg-[#e8e8e8] text-[#161616] shrink-0"
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
                className={`flex items-center gap-2 px-4 h-10 text-sm border-b-2 ${
                  active
                    ? 'border-[#0f62fe] text-[#161616] font-semibold'
                    : 'border-transparent text-[#525252] hover:bg-[#e8e8e8] hover:text-[#161616]'
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
                      <span title={log.eventType} className="cds-tag text-[12px] px-2 py-0.5 bg-[#e0e0e0]" style={{ color: c }}>
                        {ev.kind}
                      </span>
                      {ev.name && <code className="text-xs font-mono text-[var(--t-text)]">{ev.name}</code>}
                    </span>
                  )
                })()}
              </InfoRow>
              <InfoRow label="Level">
                <span className="cds-tag px-2 py-0.5 text-[12px]" style={levelStyle}>
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
              <p className="text-[12px] text-[#525252] mb-1">
                Data payload
              </p>
              <pre className="px-3 py-2 bg-[#f4f4f4] text-[#161616] text-xs font-mono whitespace-pre-wrap break-all max-h-[60vh] overflow-auto">
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
      <p className="text-[12px] text-[#525252] mb-0.5">{label}</p>
      {children}
    </div>
  )
}
