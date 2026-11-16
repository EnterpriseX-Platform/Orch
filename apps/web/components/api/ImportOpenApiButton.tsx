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
import { Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Modal, TextInput } from '@carbon/react'
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
      <Button kind="tertiary" size="sm" renderIcon={Upload} onClick={() => fileRef.current?.click()}>
        Import OpenAPI
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        onChange={onPick}
        className="hidden"
      />

      {preview && (
        <Modal
          open
          size="sm"
          modalHeading="Import OpenAPI"
          primaryButtonText={busy ? 'Importing…' : `Import ${preview.operationCount}`}
          secondaryButtonText="Cancel"
          primaryButtonDisabled={busy}
          onRequestClose={() => setPreview(null)}
          onRequestSubmit={confirmImport}
        >
          <div className="space-y-4">
            <p className="text-xs text-[var(--t-text-muted)]">
              File <span className="font-mono">{preview.fileName}</span> has{' '}
              <strong className="text-[var(--t-accent)]">{preview.operationCount}</strong> operations
            </p>
            <TextInput
              id="openapi-backend-override"
              labelText="Backend URL (override)"
              value={backendOverride}
              onChange={(e) => setBackendOverride(e.target.value)}
              placeholder="http://my-service.cluster.local:8080"
              className="font-mono"
              helperText={<>Prefixed to every path. Leave empty to use <code>servers[0].url</code> from the spec</>}
            />
          </div>
        </Modal>
      )}
    </>
  )
}
