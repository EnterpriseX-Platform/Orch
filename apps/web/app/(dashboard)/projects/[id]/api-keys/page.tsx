'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { ArrowLeft, Copy, Key, Plus, Trash2, Check, X } from 'lucide-react'
import { confirmDialog } from '@/components/common/ConfirmDialog'

const FONT = "'Prompt', sans-serif"
const THEME = {
  bg: 'var(--t-bg)',
  panel: 'var(--t-panel)',
  border: 'var(--t-border)',
  text: { primary: 'var(--t-text)', secondary: 'var(--t-text-secondary)', muted: 'var(--t-text-muted)' },
  accent: 'var(--t-accent)',
}

type ApiKey = {
  id: string
  name: string
  prefix: string
  projectId: string
  scopes: string[]
  expiresAt?: string | null
  lastUsedAt?: string | null
  createdAt: string
  createdBy: string
  revokedAt?: string | null
}

export default function ApiKeysPage() {
  const params = useParams<{ id: string }>()
  const projectId = params?.id as string

  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyExpires, setNewKeyExpires] = useState('')
  const [creating, setCreating] = useState(false)
  const [revealedKey, setRevealedKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const load = async () => {
    try {
      setLoading(true)
      const res = await fetch(`/orch/api/api-keys?projectId=${projectId}`)
      const data = await res.json()
      setKeys(data.data ?? [])
    } catch (e) {
      toast.error('Failed to load API keys')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (projectId) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const handleCreate = async () => {
    if (!newKeyName.trim()) {
      toast.error('Please enter a name')
      return
    }
    try {
      setCreating(true)
      const body: any = { name: newKeyName.trim(), projectId }
      if (newKeyExpires) body.expiresAt = new Date(newKeyExpires).toISOString()
      const res = await fetch(`/orch/api/api-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to create')
      }
      const created = await res.json()
      setRevealedKey(created.key)
      setNewKeyName('')
      setNewKeyExpires('')
      setShowCreate(false)
      await load()
      toast.success('API key created successfully')
    } catch (e: any) {
      toast.error(e.message || 'Failed to create')
    } finally {
      setCreating(false)
    }
  }

  const handleRevoke = async (id: string) => {
    const ok = await confirmDialog({
      title: 'Revoke API key?',
      body: 'This API key will stop working immediately — any application using this key will lose access.',
      variant: 'danger',
      confirmLabel: 'Revoke',
      cancelLabel: 'Cancel',
    })
    if (!ok) return
    try {
      const res = await fetch(`/orch/api/api-keys/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to revoke')
      toast.success('Revoked successfully')
      load()
    } catch (e: any) {
      toast.error(e.message || 'Failed to revoke')
    }
  }

  const handleCopy = async () => {
    if (!revealedKey) return
    try {
      await navigator.clipboard.writeText(revealedKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // noop
    }
  }

  return (
    <div style={{ fontFamily: FONT, color: THEME.text.primary, padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Link href={`/projects/${projectId}`} style={{ color: THEME.text.secondary }}>
          <ArrowLeft size={18} />
        </Link>
        <Key size={22} />
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>API Keys</h1>
        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={() => setShowCreate(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              background: THEME.accent,
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontFamily: FONT,
              fontSize: 13,
            }}
          >
            <Plus size={16} /> Create API Key
          </button>
        </div>
      </div>

      <div
        style={{
          background: THEME.panel,
          border: `1px solid ${THEME.border}`,
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: THEME.bg, textAlign: 'left' }}>
              <th style={{ padding: '12px 16px', color: THEME.text.secondary, fontWeight: 500 }}>Name</th>
              <th style={{ padding: '12px 16px', color: THEME.text.secondary, fontWeight: 500 }}>Prefix</th>
              <th style={{ padding: '12px 16px', color: THEME.text.secondary, fontWeight: 500 }}>Expires</th>
              <th style={{ padding: '12px 16px', color: THEME.text.secondary, fontWeight: 500 }}>Last used</th>
              <th style={{ padding: '12px 16px', color: THEME.text.secondary, fontWeight: 500 }}>Created</th>
              <th style={{ padding: '12px 16px', color: THEME.text.secondary, fontWeight: 500 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ padding: 32, textAlign: 'center', color: THEME.text.muted }}>
                  Loading...
                </td>
              </tr>
            ) : keys.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 32, textAlign: 'center', color: THEME.text.muted }}>
                  No API keys yet — click &quot;Create API Key&quot; to get started
                </td>
              </tr>
            ) : (
              keys.map((k) => (
                <tr key={k.id} style={{ borderTop: `1px solid ${THEME.border}` }}>
                  <td style={{ padding: '12px 16px' }}>{k.name}</td>
                  <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: THEME.text.secondary }}>
                    {k.prefix}…
                  </td>
                  <td style={{ padding: '12px 16px', color: THEME.text.secondary }}>
                    {k.expiresAt ? new Date(k.expiresAt).toLocaleDateString('th-TH') : '—'}
                  </td>
                  <td style={{ padding: '12px 16px', color: THEME.text.secondary }}>
                    {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString('th-TH') : '—'}
                  </td>
                  <td style={{ padding: '12px 16px', color: THEME.text.secondary }}>
                    {new Date(k.createdAt).toLocaleString('th-TH')}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <button
                      onClick={() => handleRevoke(k.id)}
                      style={{
                        background: 'transparent',
                        border: `1px solid ${THEME.border}`,
                        color: '#F87171',
                        borderRadius: 4,
                        padding: '4px 10px',
                        cursor: 'pointer',
                        fontFamily: FONT,
                        fontSize: 12,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <Trash2 size={12} /> Revoke
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
          onClick={() => setShowCreate(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: THEME.panel,
              border: `1px solid ${THEME.border}`,
              borderRadius: 8,
              padding: 24,
              width: 420,
            }}
          >
            <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>Create new API key</h2>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, color: THEME.text.secondary, display: 'block', marginBottom: 6 }}>
                Name
              </label>
              <input
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="e.g. Integration server"
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  background: THEME.bg,
                  border: `1px solid ${THEME.border}`,
                  color: THEME.text.primary,
                  borderRadius: 6,
                  fontSize: 13,
                  fontFamily: FONT,
                }}
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 13, color: THEME.text.secondary, display: 'block', marginBottom: 6 }}>
                Expiry date (optional)
              </label>
              <input
                type="date"
                value={newKeyExpires}
                onChange={(e) => setNewKeyExpires(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  background: THEME.bg,
                  border: `1px solid ${THEME.border}`,
                  color: THEME.text.primary,
                  borderRadius: 6,
                  fontSize: 13,
                  fontFamily: FONT,
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowCreate(false)}
                style={{
                  padding: '8px 14px',
                  background: 'transparent',
                  border: `1px solid ${THEME.border}`,
                  color: THEME.text.primary,
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontFamily: FONT,
                  fontSize: 13,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                style={{
                  padding: '8px 14px',
                  background: THEME.accent,
                  border: 'none',
                  color: '#fff',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontFamily: FONT,
                  fontSize: 13,
                  opacity: creating ? 0.6 : 1,
                }}
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reveal-key modal (shows FULL KEY ONCE) */}
      {revealedKey && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 110,
          }}
        >
          <div
            style={{
              background: THEME.panel,
              border: `1px solid ${THEME.border}`,
              borderRadius: 8,
              padding: 24,
              width: 480,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Key size={18} />
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Your API key</h2>
            </div>
            <p style={{ fontSize: 12, color: '#FBBF24', margin: '0 0 12px' }}>
              Store this key securely — the system cannot show it again after you close this window.
            </p>
            <div
              style={{
                background: THEME.bg,
                border: `1px solid ${THEME.border}`,
                borderRadius: 6,
                padding: 12,
                fontFamily: 'monospace',
                fontSize: 13,
                wordBreak: 'break-all',
                marginBottom: 12,
              }}
            >
              {revealedKey}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={handleCopy}
                style={{
                  padding: '8px 14px',
                  background: 'transparent',
                  border: `1px solid ${THEME.border}`,
                  color: THEME.text.primary,
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontFamily: FONT,
                  fontSize: 13,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button
                onClick={() => {
                  setRevealedKey(null)
                  setCopied(false)
                }}
                style={{
                  padding: '8px 14px',
                  background: THEME.accent,
                  border: 'none',
                  color: '#fff',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontFamily: FONT,
                  fontSize: 13,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <X size={14} /> Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
