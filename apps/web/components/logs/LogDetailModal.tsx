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
import { Copy, Check, Code, FileJson, Info, ExternalLink } from 'lucide-react'
import { Button, ComposedModal, ModalHeader, ModalBody, Tabs, TabList, Tab } from '@carbon/react'
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
      GET:    { bg: '#d0e2ff', color: '#0043ce' },
      POST:   { bg: '#a7f0ba', color: '#0e6027' },
      PUT:    { bg: '#fff1e6', color: '#8a3800' },
      PATCH:  { bg: '#9ef0f0', color: '#005d5d' },
      DELETE: { bg: '#ffd7d9', color: '#a2191f' },
    }
    const m = map[log.method] || map.GET
    return { background: m.bg, color: m.color }
  })()

  const statusStyle: React.CSSProperties = (() => {
    const c = log.statusCode
    const map: Array<[number, { bg: string; color: string }]> = [
      [500, { bg: '#ffd7d9', color: '#a2191f' }],
      [400, { bg: '#fff1e6', color: '#8a3800' }],
      [300, { bg: '#d0e2ff', color: '#0043ce' }],
      [200, { bg: '#a7f0ba', color: '#0e6027' }],
      [100, { bg: '#e0e0e0', color: '#161616' }],
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

  const tabs: Array<{ id: TabId; label: string; icon: React.ComponentType<Record<string, unknown>> }> = [
    { id: 'info',     label: 'Info',     icon: Info },
    { id: 'request',  label: 'Request',  icon: FileJson },
    { id: 'response', label: 'Response', icon: FileJson },
    { id: 'curl',     label: 'cURL',     icon: Code },
  ]

  const tabIndex = tabs.findIndex((t) => t.id === tab)

  return (
    <ComposedModal open onClose={onClose} size="lg">
      <ModalHeader closeModal={onClose}>
          <div className="flex items-center gap-3 min-w-0 pr-8">
            <span className="cds-tag px-2 py-0.5 text-[12px]" style={methodStyle}>
              {log.method}
            </span>
            <span className="cds-tag px-2 py-0.5 text-[12px]" style={statusStyle}>
              {log.statusCode}
            </span>
            <code className="text-xs font-mono text-[var(--t-text)] truncate">
              {log.path}
            </code>
            <span className="text-xs text-[var(--t-text-muted)] shrink-0">
              · {log.duration}ms
            </span>
          </div>
      </ModalHeader>
      <ModalBody>
        <Tabs
          selectedIndex={tabIndex}
          onChange={({ selectedIndex }) => setTab(tabs[selectedIndex].id)}
        >
          <TabList aria-label="API log detail tabs">
            {tabs.map((t) => (
              <Tab key={t.id} renderIcon={t.icon}>{t.label}</Tab>
            ))}
          </TabList>
        </Tabs>
        {/* Body */}
        <div className="pt-4 text-sm">
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
              <pre className="px-3 py-3 bg-[#f4f4f4] text-[#161616] text-xs font-mono whitespace-pre-wrap break-all">
                {curl}
              </pre>
              <Button
                kind="primary"
                size="sm"
                onClick={copyCurl}
                renderIcon={copied ? Check : Copy}
              >
                {copied ? 'Copied' : 'Copy cURL'}
              </Button>
            </div>
          )}
        </div>
      </ModalBody>
    </ComposedModal>
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

function PayloadBlock({ label, content }: { label: string; content: string }) {
  return (
    <div>
      <p className="text-[12px] text-[#525252] mb-1">{label}</p>
      <pre className="px-3 py-2 bg-[#f4f4f4] text-[#161616] text-xs font-mono whitespace-pre-wrap break-all max-h-[50vh] overflow-auto">
        {content}
      </pre>
    </div>
  )
}
