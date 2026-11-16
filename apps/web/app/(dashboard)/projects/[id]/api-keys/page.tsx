'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { ArrowLeft, Copy, Key, Plus, Trash2, Check, X } from 'lucide-react'
import { confirmDialog } from '@/components/common/ConfirmDialog'
import {
  Button,
  ComposedModal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Modal,
  TextInput,
  InlineNotification,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
} from '@carbon/react'

const FONT = '"IBM Plex Sans Thai", "IBM Plex Sans", "Sarabun", system-ui, sans-serif'
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
      body: 'This API key stops working immediately — applications using it lose access.',
      variant: 'danger',
      confirmLabel: 'Revoke',
      cancelLabel: 'Cancel',
    })
    if (!ok) return
    try {
      const res = await fetch(`/orch/api/api-keys/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to revoke')
      toast.success('Revoked')
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <Link href={`/projects/${projectId}`} style={{ color: THEME.text.secondary }}>
          <ArrowLeft size={18} />
        </Link>
        <Key size={22} />
        <h1 style={{ fontSize: 20, fontWeight: 400, margin: 0 }}>API Keys</h1>
        <div style={{ marginLeft: 'auto' }}>
          <Button kind="primary" size="sm" renderIcon={Plus} onClick={() => setShowCreate(true)}>
            Create API key
          </Button>
        </div>
      </div>

      <TableContainer>
        <div style={{ overflowX: 'auto' }}>
          <Table size="md">
            <TableHead>
              <TableRow>
                <TableHeader>Name</TableHeader>
                <TableHeader>Prefix</TableHeader>
                <TableHeader>Expires</TableHeader>
                <TableHeader>Last used</TableHeader>
                <TableHeader>Created</TableHeader>
                <TableHeader>Actions</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} style={{ padding: 32, textAlign: 'center', color: THEME.text.muted }}>
                    Loading...
                  </TableCell>
                </TableRow>
              ) : keys.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} style={{ padding: 32, textAlign: 'center', color: THEME.text.muted }}>
                    No API keys yet — click &quot;Create API key&quot; to get started
                  </TableCell>
                </TableRow>
              ) : (
                keys.map((k) => (
                  <TableRow key={k.id}>
                    <TableCell>{k.name}</TableCell>
                    <TableCell style={{ fontFamily: 'monospace' }}>{k.prefix}…</TableCell>
                    <TableCell>{k.expiresAt ? new Date(k.expiresAt).toLocaleDateString('th-TH') : '—'}</TableCell>
                    <TableCell>{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString('th-TH') : '—'}</TableCell>
                    <TableCell>{new Date(k.createdAt).toLocaleString('th-TH')}</TableCell>
                    <TableCell>
                      <Button kind="danger--ghost" size="sm" renderIcon={Trash2} onClick={() => handleRevoke(k.id)}>
                        Revoke
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </TableContainer>

      {/* Create modal */}
      <Modal
        open={showCreate}
        onRequestClose={() => setShowCreate(false)}
        modalHeading="Create new API key"
        primaryButtonText={creating ? 'Creating...' : 'Create'}
        secondaryButtonText="Cancel"
        primaryButtonDisabled={creating}
        onRequestSubmit={handleCreate}
        size="sm"
      >
        <div style={{ marginBottom: 16 }}>
          <TextInput
            id="api-key-name"
            labelText="Name"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="e.g. Integration server"
          />
        </div>
        <TextInput
          id="api-key-expires"
          type="date"
          labelText="Expiry date (optional)"
          value={newKeyExpires}
          onChange={(e) => setNewKeyExpires(e.target.value)}
        />
      </Modal>

      {/* Reveal-key modal (shows FULL KEY ONCE) */}
      <ComposedModal open={!!revealedKey} preventCloseOnClickOutside onClose={() => { setRevealedKey(null); setCopied(false); return true }}>
        <ModalHeader title="Your API key" />
        <ModalBody>
          <InlineNotification
            kind="warning"
            lowContrast
            hideCloseButton
            title=""
            subtitle="Store this key securely — the system cannot show it again after you close this window."
          />
          <div
            style={{
              background: THEME.bg,
              border: `1px solid ${THEME.border}`,
              padding: 12,
              fontFamily: 'monospace',
              fontSize: 13,
              wordBreak: 'break-all',
              marginTop: 12,
            }}
          >
            {revealedKey}
          </div>
        </ModalBody>
        <ModalFooter>
          <Button kind="secondary" renderIcon={copied ? Check : Copy} onClick={handleCopy}>
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button
            kind="primary"
            renderIcon={X}
            onClick={() => {
              setRevealedKey(null)
              setCopied(false)
            }}
          >
            Close
          </Button>
        </ModalFooter>
      </ComposedModal>
    </div>
  )
}
