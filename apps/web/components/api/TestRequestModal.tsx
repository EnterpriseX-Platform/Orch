'use client'

/**
 * TestRequestModal — Postman-lite inline tester for an API registration.
 *
 * Flow:
 *   1. Open via `Test` button on the API detail page
 *   2. Pick method, fill path (prefilled from endpoint), headers, body
 *   3. Send → hits the public gateway URL `/orch/api/v1/<path>` (so the
 *      broker routes through the real flow just like production traffic)
 *   4. Response panel shows status / duration / raw JSON + pretty
 *
 * NOT the Orch admin API — this tests the BROKER path so admins can
 * confirm the API they just saved actually proxies correctly, without
 * opening Postman.
 */
import { useState } from 'react'
import { X, Send, Copy, Check } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { toast } from 'sonner'

interface ApiForTest {
  id: string
  name: string
  method: string
  endpoint: string
}

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const

export function TestRequestModal({
  api,
  open,
  onClose,
}: {
  api: ApiForTest
  open: boolean
  onClose: () => void
}) {
  const token = useAuthStore((s) => s.accessToken)
  // Strip leading /my-api/ or other project prefixes — the gateway path
  // includes the registered endpoint as-is
  const [method, setMethod] = useState(api.method || 'POST')
  const [path, setPath] = useState(() => {
    // Pre-fill with the registered endpoint; for wildcard endpoints
    // (/foo/*) replace the star with an empty placeholder.
    return (api.endpoint || '').replace(/\/\*$/, '/')
  })
  const [body, setBody] = useState('{}')
  const [headers, setHeaders] = useState('{"Content-Type":"application/json"}')
  const [resp, setResp] = useState<null | {
    status: number
    duration: number
    body: string
    headers: Record<string, string>
  }>(null)
  const [sending, setSending] = useState(false)
  const [copied, setCopied] = useState(false)

  if (!open) return null

  const send = async () => {
    setSending(true)
    setResp(null)
    try {
      let reqHeaders: Record<string, string> = {}
      try { reqHeaders = JSON.parse(headers) } catch { /* fall through with empty */ }
      if (token && !reqHeaders.Authorization) reqHeaders.Authorization = `Bearer ${token}`

      const url = `/orch/api/v1${path.startsWith('/') ? path : '/' + path}`
      const init: RequestInit = { method, headers: reqHeaders }
      if (method !== 'GET' && method !== 'DELETE' && body.trim()) {
        init.body = body
      }
      const start = Date.now()
      const r = await fetch(url, init)
      const duration = Date.now() - start
      const text = await r.text()
      const headersObj: Record<string, string> = {}
      r.headers.forEach((v, k) => { headersObj[k] = v })
      setResp({ status: r.status, duration, body: text, headers: headersObj })
    } catch (err) {
      setResp({ status: -1, duration: 0, body: String(err), headers: {} })
    } finally {
      setSending(false)
    }
  }

  const copyCurl = () => {
    const hdrFlags = Object.entries(JSON.parse(headers || '{}')).map(([k, v]) => `-H '${k}: ${v}'`).join(' ')
    const bodyFlag = method !== 'GET' && method !== 'DELETE' && body.trim() ? `-d '${body.replace(/'/g, "'\\''")}'` : ''
    const curl = `curl -X ${method} 'https://sit.orch.example.com/orch/api/v1${path}' ${hdrFlags} ${bodyFlag}`.trim()
    navigator.clipboard.writeText(curl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    toast.success('cURL copied to clipboard')
  }

  const prettyResp = (() => {
    if (!resp?.body) return ''
    try { return JSON.stringify(JSON.parse(resp.body), null, 2) } catch { return resp.body }
  })()

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[var(--t-panel)] border border-[var(--t-border)] rounded-xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--t-border)]">
          <div>
            <h2 className="text-base font-semibold text-[var(--t-text)]">Test Request · {api.name}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-[var(--t-panel-hover)] text-[var(--t-text-muted)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body — 2 columns: Request / Response */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 flex-1 min-h-0 overflow-auto">
          {/* Request panel */}
          <div className="border-r border-[var(--t-border)] p-4 space-y-3 overflow-auto">
            <div className="flex gap-2">
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="px-3 py-1.5 rounded bg-[var(--t-bg)] border border-[var(--t-border)] text-[var(--t-text)] text-xs font-semibold"
              >
                {METHODS.map((m) => <option key={m}>{m}</option>)}
              </select>
              <input
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="/my-api/microflow/service"
                className="flex-1 px-3 py-1.5 rounded bg-[var(--t-bg)] border border-[var(--t-border)] text-[var(--t-text)] text-xs font-mono"
              />
              <button
                onClick={send}
                disabled={sending || !path}
                className="px-4 py-1.5 rounded bg-[var(--t-accent)] text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" /> {sending ? 'Sending…' : 'Send'}
              </button>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[var(--t-text-muted)] mb-1 uppercase tracking-wider">
                Headers (JSON)
              </label>
              <textarea
                value={headers}
                onChange={(e) => setHeaders(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 rounded bg-[var(--t-bg)] border border-[var(--t-border)] text-[var(--t-text)] text-xs font-mono"
              />
            </div>

            {method !== 'GET' && method !== 'DELETE' && (
              <div>
                <label className="block text-[11px] font-semibold text-[var(--t-text-muted)] mb-1 uppercase tracking-wider">
                  Body (JSON)
                </label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={12}
                  className="w-full px-3 py-2 rounded bg-[var(--t-bg)] border border-[var(--t-border)] text-[var(--t-text)] text-xs font-mono"
                />
              </div>
            )}

            <button
              onClick={copyCurl}
              className="px-3 py-1.5 rounded border border-[var(--t-border)] bg-[var(--t-bg)] text-[var(--t-text-muted)] text-xs flex items-center gap-1.5 hover:bg-[var(--t-panel-hover)]"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              Copy as cURL
            </button>
          </div>

          {/* Response panel */}
          <div className="p-4 space-y-3 overflow-auto">
            {resp ? (
              <>
                <div className="flex items-center gap-3 text-xs">
                  <span
                    className={
                      resp.status >= 200 && resp.status < 300
                        ? 'px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-semibold'
                        : resp.status >= 400
                        ? 'px-2 py-0.5 rounded bg-red-500/20 text-red-400 font-semibold'
                        : 'px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 font-semibold'
                    }
                  >
                    {resp.status > 0 ? resp.status : 'ERROR'}
                  </span>
                  <span className="text-[var(--t-text-muted)]">{resp.duration}ms</span>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[var(--t-text-muted)] mb-1 uppercase tracking-wider">
                    Response Body
                  </label>
                  <pre className="w-full px-3 py-2 rounded bg-[var(--t-bg)] border border-[var(--t-border)] text-[var(--t-text-secondary)] text-[11px] font-mono whitespace-pre-wrap break-all max-h-[400px] overflow-auto">
                    {prettyResp || '(empty)'}
                  </pre>
                </div>

                {Object.keys(resp.headers).length > 0 && (
                  <details>
                    <summary className="text-[11px] text-[var(--t-text-muted)] cursor-pointer">Response headers</summary>
                    <pre className="mt-2 px-3 py-2 rounded bg-[var(--t-bg)] border border-[var(--t-border)] text-[var(--t-text-secondary)] text-[11px] font-mono">
                      {JSON.stringify(resp.headers, null, 2)}
                    </pre>
                  </details>
                )}
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
