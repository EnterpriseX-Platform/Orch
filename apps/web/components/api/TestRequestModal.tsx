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
import { Send, Copy, Check } from 'lucide-react'
import { Button, ComposedModal, ModalHeader, ModalBody, Select, SelectItem, Tag, TextArea, TextInput } from '@carbon/react'
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

  const statusTag: 'green' | 'red' | 'warm-gray' =
    resp && resp.status >= 200 && resp.status < 300 ? 'green' : resp && resp.status >= 400 ? 'red' : 'warm-gray'

  return (
    <ComposedModal open size="lg" onClose={onClose}>
      <ModalHeader title={`Test Request · ${api.name}`} />
      <ModalBody className="!p-0 !mb-0">
        {/* Body — 2 columns: Request / Response */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 flex-1 min-h-0 overflow-auto">
          {/* Request panel */}
          <div className="border-r border-[var(--t-border)] p-4 space-y-3 overflow-auto">
            <div className="flex gap-2 items-end">
              <Select
                id="test-request-method"
                labelText="Method"
                hideLabel
                size="sm"
                inline={false}
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-28 shrink-0"
              >
                {METHODS.map((m) => <SelectItem key={m} value={m} text={m} />)}
              </Select>
              <TextInput
                id="test-request-path"
                labelText="Path"
                hideLabel
                size="sm"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="/my-api/microflow/service"
                className="font-mono"
              />
              <Button kind="primary" size="sm" renderIcon={Send} onClick={send} disabled={sending || !path}>
                {sending ? 'Sending…' : 'Send'}
              </Button>
            </div>

            <TextArea
              id="test-request-headers"
              labelText="Headers (JSON)"
              value={headers}
              onChange={(e) => setHeaders(e.target.value)}
              rows={3}
              className="font-mono text-xs"
            />

            {method !== 'GET' && method !== 'DELETE' && (
              <TextArea
                id="test-request-body"
                labelText="Body (JSON)"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={12}
                className="font-mono text-xs"
              />
            )}

            <Button kind="tertiary" size="sm" renderIcon={copied ? Check : Copy} onClick={copyCurl}>
              Copy as cURL
            </Button>
          </div>

          {/* Response panel */}
          <div className="p-4 space-y-3 overflow-auto">
            {resp ? (
              <>
                <div className="flex items-center gap-3 text-xs">
                  <Tag type={statusTag} size="sm">
                    {resp.status > 0 ? resp.status : 'ERROR'}
                  </Tag>
                  <span className="text-[var(--t-text-muted)]">{resp.duration}ms</span>
                </div>

                <div>
                  <label className="block text-xs text-[#525252] mb-1">
                    Response Body
                  </label>
                  <pre className="w-full px-3 py-2 bg-[#f4f4f4] text-[#161616] text-[11px] font-mono whitespace-pre-wrap break-all max-h-[400px] overflow-auto">
                    {prettyResp || '(empty)'}
                  </pre>
                </div>

                {Object.keys(resp.headers).length > 0 && (
                  <details>
                    <summary className="text-[11px] text-[var(--t-text-muted)] cursor-pointer">Response headers</summary>
                    <pre className="mt-2 px-3 py-2 bg-[#f4f4f4] text-[#161616] text-[11px] font-mono">
                      {JSON.stringify(resp.headers, null, 2)}
                    </pre>
                  </details>
                )}
              </>
            ) : null}
          </div>
        </div>
      </ModalBody>
    </ComposedModal>
  )
}
