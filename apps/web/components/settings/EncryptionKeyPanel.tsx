'use client'

/**
 * EncryptionKeyPanel — app-level encryption KEY manager (System Settings).
 *
 * Sits alongside EncryptionPanel (DB-native TDE/pgcrypto). This one manages
 * the AES-256-GCM key used for APP-level column encryption in the Data
 * Repository (encrypt on write-via-API, decrypt on read-via-API). The raw
 * key is never shown — only status / active version.
 */
import { type ReactNode } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { KeyRound, Loader2, RotateCw, ShieldCheck, ShieldOff, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { confirmDialog } from '@/components/common/ConfirmDialog'
import { useAuthStore } from '@/stores/authStore'

const FONT = "'Prompt', sans-serif"

function authFetch(url: string, options?: RequestInit) {
  const token = useAuthStore.getState().accessToken
  const headers = new Headers(options?.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(url, { ...options, headers, credentials: 'include' })
}

type KeyStatus = {
  configured: boolean
  enabled: boolean
  activeKeyVersion: number | null
  versions: number[]
  kekConfigured: boolean
}

export function EncryptionKeyPanel() {
  const { data: st, isLoading, refetch } = useQuery({
    queryKey: ['admin-encryption-key'],
    queryFn: async () => {
      const r = await authFetch('/orch/api/admin/encryption/key')
      if (!r.ok) throw new Error('Failed to load key status')
      return r.json() as Promise<KeyStatus>
    },
  })

  const mutate = useMutation({
    mutationFn: async (action: 'generate' | 'rotate' | 'enable' | 'disable') => {
      const r = await authFetch('/orch/api/admin/encryption/key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || j.error) throw new Error(j.error || `Failed (HTTP ${r.status})`)
      return j as { activeKeyVersion?: number; enabled?: boolean }
    },
    onSuccess: (j) => {
      toast.success(`Encryption key updated${j.activeKeyVersion != null ? ` (v${j.activeKeyVersion})` : ''}`)
      refetch()
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Key action failed'),
  })

  const busy = mutate.isPending

  return (
    <div style={{ fontFamily: FONT }} className="rounded-xl border border-[var(--t-border)] bg-[var(--t-panel)] p-5">
      <div className="flex items-center gap-2 mb-4">
        <KeyRound size={16} className="text-[var(--t-accent)]" />
        <h3 className="text-sm font-semibold text-[var(--t-text)]">App-Level Encryption Key</h3>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-[var(--t-text-muted)]">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      ) : (
        <>
          {!st?.kekConfigured && (
            <div className="flex items-start gap-2 text-xs text-amber-600 bg-amber-500/10 rounded p-2 mb-3">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                <code>ORCH_ENCRYPTION_KEK</code> is not set — an insecure dev fallback key is in use. Set it
                (32-byte base64) in env / K8s secret for real environments, and back it up — losing it makes
                encrypted data unrecoverable.
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 text-xs mb-4">
            <Field label="Status">
              {st?.enabled ? <span className="text-emerald-500 font-medium">Enabled</span> : <span className="text-[var(--t-text-muted)]">Disabled</span>}
            </Field>
            <Field label="Active key version">{st?.activeKeyVersion != null ? `v${st.activeKeyVersion}` : '—'}</Field>
            <Field label="Key versions">{st?.versions?.length ? st.versions.map((v) => `v${v}`).join(', ') : '—'}</Field>
            <Field label="KEK source">{st?.kekConfigured ? 'env secret' : 'dev fallback'}</Field>
          </div>

          <div className="flex flex-wrap gap-2">
            {!st?.configured ? (
              <button
                disabled={busy}
                onClick={() => mutate.mutate('generate')}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-[var(--t-accent)] text-white disabled:opacity-50"
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />} Generate key
              </button>
            ) : (
              <>
                <button
                  disabled={busy}
                  onClick={async () => {
                    if (await confirmDialog({ title: 'Rotate encryption key?', body: 'Mint a new key version. New writes use it; existing values still decrypt with the version they were encrypted under.' })) {
                      mutate.mutate('rotate')
                    }
                  }}
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-[var(--t-panel-hover)] text-[var(--t-text)] border border-[var(--t-border)] disabled:opacity-50"
                >
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <RotateCw size={13} />} Rotate
                </button>
                {st.enabled ? (
                  <button disabled={busy} onClick={() => mutate.mutate('disable')} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-red-500/10 text-red-500 disabled:opacity-50">
                    <ShieldOff size={13} /> Disable
                  </button>
                ) : (
                  <button disabled={busy} onClick={() => mutate.mutate('enable')} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-emerald-500/10 text-emerald-500 disabled:opacity-50">
                    <ShieldCheck size={13} /> Enable
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-[var(--t-text-muted)] mb-0.5">{label}</p>
      <div className="text-[var(--t-text)]">{children}</div>
    </div>
  )
}
