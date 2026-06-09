'use client'

/**
 * ImportOpenApiButton — bulk-create ApiRegistrations from an OpenAPI
 * 3.x JSON file. Saves admins from typing 30+ endpoints by hand when
 * onboarding an existing backend that already ships a swagger.json.
 *
 * UX:
 *   1. Click → file picker (accepts .json / .yaml, though server only
 *      supports JSON today)
 *   2. Parse locally, count ops, show confirm with optional
 *      backendUrl override
 *   3. POST /api/projects/:id/openapi-import → toast with created/skipped
 */
import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Upload, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/authStore'

export function ImportOpenApiButton({ projectId }: { projectId: string }) {
  const token = useAuthStore((s) => s.accessToken)
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<null | {
    spec: unknown
    operationCount: number
    serverUrl: string
    fileName: string
  }>(null)
  const [backendOverride, setBackendOverride] = useState('')

  const onPick = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const f = ev.target.files?.[0]
    ev.target.value = ''
    if (!f) return
    try {
      const text = await f.text()
      const spec = JSON.parse(text)
      const paths = spec?.paths || {}
      const ops = Object.values(paths).reduce((n: number, methods) => {
        return n + Object.keys((methods as Record<string, unknown>) || {}).filter((m) =>
          ['get', 'post', 'put', 'patch', 'delete'].includes(m.toLowerCase())
        ).length
      }, 0 as number)
      setPreview({
        spec,
        operationCount: ops,
        serverUrl: spec?.servers?.[0]?.url || '',
        fileName: f.name,
      })
      setBackendOverride(spec?.servers?.[0]?.url || '')
    } catch (e) {
      toast.error(`Parse failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const confirmImport = async () => {
    if (!preview) return
    setBusy(true)
    try {
      const r = await fetch(`/orch/api/projects/${projectId}/openapi-import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          spec: preview.spec,
          backendUrl: backendOverride || undefined,
        }),
      })
      if (!r.ok) throw new Error(await r.text())
      const result = await r.json()
      toast.success(`Imported ${result.created} API(s) · skipped ${result.skipped}`)
      setPreview(null)
      qc.invalidateQueries({ queryKey: ['project-apis', projectId] })
      qc.invalidateQueries({ queryKey: ['project-detail', projectId] })
    } catch (e) {
      toast.error(`Import failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        onClick={() => fileRef.current?.click()}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-[var(--t-border)] bg-[var(--t-panel)] text-[var(--t-text)] hover:bg-[var(--t-panel-hover)]"
      >
        <Upload className="w-3.5 h-3.5" /> Import OpenAPI
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        onChange={onPick}
        className="hidden"
      />

      {preview && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setPreview(null)}
        >
          <div
            className="bg-[var(--t-panel)] border border-[var(--t-border)] rounded-xl w-full max-w-md p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h2 className="text-base font-semibold text-[var(--t-text)]">Import OpenAPI</h2>
              <p className="text-xs text-[var(--t-text-muted)] mt-0.5">
                File <span className="font-mono">{preview.fileName}</span> contains{' '}
                <strong className="text-[var(--t-accent)]">{preview.operationCount}</strong> operations
              </p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--t-text-muted)] mb-1 uppercase tracking-wider">
                Backend URL (override)
              </label>
              <input
                value={backendOverride}
                onChange={(e) => setBackendOverride(e.target.value)}
                placeholder="http://my-service.cluster.local:8080"
                className="w-full px-3 py-2 rounded bg-[var(--t-bg)] border border-[var(--t-border)] text-[var(--t-text)] text-xs font-mono"
              />
              <p className="text-[10px] text-[var(--t-text-muted)] mt-1">
                Prefixed to every path. Leave empty to use <code>servers[0].url</code> from the spec.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setPreview(null)}
                className="px-3 py-1.5 rounded text-xs text-[var(--t-text-muted)] hover:text-[var(--t-text)]"
              >
                Cancel
              </button>
              <button
                onClick={confirmImport}
                disabled={busy}
                className="px-4 py-1.5 rounded bg-[var(--t-accent)] text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                Import {preview.operationCount}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
