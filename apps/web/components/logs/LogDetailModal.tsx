'use client'

/**
 * LogDetailModal — full-screen detail view for one api_logs row.
 *
 * Replaces the old inline-expand on /orch/logs. Gives admins more
 * room to read the Request/Response JSON bodies, which were getting
 * cramped in the row expander.
 *
 * Tabs:
 *   - Info     : metadata (request id, client IP, timestamp, duration, ...)
 *   - Request  : method/path/headers/body
 *   - Response : status/duration/headers/body
 *   - cURL     : reconstruct the request as a copy-pasteable cURL
 */
import { useState } from 'react'
import { X, Copy, Check, Code, FileJson, Info, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

export interface LogDetailData {
  id: string
  requestId: string
  timestamp: string
  method: string
  path: string
  statusCode: number
  duration: number
  userIp?: string
  userAgent?: string
  api?: { id: string; name: string; endpoint: string }
  queryParams?: Record<string, unknown> | null
  requestHeaders?: Record<string, unknown> | null
  requestBody?: unknown
  responseHeaders?: Record<string, unknown> | null
  responseBody?: unknown
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

type TabId = 'info' | 'request' | 'response' | 'curl'

export function LogDetailModal({
  log,
  onClose,
}: {
  log: LogDetailData | null
  onClose: () => void
}) {
  const [tab, setTab] = useState<TabId>('info')
  const [copied, setCopied] = useState(false)

  if (!log) return null

  // Swagger-style solid colours — match the list view on /orch/logs
  const methodStyle: React.CSSProperties = (() => {
    const map: Record<string, { bg: string; color: string }> = {
      GET:    { bg: '#61AFFE', color: '#FFFFFF' },
      POST:   { bg: '#49CC90', color: '#FFFFFF' },
      PUT:    { bg: '#FCA130', color: '#FFFFFF' },
      PATCH:  { bg: '#50E3C2', color: '#0F172A' },
      DELETE: { bg: '#F93E3E', color: '#FFFFFF' },
    }
    const m = map[log.method] || map.GET
    return { background: m.bg, color: m.color }
  })()

  const statusStyle: React.CSSProperties = (() => {
    const c = log.statusCode
    const map: Array<[number, { bg: string; color: string }]> = [
      [500, { bg: '#EF4444', color: '#FFFFFF' }],
      [400, { bg: '#F59E0B', color: '#FFFFFF' }],
      [300, { bg: '#0EA5E9', color: '#FFFFFF' }],
      [200, { bg: '#10B981', color: '#FFFFFF' }],
      [100, { bg: '#64748B', color: '#FFFFFF' }],
    ]
    const entry = map.find(([floor]) => c >= floor) ?? map[0]
    return { background: entry[1].bg, color: entry[1].color }
  })()

  const curl = (() => {
    const host = typeof window !== 'undefined' ? window.location.origin : 'https://sit.orch.example.com'
    const hdrs = Object.entries((log.requestHeaders || {}) as Record<string, unknown>)
      .filter(([k]) => !['host', 'content-length', 'connection'].includes(k.toLowerCase()))
      .map(([k, v]) => `-H '${k}: ${String(v).replace(/'/g, "'\\''")}'`)
      .join(' \\\n  ')
    const bodyStr = log.requestBody != null ? `-d '${formatJson(log.requestBody).replace(/'/g, "'\\''")}'` : ''
    return `curl -X ${log.method} '${host}${log.path}' \\\n  ${hdrs}${hdrs ? ' \\\n  ' : ''}${bodyStr}`.trim()
  })()

  const copyCurl = () => {
    navigator.clipboard.writeText(curl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('cURL copied')
  }

  const tabs: Array<{ id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'info',     label: 'Info',     icon: Info },
    { id: 'request',  label: 'Request',  icon: FileJson },
    { id: 'response', label: 'Response', icon: FileJson },
    { id: 'curl',     label: 'cURL',     icon: Code },
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
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold uppercase" style={methodStyle}>
              {log.method}
            </span>
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold" style={statusStyle}>
              {log.statusCode}
            </span>
            <code className="text-xs font-mono text-[var(--t-text)] truncate">
              {log.path}
            </code>
            <span className="text-xs text-[var(--t-text-muted)] shrink-0">
              · {log.duration}ms
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
          {tab === 'info' && (
            <div className="grid grid-cols-2 gap-4">
              <InfoRow label="Request ID">
                <code className="text-xs font-mono text-[var(--t-text)]">{log.requestId}</code>
              </InfoRow>
              <InfoRow label="Timestamp">
                <span className="text-xs text-[var(--t-text)]">{new Date(log.timestamp).toLocaleString('th-TH')}</span>
              </InfoRow>
              <InfoRow label="Client IP">
                <span className="text-xs text-[var(--t-text)]">{log.userIp || '—'}</span>
              </InfoRow>
              <InfoRow label="Duration">
                <span className="text-xs text-[var(--t-text)]">{log.duration} ms</span>
              </InfoRow>
              <InfoRow label="API">
                {log.api ? (
                  <Link
                    href={`/registers/${log.api.id}`}
                    className="text-xs text-[var(--t-accent)] inline-flex items-center gap-1 hover:underline"
                  >
                    {log.api.name} <ExternalLink className="w-3 h-3" />
                  </Link>
                ) : <span className="text-xs text-[var(--t-text-muted)]">—</span>}
              </InfoRow>
              <InfoRow label="Endpoint">
                <code className="text-xs font-mono text-[var(--t-text-secondary)] break-all">
                  {log.api?.endpoint || '—'}
                </code>
              </InfoRow>
              {log.userAgent && (
                <InfoRow label="User Agent" full>
                  <span className="text-xs text-[var(--t-text-secondary)] break-all">{log.userAgent}</span>
                </InfoRow>
              )}
            </div>
          )}

          {tab === 'request' && (
            <div className="space-y-4">
              {log.queryParams && Object.keys(log.queryParams).length > 0 && (
                <PayloadBlock label="Query params" content={formatJson(log.queryParams)} />
              )}
              <PayloadBlock label="Headers" content={formatJson(log.requestHeaders) || '(none)'} />
              <PayloadBlock
                label="Body"
                content={formatJson(log.requestBody) || '(empty)'}
              />
            </div>
          )}

          {tab === 'response' && (
            <div className="space-y-4">
              <PayloadBlock label={`Status: ${log.statusCode}`} content={formatJson(log.responseHeaders) || '(no headers captured)'} />
              <PayloadBlock
                label="Body"
                content={formatJson(log.responseBody) || '(empty)'}
              />
            </div>
          )}

          {tab === 'curl' && (
            <div className="space-y-3">
              <pre className="px-3 py-3 rounded-lg bg-[var(--t-bg)] border border-[var(--t-border)] text-[var(--t-text-secondary)] text-xs font-mono whitespace-pre-wrap break-all">
                {curl}
              </pre>
              <button
                onClick={copyCurl}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-[var(--t-accent)] text-white text-xs font-semibold"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy cURL'}
              </button>
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

function PayloadBlock({ label, content }: { label: string; content: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-[var(--t-text-muted)] uppercase tracking-wider mb-1">{label}</p>
      <pre className="px-3 py-2 rounded bg-[var(--t-bg)] border border-[var(--t-border)] text-[var(--t-text-secondary)] text-xs font-mono whitespace-pre-wrap break-all max-h-[50vh] overflow-auto">
        {content}
      </pre>
    </div>
  )
}
